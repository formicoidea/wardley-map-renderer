/**
 * Pure editor helpers (no DOM): hit resolution, gesture → diff-op mapping,
 * selection ids. Tested in node; used by interactive.ts.
 *
 * Selection ids: a component or relation id, or `evolve:<componentId>` for an
 * evolve arrow.
 *
 * Pipelines are link endpoints like components (body, border or handle square);
 * the handle square (`data-part="handle"`, drawn by the renderer) drags the
 * pipeline's handleEvolution. Evolve arrows never start or end on a pipeline.
 *
 * Chrome: the legend (`data-kind="legend"`) only moves (`move_legend`), and the
 * map background (`data-kind="background"`) only resizes, through overlay
 * handles, in the background tool (`resize_canvas`).
 *
 * @module interactive/gestures
 */

import { uniqueId, type DiffOp } from "../diff-ops-apply.js";
import { mapToPx, type PreparedRender } from "../render/browser-render.js";
import { computeCanvasFrame } from "../render/context-core.js";
import type { HitKind } from "../render/svg-primitives.js";
import type { LabelAnchor, WardleyMap } from "../schema.js";

/** Pointer position: SVG user units (x, y) + normalized map coords (evo, vis, clamped). */
export interface Pt { x: number; y: number; evo: number; vis: number }

/** Overlay resize handles, or "h": the renderer's pipeline handle square (drags handleEvolution). */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "h";
export interface Hit { id: string; kind: HitKind; handle?: Handle }

/** The legend's `data-id` (it is chrome, not a map object). */
export const LEGEND_ID = "legend";
/** Canvas size floor for the background resize tool (px). */
export const MIN_CANVAS = { w: 400, h: 300 };
/** Canvas size ceiling accepted by `resize_canvas`. */
const MAX_CANVAS = 10000;

/** Minimal Element surface used by resolveHit (keeps it testable without a DOM). */
export interface ElLike {
  closest(sel: string): { getAttribute(name: string): string | null } | null;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const round3 = (v: number) => Math.round(v * 1000) / 1000;

const HANDLES = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);

/**
 * Map an event target to the editor element under it. Relies only on the
 * renderer's `data-id`/`data-kind` groups and the overlay's own handles
 * (`data-handle` + `data-for`, kind from `data-kind`, pipeline by default),
 * which win over their pipeline. The renderer's pipeline handle square is a
 * pipeline group with `data-part="handle"` (handle "h").
 */
export function resolveHit(el: ElLike | null | undefined): Hit | null {
  if (!el || typeof el.closest !== "function") return null;
  const group = el.closest("[data-id][data-kind]");
  const h = el.closest("[data-handle]");
  if (h) {
    const handle = h.getAttribute("data-handle") as Handle;
    const id = h.getAttribute("data-for");
    if (HANDLES.has(handle) && id) return { id, kind: (h.getAttribute("data-kind") as HitKind) ?? "pipeline", handle };
  }
  const id = group?.getAttribute("data-id");
  if (!id) return null;
  const hit: Hit = { id, kind: group!.getAttribute("data-kind") as HitKind };
  if (group!.getAttribute("data-part") === "handle") hit.handle = "h";
  return hit;
}

/** Kinds that are not a component: they never link, evolve or rename. */
const NOT_A_COMPONENT = new Set<HitKind>(["relation", "title", "legend", "background"]);

/** Component id a hit refers to (null for relations, the title and chrome). */
export function componentOf(hit: Hit | null): string | null {
  return hit && !NOT_A_COMPONENT.has(hit.kind) ? hit.id : null;
}

/** Selection id for a hit (null: not selectable). */
export function selectId(hit: Hit | null): string | null {
  if (!hit || hit.kind === "title" || hit.kind === "background") return null;
  return hit.kind === "evolve" ? `evolve:${hit.id}` : hit.id;
}

/** Target id for the properties panel / existence checks (strips `evolve:`). */
export const targetOf = (sel: string) => sel.replace(/^evolve:/, "");

