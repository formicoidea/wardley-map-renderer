import { describe, it, expect } from "vitest";
import { applyDiffOps } from "../diff-ops-apply.js";
import { mapToPx } from "../render/browser-render.js";
import { prepareRender } from "../render/prepare-render.js";
import { sanitizeMap, type WardleyMap } from "../schema.js";
import {
  addComponentOp, componentOf, connectOp, deleteOps, dragOps, dragStart, nearestComponent, nodeCentre, rectToPipeline,
  resolveHit, selectId, selectionExists, type ElLike, type Pt,
} from "./gestures.js";
import { createStore } from "./store.js";

const pos = (evolution: number, visibility: number) => ({ evolution: { scalar: evolution }, visibility: { scalar: visibility } });
const MAP = sanitizeMap({
  title: "T",
  components: [
    { id: "pipe", label: { name: "Pipe" }, type: "pipeline", position: pos(0.5, 0.4), pipelineGeometry: { evoStart: 0.3, evoEnd: 0.7, visStart: 0.35, visEnd: 0.45 } },
    { id: "a", label: { name: "A" }, type: "component", position: pos(0.4, 0.4) },
    { id: "b", label: { name: "B" }, type: "component", position: pos(0.1, 0.1), step: { number: 1 }, evolvesTo: [{ position: pos(0.9, 0.1), evolveType: "natural" }] },
    { id: "c", label: { name: "C" }, type: "component", position: pos(0.9, 0.1) },
  ],
  relations: [{ id: "r1", consumer: "b", supplier: "a", type: "DependsOn" }],
} as WardleyMap);
const prepared = prepareRender(MAP, { interactive: true });
const p = (evo: number, vis: number, x = 0, y = 0): Pt => ({ evo, vis, x, y });

/** Fake element: `attrs` for itself, `parent` attrs for its closest group. */
function el(own: Record<string, string>, parent: Record<string, string> = {}): ElLike {
  const match = (a: Record<string, string>, sel: string) =>
    sel.split(",").some((s) => [...s.matchAll(/\[([\w-]+)\]/g)].every(([, n]) => n in a));
  const wrap = (a: Record<string, string>) => ({ getAttribute: (n: string) => a[n] ?? null });
  return { closest: (sel) => (match(own, sel) ? wrap(own) : match(parent, sel) ? wrap(parent) : null) };
}

describe("resolveHit", () => {
  it("resolves groups, labels and nothing", () => {
    expect(resolveHit(el({}, { "data-id": "a", "data-kind": "component" }))).toEqual({ id: "a", kind: "component" });
    expect(resolveHit(el({ "data-id": "a", "data-kind": "label" }))).toEqual({ id: "a", kind: "label" });
    expect(resolveHit(el({}))).toBeNull();
    expect(resolveHit(null)).toBeNull();
  });

  it("overlay handles (data-for)", () => {
    expect(resolveHit(el({ "data-handle": "se", "data-for": "pipe" }))).toEqual({ id: "pipe", kind: "pipeline", handle: "se" });
    expect(resolveHit(el({ "data-handle": "bogus", "data-for": "pipe" }))).toBeNull();
    // Renderer's pipeline handle square: data-part="handle" on the pipeline hit group.
    expect(resolveHit(el({ "data-part": "handle", "data-id": "pipe", "data-kind": "pipeline" }))).toEqual({ id: "pipe", kind: "pipeline", handle: "h" });
    expect(componentOf({ id: "pipe", kind: "pipeline", handle: "h" })).toBe("pipe");
  });

  it("maps hits to components and selection ids", () => {
    expect(componentOf({ id: "a", kind: "label" })).toBe("a");
    expect(componentOf({ id: "r1", kind: "relation" })).toBeNull();
    expect(componentOf({ id: "title", kind: "title" })).toBeNull();
    expect(selectId({ id: "b", kind: "evolve" })).toBe("evolve:b");
    expect(selectId({ id: "title", kind: "title" })).toBeNull();
    expect(selectionExists(MAP, "evolve:b")).toBe(true);
    expect(selectionExists(MAP, "evolve:a")).toBe(false);
    expect(selectionExists(MAP, "r1")).toBe(true);
  });
});

