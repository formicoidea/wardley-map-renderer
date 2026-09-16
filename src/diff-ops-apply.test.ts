import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { applyDiffOp, applyDiffOps, uniqueId, pipelineMembers, type DiffOp } from "./diff-ops-apply.js";
import { DiffOp as DiffOpSchema, SetFieldPayload, ResizePipelinePayload } from "./diff-ops.js";
import type { WardleyMap } from "./schema.js";

function makeMap(): WardleyMap {
  return {
    title: "T",
    components: [
      {
        id: "pipe",
        label: { name: "Pipe" },
        type: "pipeline",
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.4 } },
        pipelineGeometry: { evoStart: 0.3, evoEnd: 0.7, visStart: 0.35, visEnd: 0.45 },
      },
      { id: "in-a", label: { name: "A" }, type: "component", position: { evolution: { scalar: 0.4 }, visibility: { scalar: 0.4 } } },
      { id: "in-b", label: { name: "B" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.4 } } },
      { id: "out", label: { name: "Out" }, type: "component", position: { evolution: { scalar: 0.1 }, visibility: { scalar: 0.1 } } },
    ],
    relations: [
      { id: "r1", consumer: "out", supplier: "in-a", type: "DependsOn" },
      { id: "r2", consumer: "in-a", supplier: "in-b", type: "DependsOn" },
    ],
  } as WardleyMap;
}

const find = (m: WardleyMap, id: string) => m.components.find((c) => c.id === id)!;
const pos = (m: WardleyMap, id: string) => [find(m, id).position.evolution.scalar, find(m, id).position.visibility.scalar];

describe("diff-ops-apply module", () => {
  it("has no runtime imports (zod-free, browser-safe)", () => {
    const src = readFileSync(new URL("./diff-ops-apply.ts", import.meta.url), "utf8");
    const imports = src.match(/^import\s.*$/gm) ?? [];
    expect(imports.every((l) => l.startsWith("import type"))).toBe(true);
    expect(src).not.toMatch(/from "zod"/);
  });
});

describe("purity and errors", () => {
  it("never mutates the input map and returns a new map", () => {
    const map = makeMap();
    const before = structuredClone(map);
    const ops: DiffOp[] = [
      { op: "move_component", payload: { id: "out", evolution: 0.2, visibility: 0.2 } },
      { op: "move_pipeline", payload: { id: "pipe", dEvo: 0.1, dVis: 0 } },
      { op: "set_field", payload: { target: "in-a", path: "description", value: "x" } },
      { op: "delete_component", payload: { id: "in-b" } },
    ];
    let cur = map;
    for (const op of ops) {
      const next = applyDiffOp(cur, op);
      expect(next).not.toBe(cur);
      cur = next;
    }
    expect(map).toEqual(before);
    expect(applyDiffOps(map, ops)).toEqual(cur);
  });

  it("throws clear errors for unknown ids / ops / invalid payloads", () => {
    const map = makeMap();
    expect(() => applyDiffOp(map, { op: "delete_component", payload: { id: "nope" } })).toThrow(/unknown component id "nope"/);
    expect(() => applyDiffOp(map, { op: "delete_edge", payload: { id: "nope" } })).toThrow(/unknown relation id/);
    expect(() => applyDiffOp(map, { op: "explode", payload: {} } as unknown as DiffOp)).toThrow(/unknown op "explode"/);
    expect(() => applyDiffOp(map, { op: "move_component", payload: { id: "out", evolution: 2, visibility: 0 } })).toThrow(/\[0, 1\]/);
  });

  it("applyDiffOps throws on the first bad op and leaves input untouched", () => {
    const map = makeMap();
    const before = structuredClone(map);
    expect(() => applyDiffOps(map, [
      { op: "rename_map", payload: { title: "X" } },
      { op: "rename_component", payload: { id: "nope", name: "Y" } },
    ])).toThrow();
    expect(map).toEqual(before);
  });
});

