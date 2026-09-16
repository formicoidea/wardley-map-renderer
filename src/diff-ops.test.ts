/**
 * Diff ops: zod payload schemas (diff-ops.ts) + op semantics of the pure engine
 * (diff-ops-apply.ts). Purity, errors, set_field, move_pipeline and rounding
 * are covered in diff-ops-apply.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  MoveComponentPayload,
  AddComponentPayload,
  DeleteComponentPayload,
  RenameComponentPayload,
  AddEdgePayload,
  DeleteEdgePayload,
  ChangeComponentTypePayload,
  SetEvolvesToPayload,
  SetFlowPayload,
  ChangeEdgeTypePayload,
  ResizePipelinePayload,
  RenameMapPayload,
  MoveLabelPayload,
  MoveStepPayload,
  DiffOp,
} from "./diff-ops.js";
import { DiffOpSchema } from "./index.js";
import {
  applyDiffOp,
  applyDiffOps,
  expandDeleteCascade,
  expandChangeTypeCascade,
  type DiffOp as Op,
} from "./diff-ops-apply.js";
import type { Component, WardleyMap } from "./schema.js";

// ── Fixtures ─────────────────────────────────────────────────────────

const comp = (id: string, e: number, v: number, extra: Partial<Component> = {}): Component =>
  ({ id, label: { name: id }, type: "component", position: { evolution: { scalar: e }, visibility: { scalar: v } }, ...extra }) as Component;

/** comp-1 → comp-2 → comp-3 */
const makeMap = (): WardleyMap => ({
  title: "Test Map",
  components: [comp("comp-1", 0.8, 0.1), comp("comp-2", 0.6, 0.3), comp("comp-3", 0.4, 0.5)],
  relations: [
    { id: "rel-1", consumer: "comp-1", supplier: "comp-2", type: "DependsOn" },
    { id: "rel-2", consumer: "comp-2", supplier: "comp-3", type: "DependsOn" },
  ],
}) as WardleyMap;

/** pipe-1 [0.2..0.8]×[0.35..0.45] containing inside-1 and inside-2 */
const makePipelineMap = (): WardleyMap => ({
  title: "Pipeline Test Map",
  components: [
    comp("pipe-1", 0.5, 0.4, { type: "pipeline", pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.35, visEnd: 0.45 } }),
    comp("inside-1", 0.5, 0.4),
    comp("inside-2", 0.3, 0.4),
  ],
  relations: [{ id: "rel-1", consumer: "inside-1", supplier: "inside-2", type: "DependsOn" }],
}) as WardleyMap;

const find = (m: WardleyMap, id: string) => m.components.find((c) => c.id === id)!;
const rel = (m: WardleyMap, id: string) => m.relations.find((r) => r.id === id);
const apply = (m: WardleyMap, op: Op) => applyDiffOp(m, op);

// ── Zod schemas ──────────────────────────────────────────────────────

