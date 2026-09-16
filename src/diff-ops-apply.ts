/**
 * Pure diff-op engine for interactive Wardley Map editing.
 *
 * Browser-safe: ZERO runtime imports (only `import type`), so the editor bundle
 * does not pull in zod. Zod payload schemas live in `./diff-ops.ts`.
 *
 * Contract:
 * - `applyDiffOp(map, op)` returns a NEW map and never mutates its input.
 * - It throws an `Error` for unknown ops, unknown ids and invalid payloads.
 * - All positions are normalized [0, 1] (evolution = x, visibility = y), except
 *   `move_label` / `label.position` whose dx/dy are SVG user units (px) relative
 *   to the node centre, exactly as `src/render/labels-layer.ts` consumes them.
 *
 * @module diff-ops-apply
 */

import type {
  Component,
  EvolvesTo,
  Flow,
  LabelPosition,
  Method,
  Nature,
  PipelineGeometry,
  Relation,
  StepDecorator,
  Subtype,
  WardleyMap,
} from "./schema.js";

// ── Op types (the editor ↔ engine contract) ──────────────────────────

type ComponentType = Component["type"];
type RelationType = Relation["type"];
type FlowStyle = Flow["style"];

export interface MoveComponentPayload { id: string; evolution: number; visibility: number }
export interface AddComponentPayload {
  /** Omit to generate one with `uniqueId(map, name)`. */
  id?: string;
  name: string;
  type?: ComponentType; // default "component"
  subtype?: Subtype;
  nature?: Nature;
  evolution: number;
  visibility: number;
  /** Pipelines only; defaults to ±0.15 evo / ±0.05 vis around the position. */
  pipelineGeometry?: { evoStart: number; evoEnd: number; visStart: number; visEnd: number };
}
export interface IdPayload { id: string }
export interface RenameComponentPayload { id: string; name: string }
export interface AddEdgePayload {
  /**
   * Omit to generate one deterministically: `uniqueId(map, "<consumer>-<supplier>")`,
   * i.e. the slug of both ids ("App"→"User" gives "app-user"), suffixed `-2`, `-3`…
   * while it collides with an existing component or relation id.
   */
  id?: string;
  consumer: string;
  supplier: string;
  type?: RelationType; // default "DependsOn"
}
export interface ChangeComponentTypePayload { id: string; type: ComponentType; subtype?: Subtype }
/**
 * Point the component's first evolve arrow at another component's current
 * position (`evolvesTo`) or at an explicit map point (`position`, rounded to 3
 * decimals); `evolvesTo: null` clears all arrows. Setting a target replaces the
 * first arrow only: its evolveType/inertia (default natural) and any further
 * arrows are kept.
 */
export type SetEvolvesToPayload =
  | { id: string; evolvesTo: string | null; position?: never }
  | { id: string; position: { evolution: number; visibility: number }; evolvesTo?: never };
export interface SetFlowPayload { id: string; flow: { label: string; style?: FlowStyle } | null }
export interface ChangeEdgeTypePayload { id: string; type: RelationType }
export interface ResizePipelinePayload {
  id: string;
  evoStart?: number;
  evoEnd?: number;
  visStart?: number;
  visEnd?: number;
  /** Handle (top-border square) evolution, clamped into [evoStart, evoEnd]. */
  handleEvolution?: number;
}
export interface MovePipelinePayload { id: string; dEvo: number; dVis: number }
export interface MoveLabelPayload { id: string; dx: number; dy: number }
export interface MoveStepPayload { id: string; evolution: number; visibility: number }
export interface RenameMapPayload { title: string }