describe("dragOps", () => {
  it("moves the dragged component, or the whole selection, clamped", () => {
    const d = dragStart(MAP, prepared, { id: "a", kind: "component" }, p(0.4, 0.4), []);
    expect(dragOps(MAP, d, p(0.5, 0.3))).toEqual([{ op: "move_component", payload: { id: "a", evolution: 0.5, visibility: 0.3 } }]);
    expect(dragOps(MAP, d, p(0.4, 0.4))).toEqual([]);
    const multi = dragStart(MAP, prepared, { id: "a", kind: "component" }, p(0.4, 0.4), ["a", "c", "pipe", "r1"]);
    expect(dragOps(MAP, multi, p(0.6, 0.4))).toEqual([
      { op: "move_component", payload: { id: "a", evolution: 0.6, visibility: 0.4 } },
      { op: "move_component", payload: { id: "c", evolution: 1, visibility: 0.1 } },
    ]);
  });

  it("pipeline body → move_pipeline; handles → resize_pipeline", () => {
    const body = dragStart(MAP, prepared, { id: "pipe", kind: "pipeline" }, p(0.5, 0.4), []);
    const ops = dragOps(MAP, body, p(0.6, 0.45));
    expect(ops).toEqual([{ op: "move_pipeline", payload: { id: "pipe", dEvo: 0.1, dVis: 0.05 } }]);
    expect(applyDiffOps(MAP, ops).components.find((c) => c.id === "a")!.position.evolution.scalar).toBeCloseTo(0.5);

    const corner = dragStart(MAP, prepared, { id: "pipe", kind: "pipeline", handle: "nw" }, p(0.3, 0.35), []);
    expect(dragOps(MAP, corner, p(0.2, 0.3))).toEqual([{ op: "resize_pipeline", payload: { id: "pipe", evoStart: 0.2, visStart: 0.3 } }]);
    const sq = dragStart(MAP, prepared, { id: "pipe", kind: "pipeline", handle: "h" }, p(0.5, 0.35), []);
    expect(dragOps(MAP, sq, p(0.6123, 0.2))).toEqual([{ op: "resize_pipeline", payload: { id: "pipe", handleEvolution: 0.612 } }]);
    const edge = dragStart(MAP, prepared, { id: "pipe", kind: "pipeline", handle: "e" }, p(0.7, 0.4), []);
    expect(dragOps(MAP, edge, p(0.8, 0.9))).toEqual([{ op: "resize_pipeline", payload: { id: "pipe", evoEnd: 0.8 } }]);
  });

  it("label → move_label in px relative to the node centre", () => {
    const c = nodeCentre(MAP, prepared, "a")!;
    expect(c).toEqual(mapToPx(prepared, 0.4, 0.4));
    const d = dragStart(MAP, prepared, { id: "a", kind: "label" }, p(0.4, 0.4, c.x + 9, c.y + 4), [], { x: c.x + 9, y: c.y + 4 });
    expect(d.label).toEqual({ dx: 9, dy: 4 });
    expect(dragOps(MAP, d, p(0, 0, c.x + 29, c.y - 6))).toEqual([{ op: "move_label", payload: { id: "a", dx: 29, dy: -6 } }]);
  });

  it("pipeline label anchor is the top-border handle", () => {
    const c = nodeCentre(MAP, prepared, "pipe")!;
    expect(c).toEqual({ x: mapToPx(prepared, 0.5, 0).x, y: mapToPx(prepared, 0, 0.35).y });
  });

  it("step → move_step; relations and titles do not drag", () => {
    const d = dragStart(MAP, prepared, { id: "b", kind: "step" }, p(0.1, 0.1), ["b", "a"]);
    expect(dragOps(MAP, d, p(0.2, 0.2))).toEqual([{ op: "move_step", payload: { id: "b", evolution: 0.2, visibility: 0.2 } }]);
    expect(dragOps(MAP, dragStart(MAP, prepared, { id: "r1", kind: "relation" }, p(0, 0), []), p(1, 1))).toEqual([]);
  });
});

