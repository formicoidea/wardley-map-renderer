/**
 * Properties panel for the interactive editor.
 *
 * `propsFields()` is pure (descriptor list, unit-tested in node); `buildProps()`
 * turns it into a native `<form>`. Every control commits on `change` and maps
 * to exactly ONE DiffOp; the caller re-builds the panel after each dispatch
 * (options depend on the edited map). Browser code: no runtime imports.
 *
 * @module interactive/props
 */

import type { DiffOp } from "../diff-ops-apply.js";
import type { Component, Relation, WardleyMap } from "../schema.js";

/** `key`: the field that committed (`<key>.clear` for its Clear button). */
export type Dispatch = (op: DiffOp, key: string) => void;

// ── Zod-free enum mirrors (props.test.ts asserts they equal src/schema.ts) ──
export const COMPONENT_TYPES = ["anchor", "component", "pipeline"] as const;
export const SUBTYPES = ["userNeed", "market", "ecosystem", "solution", "functional", "supplier"] as const;
export const NATURES = ["personae", "generic", "group", "natural", "anthropic", "practice", "data", "activity", "knowledge"] as const;
export const EVOLVE_TYPES = ["natural", "ecosystem", "forced", "late"] as const;
export const RELATION_TYPES = ["DependsOn", "Flow", "Constraint"] as const;
export const FLOW_STYLES = ["solid", "dashed", "bold"] as const;
/** Per-type validity (mirrors ComponentSchema.superRefine). */
export const SUBTYPES_BY_TYPE: Record<string, readonly string[]> = {
  anchor: [],
  component: SUBTYPES,
  pipeline: ["functional", "userNeed", "solution"],
};
export const NATURES_BY_KEY: Record<string, readonly string[]> = {
  anchor: ["personae", "generic", "group"],
  "component/userNeed": ["natural", "anthropic"],
  "component/functional": ["practice", "data", "activity", "knowledge"],
};
/** Suggestions only (free strings in the schema; keys of the default renderConfig.methods). */
const METHOD_CATEGORIES = ["buying-policy", "project-management", "attitudes"];
const RECOMMENDATIONS = ["Uncharted", "Transitional", "Industrialized"];

export type FieldValue = string | boolean | null;
export interface FieldDesc {
  key: string;
  label: string;
  kind: "text" | "textarea" | "select" | "number" | "color" | "checkbox" | "button";
  value: string | boolean;
  /** [value, label] pairs for selects. */
  options?: [string, string][];
  /** Datalist suggestions for text inputs. */
  list?: string[];
  min?: number;
  max?: number;
  step?: number;
  /** Render a Clear button (text: the string, else "Clear") that calls `toOp(null)`. */
  clear?: boolean | string;
  /** Error reported when a non-empty value maps to no op. */
  invalid?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Fields sharing a `row` are laid out side by side. */
  row?: string;
  /** The op for a committed value, or null when the value is invalid / a no-op. */
  toOp(v: FieldValue): DiffOp | null;
}

const opts = (xs: readonly string[], none?: string): [string, string][] =>
  (none === undefined ? [] : [["", none] as [string, string]]).concat(xs.map((x) => [x, x]));
const set = (target: string, path: string, value: unknown) =>
  ({ op: "set_field", payload: { target, path, value } }) as DiffOp;
const numOrNull = (v: FieldValue) => (v === null || v === "" ? null : Number(v));
const samePos = (c: Component, p: { evolution: { scalar: number }; visibility: { scalar: number } }) =>
  Math.abs(c.position.evolution.scalar - p.evolution.scalar) < 0.001 &&
  Math.abs(c.position.visibility.scalar - p.visibility.scalar) < 0.001;