describe("payload schemas", () => {
  const cases: Array<[string, { safeParse(v: unknown): { success: boolean } }, unknown[], unknown[]]> = [
    ["MoveComponentPayload", MoveComponentPayload,
      [{ id: "c", evolution: 0.5, visibility: 0.3 }],
      [{ id: "c", evolution: 1.5, visibility: 0.3 }, { id: "c", evolution: -0.1, visibility: 0.3 }, { evolution: 0.5, visibility: 0.3 }, { id: "", evolution: 0.5, visibility: 0.3 }]],
    ["AddComponentPayload", AddComponentPayload,
      [{ id: "x", name: "X", evolution: 0.5, visibility: 0.5 }, { name: "No id", type: "anchor", nature: "personae", evolution: 0.9, visibility: 0.1 }],
      [{ id: "x", name: "", evolution: 0.5, visibility: 0.5 }]],
    ["DeleteComponentPayload", DeleteComponentPayload, [{ id: "c" }], [{}, { id: "" }]],
    ["RenameComponentPayload", RenameComponentPayload, [{ id: "c", name: "N" }], [{ id: "c", name: "" }]],
    ["AddEdgePayload", AddEdgePayload,
      [{ id: "r", consumer: "a", supplier: "b" }, { consumer: "a", supplier: "b", type: "Flow" }],
      [{ id: "r", supplier: "b" }, { id: "r", consumer: "a" }, { id: "", consumer: "a", supplier: "b" }, { consumer: "a", supplier: "b", type: "Bad" }]],
    ["DeleteEdgePayload", DeleteEdgePayload, [{ id: "r" }], [{}, { id: "" }]],
    ["ChangeComponentTypePayload", ChangeComponentTypePayload, [{ id: "c", type: "anchor" }], [{ id: "c", type: "invalid" }, { type: "anchor" }]],
    ["SetEvolvesToPayload", SetEvolvesToPayload, [{ id: "c", evolvesTo: "d" }, { id: "c", evolvesTo: null }], [{ id: "c", evolvesTo: "" }, { id: "c" }]],
    ["SetFlowPayload", SetFlowPayload,
      [{ id: "r", flow: { label: "data" } }, { id: "r", flow: { label: "risk", style: "bold" } }, { id: "r", flow: null }],
      [{ id: "r", flow: { label: "" } }, { id: "r", flow: { label: "x", style: "dotted" } }]],
    ["ChangeEdgeTypePayload", ChangeEdgeTypePayload, [{ id: "r", type: "Flow" }], [{ id: "r", type: "invalid" }]],
    ["ResizePipelinePayload", ResizePipelinePayload,
      [{ id: "p", evoStart: 0.2, evoEnd: 0.8 }],
      [{ id: "p", evoStart: 1.5 }, { id: "p", evoEnd: -0.1 }, { evoStart: 0.2 }, { id: "", evoStart: 0.2 }]],
    ["RenameMapPayload", RenameMapPayload, [{ title: "T" }], [{ title: "" }, {}]],
    ["MoveLabelPayload", MoveLabelPayload,
      [{ id: "c", dx: 0.05, dy: -0.03 }, { id: "c", dx: 0, dy: 0 }],
      [{ dx: 0, dy: 0 }, { id: "", dx: 0, dy: 0 }, { id: "c", dy: 0 }, { id: "c", dx: 0 }, { id: "c", dx: "a", dy: 0 }, { id: 1, dx: 0, dy: 0 }]],
    ["MoveStepPayload", MoveStepPayload,
      [{ id: "s", evolution: 0.5, visibility: 0.3 }, { id: "s", evolution: 0, visibility: 1 }],
      [{ evolution: 0.5, visibility: 0.3 }, { id: 1, evolution: 0.5, visibility: 0.3 }, { id: "s", evolution: 1.5, visibility: 0.3 },
        { id: "s", evolution: -0.1, visibility: 0.3 }, { id: "s", evolution: 0.5, visibility: 1.1 }, { id: "s", evolution: 0.5, visibility: -0.1 },
        { id: "s", visibility: 0.3 }, { id: "s", evolution: 0.5 }, { id: "s", evolution: "a", visibility: 0.3 }]],
  ];

  it.each(cases)("%s accepts valid and rejects invalid payloads", (_name, schema, valid, invalid) => {
    for (const v of valid) expect(schema.safeParse(v).success, JSON.stringify(v)).toBe(true);
    for (const v of invalid) expect(schema.safeParse(v).success, JSON.stringify(v)).toBe(false);
  });

  it("applies defaults (component type, DependsOn, solid flow)", () => {
    expect(AddComponentPayload.parse({ name: "X", evolution: 0, visibility: 0 }).type).toBe("component");
    expect(AddEdgePayload.parse({ consumer: "a", supplier: "b" }).type).toBe("DependsOn");
    expect(SetFlowPayload.parse({ id: "r", flow: { label: "d" } }).flow!.style).toBe("solid");
  });
});