export function selectionExists(map: WardleyMap, sel: string): boolean {
  const id = targetOf(sel);
  const comp = map.components.find((c) => c.id === id);
  if (sel !== id) return !!comp?.evolvesTo?.length;
  // The legend is chrome, not a map object, but stays selected across edits.
  return !!comp || id === LEGEND_ID || map.relations.some((r) => r.id === id);
}

/** Ops deleting the selection: relations first (component deletes cascade to them). */
export function deleteOps(map: WardleyMap, selection: readonly string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  const gone = new Set<string>();
  for (const sel of selection) {
    const rel = map.relations.find((r) => r.id === sel);
    if (rel && !gone.has(rel.id)) {
      gone.add(rel.id);
      ops.push({ op: "delete_edge", payload: { id: rel.id } });
    }
  }
  for (const sel of selection) {
    const comp = map.components.find((c) => c.id === targetOf(sel));
    if (!comp) continue;
    if (sel !== comp.id) {
      if (comp.evolvesTo?.length && !selection.includes(comp.id)) {
        ops.push({ op: "set_evolves_to", payload: { id: comp.id, evolvesTo: null } });
      }
    } else if (!gone.has(comp.id)) {
      gone.add(comp.id);
      ops.push({ op: comp.type === "pipeline" ? "delete_pipeline" : "delete_component", payload: { id: comp.id } });
    }
  }
  return ops;
}

/** SVG position edges and label offsets are measured from (pipelines: top-border handle). */
export function nodeCentre(map: WardleyMap, prepared: PreparedRender, id: string): { x: number; y: number } | null {
  const c = map.components.find((x) => x.id === id);
  if (!c) return null;
  const g = c.type === "pipeline" ? c.pipelineGeometry : undefined;
  if (g) {
    const a = mapToPx(prepared, g.handleEvolution ?? (g.evoStart + g.evoEnd) / 2, g.visStart);
    const b = mapToPx(prepared, g.evoStart, g.visEnd);
    return { x: a.x, y: Math.min(a.y, b.y) };
  }
  return mapToPx(prepared, c.position.evolution.scalar, c.position.visibility.scalar);
}

/**
 * Closest non-pipeline component node within `radius` SVG units of `p`
 * (fallback hit target: nodes are only a few px wide when zoomed out on touch).
 */
export function nearestComponent(map: WardleyMap, prepared: PreparedRender, p: Pt, radius: number): Hit | null {
  let best: Hit | null = null;
  let bestD = radius;
  for (const c of map.components) {
    if (c.type === "pipeline") continue;
    const n = mapToPx(prepared, c.position.evolution.scalar, c.position.visibility.scalar);
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = { id: c.id, kind: "component" };
    }
  }
  return best;
}

/** Canvas (map background) size in px for the prepared config, overrides included. */
export function canvasSize(prepared: PreparedRender): { w: number; h: number } {
  const f = computeCanvasFrame(prepared.options, prepared.config);
  return { w: f.canvasWidth, h: f.canvasHeight };
}

/** Where the dragged element sits at drag start (SVG user units). */
export interface DragAnchor {
  x: number;
  y: number;
  /** Label drags: the <text>'s `text-anchor`, kept so the label does not jump. */
  anchor?: string | null;
}

/** What a drag operates on, captured at drag start. */
export interface DragStart {
  hit: Hit;
  start: Pt;
  /** Components moved together (component drags). */
  ids: string[];
  /** Label offset from its node centre, with its anchor (label drags). */
  label?: { dx: number; dy: number; anchor?: LabelAnchor };
  /** Legend box top-left in canvas px (legend drags). */
  legend?: { x: number; y: number };
  /** Canvas size (background resize drags). */
  canvas?: { w: number; h: number };
}

