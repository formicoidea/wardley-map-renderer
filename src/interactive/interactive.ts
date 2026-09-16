/**
 * Interactive editor controller (browser bundle entry).
 *
 * Reads `#wardley-data` (sanitized map) and `#wardley-prepared` (server-resolved
 * render config), then: tool gestures → DiffOps → store → full re-render of
 * `#map` with the same renderer as the server; selection, handles and rubber
 * bands live in `#overlay`. Events are delegated on the stable `#viewport`.
 *
 * Public API for hosts (e.g. Claude Code's browser pane):
 * `window.__wardley = { getMap, getDiff, clearDiff, apply, undo, redo }`.
 *
 * @module interactive/interactive
 */

import type { DiffOp } from "../diff-ops-apply.js";
import { pxToMap, renderSVGFromPrepared, type PreparedRender } from "../render/browser-render.js";
import type { WardleyMap } from "../schema.js";
import {
  addComponentOp, clamp01, componentOf, connectOp, deleteOps, dragOps, dragStart, nearestComponent, nodeCentre, rectToPipeline,
  resolveHit, selectId, selectionExists, targetOf, type DragStart, type Hit, type Pt,
} from "./gestures.js";
import { buildProps, PROPS_CSS } from "./props.js";
import { initShell } from "./shell.js";
import { createStore } from "./store.js";
import { copyText, downloadJSON, sendToClaude } from "./transport.js";

const SLOP = 4;
const LONG_PRESS_MS = 500;
const DOUBLE_MS = 400;
const EDITOR_CSS =
  "#map{user-select:none;-webkit-user-select:none}" +
  "#map [data-kind]:not([data-kind=title]){cursor:pointer}" +
  "#viewport:is([data-tool=link],[data-tool=evolve],[data-tool=pipeline]){cursor:crosshair}" +
  ".wm-rename{position:fixed;z-index:25;margin:0;padding:2px 4px;border:1px solid var(--accent);border-radius:4px;" +
  "background:var(--surface);color:var(--fg);font-family:inherit;line-height:1.2;resize:none;overflow:hidden;box-shadow:var(--shadow)}";

interface Gesture {
  mode: "move" | "link" | "evolve" | "rect" | "none";
  pid: number;
  cx: number;
  cy: number;
  moved: boolean;
  hit: Hit | null;
  start: Pt;
  cur: Pt;
  from?: string;
  drag?: DragStart;
  ops: DiffOp[];
  timer: number;
  shift: boolean;
  done?: boolean;
  /** Dragged label <text> x/y at pointerdown. */
  labelXY?: { x: number; y: number };
}

