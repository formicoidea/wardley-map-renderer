import { describe, expect, it, vi } from "vitest";
import { applyDiffOp, type DiffOp } from "../diff-ops-apply.js";
import {
  ComponentTypeEnum,
  EvolveTypeEnum,
  FlowSchema,
  NatureEnum,
  RelationTypeEnum,
  SubtypeEnum,
  WardleyMapSchema,
  type WardleyMap,
} from "../schema.js";
import {
  buildProps,
  COMPONENT_TYPES,
  EVOLVE_TYPES,
  FLOW_STYLES,
  NATURES,
  NATURES_BY_KEY,
  PROPS_CSS,
  propsFields,
  RELATION_TYPES,
  SUBTYPES,
  SUBTYPES_BY_TYPE,
  type FieldDesc,
} from "./props.js";

const pos = (e: number, v: number) => ({ evolution: { scalar: e }, visibility: { scalar: v } });
function sample(): WardleyMap {
  return WardleyMapSchema.parse({
    title: "Tea",
    components: [
      { id: "user", label: { name: "User" }, type: "anchor", position: pos(0.5, 0.95) },
      { id: "cup", label: { name: "Cup" }, type: "component", subtype: "userNeed", nature: "natural", position: pos(0.6, 0.8) },
      { id: "kettle", label: { name: "Kettle" }, type: "component", position: pos(0.4, 0.5), evolvesTo: [{ position: pos(0.7, 0.5) }] },
      { id: "power", label: { name: "Power" }, type: "component", position: pos(0.7, 0.5), step: { number: 2 } },
      { id: "pipe", label: { name: "Pipe" }, type: "pipeline", position: pos(0.5, 0.3), pipelineGeometry: { evoStart: 0.3, evoEnd: 0.7, visStart: 0.25, visEnd: 0.35 } },
    ],
    relations: [
      { id: "r1", consumer: "user", supplier: "cup" },
      { id: "r2", consumer: "cup", supplier: "kettle", flow: { label: "water" } },
      { id: "r3", consumer: "kettle", supplier: "cup" },
    ],
  });
}
const fields = (map: WardleyMap, id: string) => propsFields(map, id)!.fields;
const byKey = (fs: FieldDesc[], k: string) => fs.find((f) => f.key === k);
const applies = (map: WardleyMap, op: DiffOp | null) => {
  expect(op).not.toBeNull();
  const next = applyDiffOp(map, op!);
  expect(WardleyMapSchema.safeParse(next).success).toBe(true);
  return next;
};

describe("enum mirrors", () => {
  it("equal the zod enums", () => {
    expect(COMPONENT_TYPES).toEqual(ComponentTypeEnum.options);
    expect(SUBTYPES).toEqual(SubtypeEnum.options);
    expect(NATURES).toEqual(NatureEnum.options);
    expect(EVOLVE_TYPES).toEqual(EvolveTypeEnum.options);
    expect(RELATION_TYPES).toEqual(RelationTypeEnum.options);
    expect(FLOW_STYLES).toEqual(FlowSchema.shape.style.removeDefault().options);
  });

  it("per-type validity matches ComponentSchema", () => {
    const base = { id: "x", label: { name: "X" }, position: pos(0.5, 0.5) };
    for (const type of COMPONENT_TYPES) {
      for (const subtype of [undefined, ...SUBTYPES]) {
        for (const nature of [undefined, ...NATURES]) {
          const c = { ...base, type, subtype, nature, ...(type === "pipeline" ? { pipelineGeometry: { evoStart: 0.4, evoEnd: 0.6, visStart: 0.4, visEnd: 0.6 } } : {}) };
          const ok = WardleyMapSchema.safeParse({ title: "t", components: [c], relations: [] }).success;
          const subOk = subtype === undefined || SUBTYPES_BY_TYPE[type].includes(subtype);
          const natOk = nature === undefined || (NATURES_BY_KEY[type === "component" ? `component/${subtype}` : type] ?? []).includes(nature);
          expect(ok, `${type}/${subtype}/${nature}`).toBe(subOk && natOk);
        }
      }
    }
  });
});