/** Value type per allowed `set_field` path (null deletes the field). */
export interface SetFieldValues {
  "label.name": string;
  "label.position": LabelPosition | null;
  description: string | null;
  color: string | null;
  /** Component type (component target) or relation type (relation target). */
  type: ComponentType | RelationType;
  subtype: Subtype | null;
  nature: Nature | null;
  method: Method | null;
  inertia: boolean | null;
  accelerator: boolean | null;
  deaccelerator: boolean | null;
  step: StepDecorator | null;
  evolvesTo: EvolvesTo[] | null;
  "position.evolution.range": [number, number] | null;
  /** Relation target only. */
  flow: { label: string; style?: FlowStyle } | null;
}
export type SetFieldPath = keyof SetFieldValues;
export type SetFieldPayload = {
  [P in SetFieldPath]: { target: string; path: P; value: SetFieldValues[P] };
}[SetFieldPath];

export type DiffOp =
  | { op: "move_component"; payload: MoveComponentPayload }
  | { op: "add_component"; payload: AddComponentPayload }
  | { op: "delete_component"; payload: IdPayload }
  | { op: "rename_component"; payload: RenameComponentPayload }
  | { op: "add_edge"; payload: AddEdgePayload }
  | { op: "delete_edge"; payload: IdPayload }
  | { op: "reverse_edge"; payload: IdPayload }
  | { op: "change_component_type"; payload: ChangeComponentTypePayload }
  | { op: "set_evolves_to"; payload: SetEvolvesToPayload }
  | { op: "set_flow"; payload: SetFlowPayload }
  | { op: "change_edge_type"; payload: ChangeEdgeTypePayload }
  | { op: "resize_pipeline"; payload: ResizePipelinePayload }
  | { op: "move_pipeline"; payload: MovePipelinePayload }
  | { op: "delete_pipeline"; payload: IdPayload }
  | { op: "move_label"; payload: MoveLabelPayload }
  | { op: "move_step"; payload: MoveStepPayload }
  | { op: "rename_map"; payload: RenameMapPayload }
  | { op: "set_field"; payload: SetFieldPayload };

export type DiffOpName = DiffOp["op"];

// ── Small helpers ────────────────────────────────────────────────────

const COMPONENT_TYPES: readonly string[] = ["anchor", "component", "pipeline"];
const RELATION_TYPES: readonly string[] = ["DependsOn", "Flow", "Constraint"];
const FLOW_STYLES: readonly string[] = ["solid", "dashed", "bold"];
const EVOLVE_TYPES: readonly string[] = ["natural", "ecosystem", "forced", "late"];
const SUBTYPES: Record<ComponentType, readonly string[]> = {
  anchor: [],
  component: ["userNeed", "market", "ecosystem", "solution", "functional", "supplier"],
  pipeline: ["functional", "userNeed", "solution"],
};
const NATURES: Record<string, readonly string[]> = {
  anchor: ["personae", "generic", "group"],
  "component/userNeed": ["natural", "anthropic"],
  "component/functional": ["practice", "data", "activity", "knowledge"],
};
/** Epsilon for pipeline containment (matches pipeline-geometry.ts). */
const PIPELINE_EPSILON = 0.015;
const PIPELINE_DEFAULT_HALF_EVO = 0.15;
const PIPELINE_DEFAULT_HALF_VIS = 0.05;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