describe("DiffOp schema", () => {
  const samples: Op[] = [
    { op: "move_component", payload: { id: "a", evolution: 0.5, visibility: 0.5 } },
    { op: "add_component", payload: { id: "a", name: "A", evolution: 0.5, visibility: 0.5 } },
    { op: "delete_component", payload: { id: "a" } },
    { op: "rename_component", payload: { id: "a", name: "B" } },
    { op: "add_edge", payload: { id: "e", consumer: "a", supplier: "b" } },
    { op: "delete_edge", payload: { id: "e" } },
    { op: "change_component_type", payload: { id: "a", type: "anchor" } },
    { op: "set_evolves_to", payload: { id: "a", evolvesTo: "b" } },
    { op: "set_evolves_to", payload: { id: "a", position: { evolution: 0.7, visibility: 0.2 } } },
    { op: "set_flow", payload: { id: "e", flow: { label: "x" } } },
    { op: "change_edge_type", payload: { id: "e", type: "Flow" } },
    { op: "resize_pipeline", payload: { id: "p", evoStart: 0.2, evoEnd: 0.8 } },
    { op: "resize_pipeline", payload: { id: "p", handleEvolution: 0.4 } },
    { op: "rename_map", payload: { title: "T" } },
    { op: "move_label", payload: { id: "a", dx: 1, dy: 2 } },
    { op: "move_step", payload: { id: "a", evolution: 0.1, visibility: 0.2 } },
  ];

  it("accepts every op and is exported from the package as DiffOpSchema", () => {
    expect(DiffOpSchema).toBe(DiffOp);
    for (const s of samples) expect(DiffOp.safeParse(s).success, s.op).toBe(true);
  });

  it("rejects unknown ops", () => {
    expect(DiffOp.safeParse({ op: "explode_component", payload: { id: "a" } }).success).toBe(false);
  });
});

// ── Op semantics ─────────────────────────────────────────────────────

describe("move_component / rename_component / rename_map", () => {
  it("moves one component only; throws for unknown ids", () => {
    const m = apply(makeMap(), { op: "move_component", payload: { id: "comp-1", evolution: 0.9, visibility: 0.2 } });
    expect(find(m, "comp-1").position).toEqual({ evolution: { scalar: 0.9 }, visibility: { scalar: 0.2 } });
    expect(find(m, "comp-2").position.evolution.scalar).toBe(0.6);
    expect(() => apply(makeMap(), { op: "move_component", payload: { id: "no-such", evolution: 0.5, visibility: 0.5 } })).toThrow();
  });

  it("renames a component (nothing else) and the map", () => {
    const m = applyDiffOps(makeMap(), [
      { op: "rename_component", payload: { id: "comp-1", name: "End User" } },
      { op: "rename_map", payload: { title: "New Title" } },
    ]);
    expect(find(m, "comp-1")).toEqual({ ...find(makeMap(), "comp-1"), label: { name: "End User" } });
    expect(m.title).toBe("New Title");
    expect(m.components).toHaveLength(3);
    expect(() => apply(makeMap(), { op: "rename_component", payload: { id: "no-such", name: "X" } })).toThrow();
  });
});

describe("add_component", () => {
  const add = (payload: Extract<Op, { op: "add_component" }>["payload"]) =>
    find(apply(makeMap(), { op: "add_component", payload }), payload.id!);

  it("adds a plain component without pipeline geometry", () => {
    const c = add({ id: "new", name: "New Thing", type: "component", evolution: 0.5, visibility: 0.5 });
    expect(c).toEqual({ id: "new", label: { name: "New Thing" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } } });
  });

  it("keeps explicit pipeline geometry (normalized, incl. boundaries)", () => {
    expect(add({ id: "p", name: "P", type: "pipeline", evolution: 0.5, visibility: 0.4,
      pipelineGeometry: { evoStart: 0.6, evoEnd: 0.4, visStart: 0.35, visEnd: 0.45 } }).pipelineGeometry)
      .toEqual({ evoStart: 0.4, evoEnd: 0.6, visStart: 0.35, visEnd: 0.45 });
    expect(add({ id: "e", name: "E", type: "pipeline", evolution: 0.05, visibility: 0.02,
      pipelineGeometry: { evoStart: 0, evoEnd: 0.15, visStart: 0, visEnd: 0.07 } }).pipelineGeometry)
      .toMatchObject({ evoStart: 0, visStart: 0 });
  });

  it("rejects a duplicate id", () => {
    expect(() => add({ id: "comp-1", name: "Dup", evolution: 0.5, visibility: 0.5 })).toThrow(/already exists/);
  });
});