describe("resize_pipeline", () => {
  it("accepts vis bounds only, recentres visibility only, moves nothing else", () => {
    const map = makeMap();
    const next = applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe", visStart: 0.3, visEnd: 0.6 } });
    const pipe = find(next, "pipe");
    expect(pipe.pipelineGeometry).toMatchObject({ evoStart: 0.3, evoEnd: 0.7, visStart: 0.3, visEnd: 0.6 });
    expect(pipe.position.visibility.scalar).toBeCloseTo(0.45);
    expect(pipe.position.evolution.scalar).toBe(0.5);
    for (const id of ["in-a", "in-b", "out"]) expect(pos(next, id)).toEqual(pos(map, id));
  });

  it("clamps former members into the new box; non-members never move", () => {
    const map = makeMap();
    const next = applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe", evoStart: 0.45, evoEnd: 0.55, visStart: 0.38 } });
    expect(pos(next, "in-a")).toEqual([0.45, 0.4]);
    expect(pos(next, "in-b")).toEqual([0.55, 0.4]);
    expect(pos(next, "out")).toEqual([0.1, 0.1]);
    expect(pipelineMembers(next, "pipe").map((c) => c.id)).toEqual(["in-a", "in-b"]);
    const shrunkVis = applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe", visStart: 0.42, visEnd: 0.44 } });
    expect(pos(shrunkVis, "in-a")).toEqual([0.4, 0.42]);
  });

  it("normalizes inverted bounds, requires at least one bound, rejects non-pipelines", () => {
    const map = makeMap();
    const next = applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe", evoStart: 0.9 } });
    expect(find(next, "pipe").pipelineGeometry).toMatchObject({ evoStart: 0.7, evoEnd: 0.9 });
    expect(() => applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe" } })).toThrow(/at least one/);
    expect(() => applyDiffOp(map, { op: "resize_pipeline", payload: { id: "out", evoStart: 0.1 } })).toThrow(/not a pipeline/);
  });

  it("zod schema requires at least one bound", () => {
    expect(ResizePipelinePayload.safeParse({ id: "p" }).success).toBe(false);
    expect(ResizePipelinePayload.safeParse({ id: "p", visEnd: 0.5 }).success).toBe(true);
  });
});

describe("move_pipeline", () => {
  it("moves geometry, position and contained components only", () => {
    const map = makeMap();
    const next = applyDiffOp(map, { op: "move_pipeline", payload: { id: "pipe", dEvo: 0.1, dVis: -0.05 } });
    expect(find(next, "pipe").pipelineGeometry).toEqual({ evoStart: 0.4, evoEnd: 0.8, visStart: 0.3, visEnd: 0.4 });
    expect(pos(next, "pipe")).toEqual([0.6, 0.35]);
    expect(pos(next, "in-a")).toEqual([0.5, 0.35]);
    expect(pos(next, "in-b")).toEqual([0.7, 0.35]);
    expect(pos(next, "out")).toEqual([0.1, 0.1]);
    expect(pipelineMembers(next, "pipe").map((c) => c.id)).toEqual(["in-a", "in-b"]);
  });

  it("clamps the delta so the pipeline stays inside [0, 1]", () => {
    const next = applyDiffOp(makeMap(), { op: "move_pipeline", payload: { id: "pipe", dEvo: 0.9, dVis: 0 } });
    expect(find(next, "pipe").pipelineGeometry).toMatchObject({ evoStart: 0.6, evoEnd: 1 });
    expect(pos(next, "in-b")).toEqual([0.9, 0.4]);
  });
});

describe("delete_pipeline / delete_component cascade", () => {
  it("delete_pipeline removes the pipeline only; contained components stay", () => {
    const next = applyDiffOp(makeMap(), { op: "delete_pipeline", payload: { id: "pipe" } });
    expect(next.components.map((c) => c.id)).toEqual(["in-a", "in-b", "out"]);
    expect(() => applyDiffOp(makeMap(), { op: "delete_pipeline", payload: { id: "out" } })).toThrow(/not a pipeline/);
  });

  it("delete_component removes relations and evolvesTo entries targeting it", () => {
    let map = applyDiffOp(makeMap(), { op: "set_evolves_to", payload: { id: "out", evolvesTo: "in-b" } });
    map = applyDiffOp(map, {
      op: "set_field",
      payload: {
        target: "in-a",
        path: "evolvesTo",
        value: [
          { position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.4 } }, evolveType: "natural" },
          { position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.4 } }, evolveType: "forced" },
        ],
      },
    });
    const next = applyDiffOp(map, { op: "delete_component", payload: { id: "in-b" } });
    expect(next.relations.map((r) => r.id)).toEqual(["r1"]);
    expect(find(next, "out").evolvesTo).toBeUndefined();
    expect(find(next, "in-a").evolvesTo).toHaveLength(1);
    expect(find(next, "in-a").evolvesTo![0].evolveType).toBe("forced");
  });
});