function componentFields(map: WardleyMap, c: Component): FieldDesc[] {
  const id = c.id;
  const f: FieldDesc[] = [];
  const add = (d: Omit<FieldDesc, "kind"> & { kind?: FieldDesc["kind"] }) => f.push({ kind: "text", ...d } as FieldDesc);

  add({ key: "name", label: "Name", kind: "textarea", value: c.label.name, toOp: (v) => (v ? { op: "rename_component", payload: { id, name: v as string } } : null) });
  add({ key: "type", label: "Type", kind: "select", value: c.type, options: opts(COMPONENT_TYPES), toOp: (v) => (v ? set(id, "type", v) : null) });
  const subtypes = SUBTYPES_BY_TYPE[c.type];
  if (subtypes.length) {
    add({ key: "subtype", label: "Subtype", kind: "select", value: c.subtype ?? "", options: opts(subtypes, "(none)"), toOp: (v) => set(id, "subtype", v || null) });
  }
  const natures = NATURES_BY_KEY[c.type === "component" ? `component/${c.subtype}` : c.type];
  if (natures) {
    add({ key: "nature", label: "Nature", kind: "select", value: c.nature ?? "", options: opts(natures, "(none)"), toOp: (v) => set(id, "nature", v || null) });
  }
  add({ key: "description", label: "Description", kind: "textarea", value: c.description ?? "", toOp: (v) => set(id, "description", v || null) });
  add({ key: "color", label: "Color", kind: "color", value: c.color ?? "", clear: !!c.color, toOp: (v) => set(id, "color", v || null) });

  const m = c.method;
  add({
    key: "method", label: "Method", value: m?.category ?? "", list: METHOD_CATEGORIES, row: "method",
    toOp: (v) => set(id, "method", v ? { category: v, recommendation: m?.recommendation || RECOMMENDATIONS[0] } : null),
  });
  add({
    key: "recommendation", label: "Recommendation", value: m?.recommendation ?? "", list: RECOMMENDATIONS, row: "method", disabled: !m,
    toOp: (v) => (m && v ? set(id, "method", { category: m.category, recommendation: v }) : null),
  });

  for (const k of ["inertia", "accelerator", "deaccelerator"] as const) {
    add({ key: k, label: k[0].toUpperCase() + k.slice(1), kind: "checkbox", value: !!c[k], toOp: (v) => set(id, k, v === true) });
  }

  const s = c.step;
  add({
    key: "step", label: "Step", kind: "number", value: s ? String(s.number) : "", min: 1, step: 1, row: "step", invalid: "Step must be a whole number of 1 or more",
    toOp: (v) => {
      const n = numOrNull(v);
      if (n === null) return set(id, "step", null);
      return Number.isInteger(n) && n >= 1 ? set(id, "step", s?.color ? { number: n, color: s.color } : { number: n }) : null;
    },
  });
  add({
    key: "stepColor", label: "Step color", kind: "color", value: s?.color ?? "", row: "step", disabled: !s, clear: !!s?.color,
    toOp: (v) => (s ? set(id, "step", v ? { number: s.number, color: v } : { number: s.number }) : null),
  });

  const evo = c.evolvesTo ?? [];
  const first = evo[0];
  const others = map.components.filter((o) => o.id !== id);
  const hit = first && others.find((o) => samePos(o, first.position));
  const evOpts = opts([], "(none)").concat(others.map((o) => [o.id, o.label.name || o.id] as [string, string]));
  if (first && !hit) evOpts.push(["?", "(custom position)"]);
  add({
    key: "evolvesTo", label: "Evolves to", kind: "select", value: first ? hit?.id ?? "?" : "", options: evOpts, row: "evo",
    toOp: (v) => (v === "?" ? null : { op: "set_evolves_to", payload: { id, evolvesTo: (v as string) || null } }),
  });
  if (first) {
    const edit = (patch: object) => set(id, "evolvesTo", [{ ...first, ...patch }, ...evo.slice(1)]);
    add({ key: "evolveType", label: "Evolve type", kind: "select", value: first.evolveType, options: opts(EVOLVE_TYPES), row: "evo", toOp: (v) => (v ? edit({ evolveType: v }) : null) });
    add({ key: "evolveInertia", label: "Inertia on evolution", kind: "checkbox", value: !!first.inertia, toOp: (v) => edit({ inertia: v === true }) });
  }

  const r = c.position.evolution.range;
  const e = c.position.evolution.scalar;
  const range = (i: 0 | 1) => (v: FieldValue) => {
    const n = numOrNull(v);
    if (n === null) return r ? set(id, "position.evolution.range", null) : null;
    const next: [number, number] = r ? [r[0], r[1]] : [e, e];
    next[i] = n;
    return next[0] >= 0 && next[1] <= 1 && next[0] <= next[1] ? set(id, "position.evolution.range", next) : null;
  };
  const numRange = { kind: "number", min: 0, max: 1, step: 0.01, row: "range", invalid: "Evolution range needs 0 ≤ from ≤ to ≤ 1" } as const;
  add({ key: "rangeMin", label: "Evolution from", value: r ? String(r[0]) : "", ...numRange, toOp: range(0) });
  add({ key: "rangeMax", label: "Evolution to", value: r ? String(r[1]) : "", ...numRange, clear: !!r && "Clear range", toOp: range(1) });

  add({
    key: "delete", label: c.type === "pipeline" ? "Delete pipeline" : "Delete component", kind: "button", value: "", danger: true,
    toOp: () => ({ op: c.type === "pipeline" ? "delete_pipeline" : "delete_component", payload: { id } }),
  });
  return f;
}