describe("delete_component / delete_edge", () => {
  it.each([
    ["comp-1", ["rel-2"]], // source of rel-1
    ["comp-3", ["rel-1"]], // target of rel-2
    ["comp-2", []], // both
  ])("deleting %s cascades its relations", (id, kept) => {
    const m = apply(makeMap(), { op: "delete_component", payload: { id } });
    expect(m.components.map((c) => c.id)).not.toContain(id);
    expect(m.relations.map((r) => r.id)).toEqual(kept);
  });

  it("delete_edge removes that edge only; a second delete throws", () => {
    const m = apply(makeMap(), { op: "delete_edge", payload: { id: "rel-1" } });
    expect(m.relations.map((r) => r.id)).toEqual(["rel-2"]);
    expect(m.components).toHaveLength(3);
    expect(() => apply(m, { op: "delete_edge", payload: { id: "rel-1" } })).toThrow();
    const n = apply(makeMap(), { op: "delete_component", payload: { id: "comp-3" } });
    expect(() => apply(n, { op: "delete_component", payload: { id: "comp-3" } })).toThrow();
  });

  it("removes evolvesTo entries pointing at the deleted component's position", () => {
    let m = apply(makeMap(), { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2" } });
    m = apply(m, { op: "delete_component", payload: { id: "comp-2" } });
    expect(find(m, "comp-1").evolvesTo).toBeUndefined();
  });
});

describe("add_edge / change_edge_type / set_flow", () => {
  it("adds an edge with the given type, leaving others untouched", () => {
    const m = apply(makeMap(), { op: "add_edge", payload: { id: "rel-flow", consumer: "comp-1", supplier: "comp-3", type: "Flow" } });
    expect(rel(m, "rel-flow")).toEqual({ id: "rel-flow", consumer: "comp-1", supplier: "comp-3", type: "Flow" });
    expect(m.relations.slice(0, 2)).toEqual(makeMap().relations);
  });

  it("generates a deterministic id from the consumer/supplier ids", () => {
    const op: Op = { op: "add_edge", payload: { consumer: "comp-1", supplier: "comp-3" } };
    expect(rel(apply(makeMap(), op), "comp-1-comp-3")).toBeDefined();
    const m = makeMap();
    m.components.push(comp("comp-1-comp-3", 0.1, 0.1));
    expect(rel(apply(m, op), "comp-1-comp-3-2")).toBeDefined();
  });

  it("rejects a duplicate id, unknown endpoints and self-links", () => {
    for (const payload of [
      { id: "rel-1", consumer: "comp-1", supplier: "comp-3" },
      { id: "x", consumer: "no-such", supplier: "comp-2" },
      { id: "x", consumer: "comp-1", supplier: "no-such" },
      { id: "x", consumer: "comp-1", supplier: "comp-1" },
    ]) expect(() => apply(makeMap(), { op: "add_edge", payload })).toThrow();
  });

  it("changes the type and sets/clears the flow of one relation", () => {
    let m = apply(makeMap(), { op: "change_edge_type", payload: { id: "rel-1", type: "Constraint" } });
    expect(rel(m, "rel-1")!.type).toBe("Constraint");
    expect(rel(m, "rel-2")!.type).toBe("DependsOn");
    m = apply(m, { op: "set_flow", payload: { id: "rel-1", flow: { label: "data", style: "dashed" } } });
    expect(rel(m, "rel-1")!.flow).toEqual({ label: "data", style: "dashed" });
    m = apply(m, { op: "set_flow", payload: { id: "rel-1", flow: null } });
    expect(rel(m, "rel-1")!.flow).toBeUndefined();
    expect(() => apply(m, { op: "set_flow", payload: { id: "no-such", flow: null } })).toThrow();
    expect(() => apply(m, { op: "change_edge_type", payload: { id: "no-such", type: "Flow" } })).toThrow();
  });
});

describe("change_component_type", () => {
  const change = (m: WardleyMap, id: string, type: Component["type"]) =>
    apply(m, { op: "change_component_type", payload: { id, type } });

  it("changes only the type; throws for unknown ids", () => {
    const m = change(makeMap(), "comp-1", "anchor");
    expect(find(m, "comp-1")).toEqual({ ...find(makeMap(), "comp-1"), type: "anchor" });
    expect(() => change(makeMap(), "no-such", "anchor")).toThrow();
  });

  it("generates (clamped) pipeline geometry, keeping an existing one", () => {
    expect(find(change(makeMap(), "comp-2", "pipeline"), "comp-2").pipelineGeometry)
      .toEqual({ evoStart: 0.45, evoEnd: 0.75, visStart: 0.25, visEnd: 0.35 });
    const edge = makeMap();
    edge.components[0] = comp("comp-1", 0.05, 0.02);
    expect(find(change(edge, "comp-1", "pipeline"), "comp-1").pipelineGeometry)
      .toEqual({ evoStart: 0, evoEnd: 0.2, visStart: 0, visEnd: 0.07 });
    const kept = makeMap();
    kept.components[0].pipelineGeometry = { evoStart: 0.1, evoEnd: 0.9, visStart: 0.2, visEnd: 0.8 };
    expect(find(change(kept, "comp-1", "pipeline"), "comp-1").pipelineGeometry).toMatchObject({ evoStart: 0.1, evoEnd: 0.9 });
  });

  it("pipeline → component drops the geometry; contained and outside components stay put", () => {
    const src = makePipelineMap();
    src.components.push(comp("outside-1", 0.95, 0.9));
    const m = change(src, "pipe-1", "component");
    expect(find(m, "pipe-1").pipelineGeometry).toBeUndefined();
    expect(m.components.slice(1)).toEqual(src.components.slice(1));
  });
});

describe("set_evolves_to", () => {
  const evolve = (m: WardleyMap, id: string, evolvesTo: string | null) =>
    apply(m, { op: "set_evolves_to", payload: { id, evolvesTo } });

  it("copies the target position (replacing any previous one) and clears with null", () => {
    let m = evolve(makeMap(), "comp-1", "comp-2");
    expect(find(m, "comp-1").evolvesTo).toEqual([
      { position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.3 } }, evolveType: "natural" },
    ]);
    m = evolve(m, "comp-1", "comp-3");
    expect(find(m, "comp-1").evolvesTo!.map((t) => t.position.evolution.scalar)).toEqual([0.4]);
    m = evolve(evolve(m, "comp-1", null), "comp-1", null);
    expect(find(m, "comp-1").evolvesTo).toBeUndefined();
  });

  it("accepts an explicit position (rounded), replacing only the first arrow and keeping its type", () => {
    const at = (m: WardleyMap, evolution: number, visibility: number) =>
      apply(m, { op: "set_evolves_to", payload: { id: "comp-1", position: { evolution, visibility } } });
    let m = at(makeMap(), 0.91234, 0.1);
    expect(find(m, "comp-1").evolvesTo).toEqual([
      { position: { evolution: { scalar: 0.912 }, visibility: { scalar: 0.1 } }, evolveType: "natural" },
    ]);
    const forced = { position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } }, evolveType: "forced" as const, inertia: true };
    m = apply(m, { op: "set_field", payload: { target: "comp-1", path: "evolvesTo", value: [forced, forced] } });
    m = evolve(at(m, 0.95, 0.1), "comp-1", "comp-2");
    expect(find(m, "comp-1").evolvesTo).toEqual([
      { position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.3 } }, evolveType: "forced", inertia: true },
      forced,
    ]);
    expect(() => at(makeMap(), 1.2, 0.1)).toThrow(/[0, 1]/);
    expect(() => apply(makeMap(), { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2", position: { evolution: 1, visibility: 0 } } } as unknown as Op)).toThrow(/not both/);
    expect(SetEvolvesToPayload.safeParse({ id: "a", position: { evolution: 0.5, visibility: 0.2 } }).success).toBe(true);
    expect(SetEvolvesToPayload.safeParse({ id: "a", position: { evolution: 1.5, visibility: 0.2 } }).success).toBe(false);
    expect(SetEvolvesToPayload.safeParse({ id: "a" }).success).toBe(false);
  });

  it("rejects unknown source/target and self-evolution", () => {
    expect(() => evolve(makeMap(), "no-such", "comp-2")).toThrow();
    expect(() => evolve(makeMap(), "comp-1", "no-such")).toThrow();
    expect(() => evolve(makeMap(), "comp-1", "comp-1")).toThrow();
  });
});

