/**
 * Shared test helpers for @wardleyapi/render tests.
 *
 * Provides `makeComponent()` factory that produces the nested Component
 * format with sensible defaults, reducing fixture verbosity across 12+ test files.
 *
 * @module test-helpers
 */

import type { Component, WardleyMap } from "./schema.js";

/** Overrides accepted by makeComponent — all optional except id */
export interface ComponentOverrides {
  id: string;
  name?: string;
  type?: Component["type"];
  evolution?: number;
  visibility?: number;
  evolutionRange?: [number, number];
  labelPosition?: { dx: number; dy: number };
  description?: string;
  nature?: Component["nature"];
  color?: string;
  evolvesTo?: Array<{
    evolution: number;
    visibility: number;
    evolveType?: "natural" | "ecosystem" | "forced" | "late";
  }>;
  pipelineGeometry?: Component["pipelineGeometry"];
}

/**
 * Create a Component in nested format with sensible defaults.
 *
 * Defaults: type="component", evolution=0.5, visibility=0.5, name=id
 */
export function makeComponent(overrides: ComponentOverrides): Component {
  const {
    id,
    name,
    type = "component",
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

  const comp: any = {
    id,
    label: { name: name ?? id, position: labelPosition },
    type,
    position: {
      evolution: {
        scalar: evolution,
        ...(evolutionRange ? { range: evolutionRange } : {}),
      },
      visibility: { scalar: visibility },
    },
  };

  if (!labelPosition) delete comp.label.position;
  if (nature) comp.nature = nature;
  if (color) comp.color = color;
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
