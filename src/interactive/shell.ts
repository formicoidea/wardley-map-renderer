/**
 * App shell for the interactive editor: toolbar, shortcuts, pan/zoom,
 * properties panel and toast. Knows nothing about Wardley maps — the
 * controller subscribes via `on('tool' | 'action' | ...)`.
 *
 * DOM contract: see template.html (#viewport > #stage > #map + #overlay).
 *
 * @module interactive/shell
 */

export type Tool = "select" | "component" | "link" | "evolve" | "pipeline" | "pan";

export interface View {
  x: number;
  y: number;
  k: number;
  fit(): void;
  /** Multiply zoom by `factor`, keeping client point (cx, cy) fixed. */
  zoomAt(factor: number, cx: number, cy: number): void;
  /** Pan by (dx, dy) screen px. */
  panBy(dx: number, dy: number): void;
  /** Client coordinates → SVG user units of the map viewBox. */
  screenToSvg(clientX: number, clientY: number): { x: number; y: number };
  /** Overridable: may a primary-button drag starting here pan the view? */
  shouldPan(ev: PointerEvent): boolean;
}

/**
 * Events: `tool` (tool), `action` (name, event) — zoom-in/zoom-out/fit/collapse are
 * handled by the shell and still emitted — `view` (view), `escape`, `panel-close`,
 * `gesture` (a pinch started: cancel any in-progress drag).
 */
export interface Shell {
  setTool(t: Tool): void;
  getTool(): Tool;
  toast(msg: string, kind?: "info" | "success" | "error"): void;
  openPanel(title: string, body: Node): void;
  closePanel(): void;
  setDiffCount(n: number): void;
  /** True when this pointerdown pans regardless of its target (middle button, pan tool, Space held). */
  isPanForced(ev: PointerEvent): boolean;
  view: View;
  on(event: string, cb: (...args: any[]) => void): void;
}

const KEYS: Record<string, Tool> = { v: "select", c: "component", l: "link", e: "evolve", p: "pipeline", h: "pan" };
const STORE = "wardley.toolbar.collapsed";
const clamp = (k: number) => Math.min(8, Math.max(0.1, k));