describe("resize_pipeline", () => {
  const resize = (m: WardleyMap, id: string, evoStart: number, evoEnd: number) =>
    apply(m, { op: "resize_pipeline", payload: { id, evoStart, evoEnd } });

  it("sets bounds, recentres, keeps visibility bounds and clamps former members", () => {
    const m = resize(makePipelineMap(), "pipe-1", 0.6, 0.9);
    expect(find(m, "pipe-1").pipelineGeometry).toEqual({ evoStart: 0.6, evoEnd: 0.9, visStart: 0.35, visEnd: 0.45 });
    expect(find(m, "pipe-1").position.evolution.scalar).toBe(0.75);
    expect(find(m, "inside-1").position.evolution.scalar).toBe(0.6);
    expect(find(m, "inside-2").position.evolution.scalar).toBe(0.6);
  });

  it("allows zero width", () => {
    const m = resize(makePipelineMap(), "pipe-1", 0.5, 0.5);
    expect(find(m, "pipe-1").pipelineGeometry).toMatchObject({ evoStart: 0.5, evoEnd: 0.5 });
    expect(find(m, "pipe-1").position.evolution.scalar).toBe(0.5);
  });

  it("throws for unknown ids, non-pipelines and pipelines without geometry", () => {
    const noGeo = makePipelineMap();
    delete noGeo.components[0].pipelineGeometry;
    expect(() => resize(makePipelineMap(), "nonexistent", 0.1, 0.9)).toThrow();
    expect(() => resize(makePipelineMap(), "inside-1", 0.1, 0.9)).toThrow();
    expect(() => resize(noGeo, "pipe-1", 0.1, 0.9)).toThrow();
  });
});