function relationFields(map: WardleyMap, r: Relation): FieldDesc[] {
  const id = r.id;
  const flow = r.flow;
  const reversed = map.relations.some((o) => o.consumer === r.supplier && o.supplier === r.consumer);
  const setFlow = (fl: object | null): DiffOp => ({ op: "set_flow", payload: { id, flow: fl as never } });
  const f: FieldDesc[] = [
    { key: "type", label: "Type", kind: "select", value: r.type, options: opts(RELATION_TYPES), toOp: (v) => (v ? set(id, "type", v) : null) },
    { key: "flowLabel", label: "Flow label", kind: "text", value: flow?.label ?? "", row: "flow", toOp: (v) => setFlow(v ? { label: v, style: flow?.style ?? "solid" } : null) },
  ];
  if (flow) {
    f.push({ key: "flowStyle", label: "Flow style", kind: "select", value: flow.style, options: opts(FLOW_STYLES), row: "flow", toOp: (v) => (v ? setFlow({ label: flow.label, style: v }) : null) });
  }
  f.push(
    { key: "reverse", label: "Reverse", kind: "button", value: "", disabled: reversed, toOp: () => ({ op: "reverse_edge", payload: { id } }) },
    { key: "delete", label: "Delete link", kind: "button", value: "", danger: true, toOp: () => ({ op: "delete_edge", payload: { id } }) },
  );
  return f;
}

/** Pure descriptor list for a component or relation id; null for unknown ids. */
export function propsFields(map: WardleyMap, targetId: string): { title: string; fields: FieldDesc[] } | null {
  const c = map.components.find((x) => x.id === targetId);
  if (c) return { title: c.label.name || c.id, fields: componentFields(map, c) };
  const r = map.relations.find((x) => x.id === targetId);
  if (!r) return null;
  const name = (cid: string) => map.components.find((x) => x.id === cid)?.label.name ?? cid;
  return { title: `${name(r.consumer)} → ${name(r.supplier)}`, fields: relationFields(map, r) };
}

// ── DOM ──────────────────────────────────────────────────────────────

export const PROPS_CSS =
  ".pf{display:flex;flex-direction:column;gap:10px}" +
  ".pf .r{display:flex;gap:8px;align-items:end}" +
  ".pf label{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}" +
  ".pf label.ck{flex-direction:row;align-items:center;gap:8px;font-size:14px;color:var(--fg)}" +
  ".pf input,.pf select,.pf textarea{font:inherit;color:var(--fg);background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:6px 8px;min-width:0;width:100%}" +
  ".pf textarea{resize:vertical;min-height:56px}" +
  ".pf input[type=checkbox]{width:auto;accent-color:var(--accent)}" +
  ".pf input[type=color]{height:34px;padding:2px}" +
  ".pf [data-unset]{opacity:.35}" +
  ".pf button{font:inherit;height:34px;padding:0 12px;border:1px solid var(--border);border-radius:6px;background:none;color:var(--fg);cursor:pointer}" +
  ".pf button:hover{background:var(--hover)}" +
  ".pf button:disabled{opacity:.4;cursor:default}" +
  ".pf .d{color:var(--danger)}";