function fail(msg: string): never {
  throw new Error(`diff-op: ${msg}`);
}
function str(v: unknown, name: string): string {
  if (typeof v !== "string" || v === "") fail(`${name} must be a non-empty string`);
  return v;
}
function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${name} must be a finite number`);
  return v;
}
function unit(v: unknown, name: string): number {
  const n = num(v, name);
  if (n < 0 || n > 1) fail(`${name} must be within [0, 1]`);
  return n;
}
/** Hex (#rgb … #rrggbbaa) or a Tailwind-style name ("red-600"): safe to put in markup. */
function color(v: unknown, name: string): string {
  if (typeof v !== "string" || !/^(#[0-9a-f]{3,8}|[a-z]+-\d{2,3})$/i.test(v)) {
    fail(`${name} must be a hex color (#rgb…#rrggbbaa) or a name like "red-600"`);
  }
  return v;
}
function oneOf<T extends string>(v: unknown, allowed: readonly string[], name: string): T {
  if (typeof v !== "string" || !allowed.includes(v)) fail(`${name} must be one of: ${allowed.join(", ")}`);
  return v as T;
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function getComponent(map: WardleyMap, id: unknown): Component {
  const comp = map.components.find((c) => c.id === id);
  if (!comp) fail(`unknown component id "${String(id)}"`);
  return comp;
}
function getRelation(map: WardleyMap, id: unknown): Relation {
  const rel = map.relations.find((r) => r.id === id);
  if (!rel) fail(`unknown relation id "${String(id)}"`);
  return rel;
}
function getPipeline(map: WardleyMap, id: unknown): Component & { pipelineGeometry: PipelineGeometry } {
  const comp = getComponent(map, id);
  if (comp.type !== "pipeline" || !comp.pipelineGeometry) fail(`component "${String(id)}" is not a pipeline`);
  return comp as Component & { pipelineGeometry: PipelineGeometry };
}
function idTaken(map: WardleyMap, id: string): boolean {
  return map.components.some((c) => c.id === id) || map.relations.some((r) => r.id === id);
}

/**
 * Generate an id unique among the map's component AND relation ids:
 * slug of `name` ("Web App" → "web-app"), then "web-app-2", "web-app-3", ...
 */
export function uniqueId(map: WardleyMap, name: string): string {
  const slug =
    name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "component";
  if (!idTaken(map, slug)) return slug;
  let n = 2;
  while (idTaken(map, `${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/** Membership predicate (copy of pipeline-geometry.ts `isInsidePipeline`, zod-free). */
function isInside(c: Component, geo: PipelineGeometry): boolean {
  const e = c.position.evolution.scalar;
  const v = c.position.visibility.scalar;
  return (
    e >= geo.evoStart - PIPELINE_EPSILON && e <= geo.evoEnd + PIPELINE_EPSILON &&
    v >= geo.visStart - PIPELINE_EPSILON && v <= geo.visEnd + PIPELINE_EPSILON
  );
}

/** Components (non-pipeline) positionally contained in a pipeline. */
export function pipelineMembers(map: WardleyMap, pipelineId: string): Component[] {
  const pipe = map.components.find((c) => c.id === pipelineId);
  const geo = pipe?.type === "pipeline" ? pipe.pipelineGeometry : undefined;
  if (!geo) return [];
  return map.components.filter((c) => c.type !== "pipeline" && isInside(c, geo));
}

function defaultPipelineGeometry(evolution: number, visibility: number): PipelineGeometry {
  return {
    evoStart: round3(clamp01(evolution - PIPELINE_DEFAULT_HALF_EVO)),
    evoEnd: round3(clamp01(evolution + PIPELINE_DEFAULT_HALF_EVO)),
    visStart: round3(clamp01(visibility - PIPELINE_DEFAULT_HALF_VIS)),
    visEnd: round3(clamp01(visibility + PIPELINE_DEFAULT_HALF_VIS)),
  };
}

function checkNature(type: ComponentType, subtype: string | undefined, nature: string, name: string): void {
  const key = type === "component" ? `component/${subtype}` : type;
  oneOf(nature, NATURES[key] ?? [], `${name} (for ${key})`);
}

/** Apply a type change, keeping subtype/nature only when still valid for the new type. */
function setType(comp: Component, type: ComponentType, subtype?: Subtype | null): void {
  const nextSubtype = subtype === undefined ? comp.subtype : subtype ?? undefined;
  if (subtype != null) oneOf(subtype, SUBTYPES[type], `subtype (for ${type})`);
  const wasPipeline = comp.type === "pipeline";
  comp.type = type;
  if (nextSubtype && SUBTYPES[type].includes(nextSubtype)) comp.subtype = nextSubtype;
  else delete comp.subtype;
  dropInvalidNature(comp);
  if (type === "pipeline") {
    comp.pipelineGeometry ??= defaultPipelineGeometry(
      comp.position.evolution.scalar,
      comp.position.visibility.scalar,
    );
  } else if (wasPipeline) {
    // Contained components keep their positions (membership is purely positional).
    delete comp.pipelineGeometry;
  }
}

function dropInvalidNature(comp: Component): void {
  if (comp.nature === undefined) return;
  const key = comp.type === "component" ? `component/${comp.subtype}` : comp.type;
  if (!(NATURES[key] ?? []).includes(comp.nature)) delete comp.nature;
}

type PosLike = { evolution: { scalar: number }; visibility: { scalar: number } };
function samePos(a: PosLike, e: number, v: number): boolean {
  return Math.abs(a.evolution.scalar - e) < 0.001 && Math.abs(a.visibility.scalar - v) < 0.001;
}

/** Remove a component + its relations + evolvesTo entries of others that target its position. */
function removeComponent(map: WardleyMap, comp: Component): void {
  const e = comp.position.evolution.scalar;
  const v = comp.position.visibility.scalar;
  map.components = map.components.filter((c) => c !== comp);
  map.relations = map.relations.filter((r) => r.consumer !== comp.id && r.supplier !== comp.id);
  for (const c of map.components) {
    if (!Array.isArray(c.evolvesTo)) continue;
    const kept = c.evolvesTo.filter((t) => !samePos(t.position, e, v));
    if (kept.length === c.evolvesTo.length) continue;
    if (kept.length) c.evolvesTo = kept;
    else delete c.evolvesTo;
  }
}

// ── Validators for set_field values ──────────────────────────────────

function checkFlow(v: unknown, name: string): Flow {
  if (!isObj(v)) fail(`${name} must be { label, style? } or null`);
  return {
    label: str(v.label, `${name}.label`),
    style: v.style === undefined ? "solid" : oneOf<FlowStyle>(v.style, FLOW_STYLES, `${name}.style`),
  };
}

function checkEvolvesTo(v: unknown): EvolvesTo[] {
  if (!Array.isArray(v)) fail("evolvesTo must be an array or null");
  return v.map((t, i) => {
    const p = isObj(t) && isObj(t.position) ? t.position : fail(`evolvesTo[${i}].position is required`);
    const ev = isObj(p.evolution) ? p.evolution.scalar : undefined;
    const vi = isObj(p.visibility) ? p.visibility.scalar : undefined;
    const out: EvolvesTo = {
      position: {
        evolution: { scalar: unit(ev, `evolvesTo[${i}].position.evolution.scalar`) },
        visibility: { scalar: unit(vi, `evolvesTo[${i}].position.visibility.scalar`) },
      },
      evolveType: t.evolveType === undefined
        ? "natural"
        : oneOf<EvolvesTo["evolveType"]>(t.evolveType, EVOLVE_TYPES, `evolvesTo[${i}].evolveType`),
    };
    if (t.inertia !== undefined) {
      if (typeof t.inertia !== "boolean") fail(`evolvesTo[${i}].inertia must be boolean`);
      out.inertia = t.inertia;
    }
    return out;
  });
}

function setOrDelete<T extends object>(obj: T, key: keyof T, value: unknown): void {
  if (value === null) delete obj[key];
  else obj[key] = value as T[keyof T];
}

const COMPONENT_PATHS = new Set<string>([
  "label.name", "label.position", "description", "color", "type", "subtype", "nature",
  "method", "inertia", "accelerator", "deaccelerator", "step", "evolvesTo",
  "position.evolution.range",
]);
const RELATION_PATHS = new Set<string>(["type", "flow"]);

function setComponentField(map: WardleyMap, comp: Component, path: string, value: unknown): void {
  switch (path) {
    case "label.name":
      comp.label.name = str(value, "label.name");
      return;
    case "label.position":
      if (value !== null && !isObj(value)) fail("label.position must be { dx, dy } or null");
      if (value === null) delete comp.label.position;
      else comp.label.position = { dx: num(value.dx, "label.position.dx"), dy: num(value.dy, "label.position.dy") };
      return;
    case "description":
      if (value !== null && typeof value !== "string") fail(`${path} must be a string or null`);
      setOrDelete(comp, path, value === "" ? null : value);
      return;
    case "color":
      setOrDelete(comp, path, value === null || value === "" ? null : color(value, "color"));
      return;
    case "type":
      setType(comp, oneOf(value, COMPONENT_TYPES, "type"));
      return;
    case "subtype":
      if (value !== null) oneOf(value, SUBTYPES[comp.type], `subtype (for ${comp.type})`);
      setOrDelete(comp, "subtype", value);
      dropInvalidNature(comp);
      return;
    case "nature":
      if (value !== null) checkNature(comp.type, comp.subtype, value as string, "nature");
      setOrDelete(comp, "nature", value);
      return;
    case "method":
      if (value !== null && !isObj(value)) fail("method must be { category, recommendation } or null");
      setOrDelete(comp, "method", value && {
        category: str(value.category, "method.category"),
        recommendation: str(value.recommendation, "method.recommendation"),
      });
      return;
    case "inertia":
    case "accelerator":
    case "deaccelerator":
      if (value !== null && typeof value !== "boolean") fail(`${path} must be a boolean or null`);
      setOrDelete(comp, path, value === false ? null : value);
      return;
    case "step": {
      if (value !== null && !isObj(value)) fail("step must be { number, color? } or null");
      if (value === null) { delete comp.step; return; }
      const n = num(value.number, "step.number");
      if (!Number.isInteger(n) || n < 1) fail("step.number must be an integer >= 1");
      const step: StepDecorator = { number: n };
      if (value.color !== undefined) step.color = color(value.color, "step.color");
      comp.step = step;
      return;
    }
    case "evolvesTo": {
      const list = value === null ? [] : checkEvolvesTo(value);
      if (list.length) comp.evolvesTo = list;
      else delete comp.evolvesTo;
      return;
    }
    case "position.evolution.range": {
      if (value === null) { delete comp.position.evolution.range; return; }
      if (!Array.isArray(value) || value.length !== 2) fail("position.evolution.range must be [min, max] or null");
      const lo = unit(value[0], "range[0]");
      const hi = unit(value[1], "range[1]");
      if (lo > hi) fail("range[0] must be <= range[1]");
      comp.position.evolution.range = [lo, hi];
      return;
    }
  }
  fail(`set_field path "${path}" is not allowed on a component`);
}

function setRelationField(map: WardleyMap, rel: Relation, path: string, value: unknown): void {
  if (path === "type") {
    rel.type = oneOf(value, RELATION_TYPES, "type");
  } else if (path === "flow") {
    if (value === null) delete rel.flow;
    else rel.flow = checkFlow(value, "flow");
  } else {
    fail(`set_field path "${path}" is not allowed on a relation`);
  }
}

// ── Op handlers (mutate the working copy; validate BEFORE mutating) ──

function mutate(map: WardleyMap, diffOp: DiffOp): void {
  if (!isObj(diffOp as unknown) || !isObj(diffOp.payload)) fail("op must be { op, payload }");
  const p = diffOp.payload as Record<string, unknown>;

  switch (diffOp.op) {
    case "move_component":
    case "move_step": {
      const comp = getComponent(map, p.id);
      if (diffOp.op === "move_step" && !comp.step) fail(`component "${comp.id}" has no step`);
      // Rounded like sanitizeMap so an edited map is stable under re-sanitization.
      const e = unit(p.evolution, "evolution");
      const v = unit(p.visibility, "visibility");
      comp.position.evolution.scalar = round3(e);
      comp.position.visibility.scalar = round3(v);
      return;
    }

    case "add_component": {
      const name = str(p.name, "name");
      const id = p.id === undefined ? uniqueId(map, name) : str(p.id, "id");
      if (map.components.some((c) => c.id === id)) fail(`component id "${id}" already exists`);
      const type = p.type === undefined ? "component" : oneOf<ComponentType>(p.type, COMPONENT_TYPES, "type");
      const e = round3(unit(p.evolution, "evolution"));
      const v = round3(unit(p.visibility, "visibility"));
      const comp: Component = {
        id,
        label: { name },
        type,
        position: { evolution: { scalar: e }, visibility: { scalar: v } },
      };
      if (p.subtype !== undefined) comp.subtype = oneOf<Subtype>(p.subtype, SUBTYPES[type], `subtype (for ${type})`);
      if (p.nature !== undefined) {
        checkNature(type, comp.subtype, p.nature as string, "nature");
        comp.nature = p.nature as Nature;
      }
      if (type === "pipeline") {
        const g = p.pipelineGeometry;
        if (g !== undefined) {
          if (!isObj(g)) fail("pipelineGeometry must be an object");
          const geo = {
            evoStart: round3(unit(g.evoStart, "pipelineGeometry.evoStart")),
            evoEnd: round3(unit(g.evoEnd, "pipelineGeometry.evoEnd")),
            visStart: round3(unit(g.visStart, "pipelineGeometry.visStart")),
            visEnd: round3(unit(g.visEnd, "pipelineGeometry.visEnd")),
          };
          comp.pipelineGeometry = {
            evoStart: Math.min(geo.evoStart, geo.evoEnd),
            evoEnd: Math.max(geo.evoStart, geo.evoEnd),
            visStart: Math.min(geo.visStart, geo.visEnd),
            visEnd: Math.max(geo.visStart, geo.visEnd),
          };
        } else {
          comp.pipelineGeometry = defaultPipelineGeometry(e, v);
        }
      }
      map.components.push(comp);
      return;
    }

    case "delete_component":
      removeComponent(map, getComponent(map, p.id));
      return;

    case "delete_pipeline":
      removeComponent(map, getPipeline(map, p.id));
      return;

    case "rename_component":
      getComponent(map, p.id).label.name = str(p.name, "name");
      return;

    case "rename_map":
      map.title = str(p.title, "title");
      return;

    case "add_edge": {
      const consumer = getComponent(map, p.consumer).id;
      const supplier = getComponent(map, p.supplier).id;
      if (consumer === supplier) fail("self-links are not allowed");
      if (map.relations.some((r) => r.consumer === consumer && r.supplier === supplier)) {
        fail(`relation ${consumer} -> ${supplier} already exists`);
      }
      const type = p.type === undefined ? "DependsOn" : oneOf<RelationType>(p.type, RELATION_TYPES, "type");
      const id = p.id === undefined ? uniqueId(map, `${consumer}-${supplier}`) : str(p.id, "id");
      if (map.relations.some((r) => r.id === id)) fail(`relation id "${id}" already exists`);
      map.relations.push({ id, consumer, supplier, type });
      return;
    }

    case "delete_edge": {
      const rel = getRelation(map, p.id);
      map.relations = map.relations.filter((r) => r !== rel);
      return;
    }

    case "reverse_edge": {
      const rel = getRelation(map, p.id);
      if (map.relations.some((r) => r.consumer === rel.supplier && r.supplier === rel.consumer)) {
        fail(`relation ${rel.supplier} -> ${rel.consumer} already exists`);
      }
      [rel.consumer, rel.supplier] = [rel.supplier, rel.consumer];
      return;
    }

    case "change_component_type": {
      const comp = getComponent(map, p.id);
      const type = oneOf<ComponentType>(p.type, COMPONENT_TYPES, "type");
      // Legacy semantics: subtype is set/cleared together with the type.
      setType(comp, type, (p.subtype as Subtype | undefined) ?? null);
      return;
    }

    case "change_edge_type":
      getRelation(map, p.id).type = oneOf(p.type, RELATION_TYPES, "type");
      return;

    case "set_flow": {
      const rel = getRelation(map, p.id);
      if (p.flow === null) delete rel.flow;
      else rel.flow = checkFlow(p.flow, "flow");
      return;
    }

    case "set_evolves_to": {
      const comp = getComponent(map, p.id);
      let evolution: number, visibility: number;
      if (p.position !== undefined) {
        if (p.evolvesTo !== undefined) fail("set_evolves_to takes evolvesTo or position, not both");
        const pos = isObj(p.position) ? p.position : fail("position must be an object");
        evolution = round3(unit(pos.evolution, "position.evolution"));
        visibility = round3(unit(pos.visibility, "position.visibility"));
      } else if (p.evolvesTo === null) {
        delete comp.evolvesTo;
        return;
      } else {
        const target = getComponent(map, p.evolvesTo);
        if (target === comp) fail("a component cannot evolve to itself");
        evolution = target.position.evolution.scalar;
        visibility = target.position.visibility.scalar;
      }
      const [prev, ...rest] = comp.evolvesTo ?? [];
      comp.evolvesTo = [{
        position: { evolution: { scalar: evolution }, visibility: { scalar: visibility } },
        evolveType: prev?.evolveType ?? "natural",
        ...(prev?.inertia !== undefined ? { inertia: prev.inertia } : {}),
      }, ...rest];
      return;
    }

    case "resize_pipeline": {
      // Components that were members before the resize are clamped into the new
      // box (membership preserved); non-members never move.
      const pipe = getPipeline(map, p.id);
      const members = pipelineMembers(map, pipe.id);
      const keys = ["evoStart", "evoEnd", "visStart", "visEnd"] as const;
      if (!keys.some((k) => p[k] !== undefined) && p.handleEvolution === undefined) {
        fail("resize_pipeline needs at least one bound or handleEvolution");
      }
      const geo = { ...pipe.pipelineGeometry };
      for (const k of keys) if (p[k] !== undefined) geo[k] = round3(unit(p[k], k));
      if (p.handleEvolution !== undefined) geo.handleEvolution = round3(unit(p.handleEvolution, "handleEvolution"));
      if (geo.evoStart > geo.evoEnd) [geo.evoStart, geo.evoEnd] = [geo.evoEnd, geo.evoStart];
      if (geo.visStart > geo.visEnd) [geo.visStart, geo.visEnd] = [geo.visEnd, geo.visStart];
      if (geo.handleEvolution != null) {
        geo.handleEvolution = Math.max(geo.evoStart, Math.min(geo.evoEnd, geo.handleEvolution));
      }
      // Recentre only the axes that were touched (a vis-less resize keeps position.visibility).
      if (p.evoStart !== undefined || p.evoEnd !== undefined) {
        pipe.position.evolution.scalar = round3((geo.evoStart + geo.evoEnd) / 2);
      }
      if (p.visStart !== undefined || p.visEnd !== undefined) {
        pipe.position.visibility.scalar = round3((geo.visStart + geo.visEnd) / 2);
      }
      pipe.pipelineGeometry = geo;
      for (const c of members) {
        const ev = c.position.evolution;
        const vi = c.position.visibility;
        ev.scalar = Math.max(geo.evoStart, Math.min(geo.evoEnd, ev.scalar));
        vi.scalar = Math.max(geo.visStart, Math.min(geo.visEnd, vi.scalar));
      }
      return;
    }

    case "move_pipeline": {
      const pipe = getPipeline(map, p.id);
      const geo = pipe.pipelineGeometry;
      // Clamp the delta so the pipeline box stays inside [0, 1].
      const dEvo = Math.max(-geo.evoStart, Math.min(1 - geo.evoEnd, num(p.dEvo, "dEvo")));
      const dVis = Math.max(-geo.visStart, Math.min(1 - geo.visEnd, num(p.dVis, "dVis")));
      const shift = (c: Component) => {
        c.position.evolution.scalar = round3(clamp01(c.position.evolution.scalar + dEvo));
        c.position.visibility.scalar = round3(clamp01(c.position.visibility.scalar + dVis));
        const r = c.position.evolution.range;
        if (r) c.position.evolution.range = [round3(clamp01(r[0] + dEvo)), round3(clamp01(r[1] + dEvo))];
      };
      const members = pipelineMembers(map, pipe.id);
      shift(pipe);
      members.forEach(shift);
      pipe.pipelineGeometry = {
        ...geo,
        evoStart: round3(geo.evoStart + dEvo),
        evoEnd: round3(geo.evoEnd + dEvo),
        visStart: round3(geo.visStart + dVis),
        visEnd: round3(geo.visEnd + dVis),
        ...(geo.handleEvolution != null ? { handleEvolution: round3(geo.handleEvolution + dEvo) } : {}),
      };
      return;
    }

    case "move_label": {
      const comp = getComponent(map, p.id);
      comp.label.position = { dx: num(p.dx, "dx"), dy: num(p.dy, "dy") };
      return;
    }

    case "set_field": {
      const path = str(p.path, "path");
      if (!("value" in p)) fail("set_field needs a value (null deletes)");
      const comp = COMPONENT_PATHS.has(path) ? map.components.find((c) => c.id === p.target) : undefined;
      if (comp) return setComponentField(map, comp, path, p.value);
      const rel = RELATION_PATHS.has(path) ? map.relations.find((r) => r.id === p.target) : undefined;
      if (rel) return setRelationField(map, rel, path, p.value);
      if (!COMPONENT_PATHS.has(path) && !RELATION_PATHS.has(path)) fail(`set_field path "${path}" is not allowed`);
      fail(`unknown target id "${String(p.target)}" for path "${path}"`);
    }

    default:
      fail(`unknown op "${String((diffOp as { op?: unknown }).op)}"`);
  }
}

// ── Public API ───────────────────────────────────────────────────────

function cloneMap(map: WardleyMap): WardleyMap {
  return structuredClone(map);
}

/**
 * Apply one diff op. Pure: returns a new map, never mutates `map`.
 * @throws Error for unknown ops, unknown ids, or invalid payloads.
 */
export function applyDiffOp(map: WardleyMap, diffOp: DiffOp): WardleyMap {
  const next = cloneMap(map);
  mutate(next, diffOp);
  return next;
}

/** Apply ops in order. Pure; throws on the first failing op (input untouched). */
export function applyDiffOps(map: WardleyMap, ops: readonly DiffOp[]): WardleyMap {
  const next = cloneMap(map);
  for (const op of ops) mutate(next, op);
  return next;
}

// ── Cascade expansion (pure reads) ───────────────────────────────────

/**
 * Explicit ops implied by deleting a component (for diff exhaustiveness):
 * `delete_edge` per relation touching it, then `set_evolves_to null` for every
 * component whose evolvesTo targets the deleted component's position.
 */
export function expandDeleteCascade(map: WardleyMap, componentId: string): DiffOp[] {
  const ops: DiffOp[] = [];
  for (const r of map.relations) {
    if (r.consumer === componentId || r.supplier === componentId) {
      ops.push({ op: "delete_edge", payload: { id: r.id } });
    }
  }
  const deleted = map.components.find((c) => c.id === componentId);
  if (!deleted) return ops;
  const e = deleted.position.evolution.scalar;
  const v = deleted.position.visibility.scalar;
  for (const c of map.components) {
    if (c.id === componentId || !c.evolvesTo) continue;
    const targets: unknown = c.evolvesTo;
    const hit = typeof targets === "string"
      ? targets === componentId // legacy interactive model stored an id
      : Array.isArray(targets) && targets.some((t) => isObj(t) && isObj(t.position) && samePos(t.position as PosLike, e, v));
    if (hit) ops.push({ op: "set_evolves_to", payload: { id: c.id, evolvesTo: null } });
  }
  return ops;
}

/**
 * Explicit ops implied by turning a pipeline into a non-pipeline: a no-op
 * `move_component` for each contained component (they keep their positions).
 */
export function expandChangeTypeCascade(map: WardleyMap, componentId: string): DiffOp[] {
  return pipelineMembers(map, componentId).map((c) => ({
    op: "move_component" as const,
    payload: {
      id: c.id,
      evolution: c.position.evolution.scalar,
      visibility: c.position.visibility.scalar,
    },
  }));
}