export function initShell(doc: Document): Shell {
  const $ = (s: string) => doc.querySelector(s) as HTMLElement;
  const vp = $("#viewport"), stage = $("#stage"), map = $("#map"), bar = $("#bar"), props = $("#props");
  const toastEl = $("#toast"), overlay = $("#overlay"), tip = $("#tip");
  const subs: Record<string, ((...a: any[]) => void)[]> = {};
  const emit = (e: string, ...a: unknown[]) => subs[e]?.forEach((f) => f(...a));
  let tool: Tool = "select", space = false, fitted = true, timer = 0;

  const vb = () => {
    const b = map.querySelector("svg")?.viewBox?.baseVal;
    return b && b.width ? b : { x: 0, y: 0, width: 1600, height: 900 };
  };
  const sync = () => {
    const b = vb();
    stage.style.width = b.width + "px";
    stage.style.height = b.height + "px";
    overlay.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
  };
  const apply = () => {
    stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
    $("#zoom-level").textContent = Math.round(view.k * 100) + "%";
    emit("view", view);
  };
  const center = () => {
    const r = vp.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2] as const;
  };

  const view: View = {
    x: 0,
    y: 0,
    k: 1,
    fit() {
      const r = vp.getBoundingClientRect(), b = vb();
      let top = 16, bottom = 16;
      // Keep the map clear of floating chrome (toolbar, zoom cluster).
      for (const el of [bar, $("#zoom")]) {
        const e = el.getBoundingClientRect();
        if (!e.height) continue;
        if (e.top < r.height / 2) top = Math.max(top, e.bottom - r.top + 12);
        else bottom = Math.max(bottom, r.bottom - e.top + 12);
      }
      const h = Math.max(1, r.height - top - bottom);
      view.k = clamp(Math.min((r.width - 32) / b.width, h / b.height));
      view.x = (r.width - b.width * view.k) / 2;
      view.y = top + (h - b.height * view.k) / 2;
      fitted = true;
      apply();
    },
    panBy(dx, dy) {
      view.x += dx;
      view.y += dy;
      fitted = false;
      apply();
    },
    zoomAt(f, cx, cy) {
      const r = vp.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, k = clamp(view.k * f);
      view.x = px - ((px - view.x) * k) / view.k;
      view.y = py - ((py - view.y) * k) / view.k;
      view.k = k;
      fitted = false;
      apply();
    },
    screenToSvg(cx, cy) {
      const b = vb(), r = stage.getBoundingClientRect();
      return { x: b.x + ((cx - r.left) * b.width) / r.width, y: b.y + ((cy - r.top) * b.height) / r.height };
    },
    shouldPan: (ev) => !(ev.target as Element).closest?.("[data-id],[data-kind],[data-handle],input,textarea,select,button"),
  };

  // ── Tools, actions, panel, toast ────────────────────────────────
  const setTool = (t: Tool) => {
    if (t === tool) return;
    tool = t;
    vp.dataset.tool = t;
    doc.querySelectorAll<HTMLElement>("[data-tool]").forEach((b) => b !== vp && b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
    emit("tool", t);
  };
  const setCollapsed = (c: boolean) => {
    bar.classList.toggle("collapsed", c);
    const b = bar.querySelector("[data-action=collapse]")!, label = c ? "Show toolbar" : "Hide toolbar";
    b.setAttribute("aria-expanded", String(!c));
    b.setAttribute("aria-label", label);
    try { localStorage.setItem(STORE, c ? "1" : ""); } catch { /* storage unavailable */ }
  };
  const act = (name: string, ev: Event) => {
    if (name === "zoom-in" || name === "zoom-out") view.zoomAt(name === "zoom-in" ? 1.25 : 0.8, ...center());
    else if (name === "fit") view.fit();
    else if (name === "collapse") setCollapsed(!bar.classList.contains("collapsed"));
    emit("action", name, ev);
  };
  const closePanel = () => {
    if (props.hidden) return;
    props.hidden = true;
    emit("panel-close");
  };

  doc.addEventListener("click", (ev) => {
    const t = ev.target as Element;
    if (t.closest?.("[data-close]")) return closePanel();
    const b = t.closest?.("button[data-tool],button[data-action]") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    if (b.dataset.tool) setTool(b.dataset.tool as Tool);
    else act(b.dataset.action!, ev);
  });

  // ── Keyboard ────────────────────────────────────────────────────
  doc.addEventListener("keydown", (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest?.("input,textarea,select,[contenteditable=''],[contenteditable=true]")) return;
    const k = ev.key.toLowerCase();
    let a: string;
    if (ev.ctrlKey || ev.metaKey) {
      if (k === "z") a = ev.shiftKey ? "redo" : "undo";
      else if (k === "y") a = "redo";
      else if (k === "=" || k === "+") a = "zoom-in";
      else if (k === "-") a = "zoom-out";
      else return;
    } else if (ev.altKey) return;
    else if (k === "delete" || k === "backspace") a = "delete";
    else if (ev.shiftKey && ev.code === "Digit1") a = "fit";
    else if (k === "escape") {
      closePanel();
      return emit("escape");
    } else if (k === " ") {
      if (t.closest?.("button")) return;
      ev.preventDefault();
      space = true;
      return void vp.classList.add("grab");
    } else if (!ev.shiftKey && KEYS[k]) return setTool(KEYS[k]);
    else return;
    ev.preventDefault();
    act(a, ev);
  });
  const spaceUp = () => {
    space = false;
    vp.classList.remove("grab");
  };
  // Icon buttons carry only aria-label (a title would duplicate it for screen
  // readers and cannot be styled); mouse users get this tooltip instead.
  doc.addEventListener("pointerover", (ev) => {
    const b = ev.pointerType === "mouse" && (ev.target as Element).closest?.("button[aria-label]");
    tip.hidden = !b;
    if (!b) return;
    const r = b.getBoundingClientRect(), up = r.top > innerHeight / 2;
    tip.textContent = b.getAttribute("aria-label");
    tip.style.cssText = `left:${r.left + r.width / 2}px;top:${up ? r.top - 6 : r.bottom + 6}px;translate:-50% ${up ? -100 : 0}%`;
  });
  doc.addEventListener("pointerdown", () => (tip.hidden = true), true);
  doc.addEventListener("keyup", (ev) => ev.key === " " && spaceUp());
  addEventListener("blur", spaceUp);

  // ── Pan & zoom ──────────────────────────────────────────────────
  const pts = new Map<number, { x: number; y: number }>();
  let drag: { id: number; sx: number; sy: number; ox: number; oy: number; on: boolean } | null = null;
  let pinch: { d: number; mx: number; my: number } | null = null;
  const pair = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const capture = (id: number) => {
    try { vp.setPointerCapture(id); } catch { /* pointer already gone */ }
  };
  // After a real pan, the trailing click must not reach the controller.
  // Flag-based (not timer-based): reset by the next pointerdown.
  let swallow = false;
  addEventListener("pointerdown", () => (swallow = false), true);
  addEventListener("click", (e) => {
    if (swallow) {
      swallow = false;
      e.stopPropagation();
    }
  }, true);

  vp.addEventListener("pointerdown", (ev) => {
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 2 && ev.pointerType === "touch") {
      drag = null;
      pinch = pair();
      pts.forEach((_, id) => capture(id));
      return emit("gesture");
    }
    const forced = isPanForced(ev);
    if (pts.size === 1 && (forced || (ev.button === 0 && view.shouldPan(ev)))) {
      if (forced) ev.preventDefault();
      drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: view.x, oy: view.y, on: false };
    }
  });
  vp.addEventListener("pointermove", (ev) => {
    if (!pts.has(ev.pointerId)) return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pts.size > 1) {
      const p = pair();
      view.x += p.mx - pinch.mx;
      view.y += p.my - pinch.my;
      view.zoomAt(p.d / pinch.d, p.mx, p.my);
      pinch = p;
      return;
    }
    if (drag?.id !== ev.pointerId) return;
    const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.on = true;
      capture(ev.pointerId);
      vp.classList.add("panning");
    }
    view.x = drag.ox + dx;
    view.y = drag.oy + dy;
    fitted = false;
    apply();
  });
  const end = (ev: PointerEvent) => {
    pts.delete(ev.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag?.id !== ev.pointerId) return;
    if (drag.on) {
      vp.classList.remove("panning");
      swallow = true;
    }
    drag = null;
  };
  vp.addEventListener("pointerup", end);
  vp.addEventListener("pointercancel", end);
  vp.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const m = ev.deltaMode ? 16 : 1;
    if (ev.ctrlKey || ev.metaKey) {
      const d = Math.max(-10, Math.min(10, ev.deltaY * m));
      return view.zoomAt(Math.exp(-d * 0.01), ev.clientX, ev.clientY);
    }
    const sideways = ev.shiftKey && !ev.deltaX;
    view.panBy(-(sideways ? ev.deltaY : ev.deltaX) * m, sideways ? 0 : -ev.deltaY * m);
  }, { passive: false });

  const isPanForced = (ev: PointerEvent) => ev.button === 1 || tool === "pan" || space;
  const setDiffCount = (n: number) => {
    doc.querySelectorAll<HTMLElement>("[data-diff-count]").forEach((e) => {
      e.textContent = n > 99 ? "99+" : String(n);
      e.hidden = !n;
    });
    // Nothing to send, copy or reset until there is a diff.
    doc.querySelectorAll<HTMLButtonElement>("[data-action=send],[data-action=copy-diff],[data-action=reset]").forEach((b) => (b.disabled = !n));
  };

  // ── Init ────────────────────────────────────────────────────────
  let collapsed = false;
  try { collapsed = !!localStorage.getItem(STORE); } catch { /* storage unavailable */ }
  setCollapsed(collapsed);
  doc.querySelectorAll<HTMLElement>("button[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
  setDiffCount(0);
  sync();
  new MutationObserver(sync).observe(map, { childList: true });
  const ro = new ResizeObserver(() => {
    // Mobile: the properties sheet docks above the (bottom) toolbar.
    doc.body.style.setProperty("--bar-h", bar.offsetHeight + "px");
    if (fitted) view.fit();
  });
  ro.observe(vp);
  ro.observe(bar);
  view.fit();

  return {
    setTool,
    getTool: () => tool,
    toast(msg, kind = "info") {
      toastEl.textContent = msg;
      toastEl.dataset.kind = kind;
      toastEl.classList.add("show");
      clearTimeout(timer);
      timer = window.setTimeout(() => toastEl.classList.remove("show"), kind === "error" ? 5000 : 2800);
    },
    openPanel(title, body) {
      $("#props-title").textContent = title;
      $("#props-body").replaceChildren(body);
      props.hidden = false;
    },
    closePanel,
    setDiffCount,
    isPanForced,
    view,
    on(event, cb) {
      (subs[event] ??= []).push(cb);
    },
  };
}