describe("add_component", () => {
  it("generates a unique slug id when omitted, honours type/subtype", () => {
    const map = makeMap();
    const a = applyDiffOp(map, { op: "add_component", payload: { name: "Out", evolution: 0.2, visibility: 0.2 } });
    expect(a.components.at(-1)).toMatchObject({ id: "out-2", type: "component", label: { name: "Out" } });
    const b = applyDiffOp(a, {
      op: "add_component",
      payload: { name: "Café Crème!", type: "component", subtype: "userNeed", nature: "natural", evolution: 0.2, visibility: 0.2 },
    });
    expect(b.components.at(-1)).toMatchObject({ id: "cafe-creme", subtype: "userNeed", nature: "natural" });
  });

  it("gives new pipelines default geometry and rejects duplicate ids / bad taxonomy", () => {
    const map = makeMap();
    const next = applyDiffOp(map, { op: "add_component", payload: { name: "P", type: "pipeline", evolution: 0.5, visibility: 0.8 } });
    expect(find(next, "p").pipelineGeometry).toEqual({ evoStart: 0.35, evoEnd: 0.65, visStart: 0.75, visEnd: 0.85 });
    expect(() => applyDiffOp(map, { op: "add_component", payload: { id: "out", name: "X", evolution: 0, visibility: 0 } })).toThrow(/already exists/);
    expect(() => applyDiffOp(map, { op: "add_component", payload: { name: "X", type: "anchor", subtype: "market", evolution: 0, visibility: 0 } })).toThrow(/subtype/);
  });

  it("uniqueId avoids component and relation ids", () => {
    const map = makeMap();
    expect(uniqueId(map, "R1")).toBe("r1-2");
    expect(uniqueId(map, "  New Thing ")).toBe("new-thing");
    expect(uniqueId(map, "!!!")).toBe("component");
  });
});

describe("add_edge / reverse_edge", () => {
  it("defaults type to DependsOn and generates an id", () => {
    const next = applyDiffOp(makeMap(), { op: "add_edge", payload: { consumer: "out", supplier: "in-b" } });
    expect(next.relations.at(-1)).toEqual({ id: "out-in-b", consumer: "out", supplier: "in-b", type: "DependsOn" });
  });

  it("rejects duplicates, self-links, bad types and unknown components", () => {
    const map = makeMap();
    expect(() => applyDiffOp(map, { op: "add_edge", payload: { id: "x", consumer: "out", supplier: "in-a" } })).toThrow(/already exists/);
    expect(() => applyDiffOp(map, { op: "add_edge", payload: { consumer: "out", supplier: "out" } })).toThrow(/self-links/);
    expect(() => applyDiffOp(map, { op: "add_edge", payload: { id: "r1", consumer: "in-b", supplier: "out" } })).toThrow(/already exists/);
    expect(() => applyDiffOp(map, { op: "add_edge", payload: { consumer: "out", supplier: "zz" } })).toThrow(/unknown component/);
    expect(() => applyDiffOp(map, { op: "add_edge", payload: { consumer: "out", supplier: "in-b", type: "Bad" as never } })).toThrow(/type/);
  });

  it("reverse_edge swaps consumer/supplier unless the reverse already exists", () => {
    const map = makeMap();
    const next = applyDiffOp(map, { op: "reverse_edge", payload: { id: "r1" } });
    expect(next.relations[0]).toMatchObject({ consumer: "in-a", supplier: "out" });
    const withBoth = applyDiffOp(map, { op: "add_edge", payload: { consumer: "in-a", supplier: "out" } });
    expect(() => applyDiffOp(withBoth, { op: "reverse_edge", payload: { id: "r1" } })).toThrow(/already exists/);
  });
});