describe("propsFields", () => {
  it("returns null for unknown ids", () => {
    expect(propsFields(sample(), "nope")).toBeNull();
  });

  it("only offers valid subtype/nature fields", () => {
    const map = sample();
    expect(byKey(fields(map, "user"), "subtype")).toBeUndefined();
    expect(byKey(fields(map, "user"), "nature")!.options!.map((o) => o[0])).toEqual(["", "personae", "generic", "group"]);
    expect(byKey(fields(map, "cup"), "nature")!.options!.map((o) => o[0])).toEqual(["", "natural", "anthropic"]);
    expect(byKey(fields(map, "kettle"), "nature")).toBeUndefined();
    expect(byKey(fields(map, "pipe"), "nature")).toBeUndefined();
    expect(byKey(fields(map, "pipe"), "subtype")!.options!.map((o) => o[0])).toEqual(["", "functional", "userNeed", "solution"]);
  });

  it("every component field emits one applicable op", () => {
    const map = sample();
    const f = fields(map, "cup");
    const ops: [string, string | boolean | null, (m: WardleyMap) => unknown, unknown][] = [
      ["name", "Mug", (m) => m.components[1].label.name, "Mug"],
      ["type", "pipeline", (m) => m.components[1].type, "pipeline"],
      ["subtype", "market", (m) => [m.components[1].subtype, m.components[1].nature], ["market", undefined]],
      ["nature", "anthropic", (m) => m.components[1].nature, "anthropic"],
      ["nature", "", (m) => m.components[1].nature, undefined],
      ["description", "hot", (m) => m.components[1].description, "hot"],
      ["color", "#ff0000", (m) => m.components[1].color, "#ff0000"],
      ["method", "buying-policy", (m) => m.components[1].method, { category: "buying-policy", recommendation: "Uncharted" }],
      ["inertia", true, (m) => m.components[1].inertia, true],
      ["accelerator", true, (m) => m.components[1].accelerator, true],
      ["deaccelerator", true, (m) => m.components[1].deaccelerator, true],
      ["step", "3", (m) => m.components[1].step, { number: 3 }],
      ["evolvesTo", "power", (m) => m.components[1].evolvesTo?.[0].position.evolution.scalar, 0.7],
      ["rangeMin", "0.5", (m) => m.components[1].position.evolution.range, [0.5, 0.6]],
      ["rangeMax", "0.9", (m) => m.components[1].position.evolution.range, [0.6, 0.9]],
    ];
    for (const [key, v, read, want] of ops) {
      expect(read(applies(map, byKey(f, key)!.toOp(v))), key).toEqual(want);
    }
    expect(applies(map, byKey(f, "delete")!.toOp(null)).components).toHaveLength(4);
    expect(byKey(f, "recommendation")!.disabled).toBe(true);
    expect(byKey(f, "recommendation")!.toOp("Transitional")).toBeNull();
    expect(byKey(f, "stepColor")!.toOp("#00ff00")).toBeNull();
    expect(byKey(f, "evolveType")).toBeUndefined();
  });

  it("dependent fields edit existing decorators", () => {
    let map = sample();
    map = applyDiffOp(map, byKey(fields(map, "power"), "method")!.toOp("attitudes")!);
    map = applies(map, byKey(fields(map, "power"), "recommendation")!.toOp("Transitional"));
    expect(map.components[3].method).toEqual({ category: "attitudes", recommendation: "Transitional" });
    map = applies(map, byKey(fields(map, "power"), "stepColor")!.toOp("#00ff00"));
    expect(map.components[3].step).toEqual({ number: 2, color: "#00ff00" });
    expect(byKey(fields(map, "power"), "stepColor")!.clear).toBe(true);
    map = applies(map, byKey(fields(map, "power"), "step")!.toOp("5"));
    expect(map.components[3].step).toEqual({ number: 5, color: "#00ff00" });
    map = applies(map, byKey(fields(map, "power"), "stepColor")!.toOp(null));
    expect(map.components[3].step).toEqual({ number: 5 });
    expect(byKey(fields(map, "power"), "step")!.toOp("0")).toBeNull();
    expect(byKey(fields(map, "power"), "step")!.toOp("1.5")).toBeNull();
    map = applies(map, byKey(fields(map, "power"), "step")!.toOp(""));
    expect(map.components[3].step).toBeUndefined();
    map = applies(map, byKey(fields(map, "power"), "method")!.toOp(""));
    expect(map.components[3].method).toBeUndefined();
  });

  it("evolvesTo: resolves target, edits type/inertia, clears", () => {
    let map = sample();
    const f = fields(map, "kettle");
    expect(byKey(f, "evolvesTo")!.value).toBe("power");
    expect(byKey(f, "evolvesTo")!.options!.map((o) => o[0])).not.toContain("kettle");
    map = applies(map, byKey(f, "evolveType")!.toOp("forced"));
    map = applies(map, byKey(fields(map, "kettle"), "evolveInertia")!.toOp(true));
    expect(map.components[2].evolvesTo).toEqual([{ position: pos(0.7, 0.5), evolveType: "forced", inertia: true }]);
    map = applies(map, byKey(fields(map, "kettle"), "evolvesTo")!.toOp(""));
    expect(map.components[2].evolvesTo).toBeUndefined();

    const moved = applyDiffOp(sample(), { op: "move_component", payload: { id: "power", evolution: 0.9, visibility: 0.5 } });
    const g = byKey(fields(moved, "kettle"), "evolvesTo")!;
    expect(g.value).toBe("?");
    expect(g.toOp("?")).toBeNull();
  });

  it("range rejects invalid bounds and clears", () => {
    let map = sample();
    const f = fields(map, "kettle");
    expect(byKey(f, "rangeMin")!.toOp("0.9")).toBeNull(); // > scalar-derived max 0.4
    expect(byKey(f, "rangeMax")!.toOp("1.5")).toBeNull();
    expect(byKey(f, "rangeMax")!.toOp("")).toBeNull(); // nothing to clear
    map = applies(map, byKey(f, "rangeMax")!.toOp("0.8"));
    expect(byKey(fields(map, "kettle"), "rangeMax")!.clear).toBe(true);
    map = applies(map, byKey(fields(map, "kettle"), "rangeMax")!.toOp(null));
    expect(map.components[2].position.evolution.range).toBeUndefined();
  });

  it("pipeline delete uses delete_pipeline; type change drops geometry", () => {
    const map = sample();
    const f = fields(map, "pipe");
    expect(f.find((x) => x.key === "delete")!.toOp(null)).toEqual({ op: "delete_pipeline", payload: { id: "pipe" } });
    expect(applies(map, byKey(f, "type")!.toOp("component")).components[4].pipelineGeometry).toBeUndefined();
  });

  it("relation fields", () => {
    let map = sample();
    const p = propsFields(map, "r2")!;
    expect(p.title).toBe("Cup → Kettle");
    expect(byKey(p.fields, "reverse")!.disabled).toBe(true); // r3 is the reverse
    expect(byKey(fields(map, "r1"), "reverse")!.disabled).toBe(false);
    expect(byKey(fields(map, "r1"), "flowStyle")).toBeUndefined();
    map = applies(map, byKey(p.fields, "type")!.toOp("Flow"));
    map = applies(map, byKey(p.fields, "flowStyle")!.toOp("dashed"));
    expect(map.relations[1]).toMatchObject({ type: "Flow", flow: { label: "water", style: "dashed" } });
    map = applies(map, byKey(fields(map, "r2"), "flowLabel")!.toOp("tea"));
    expect(map.relations[1].flow).toEqual({ label: "tea", style: "dashed" });
    map = applies(map, byKey(fields(map, "r2"), "flowLabel")!.toOp(""));
    expect(map.relations[1].flow).toBeUndefined();
    const r1 = applies(map, byKey(fields(map, "r1"), "reverse")!.toOp(null));
    expect(r1.relations[0]).toMatchObject({ consumer: "cup", supplier: "user" });
    expect(applies(map, byKey(fields(map, "r1"), "delete")!.toOp(null)).relations).toHaveLength(2);
  });
});

