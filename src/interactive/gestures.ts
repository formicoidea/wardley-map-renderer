/**
 * Pure editor helpers (no DOM): hit resolution, gesture → diff-op mapping,
 * selection ids. Tested in node; used by interactive.ts.
 *
 * Selection ids: a component or relation id, or `evolve:<componentId>` for an
 * evolve arrow.
 *
 * @module interactive/gestures
 */

import { uniqueId, type DiffOp } from "../diff-ops-apply.js";
import { mapToPx, type PreparedRender } from "../render/browser-render.js";
import type { HitKind } from "../render/svg-primitives.js";
import type { WardleyMap } from "../schema.js";

/** Pointer position: SVG user units (x, y) + normalized map coords (evo, vis, clamped). */
export interface Pt { x: number; y: number; evo: number; vis: number }

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export interface Hit { id: string; kind: HitKind; handle?: Handle }

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
 * (`data-handle` + `data-for`), which win over their pipeline.
 */
export function resolveHit(el: ElLike | null | undefined): Hit | null {
  if (!el || typeof el.closest !== "function") return null;
  const group = el.closest("[data-id][data-kind]");
  const h = el.closest("[data-handle]");
  if (h) {
    const handle = h.getAttribute("data-handle") as Handle;
    const id = h.getAttribute("data-for");
    if (HANDLES.has(handle) && id) return { id, kind: "pipeline", handle };
  }
  const id = group?.getAttribute("data-id");
  return id ? { id, kind: group!.getAttribute("data-kind") as HitKind } : null;
}

/** Component id a hit refers to (null for relations and the title). */
export function componentOf(hit: Hit | null): string | null {
  return hit && hit.kind !== "relation" && hit.kind !== "title" ? hit.id : null;
}

/** Selection id for a hit (null: not selectable). */
export function selectId(hit: Hit | null): string | null {
  if (!hit || hit.kind === "title") return null;
  return hit.kind === "evolve" ? `evolve:${hit.id}` : hit.id;
}

/** Target id for the properties panel / existence checks (strips `evolve:`). */
export const targetOf = (sel: string) => sel.replace(/^evolve:/, "");

export function selectionExists(map: WardleyMap, sel: string): boolean {
  const id = targetOf(sel);
  const comp = map.components.find((c) => c.id === id);
  if (sel !== id) return !!comp?.evolvesTo?.length;
  return !!comp || map.relations.some((r) => r.id === id);
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

/** What a select-tool drag operates on, captured at drag start. */
export interface DragStart {
  hit: Hit;
  start: Pt;
  /** Components moved together (component drags). */
  ids: string[];
  /** Label offset from its node centre at drag start (label drags). */
  label?: { dx: number; dy: number };
}

/** Start a select-tool drag; `labelXY` is the dragged <text>'s x/y attributes. */
export function dragStart(
  map: WardleyMap,
  prepared: PreparedRender,
  hit: Hit,
  start: Pt,
  selection: readonly string[],
  labelXY?: { x: number; y: number },
): DragStart {
  let ids = [hit.id];
  if (hit.kind === "component" && selection.includes(hit.id)) {
    const movable = new Set(map.components.filter((c) => c.type !== "pipeline").map((c) => c.id));
    ids = selection.filter((s) => movable.has(s));
  }
  const d: DragStart = { hit, start, ids };
  if (hit.kind === "label" && labelXY) {
    const c = nodeCentre(map, prepared, hit.id);
    if (c) d.label = { dx: labelXY.x - c.x, dy: labelXY.y - c.y };
  }
  return d;
}

/** Ops for a select-tool drag at pointer `cur` (empty when nothing changes). */
export function dragOps(map: WardleyMap, d: DragStart, cur: Pt): DiffOp[] {
  const dEvo = round3(cur.evo - d.start.evo);
  const dVis = round3(cur.vis - d.start.vis);
  const { hit } = d;
  if (hit.handle) {
    const p: { id: string; evoStart?: number; evoEnd?: number; visStart?: number; visEnd?: number } = { id: hit.id };
    const e = round3(cur.evo), v = round3(cur.vis);
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
      return cur.x === d.start.x && cur.y === d.start.y ? [] : [{ op: "move_label", payload: { id: hit.id, dx, dy } }];
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

/** Link / evolve gesture result (null: no valid target). add_edge carries its id so replays match. */
export function connectOp(map: WardleyMap, tool: "link" | "evolve", from: string, to: string | null): DiffOp | null {
  if (!to || to === from) return null;
  return tool === "link"
    ? { op: "add_edge", payload: { id: uniqueId(map, `${from}-${to}`), consumer: from, supplier: to, type: "DependsOn" } }
    : { op: "set_evolves_to", payload: { id: from, evolvesTo: to } };
}
