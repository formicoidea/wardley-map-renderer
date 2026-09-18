import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { applyDiffOp, applyDiffOps, readConfigOverrides, uniqueId, pipelineMembers, type DiffOp } from "./diff-ops-apply.js";
import { DiffOp as DiffOpSchema, SetFieldPayload, ResizePipelinePayload } from "./diff-ops.js";
import { sanitizeMap, type WardleyMap } from "./schema.js";

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

  it("sets handleEvolution alone (clamped into the box), leaving the geometry and members alone", () => {
    const map = makeMap();
    const next = applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe", handleEvolution: 0.4561 } });
    expect(find(next, "pipe").pipelineGeometry).toEqual({ ...find(map, "pipe").pipelineGeometry, handleEvolution: 0.456 });
    expect(find(next, "pipe").position).toEqual(find(map, "pipe").position);
    const clamped = applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe", handleEvolution: 0.95 } });
    expect(find(clamped, "pipe").pipelineGeometry!.handleEvolution).toBe(0.7);
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

describe("rounding (stable under sanitizeMap)", () => {
  it("move/add/resize/move_pipeline round coordinates to 3 decimals", () => {
    const m = applyDiffOps(makeMap(), [
      { op: "move_component", payload: { id: "out", evolution: 0.123456, visibility: 0.0999999 } },
      { op: "add_component", payload: { id: "n", name: "N", evolution: 0.33333, visibility: 0.66666 } },
      { op: "resize_pipeline", payload: { id: "pipe", evoStart: 0.2 + 0.1, evoEnd: 0.71234, visStart: 0.35 } },
      { op: "move_pipeline", payload: { id: "pipe", dEvo: 0.1 / 3, dVis: 0 } },
    ]);
    expect(pos(m, "out")).toEqual([0.123, 0.1]);
    expect(pos(m, "n")).toEqual([0.333, 0.667]);
    expect(find(m, "pipe").pipelineGeometry).toEqual({ evoStart: 0.333, evoEnd: 0.745, visStart: 0.35, visEnd: 0.45 });
    expect(pos(m, "pipe")).toEqual([0.539, 0.4]);
    expect(sanitizeMap(m).components).toEqual(m.components);
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

  it("accepts only hex / Tailwind-style colors (component and step)", () => {
    const m = makeMap();
    expect(find(set(m, "out", "color", "#A1b2C3"), "out").color).toBe("#A1b2C3");
    expect(find(set(m, "out", "step", { number: 1, color: "#fff" }), "out").step).toEqual({ number: 1, color: "#fff" });
    for (const bad of ['#fff"><script>', "red", "url(x)", "#12", 3]) {
      expect(() => set(m, "out", "color", bad)).toThrow(/color/);
      expect(() => set(m, "out", "step", { number: 1, color: bad })).toThrow(/step\.color/);
      expect(SetFieldPayload.safeParse({ target: "a", path: "color", value: bad }).success).toBe(false);
      expect(SetFieldPayload.safeParse({ target: "a", path: "step", value: { number: 1, color: bad } }).success).toBe(false);
    }
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

  it("move_label keeps an explicit anchor and rejects an unknown one", () => {
    const next = applyDiffOp(makeMap(), { op: "move_label", payload: { id: "out", dx: 12, dy: -6, anchor: "end" } });
    expect(find(next, "out").label.position).toEqual({ dx: 12, dy: -6, anchor: "end" });
    expect(() => applyDiffOp(makeMap(), {
      op: "move_label",
      payload: { id: "out", dx: 0, dy: 0, anchor: "left" as never },
    })).toThrow(/anchor must be one of/);
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

describe("locks", () => {
  it("placing a property locks it (position / label / geometry)", () => {
    const m = applyDiffOps(makeMap(), [
      { op: "move_component", payload: { id: "out", evolution: 0.2, visibility: 0.2 } },
      { op: "move_label", payload: { id: "out", dx: 4, dy: 4 } },
      { op: "move_pipeline", payload: { id: "pipe", dEvo: 0.05, dVis: 0 } },
      { op: "resize_pipeline", payload: { id: "pipe", visEnd: 0.5 } },
    ]);
    expect(find(m, "out").locked).toEqual({ position: true, label: true });
    expect(find(m, "pipe").locked).toEqual({ geometry: true });
    expect(find(m, "in-b").locked).toBeUndefined();
  });

  it("move_step locks the position too", () => {
    const seed = makeMap();
    find(seed, "out").step = { number: 1 };
    const m = applyDiffOp(seed, { op: "move_step", payload: { id: "out", evolution: 0.3, visibility: 0.3 } });
    expect(find(m, "out").locked).toEqual({ position: true });
  });

  it("set_lock round-trips: null removes a flag and drops an empty locked object", () => {
    let m = applyDiffOp(makeMap(), { op: "set_lock", payload: { id: "out", label: true, position: false } });
    expect(find(m, "out").locked).toEqual({ label: true, position: false });
    m = applyDiffOp(m, { op: "set_lock", payload: { id: "out", position: null } });
    expect(find(m, "out").locked).toEqual({ label: true });
    m = applyDiffOp(m, { op: "set_lock", payload: { id: "out", label: null } });
    expect(find(m, "out").locked).toBeUndefined();
  });

  it("set_lock validates its payload", () => {
    const m = makeMap();
    expect(() => applyDiffOp(m, { op: "set_lock", payload: { id: "out" } })).toThrow(/at least one of/);
    expect(() => applyDiffOp(m, { op: "set_lock", payload: { id: "nope", label: true } })).toThrow(/unknown component id/);
    expect(() => applyDiffOp(m, { op: "set_lock", payload: { id: "out", label: "yes" as never } })).toThrow(/boolean or null/);
  });
});

describe("resize_canvas / move_legend / readConfigOverrides", () => {
  /** v3 shape (what a human- or Claude-authored map carries). */
  const v3Map = (): WardleyMap => ({
    ...makeMap(),
    renderConfig: {
      style: {
        background: { canvas: { default: { width: 1200, height: 800 } } },
        view: { default: { width: 600, height: 400 } },
      },
    },
  } as unknown as WardleyMap);

  /** Legacy shape (what WardleyMapSchema / sanitizeMap hands the editor). */
  const legacyMap = (): WardleyMap => ({
    ...makeMap(),
    renderConfig: {
      spatial: {
        width: 1200,
        height: 800,
        coordinateSpace: { width: 1200, height: 800, outputHint: { targetWidth: 600, targetHeight: 400 } },
      },
      legend: { position: "bottom-right" },
    },
  } as unknown as WardleyMap);

  const rc = (m: WardleyMap) => (m as unknown as { renderConfig: any }).renderConfig;

  it("resizes a v3 map in the v3 paths, output hint included", () => {
    const m = applyDiffOp(v3Map(), { op: "resize_canvas", payload: { width: 1000, height: 500 } });
    expect(rc(m).style.background.canvas.default).toEqual({ width: 1000, height: 500 });
    expect(rc(m).style.view.default).toEqual({ width: 1000, height: 500 });
    expect(rc(m).spatial).toBeUndefined();
    expect(readConfigOverrides(m)).toMatchObject({ width: 1000, height: 500 });
  });

  it("resizes a legacy map in the legacy paths, coordinateSpace and output hint included", () => {
    const m = applyDiffOp(legacyMap(), { op: "resize_canvas", payload: { width: 1000 } });
    expect(rc(m).spatial).toMatchObject({ width: 1000, height: 800 });
    expect(rc(m).spatial.coordinateSpace).toMatchObject({ width: 1000, height: 800 });
    expect(rc(m).spatial.coordinateSpace.outputHint).toEqual({ targetWidth: 1000, targetHeight: 400 });
    expect(rc(m).style).toBeUndefined();
    expect(readConfigOverrides(m)).toMatchObject({ width: 1000, height: 400 });
  });

  it("creates a v3 config on a map that has none", () => {
    const m = applyDiffOp(makeMap(), { op: "resize_canvas", payload: { height: 900 } });
    expect(rc(m)).toEqual({ style: { background: { canvas: { default: { height: 900 } } } } });
    expect(readConfigOverrides(makeMap())).toEqual({});
    expect(readConfigOverrides(m)).toEqual({ height: 900 });
  });

  it("rejects out-of-range or empty resize_canvas payloads", () => {
    const m = makeMap();
    expect(() => applyDiffOp(m, { op: "resize_canvas", payload: {} })).toThrow(/width and\/or height/);
    expect(() => applyDiffOp(m, { op: "resize_canvas", payload: { width: 100 } })).toThrow(/\[200, 10000\]/);
    expect(() => applyDiffOp(m, { op: "resize_canvas", payload: { height: 20000 } })).toThrow(/\[200, 10000\]/);
  });

  it("move_legend writes x/y or a named anchor in both shapes", () => {
    const v3 = applyDiffOp(v3Map(), { op: "move_legend", payload: { x: 40, y: 700 } });
    expect(rc(v3).style.legend.default.box.position).toEqual({ x: 40, y: 700 });
    expect(readConfigOverrides(v3).legendPosition).toEqual({ x: 40, y: 700 });

    const legacy = applyDiffOp(legacyMap(), { op: "move_legend", payload: { position: "top-left" } });
    expect(rc(legacy).legend.position).toBe("top-left");
    expect(rc(legacy).style).toBeUndefined();
    expect(readConfigOverrides(legacy).legendPosition).toBe("top-left");

    expect(() => applyDiffOp(makeMap(), { op: "move_legend", payload: { position: "middle" as never } }))
      .toThrow(/position must be one of/);
  });
});