describe("creation and connection ops", () => {
  it("adds components with a fresh id", () => {
    const op = addComponentOp(MAP, p(0.1234, 0.5));
    expect(op.payload).toMatchObject({ id: "new-component", name: "New component", type: "component", evolution: 0.123 });
    const next = applyDiffOps(MAP, [op]);
    expect(addComponentOp(next, p(0, 0)).payload.id).toBe("new-component-2");
  });

  it("rectangle → pipeline with geometry, too small → null", () => {
    const op = rectToPipeline(MAP, p(0.6, 0.8), p(0.2, 0.7))!;
    expect(op.payload).toMatchObject({
      type: "pipeline", name: "New pipeline", evolution: 0.4, visibility: 0.75,
      pipelineGeometry: { evoStart: 0.2, evoEnd: 0.6, visStart: 0.7, visEnd: 0.8 },
    });
    expect(applyDiffOps(MAP, [op]).components.at(-1)!.pipelineGeometry).toEqual(op.payload.pipelineGeometry);
    expect(rectToPipeline(MAP, p(0.5, 0.5), p(0.51, 0.6))).toBeNull();
  });

  it("evolve arrow drag moves its head horizontally", () => {
    const d = dragStart(MAP, prepared, { id: "b", kind: "evolve" }, p(0.5, 0.1), []);
    expect(dragOps(MAP, d, p(0.4, 0.3))).toEqual([{ op: "set_evolves_to", payload: { id: "b", position: { evolution: 0.8, visibility: 0.1 } } }]);
    expect(dragOps(MAP, d, p(0.5, 0.3))).toEqual([]);
  });

  it("evolve into empty space: horizontal arrow at the source visibility; pipelines are not evolve ends", () => {
    expect(connectOp(MAP, "evolve", "a", null, p(0.8123, 0.9))).toEqual({
      op: "set_evolves_to", payload: { id: "a", position: { evolution: 0.812, visibility: 0.4 } },
    });
    expect(connectOp(MAP, "evolve", "a", "pipe", p(0.6, 0.35))).toEqual({
      op: "set_evolves_to", payload: { id: "a", position: { evolution: 0.6, visibility: 0.4 } },
    });
    expect(connectOp(MAP, "evolve", "a", null, p(0.402, 0.9))).toBeNull(); // no length
    expect(connectOp(MAP, "evolve", "a", "a", p(0.8, 0.4))).toBeNull();
    expect(connectOp(MAP, "evolve", "a", null)).toBeNull();
    expect(connectOp(MAP, "evolve", "pipe", "c", p(0.9, 0.1))).toBeNull();
  });

  it("links to and from pipelines", () => {
    expect(connectOp(MAP, "link", "pipe", "c")).toMatchObject({ op: "add_edge", payload: { consumer: "pipe", supplier: "c" } });
    const op = connectOp(MAP, "link", "c", "pipe")!;
    expect(op).toMatchObject({ op: "add_edge", payload: { consumer: "c", supplier: "pipe" } });
    expect(applyDiffOps(MAP, [op]).relations.at(-1)).toMatchObject({ consumer: "c", supplier: "pipe" });
  });

  it("link and evolve", () => {
    // Explicit id: a receiver replaying the diff gets the same relation ids.
    expect(connectOp(MAP, "link", "a", "c")).toEqual({ op: "add_edge", payload: { id: "a-c", consumer: "a", supplier: "c", type: "DependsOn" } });
    expect(connectOp(MAP, "evolve", "a", "c")).toEqual({ op: "set_evolves_to", payload: { id: "a", evolvesTo: "c" } });
    expect(connectOp(MAP, "link", "a", "a")).toBeNull();
    expect(connectOp(MAP, "link", "a", null)).toBeNull();
  });
});

describe("deleteOps", () => {
  it("deletes relations first, pipelines with delete_pipeline, evolve arrows via set_evolves_to", () => {
    const ops = deleteOps(MAP, ["a", "r1", "pipe", "evolve:b", "nope"]);
    expect(ops).toEqual([
      { op: "delete_edge", payload: { id: "r1" } },
      { op: "delete_component", payload: { id: "a" } },
      { op: "delete_pipeline", payload: { id: "pipe" } },
      { op: "set_evolves_to", payload: { id: "b", evolvesTo: null } },
    ]);
    const next = applyDiffOps(MAP, ops);
    expect(next.components.map((c) => c.id)).toEqual(["b", "c"]);
    expect(next.components[0].evolvesTo).toBeUndefined();
  });

  it("skips the evolve op when its component is deleted too", () => {
    expect(deleteOps(MAP, ["evolve:b", "b"])).toEqual([{ op: "delete_component", payload: { id: "b" } }]);
  });
});