/** Start a drag; `at` is the dragged <text>'s x/y (labels) or the legend box top-left. */
export function dragStart(
  map: WardleyMap,
  prepared: PreparedRender,
  hit: Hit,
  start: Pt,
  selection: readonly string[],
  at?: DragAnchor,
): DragStart {
  let ids = [hit.id];
  if (hit.kind === "component" && selection.includes(hit.id)) {
    const movable = new Set(map.components.filter((c) => c.type !== "pipeline").map((c) => c.id));
    ids = selection.filter((s) => movable.has(s));
  }
  const d: DragStart = { hit, start, ids };
  if (hit.kind === "label" && at) {
    const c = nodeCentre(map, prepared, hit.id);
    if (c) {
      d.label = { dx: at.x - c.x, dy: at.y - c.y };
      if (at.anchor === "start" || at.anchor === "middle" || at.anchor === "end") d.label.anchor = at.anchor;
    }
  } else if (hit.kind === "legend" && at) d.legend = { x: at.x, y: at.y };
  else if (hit.kind === "background") d.canvas = canvasSize(prepared);
  return d;
}

/**
 * Ops for a background-handle drag: the canvas grows with the dragged edge
 * (its origin stays at 0,0, so a west/north handle mirrors the movement).
 */
function resizeCanvasOps(d: DragStart, cur: Pt): DiffOp[] {
  const s = d.canvas;
  const h = d.hit.handle;
  if (!s || !h) return [];
  const dim = (v: number, min: number) => Math.round(Math.max(min, Math.min(MAX_CANVAS, v)));
  const p: { width?: number; height?: number } = {};
  if (h.includes("e")) p.width = dim(s.w + cur.x - d.start.x, MIN_CANVAS.w);
  else if (h.includes("w")) p.width = dim(s.w - cur.x + d.start.x, MIN_CANVAS.w);
  if (h.includes("s")) p.height = dim(s.h + cur.y - d.start.y, MIN_CANVAS.h);
  else if (h.includes("n")) p.height = dim(s.h - cur.y + d.start.y, MIN_CANVAS.h);
  if (p.width === s.w) delete p.width;
  if (p.height === s.h) delete p.height;
  return p.width === undefined && p.height === undefined ? [] : [{ op: "resize_canvas", payload: p }];
}

/** Ops for a select-tool drag at pointer `cur` (empty when nothing changes). */
export function dragOps(map: WardleyMap, d: DragStart, cur: Pt): DiffOp[] {
  const dEvo = round3(cur.evo - d.start.evo);
  const dVis = round3(cur.vis - d.start.vis);
  const { hit } = d;
  if (hit.handle) {
    if (hit.kind === "background") return resizeCanvasOps(d, cur);
    const e = round3(cur.evo), v = round3(cur.vis);
    if (hit.handle === "h") return [{ op: "resize_pipeline", payload: { id: hit.id, handleEvolution: e } }];
    const p: { id: string; evoStart?: number; evoEnd?: number; visStart?: number; visEnd?: number } = { id: hit.id };
    if (hit.handle.includes("w")) p.evoStart = e;
    if (hit.handle.includes("e")) p.evoEnd = e;
    if (hit.handle.includes("n")) p.visStart = v;
    if (hit.handle.includes("s")) p.visEnd = v;
    return [{ op: "resize_pipeline", payload: p }];
  }
  switch (hit.kind) {
    case "label": {
      const dx = Math.round((d.label?.dx ?? 9) + cur.x - d.start.x);
      const dy = Math.round((d.label?.dy ?? 4) + cur.y - d.start.y);
      // The anchor captured at drag start keeps the text where the pointer took it
      // (the renderer would otherwise re-derive it from the sign of dx).
      const anchor = d.label?.anchor;
      return cur.x === d.start.x && cur.y === d.start.y
        ? []
        : [{ op: "move_label", payload: anchor ? { id: hit.id, dx, dy, anchor } : { id: hit.id, dx, dy } }];
    }
    case "legend": {
      if (!d.legend || (cur.x === d.start.x && cur.y === d.start.y)) return [];
      const x = Math.round(Math.max(0, d.legend.x + cur.x - d.start.x));
      const y = Math.round(Math.max(0, d.legend.y + cur.y - d.start.y));
      return [{ op: "move_legend", payload: { x, y } }];
    }
    case "pipeline":
      return dEvo || dVis ? [{ op: "move_pipeline", payload: { id: hit.id, dEvo, dVis } }] : [];
    case "component":
    case "step": {
      if (!dEvo && !dVis) return [];
      const op = hit.kind === "step" ? "move_step" : "move_component";
      return d.ids.flatMap((id): DiffOp[] => {
        const c = map.components.find((x) => x.id === id);
        if (!c) return [];
        const evolution = clamp01(round3(c.position.evolution.scalar + dEvo));
        const visibility = clamp01(round3(c.position.visibility.scalar + dVis));
        return [{ op, payload: { id, evolution, visibility } }];
      });
    }
    case "evolve": {
      // Moves the (first) arrow head horizontally by the drag delta.
      const t = map.components.find((x) => x.id === hit.id)?.evolvesTo?.[0]?.position;
      if (!t || !dEvo) return [];
      const evolution = clamp01(round3(t.evolution.scalar + dEvo));
      return [{ op: "set_evolves_to", payload: { id: hit.id, position: { evolution, visibility: t.visibility.scalar } } }];
    }
    default:
      return [];
  }
}

