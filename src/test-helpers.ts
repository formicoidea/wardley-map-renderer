/**
 * Shared test helpers for @wardleyapi/render tests.
 *
 * Provides `makeComponent()` factory that produces the nested Component
 * format with sensible defaults, reducing fixture verbosity across 12+ test files.
 *
 * @module test-helpers
 */

import type { Component, WardleyMap } from "./schema.js";

/** Overrides accepted by makeComponent — all optional except id.
 *  `type` accepts BOTH the new taxonomy (anchor|component|pipeline) and the
 *  legacy flat vocabulary (market|ecosystem|user-need|note|capacity) which is
 *  auto-translated to the new {type, subtype} model. */
export interface ComponentOverrides {
  id: string;
  name?: string;
  type?: string;
  subtype?: string;
  evolution?: number;
  visibility?: number;
  evolutionRange?: [number, number];
  labelPosition?: { dx: number; dy: number };
  description?: string;
  nature?: string;
  color?: string;
  evolvesTo?: Array<{
    evolution: number;
    visibility: number;
    evolveType?: "natural" | "ecosystem" | "forced" | "late";
  }>;
  pipelineGeometry?: Component["pipelineGeometry"];
  // Gameplay decorators (component-level annotations)
  method?: { category: string; recommendation: string };
  inertia?: boolean;
  accelerator?: boolean;
  deaccelerator?: boolean;
  step?: { number: number; color?: string };
}

// Legacy/new type string → {type, subtype} in the new taxonomy.
const NODE_TYPE_MAP: Record<string, { type: string; subtype?: string }> = {
  component: { type: "component" },
  capacity: { type: "component" },
  anchor: { type: "anchor" },
  pipeline: { type: "pipeline" },
  "user-need": { type: "component", subtype: "userNeed" },
  userNeed: { type: "component", subtype: "userNeed" },
  market: { type: "component", subtype: "market" },
  ecosystem: { type: "component", subtype: "ecosystem" },
  solution: { type: "component", subtype: "solution" },
  functional: { type: "component", subtype: "functional" },
  supplier: { type: "component", subtype: "supplier" },
  note: { type: "component" },
};

const FUNCTIONAL_NATURES = ["practice", "data", "activity", "knowledge"];
const USERNEED_NATURES = ["natural", "anthropic"];
const ANCHOR_NATURES = ["personae", "generic", "group"];

/**
 * Create a Component in nested format with sensible defaults.
 *
 * Defaults: type="component", evolution=0.5, visibility=0.5, name=id.
 * Legacy type strings (market/ecosystem/user-need/note) are translated to the
 * new {type, subtype} taxonomy; natures are attached only when valid for the
 * resulting type/subtype (otherwise dropped — nature has no visual effect).
 */
export function makeComponent(overrides: ComponentOverrides): Component {
  const {
    id,
    name,
    type = "component",
    subtype,
    evolution = 0.5,
    visibility = 0.5,
    evolutionRange,
    labelPosition,
    description,
    nature,
    color,
    evolvesTo,
    pipelineGeometry,
  } = overrides;

  const mapped = NODE_TYPE_MAP[type] ?? { type: "component" as const };
  let subtypeFinal = subtype ?? mapped.subtype;

  // Normalize nature against the resulting type/subtype (no visual effect).
  let natureFinal: string | undefined = nature;
  if (natureFinal) {
    if (FUNCTIONAL_NATURES.includes(natureFinal)) {
      if (!subtypeFinal) subtypeFinal = "functional";
      if (subtypeFinal !== "functional") natureFinal = undefined;
    } else if (USERNEED_NATURES.includes(natureFinal)) {
      if (!subtypeFinal) subtypeFinal = "userNeed";
      if (subtypeFinal !== "userNeed") natureFinal = undefined;
    } else if (ANCHOR_NATURES.includes(natureFinal)) {
      if (mapped.type !== "anchor") natureFinal = undefined;
    } else {
      natureFinal = undefined;
    }
  }

  const comp: any = {
    id,
    label: { name: name ?? id, position: labelPosition },
    type: mapped.type,
    position: {
      evolution: {
        scalar: evolution,
        ...(evolutionRange ? { range: evolutionRange } : {}),
      },
      visibility: { scalar: visibility },
    },
  };

  if (subtypeFinal) comp.subtype = subtypeFinal;
  if (!labelPosition) delete comp.label.position;
  if (natureFinal) comp.nature = natureFinal;
  if (color) comp.color = color;
  // Gameplay decorators
  if (overrides.method) comp.method = overrides.method;
  if (overrides.inertia) comp.inertia = overrides.inertia;
  if (overrides.accelerator) comp.accelerator = overrides.accelerator;
  if (overrides.deaccelerator) comp.deaccelerator = overrides.deaccelerator;
  if (overrides.step) comp.step = overrides.step;
  if (description) comp.description = description;
  if (pipelineGeometry) comp.pipelineGeometry = pipelineGeometry;

  if (evolvesTo && evolvesTo.length > 0) {
    comp.evolvesTo = evolvesTo.map((e) => ({
      position: {
        evolution: { scalar: e.evolution },
        visibility: { scalar: e.visibility },
      },
      evolveType: e.evolveType ?? "natural",
    }));
  }

  return comp as Component;
}

/**
 * Create a minimal valid WardleyMap for testing.
 */
export function makeMap(overrides: Partial<WardleyMap> = {}): WardleyMap {
  return {
    title: "Test",
    components: [],
    relations: [],
    ...overrides,
  };
}