describe("store", () => {
  const move = (id: string, e: number) => ({ op: "move_component" as const, payload: { id, evolution: e, visibility: 0.5 } });

  it("commits op groups as one undo step; undo/redo keep the log = net diff", () => {
    const s = createStore(MAP);
    s.commit([move("a", 0.1), move("c", 0.2)]);
    s.commit([move("a", 0.3)]);
    expect(s.ops).toHaveLength(3);
    expect(applyDiffOps(MAP, s.ops)).toEqual(s.map);
    expect(s.undo()).toBe(true);
    expect(s.ops).toHaveLength(2);
    expect(s.map.components[1].position.evolution.scalar).toBe(0.1);
    expect(s.redo()).toBe(true);
    expect(s.ops).toHaveLength(3);
    s.undo();
    s.undo();
    expect(s.map).toBe(MAP);
    expect(s.undo()).toBe(false);
    expect(s.canRedo()).toBe(true);
    s.commit([move("a", 0.9)]);
    expect(s.canRedo()).toBe(false);
  });

  it("invalid ops throw and leave the state unchanged", () => {
    const s = createStore(MAP);
    s.commit([move("a", 0.1)]);
    const before = s.map;
    expect(() => s.commit([move("c", 0.2), move("zzz", 0.1)])).toThrow(/unknown component/);
    expect(s.map).toBe(before);
    expect(s.ops).toHaveLength(1);
    expect(() => s.preview([move("a", 2)])).toThrow();
  });

  it("reset is undoable; checkpoint rebases", () => {
    const s = createStore(MAP);
    s.commit([move("a", 0.1)]);
    s.reset();
    expect(s.map).toBe(MAP);
    expect(s.ops).toEqual([]);
    s.undo();
    expect(s.ops).toHaveLength(1);
    const edited = s.map;
    const diff = s.ops;
    expect(s.checkpoint()).toBe(true);
    expect(diff).toHaveLength(1);
    expect(s.ops).toEqual([]);
    expect(s.original).toBe(edited);
    expect(s.canUndo()).toBe(false);
  });

  it("checkpoint(sent) keeps edits made after sending; refuses a diverged log", () => {
    const s = createStore(MAP);
    s.commit([move("a", 0.1)]);
    const sent = s.ops;
    const sentMap = s.map;
    s.commit([move("c", 0.2)]);
    expect(s.checkpoint(sent)).toBe(true);
    expect(s.ops).toEqual([move("c", 0.2)]);
    expect(s.original).toEqual(sentMap);
    expect(applyDiffOps(s.original, s.ops)).toEqual(s.map);
    expect(s.canUndo()).toBe(false);

    const t = createStore(MAP);
    t.commit([move("a", 0.1)]);
    const sent2 = t.ops;
    t.undo();
    t.commit([move("c", 0.3)]);
    expect(t.checkpoint(sent2)).toBe(false);
    expect(t.ops).toHaveLength(1);
    expect(t.original).toBe(MAP);
  });

  it("stored ops are copies", () => {
    const s = createStore(MAP);
    const op = move("a", 0.1);
    s.commit([op]);
    op.payload.evolution = 0.7;
    expect((s.ops[0].payload as { evolution: number }).evolution).toBe(0.1);
  });
});

describe("nearestComponent", () => {
  it("finds the closest node within the radius, never pipelines", () => {
    const a = mapToPx(prepared, 0.4, 0.4);
    expect(nearestComponent(MAP, prepared, p(0, 0, a.x + 5, a.y), 8)).toEqual({ id: "a", kind: "component" });
    expect(nearestComponent(MAP, prepared, p(0, 0, a.x + 9, a.y), 8)).toBeNull();
    const pipe = mapToPx(prepared, 0.5, 0.4);
    expect(nearestComponent(MAP, prepared, p(0, 0, pipe.x, pipe.y), 4)).toBeNull();
  });
});