// ── Minimal fake DOM (vitest env is node) ────────────────────────────
class El {
  children: El[] = [];
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  [k: string]: any;
  constructor(public tagName: string) {}
  get childNodes() { return [...this.children]; }
  append(...xs: (El | string)[]) {
    for (const x of xs) {
      if (typeof x === "string") { this.text = (this.text ?? "") + x; continue; }
      x.parent?.children.splice(x.parent.children.indexOf(x), 1);
      x.parent = this;
      this.children.push(x);
    }
  }
  prepend(x: El) { this.append(x); this.children.unshift(this.children.pop()!); }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  all(pred: (e: El) => boolean): El[] {
    return this.children.flatMap((c) => [...(pred(c) ? [c] : []), ...c.all(pred)]);
  }
}
const fakeDoc = { createElement: (t: string) => new El(t) } as unknown as Document;

describe("buildProps", () => {
  it("returns null for unknown ids", () => {
    expect(buildProps(fakeDoc, sample(), "nope", () => {})).toBeNull();
  });

  it("builds labelled controls that dispatch on change and restore on invalid", () => {
    const dispatch = vi.fn();
    const { title, body } = buildProps(fakeDoc, sample(), "power", dispatch)!;
    const root = body as unknown as El;
    expect(title).toBe("Power");
    expect(root.tagName).toBe("form");
    const named = (n: string) => root.all((e) => e.name === n)[0];
    // Every control sits inside a <label>.
    for (const input of root.all((e) => ["input", "select", "textarea"].includes(e.tagName))) {
      expect(input.parent.tagName).toBe("label");
    }
    const step = named("step");
    expect(step.value).toBe("2");
    expect(step.parent.parent.dataset.row).toBe("step");
    step.value = " 4 ";
    step.onchange();
    expect(dispatch).toHaveBeenLastCalledWith({ op: "set_field", payload: { target: "power", path: "step", value: { number: 4 } } });
    step.value = "-1";
    step.onchange();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(step.value).toBe("2");

    const ck = named("inertia");
    expect(ck.type).toBe("checkbox");
    ck.checked = true;
    ck.onchange();
    expect(dispatch).toHaveBeenLastCalledWith({ op: "set_field", payload: { target: "power", path: "inertia", value: true } });

    expect(named("method").attrs.list).toBe("pf-method-list");
    expect(named("recommendation").disabled).toBe(true);
    expect(named("type").children.map((o) => o.value)).toEqual(["anchor", "component", "pipeline"]);

    const del = root.all((e) => e.tagName === "button" && e.textContent === "Delete component")[0];
    del.onclick();
    expect(dispatch).toHaveBeenLastCalledWith({ op: "delete_component", payload: { id: "power" } });
    let prevented = false;
    root.onsubmit({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
  });

  it("ships compact CSS", () => {
    expect(PROPS_CSS.length).toBeLessThan(1024);
  });
});