export function initEditor(doc: Document): void {
  const dataEl = doc.getElementById("wardley-data");
  const prepEl = doc.getElementById("wardley-prepared");
  if (!dataEl || !prepEl) return;
  const prepared = JSON.parse(prepEl.textContent!) as PreparedRender;
  const store = createStore(JSON.parse(dataEl.textContent!) as WardleyMap);
  const style = doc.createElement("style");
  style.textContent = PROPS_CSS + EDITOR_CSS;
  doc.head.append(style);

  const shell = initShell(doc);
  const view = shell.view;
  const vp = doc.getElementById("viewport")!;
  const mapEl = doc.getElementById("map")!;
  const overlay = doc.getElementById("overlay")!;
  const endpoint = doc.body.dataset.editsEndpoint || undefined;

  let selection: string[] = [];
  let g: Gesture | null = null;
  let linkFrom: { tool: "link" | "evolve"; id: string } | null = null;
  let hover: Pt | null = null;
  let panelFor: string | null = null;
  let lastClick: { t: number; x: number; y: number } | null = null;
  let editing: { finish(commit: boolean): void; place(): void } | null = null;
  let raf = 0;
  let pending: WardleyMap | null = null;

  const tool = () => shell.getTool();
  // Drags on map elements (and pipeline rectangles) belong to the editor, not to panning.
  const canPan = view.shouldPan;
  view.shouldPan = (ev) =>
    tool() !== "pipeline" && canPan(ev) && !hitFor(ev.target as Element, ev.clientX, ev.clientY, ev.pointerType !== "mouse");
  const title = () => store.map.title?.trim() || "Wardley map";
  const esc = (s: string) => CSS.escape(s);
  const byId = (id: string, kinds: string) =>
    mapEl.querySelector<SVGGraphicsElement>(kinds.split(",").map((k) => `[data-id="${esc(id)}"][data-kind=${k}]`).join(","));

  const pt = (clientX: number, clientY: number): Pt => {
    const s = view.screenToSvg(clientX, clientY);
    const m = pxToMap(prepared, s.x, s.y);
    return { x: s.x, y: s.y, evo: clamp01(m.evo), vis: clamp01(m.vis) };
  };
  /** Element hit, else the nearest node within a finger/cursor radius. */
  const hitFor = (target: Element | null, x: number, y: number, touch = false) =>
    resolveHit(target) ?? nearestComponent(store.map, prepared, pt(x, y), (touch ? 16 : 6) / view.k);
  const hitAt = (x: number, y: number) => hitFor(doc.elementFromPoint(x, y), x, y);

  // ── Rendering ───────────────────────────────────────────────────
  const render = (map: WardleyMap = store.map) => {
    mapEl.innerHTML = renderSVGFromPrepared(map, prepared);
    drawOverlay();
    editing?.place();
  };
  const schedule = (map: WardleyMap) => {
    pending = map;
    raf ||= requestAnimationFrame(() => {
      raf = 0;
      if (pending) render(pending);
    });
  };

  const drawOverlay = () => {
    const k = view.k;
    const sw = 1.5 / k;
    const accent = "stroke:var(--accent)";
    let s = `<defs><marker id="wm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--accent)"/></marker></defs>`;
    const box = (b: DOMRect, pad: number, extra = "") =>
      `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + 2 * pad}" height="${b.height + 2 * pad}" rx="${3 / k}" fill="none" style="${accent}" stroke-width="${sw}"${extra}/>`;
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, extra = "") =>
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="${accent}" stroke-width="${sw}"${extra}/>`;

    for (const sel of selection) {
      const el = byId(targetOf(sel), sel.startsWith("evolve:") ? "evolve" : "component,pipeline,relation");
      if (!el) continue;
      const kind = el.dataset.kind;
      if (kind === "relation" || kind === "evolve") {
        s += box(el.getBBox(), 3 / k, ` stroke-dasharray="${4 / k}"`);
        continue;
      }
      const body = (kind === "pipeline" ? el.firstElementChild : el) as SVGGraphicsElement;
      const b = body.getBBox();
      s += box(b, kind === "pipeline" ? 0 : 4 / k, kind === "pipeline" ? "" : ` stroke-dasharray="${4 / k}"`);
      if (kind === "pipeline" && selection.length === 1) {
        const r = 6 / k;
        const xs = { w: b.x, e: b.x + b.width, "": b.x + b.width / 2 };
        const ys = { n: b.y, s: b.y + b.height, "": b.y + b.height / 2 };
        for (const [v, y] of Object.entries(ys)) {
          for (const [h, x] of Object.entries(xs)) {
            const name = v + h;
            if (!name) continue;
            const cursor = name.length === 2 ? (name === "nw" || name === "se" ? "nwse" : "nesw") : v ? "ns" : "ew";
            s += `<rect data-handle="${name}" data-for="${targetOf(sel).replace(/[&"<]/g, (c) => `&#${c.charCodeAt(0)};`)}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="${r / 3}" style="fill:var(--surface);${accent};cursor:${cursor}-resize;touch-action:none" stroke-width="${sw}"/>`;
          }
        }
      }
    }

    const src = g?.from ?? linkFrom?.id;
    const mode = g?.mode === "link" || g?.mode === "evolve" ? g.mode : linkFrom?.tool;
    const to = g?.from ? g.cur : linkFrom ? hover : null;
    if (src && mode && to) {
      const a = nodeCentre(store.map, prepared, src);
      if (a) {
        s += mode === "evolve"
          ? line(a, to, ` stroke-dasharray="${6 / k}" marker-end="url(#wm-arrow)"`)
          : line(a, to, ` marker-end="url(#wm-arrow)"`);
      }
    }
    if (g?.mode === "rect" && g.moved) {
      const { start: a, cur: b } = g;
      s += `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(a.x - b.x)}" height="${Math.abs(a.y - b.y)}" style="${accent};fill:var(--accent-soft);fill-opacity:.35" stroke-width="${sw}" stroke-dasharray="${4 / k}"/>`;
    }
    overlay.innerHTML = s;
  };
  shell.on("view", () => {
    drawOverlay();
    editing?.place();
  });

  // ── State changes ───────────────────────────────────────────────
  const syncUi = () => {
    shell.setDiffCount(store.ops.length);
    const dis = (a: string, d: boolean) => doc.querySelectorAll<HTMLButtonElement>(`[data-action=${a}]`).forEach((b) => (b.disabled = d));
    dis("undo", !store.canUndo());
    dis("redo", !store.canRedo());
    dis("delete", !selection.length);
  };
  const select = (ids: string[]) => {
    selection = ids;
    if (panelFor && ids.length === 1 && targetOf(ids[0]) !== panelFor) openProps(targetOf(ids[0]));
    else if (panelFor && !ids.length) shell.closePanel();
    drawOverlay();
    syncUi();
  };
  const changed = () => {
    pending = null;
    selection = selection.filter((s) => selectionExists(store.map, s));
    render();
    syncUi();
    refreshPanel();
  };
  const commit = (ops: DiffOp[]): boolean => {
    try {
      store.commit(ops);
    } catch (e) {
      shell.toast((e as Error).message.replace(/^diff-op: /, "Invalid edit: "), "error");
      render();
      return false;
    }
    changed();
    return true;
  };

  // ── Properties panel ────────────────────────────────────────────
  const openProps = (id: string) => {
    const p = buildProps(doc, store.map, id, (op) => void commit([op]));
    if (!p) return;
    panelFor = id;
    shell.openPanel(p.title, p.body);
  };
  // Deferred: a `change` fired by Tab moves focus afterwards; keep it on the same field.
  const refreshPanel = () => setTimeout(() => {
    if (!panelFor) return;
    if (!selectionExists(store.map, panelFor)) return shell.closePanel();
    const active = doc.activeElement as HTMLInputElement | null;
    const name = active?.closest("#props-body") ? active.name : "";
    openProps(panelFor);
    if (name) (doc.querySelector(`#props-body [name="${esc(name)}"]`) as HTMLElement | null)?.focus();
  });
  shell.on("panel-close", () => (panelFor = null));

  // ── Inline rename ───────────────────────────────────────────────
  const rename = (id: string) => {
    editing?.finish(true);
    const isTitle = id === "title";
    const find = () => (isTitle ? mapEl.querySelector<SVGGraphicsElement>("[data-kind=title]") : byId(id, "label"));
    const el = find();
    const comp = store.map.components.find((c) => c.id === id);
    if (!el || (!isTitle && !comp)) return comp && openProps(id);
    const old = isTitle ? store.map.title : comp!.label.name;
    const ta = doc.createElement("textarea");
    ta.className = "wm-rename";
    ta.value = old;
    ta.rows = old.split("\n").length;
    ta.setAttribute("aria-label", isTitle ? "Map title" : "Component name");
    let done = false;
    const place = () => {
      const cur = find();
      if (!cur) return;
      const r = cur.getBoundingClientRect();
      const fs = (parseFloat(cur.getAttribute("font-size") || "12") || 12) * view.k;
      Object.assign(ta.style, {
        fontSize: `${Math.max(12, fs)}px`,
        left: `${r.left - 5}px`,
        top: `${r.top - 3}px`,
        width: `${Math.max(r.width + 40, 140)}px`,
      });
    };
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      editing = null;
      const name = ta.value.replace(/\s+$/, "");
      ta.remove();
      if (!ok || !name.trim() || name === old) return;
      commit([isTitle ? { op: "rename_map", payload: { title: name } } : { op: "rename_component", payload: { id, name } }]);
    };
    ta.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.isComposing) return;
      if (ev.key === "Escape") finish(false);
      else if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        finish(true);
      }
    });
    ta.addEventListener("blur", () => finish(true));
    doc.body.append(ta);
    editing = { finish, place };
    place();
    ta.focus();
    ta.select();
  };

  // ── Gestures ────────────────────────────────────────────────────
  const cancel = () => {
    if (g) {
      clearTimeout(g.timer);
      if (g.mode === "move" && g.moved) render();
      g = null;
    }
    linkFrom = null;
    hover = null;
    drawOverlay();
  };
  const add = (op: ReturnType<typeof addComponentOp>) => {
    if (!commit([op])) return;
    shell.setTool("select");
    select([op.payload.id!]);
    rename(op.payload.id!);
  };

  const onClick = (c: Gesture) => {
    const now = Date.now();
    const dbl = lastClick && now - lastClick.t < DOUBLE_MS && Math.hypot(c.cx - lastClick.x, c.cy - lastClick.y) < 8;
    lastClick = dbl ? null : { t: now, x: c.cx, y: c.cy };
    const t = tool();
    const hit = c.hit;
    if (t === "select" && dbl) {
      if (!hit) return add(addComponentOp(store.map, c.start));
      if (hit.kind === "relation" || hit.kind === "evolve") return openProps(hit.id);
      return rename(hit.id);
    }
    if ((t === "link" || t === "evolve")) {
      const comp = componentOf(hit);
      if (!linkFrom) {
        if (!comp) return select([]);
        linkFrom = { tool: t, id: comp };
        hover = c.start;
        shell.toast("Now click the target component");
        return drawOverlay();
      }
      const op = connectOp(linkFrom.tool, linkFrom.id, comp);
      linkFrom = null;
      hover = null;
      if (op) commit([op]);
      else drawOverlay();
      return;
    }
    if (t === "component" && !hit) return add(addComponentOp(store.map, c.start));
    if (t === "pipeline" && !hit) return add(addComponentOp(store.map, c.start, "pipeline"));
    const id = selectId(hit);
    if (!id) return select([]);
    if (c.shift) select(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]);
    else select([id]);
  };

  const onDragEnd = (c: Gesture, ev: PointerEvent) => {
    if (c.mode === "move") {
      if (c.ops.length) commit(c.ops);
      else render();
    } else if (c.mode === "link" || c.mode === "evolve") {
      const op = connectOp(c.mode, c.from!, componentOf(hitAt(ev.clientX, ev.clientY)));
      if (op) commit([op]);
      else {
        drawOverlay();
        shell.toast("Drop on another component");
      }
    } else if (c.mode === "rect") {
      const op = rectToPipeline(store.map, c.start, c.cur);
      drawOverlay();
      if (op) add(op);
      else shell.toast("Drag a larger rectangle");
    }
  };

  vp.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || !ev.isPrimary) return;
    if (g) cancel();
    const t = tool();
    if (t === "pan") return;
    const hit = hitFor(ev.target as Element, ev.clientX, ev.clientY, ev.pointerType !== "mouse");
    const start = pt(ev.clientX, ev.clientY);
    const comp = componentOf(hit);
    const text = hit?.kind === "label" ? (ev.target as Element).closest("text") : null;
    let mode: Gesture["mode"] = "none";
    if (t === "select" && hit && hit.kind !== "relation" && hit.kind !== "evolve" && hit.kind !== "title") mode = "move";
    else if ((t === "link" || t === "evolve") && comp && !linkFrom) mode = t;
    else if (t === "pipeline" && !hit) mode = "rect";
    const c: Gesture = {
      mode, pid: ev.pointerId, cx: ev.clientX, cy: ev.clientY, moved: false, hit, start, cur: start,
      from: mode === "link" || mode === "evolve" ? comp! : undefined, ops: [], timer: 0, shift: ev.shiftKey,
      labelXY: text ? { x: +text.getAttribute("x")!, y: +text.getAttribute("y")! } : undefined,
    };
    if (ev.pointerType === "touch" && hit) {
      c.timer = window.setTimeout(() => {
        if (g !== c || c.moved) return;
        c.done = true;
        const id = selectId(hit);
        if (id) {
          select([id]);
          openProps(targetOf(id));
        }
      }, LONG_PRESS_MS);
    }
    g = c;
  });

  vp.addEventListener("pointermove", (ev) => {
    if (!g || ev.pointerId !== g.pid) {
      if (linkFrom && ev.isPrimary) {
        hover = pt(ev.clientX, ev.clientY);
        drawOverlay();
      }
      return;
    }
    const c = g;
    if (c.done) return;
    c.cur = pt(ev.clientX, ev.clientY);
    if (!c.moved) {
      if (Math.hypot(ev.clientX - c.cx, ev.clientY - c.cy) < SLOP) return;
      c.moved = true;
      clearTimeout(c.timer);
      if (c.mode === "none") return;
      try { vp.setPointerCapture(c.pid); } catch { /* pointer gone */ }
      if (c.mode === "move") {
        const hit = c.hit!;
        const id = selectId(hit)!;
        if (!selection.includes(id)) select(c.shift ? [...selection, id] : [id]);
        c.drag = dragStart(store.map, prepared, hit, c.start, selection, c.labelXY);
      }
    }
    if (c.mode === "move" && c.drag) {
      c.ops = dragOps(store.map, c.drag, c.cur);
      try {
        schedule(store.preview(c.ops));
      } catch {
        c.ops = [];
      }
    } else if (c.mode !== "none") drawOverlay();
  });

  const end = (ev: PointerEvent) => {
    if (!g || ev.pointerId !== g.pid) return;
    const c = g;
    g = null;
    clearTimeout(c.timer);
    if (c.done) return;
    if (ev.type === "pointercancel") {
      if (c.mode === "move" && c.moved) render();
      return drawOverlay();
    }
    if (!c.moved) onClick(c);
    else onDragEnd(c, ev);
  };
  vp.addEventListener("pointerup", end);
  vp.addEventListener("pointercancel", end);

  vp.addEventListener("contextmenu", (ev) => {
    const id = selectId(hitFor(ev.target as Element, ev.clientX, ev.clientY));
    if (!id) return;
    ev.preventDefault();
    if (g) cancel();
    select([id]);
    openProps(targetOf(id));
  });
  // Browsers' own dblclick (text selection / zoom) is replaced by our double-tap detection.
  vp.addEventListener("dblclick", (ev) => ev.preventDefault());

  doc.addEventListener("keydown", (ev) => {
    const t = ev.target as Element;
    if (ev.key === "Escape" && t.closest?.("#props")) return shell.closePanel();
    if (t.closest?.("input,textarea,select,button,[contenteditable]")) return;
    if (selection.length !== 1 || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "Enter") openProps(targetOf(selection[0]));
    else if (ev.key === "F2" && !selection[0].startsWith("evolve:")) rename(selection[0]);
    else return;
    ev.preventDefault();
  });

  shell.on("tool", cancel);
  shell.on("gesture", cancel);
  shell.on("escape", () => {
    if (g || linkFrom) cancel();
    else select([]);
  });

  // ── Actions ─────────────────────────────────────────────────────
  const history = (f: () => boolean) => () => {
    const ok = f();
    if (ok) changed();
    return ok;
  };
  const undo = history(store.undo);
  const redo = history(store.redo);
  const n = () => `${store.ops.length} edit${store.ops.length === 1 ? "" : "s"}`;
  const SENT: Record<string, [string, "success" | "info" | "error"]> = {
    host: ["Sent %s to Claude", "success"],
    endpoint: ["Sent %s", "success"],
    clipboard: ["Copied %s: paste into Claude", "info"],
    failed: ["Could not send %s: use Download", "error"],
  };

  shell.on("action", async (name: string) => {
    if (g) cancel();
    editing?.finish(true);
    switch (name) {
      case "undo": return void undo();
      case "redo": return void redo();
      case "delete":
        if (!selection.length) return;
        if (commit(deleteOps(store.map, selection))) select([]);
        return;
      case "reset":
        if (store.ops.length && confirm(`Discard ${n()}?`)) {
          store.reset();
          changed();
          shell.toast("All changes discarded (Ctrl+Z to restore)");
        }
        return;
      case "copy-diff": {
        const ok = await copyText(JSON.stringify(store.ops, null, 2));
        return shell.toast(ok ? `Copied ${n()} as JSON` : "Copy failed: clipboard unavailable", ok ? "success" : "error");
      }
      case "send": {
        if (!store.ops.length) return;
        const count = n();
        shell.toast(`Sending ${count}…`);
        const res = await sendToClaude(store.ops, { title: title(), endpoint });
        const [msg, kind] = SENT[res];
        return shell.toast(msg.replace("%s", count), kind);
      }
      case "download-json": {
        const slug = title().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wardley-map";
        return downloadJSON(`${slug}.json`, store.map, doc);
      }
    }
  });

  (window as unknown as { __wardley: unknown }).__wardley = {
    getMap: () => structuredClone(store.map),
    getDiff: () => structuredClone(store.ops as DiffOp[]),
    clearDiff: () => {
      store.clearDiff();
      syncUi();
    },
    apply: (op: DiffOp | DiffOp[]) => commit(Array.isArray(op) ? op : [op]),
    undo,
    redo,
  };

  syncUi();
  drawOverlay();
}

if (typeof document !== "undefined") initEditor(document);