describe("set_field", () => {
  const set = (map: WardleyMap, target: string, path: string, value: unknown) =>
    applyDiffOp(map, { op: "set_field", payload: { target, path, value } as never });

  it("sets and deletes (null) simple component fields", () => {
    let m = makeMap();
    m = set(m, "out", "label.name", "Renamed");
    m = set(m, "out", "description", "desc");
    m = set(m, "out", "color", "red-600");
    m = set(m, "out", "inertia", true);
    m = set(m, "out", "method", { category: "buy", recommendation: "outsource" });
    m = set(m, "out", "step", { number: 2 });
    m = set(m, "out", "label.position", { dx: -20, dy: 8 });
    m = set(m, "out", "position.evolution.range", [0.05, 0.2]);
    expect(find(m, "out")).toMatchObject({
      label: { name: "Renamed", position: { dx: -20, dy: 8 } },
      description: "desc", color: "red-600", inertia: true,
      method: { category: "buy", recommendation: "outsource" }, step: { number: 2 },
      position: { evolution: { scalar: 0.1, range: [0.05, 0.2] } },
    });
    for (const p of ["description", "color", "inertia", "method", "step", "label.position", "position.evolution.range"]) {
      m = set(m, "out", p, null);
    }
    const out = find(m, "out");
    expect(out).toEqual({ id: "out", label: { name: "Renamed" }, type: "component", position: { evolution: { scalar: 0.1 }, visibility: { scalar: 0.1 } } });
  });

  it("type/subtype/nature keep taxonomy valid", () => {
    let m = set(makeMap(), "out", "subtype", "functional");
    m = set(m, "out", "nature", "data");
    expect(() => set(m, "out", "nature", "personae")).toThrow(/nature/);
    m = set(m, "out", "type", "pipeline");
    expect(find(m, "out")).toMatchObject({ type: "pipeline", subtype: "functional" });
    expect(find(m, "out").nature).toBeUndefined();
    expect(find(m, "out").pipelineGeometry).toBeDefined();
    m = set(m, "out", "type", "anchor");
    expect(find(m, "out").subtype).toBeUndefined();
    expect(find(m, "out").pipelineGeometry).toBeUndefined();
  });

  it("sets relation type and flow", () => {
    let m = set(makeMap(), "r1", "type", "Flow");
    m = set(m, "r1", "flow", { label: "money" });
    expect(m.relations[0]).toMatchObject({ type: "Flow", flow: { label: "money", style: "solid" } });
    m = set(m, "r1", "flow", null);
    expect(m.relations[0].flow).toBeUndefined();
  });

  it("rejects paths outside the allow-list, wrong targets and bad values", () => {
    const m = makeMap();
    expect(() => set(m, "out", "id", "x")).toThrow(/not allowed/);
    expect(() => set(m, "out", "position.evolution.scalar", 0.3)).toThrow(/not allowed/);
    expect(() => set(m, "r1", "description", "x")).toThrow(/unknown target/);
    expect(() => set(m, "out", "flow", null)).toThrow(/unknown target/);
    expect(() => set(m, "out", "inertia", "yes")).toThrow(/boolean/);
    expect(() => set(m, "out", "label.name", null)).toThrow(/non-empty/);
  });

  it("zod SetFieldPayload validates per path", () => {
    expect(SetFieldPayload.safeParse({ target: "a", path: "color", value: null }).success).toBe(true);
    expect(SetFieldPayload.safeParse({ target: "a", path: "inertia", value: "x" }).success).toBe(false);
    expect(SetFieldPayload.safeParse({ target: "a", path: "id", value: "x" }).success).toBe(false);
  });
});

describe("move_label / legacy ops", () => {
  it("move_label stores px offsets in label.position", () => {
    const next = applyDiffOp(makeMap(), { op: "move_label", payload: { id: "out", dx: 12, dy: -6 } });
    expect(find(next, "out").label.position).toEqual({ dx: 12, dy: -6 });
  });

  it("rename_component, rename_map, change_component_type, change_edge_type, set_flow still work", () => {
    const next = applyDiffOps(makeMap(), [
      { op: "rename_component", payload: { id: "out", name: "N" } },
      { op: "rename_map", payload: { title: "M" } },
      { op: "change_component_type", payload: { id: "out", type: "anchor" } },
      { op: "change_edge_type", payload: { id: "r1", type: "Constraint" } },
      { op: "set_flow", payload: { id: "r1", flow: { label: "risk", style: "bold" } } },
    ]);
    expect(next.title).toBe("M");
    expect(find(next, "out")).toMatchObject({ type: "anchor", label: { name: "N" } });
    expect(next.relations[0]).toMatchObject({ type: "Constraint", flow: { label: "risk", style: "bold" } });
  });

  it("zod DiffOp accepts every new op", () => {
    const samples = [
      { op: "move_pipeline", payload: { id: "p", dEvo: 0.1, dVis: -0.1 } },
      { op: "delete_pipeline", payload: { id: "p" } },
      { op: "reverse_edge", payload: { id: "e" } },
      { op: "set_field", payload: { target: "a", path: "type", value: "Flow" } },
      { op: "add_component", payload: { name: "No id", evolution: 0.1, visibility: 0.1 } },
      { op: "add_edge", payload: { consumer: "a", supplier: "b" } },
      { op: "resize_pipeline", payload: { id: "p", visStart: 0.1 } },
    ];
    for (const s of samples) expect(DiffOpSchema.safeParse(s).success, s.op).toBe(true);
  });
});