describe("move_label / move_step", () => {
  it("move_label sets (and overwrites) label.position of one component", () => {
    let m = apply(makeMap(), { op: "move_label", payload: { id: "comp-1", dx: 0.1, dy: 0.1 } });
    m = apply(m, { op: "move_label", payload: { id: "comp-1", dx: -0.2, dy: 0 } });
    expect(find(m, "comp-1").label.position).toEqual({ dx: -0.2, dy: 0 });
    expect(find(m, "comp-2").label.position).toBeUndefined();
    expect(() => apply(m, { op: "move_label", payload: { id: "no-such", dx: 0, dy: 0 } })).toThrow();
  });

  it("move_step moves the step-bearing component only; throws without a step", () => {
    const steps = makeMap();
    steps.components[0].step = { number: 1 };
    const m = apply(steps, { op: "move_step", payload: { id: "comp-1", evolution: 0.9, visibility: 0.2 } });
    expect(find(m, "comp-1").position).toEqual({ evolution: { scalar: 0.9 }, visibility: { scalar: 0.2 } });
    expect(find(m, "comp-2").position).toEqual(find(steps, "comp-2").position);
    expect(() => apply(steps, { op: "move_step", payload: { id: "comp-2", evolution: 0.5, visibility: 0.5 } })).toThrow(/no step/);
    expect(() => apply(steps, { op: "move_step", payload: { id: "no-such", evolution: 0.5, visibility: 0.5 } })).toThrow();
  });
});

describe("batches", () => {
  it("applies a full workflow and survives a JSON round-trip", () => {
    const ops: Op[] = [
      { op: "rename_map", payload: { title: "Batch Test" } },
      { op: "add_component", payload: { id: "c4", name: "API", evolution: 0.5, visibility: 0.5 } },
      { op: "move_component", payload: { id: "c4", evolution: 0.6, visibility: 0.4 } },
      { op: "rename_component", payload: { id: "c4", name: "REST API" } },
      { op: "change_component_type", payload: { id: "c4", type: "component", subtype: "market" } },
      { op: "add_edge", payload: { id: "r3", consumer: "comp-1", supplier: "c4" } },
      { op: "change_edge_type", payload: { id: "r3", type: "Constraint" } },
      { op: "set_flow", payload: { id: "r3", flow: { label: "auth", style: "bold" } } },
      { op: "set_evolves_to", payload: { id: "comp-2", evolvesTo: "c4" } },
      { op: "delete_edge", payload: { id: "rel-1" } },
      { op: "delete_component", payload: { id: "comp-3" } },
    ];
    const m = applyDiffOps(makeMap(), ops);
    expect(m.title).toBe("Batch Test");
    expect(m.components.map((c) => c.id)).toEqual(["comp-1", "comp-2", "c4"]);
    expect(find(m, "c4")).toMatchObject({ label: { name: "REST API" }, subtype: "market", position: { evolution: { scalar: 0.6 } } });
    expect(m.relations).toEqual([{ id: "r3", consumer: "comp-1", supplier: "c4", type: "Constraint", flow: { label: "auth", style: "bold" } }]);
    expect(find(m, "comp-2").evolvesTo).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    expect(applyDiffOps(JSON.parse(JSON.stringify(makeMap())), ops)).toEqual(m);
  });

  it("is order-sensitive: an edge to a not-yet-added component fails", () => {
    const add: Op = { op: "add_component", payload: { id: "new", name: "New", evolution: 0.5, visibility: 0.5 } };
    const edge: Op = { op: "add_edge", payload: { id: "r", consumer: "comp-1", supplier: "new" } };
    expect(() => applyDiffOps(makeMap(), [edge, add])).toThrow();
    expect(applyDiffOps(makeMap(), [add, edge]).relations).toHaveLength(3);
  });
});