/**
 * Build the panel form for `targetId`; null for unknown ids. Every control has
 * `data-focus` (field key) so the caller can restore focus after a rebuild.
 */
export function buildProps(
  doc: Document,
  map: WardleyMap,
  targetId: string,
  dispatch: Dispatch,
  onError: (msg: string) => void = () => {},
): { title: string; body: HTMLElement } | null {
  const spec = propsFields(map, targetId);
  if (!spec) return null;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}) =>
    Object.assign(doc.createElement(tag), props);
  const fire = (f: FieldDesc, v: FieldValue, key = f.key) => {
    const op = f.toOp(v);
    if (op) dispatch(op, key);
    else if (v && f.invalid) onError(f.invalid);
    return !!op;
  };
  const button = (key: string, text: string, onclick: () => void, extra: Record<string, unknown> = {}) => {
    const b = el("button", { type: "button", textContent: text, onclick, ...extra });
    b.dataset.focus = key;
    return b;
  };

  const form = el("form", { className: "pf", onsubmit: (e: Event) => e.preventDefault() });
  const actions = el("div", { className: "r" });
  let row: HTMLElement | null = null;

  for (const f of spec.fields) {
    if (f.kind === "button") {
      actions.append(button(f.key, f.label, () => fire(f, null), { disabled: !!f.disabled, className: f.danger ? "d" : "" }));
      continue;
    }
    const input = (f.kind === "textarea" || f.kind === "select" ? el(f.kind) : el("input", { type: f.kind })) as
      HTMLInputElement;
    input.name = input.dataset.focus = f.key;
    input.disabled = !!f.disabled;
    const unset = f.kind === "color" && !/^#[0-9a-f]{6}$/i.test(f.value as string);
    for (const [value, text] of f.options ?? []) input.append(el("option", { value, textContent: text }));
    if (f.kind === "checkbox") input.checked = f.value === true;
    else if (unset) input.dataset.unset = "";
    else input.value = f.value as string;
    if (f.kind === "textarea") input.setAttribute("rows", "2");
    if (f.kind === "number") Object.assign(input, { min: f.min ?? "", max: f.max ?? "", step: f.step ?? "any" });
    if (f.list) {
      const dl = el("datalist", { id: `pf-${f.key}-list` });
      for (const value of f.list) dl.append(el("option", { value }));
      input.setAttribute("list", dl.id);
      form.append(dl);
    }
    // Last committed value: an Enter commit is followed by the browser's own
    // `change` on blur, which must not dispatch the same op twice.
    let committed = f.value;
    input.onchange = () => {
      const v = f.kind === "checkbox" ? input.checked : input.value.trim();
      if (v === committed) return;
      if (fire(f, v)) committed = v;
      else {
        // Invalid or no-op: restore the committed value.
        if (f.kind === "checkbox") input.checked = committed === true;
        else if (f.kind !== "color") input.value = committed as string;
      }
    };
    // Enter commits text fields (Shift+Enter: new line in text areas).
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && /text|number/.test(f.kind)) {
        e.preventDefault();
        input.onchange!(e);
      }
    };

    const label = el("label", { className: f.kind === "checkbox" ? "ck" : "" });
    // Colors: a picker cannot be empty, so show the unset / non-hex value in the label.
    label.append(unset ? `${f.label} (${f.value || "unset"})` : f.label);
    if (f.kind === "checkbox") label.prepend(input);
    else label.append(input);

    const wrap = el("div", { className: "r" });
    wrap.append(label);
    if (f.clear) {
      wrap.append(button(`${f.key}.clear`, typeof f.clear === "string" ? f.clear : "Clear", () => fire(f, null, `${f.key}.clear`),
        typeof f.clear === "string" ? {} : { ariaLabel: `Clear ${f.label.toLowerCase()}` }));
    }
    if (!f.row || f.row !== row?.dataset.row) {
      row = f.row ? el("div", { className: "r" }) : null;
      if (row) row.dataset.row = f.row;
      form.append(row ?? wrap);
    }
    if (row) row.append(...wrap.childNodes);
  }
  form.append(actions);
  return { title: spec.title, body: form };
}