/** add_component for a new component at `p` (id generated so the caller can select it). */
export function addComponentOp(map: WardleyMap, p: Pt, type: "component" | "pipeline" = "component"): DiffOp & { op: "add_component" } {
  const name = type === "pipeline" ? "New pipeline" : "New component";
  return {
    op: "add_component",
    payload: { id: uniqueId(map, name), name, type, evolution: round3(p.evo), visibility: round3(p.vis) },
  };
}

/** add_component (pipeline) for a dragged rectangle; null when it is too small. */
export function rectToPipeline(map: WardleyMap, a: Pt, b: Pt): (DiffOp & { op: "add_component" }) | null {
  const g = {
    evoStart: round3(Math.min(a.evo, b.evo)),
    evoEnd: round3(Math.max(a.evo, b.evo)),
    visStart: round3(Math.min(a.vis, b.vis)),
    visEnd: round3(Math.max(a.vis, b.vis)),
  };
  if (g.evoEnd - g.evoStart < 0.02 || g.visEnd - g.visStart < 0.01) return null;
  const op = addComponentOp(map, { x: 0, y: 0, evo: (g.evoStart + g.evoEnd) / 2, vis: (g.visStart + g.visEnd) / 2 }, "pipeline");
  op.payload.pipelineGeometry = g;
  return op;
}

/** Whether an evolve gesture may start on component `id` (not pipelines: they have no arrows). */
export const canEvolve = (map: WardleyMap, id: string | null): id is string =>
  !!id && map.components.some((c) => c.id === id && c.type !== "pipeline");

/**
 * Link / evolve gesture result (null: no valid target). add_edge carries its id so replays match.
 * Evolve: onto another (non-pipeline) component → that component; elsewhere (`at`) →
 * a horizontal arrow to the pointer's evolution at the source's visibility.
 */
export function connectOp(map: WardleyMap, tool: "link" | "evolve", from: string, to: string | null, at?: Pt): DiffOp | null {
  if (tool === "link") {
    if (!to || to === from) return null;
    return { op: "add_edge", payload: { id: uniqueId(map, `${from}-${to}`), consumer: from, supplier: to, type: "DependsOn" } };
  }
  const src = map.components.find((c) => c.id === from);
  if (!src || src.type === "pipeline" || to === from) return null;
  if (to !== null && canEvolve(map, to)) return { op: "set_evolves_to", payload: { id: from, evolvesTo: to } };
  if (!at) return null;
  const evolution = round3(clamp01(at.evo));
  if (Math.abs(evolution - src.position.evolution.scalar) < 0.01) return null;
  return { op: "set_evolves_to", payload: { id: from, position: { evolution, visibility: src.position.visibility.scalar } } };
}