// ── Cascade expansion ────────────────────────────────────────────────

describe("expandDeleteCascade", () => {
  it.each([
    ["comp-1", ["rel-1"]],
    ["comp-3", ["rel-2"]],
    ["comp-2", ["rel-1", "rel-2"]],
    ["non-existent", []],
  ])("lists the delete_edge ops for %s", (id, edges) => {
    expect(expandDeleteCascade(makeMap(), id)).toEqual(edges.map((e) => ({ op: "delete_edge", payload: { id: e } })));
  });

  it("appends set_evolves_to null for components evolving to it (not itself), without mutating", () => {
    const m = applyDiffOps(makeMap(), [
      { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2" } },
      { op: "set_evolves_to", payload: { id: "comp-3", evolvesTo: "comp-2" } },
      { op: "set_evolves_to", payload: { id: "comp-2", evolvesTo: "comp-1" } },
    ]);
    const before = JSON.stringify(m);
    expect(expandDeleteCascade(m, "comp-2")).toEqual([
      { op: "delete_edge", payload: { id: "rel-1" } },
      { op: "delete_edge", payload: { id: "rel-2" } },
      { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: null } },
      { op: "set_evolves_to", payload: { id: "comp-3", evolvesTo: null } },
    ]);
    expect(JSON.stringify(m)).toBe(before);
  });

  it("returns nothing for an isolated component", () => {
    const m = makeMap();
    m.components.push(comp("isolated", 0.1, 0.9));
    expect(expandDeleteCascade(m, "isolated")).toEqual([]);
  });
});

describe("expandChangeTypeCascade", () => {
  it("emits no-op move_component for contained, non-pipeline components (epsilon 0.015)", () => {
    const m = makePipelineMap();
    m.components.push(
      comp("outside-1", 0.95, 0.9),
      comp("boundary-in", 0.19, 0.4),
      comp("boundary-out", 0.17, 0.4),
      comp("nested-pipe", 0.5, 0.4, { type: "pipeline", pipelineGeometry: { evoStart: 0.4, evoEnd: 0.6, visStart: 0.35, visEnd: 0.45 } }),
    );
    const before = JSON.stringify(m);
    expect(expandChangeTypeCascade(m, "pipe-1")).toEqual([
      { op: "move_component", payload: { id: "inside-1", evolution: 0.5, visibility: 0.4 } },
      { op: "move_component", payload: { id: "inside-2", evolution: 0.3, visibility: 0.4 } },
      { op: "move_component", payload: { id: "boundary-in", evolution: 0.19, visibility: 0.4 } },
    ]);
    expect(JSON.stringify(m)).toBe(before);
  });

  it("returns nothing for non-pipelines, unknown ids and pipelines without geometry", () => {
    const noGeo = makePipelineMap();
    delete noGeo.components[0].pipelineGeometry;
    expect(expandChangeTypeCascade(makePipelineMap(), "inside-1")).toEqual([]);
    expect(expandChangeTypeCascade(makePipelineMap(), "no-such")).toEqual([]);
    expect(expandChangeTypeCascade(noGeo, "pipe-1")).toEqual([]);
  });
});
