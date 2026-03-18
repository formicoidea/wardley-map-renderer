/**
 * Dedicated tests for Sub-AC 8b:
 *   - RenderableType mapping: decoupling from ComponentType enum (4+ tests)
 *   - Phase vocabulary flexibility: open-length phases independent of evolveStyles (2+ tests)
 *
 * These tests complement renderable-type.test.ts by verifying the schema-layer
 * enforcement of vocabulary isolation and phase label open-endedness.
 */

import { describe, it, expect } from "vitest";
import {
  NodeRadiiSchema,
  EvolveStylesMapSchema,
  EvolutionPhasesSchema,
  typeStyleMapSchema,
  makeTypeStyleMapSchema,
  EvolveTypeEnum,
} from "./schema.js";
import {
  KNOWN_RENDERABLE_TYPES,
  mapComponentType,
  DEFAULT_RENDERABLE_TYPE_SENTINEL,
} from "./renderable-type.js";
import { z } from "zod";

// ══════════════════════════════════════════════════════════════════════════════
// 1. RenderableType Mapping — schema-level vocabulary isolation
// ══════════════════════════════════════════════════════════════════════════════

describe("RenderableType mapping — schema-level decoupling from ComponentType", () => {
  /**
   * Test 1: NodeRadiiSchema accepts all KNOWN_RENDERABLE_TYPES keys.
   *
   * The render-layer type vocabulary (KNOWN_RENDERABLE_TYPES) must map exactly to
   * the valid keys NodeRadiiSchema accepts.  No data-layer enum import is needed.
   */
  it("NodeRadiiSchema accepts all KNOWN_RENDERABLE_TYPES as optional per-type keys", () => {
    // Build a shape with _default + every known type.
    const fullRadii: Record<string, unknown> = { _default: 5 };
    for (const t of KNOWN_RENDERABLE_TYPES) {
      fullRadii[t] = 7;
    }
    const result = NodeRadiiSchema.safeParse(fullRadii);
    expect(result.success).toBe(true);
  });

  /**
   * Test 2: NodeRadiiSchema rejects keys that are NOT in KNOWN_RENDERABLE_TYPES.
   *
   * A hypothetical data-schema type name that was never added to the render
   * vocabulary must be rejected at parse time — ensuring the two vocabularies
   * evolve independently and unknown keys are caught early.
   */
  it("NodeRadiiSchema rejects a data-layer type string not in KNOWN_RENDERABLE_TYPES", () => {
    // "genesis" is a Wardley Map zone label, not a component type in either vocab.
    const result = NodeRadiiSchema.safeParse({ _default: 5, genesis: 3 });
    expect(result.success).toBe(false);

    // "capacity" exists in MapKeep but was never added to KNOWN_RENDERABLE_TYPES.
    const result2 = NodeRadiiSchema.safeParse({ _default: 5, capacity: 3 });
    expect(result2.success).toBe(false);
  });

  /**
   * Test 3: EvolveStylesMapSchema rejects KNOWN_RENDERABLE_TYPES keys.
   *
   * The evolve-style vocabulary (natural/ecosystem/forced/late) is independent of
   * the renderable-type vocabulary (component/user-need/pipeline/note/anchor).
   * Keys from one set must not be valid in the other.
   */
  it("EvolveStylesMapSchema rejects RenderableType keys — the two vocabularies are orthogonal", () => {
    // "component" is a valid RenderableType but NOT a valid EvolveType key.
    const resultComponent = EvolveStylesMapSchema.safeParse({
      component: { stroke: "#ff0000" },
    });
    expect(resultComponent.success).toBe(false);

    // "anchor" is a valid RenderableType but NOT a valid EvolveType key.
    const resultAnchor = EvolveStylesMapSchema.safeParse({
      anchor: { stroke: "#0000ff" },
    });
    expect(resultAnchor.success).toBe(false);

    // "user-need" is a valid RenderableType but NOT a valid EvolveType key.
    const resultUserNeed = EvolveStylesMapSchema.safeParse({
      "user-need": { stroke: "#00ff00" },
    });
    expect(resultUserNeed.success).toBe(false);
  });

  /**
   * Test 4: typeStyleMapSchema is a generic factory — valid keys are entirely
   * determined by the caller-supplied enumOptions array, not hard-coded types.
   *
   * This confirms the render-layer vocabulary is locally declared and can be
   * instantiated with any closed enum without importing a data-schema type.
   */
  it("typeStyleMapSchema factory accepts custom enumOptions independent of KNOWN_RENDERABLE_TYPES", () => {
    // Invent a rendering-local shape vocabulary (e.g., map background regions).
    const regionTypes = ["header", "footer", "sidebar"] as const;
    const RegionStyleSchema = typeStyleMapSchema(
      z.string(),
      regionTypes,
      { requireDefault: true }
    );

    // Valid: _default + known region keys.
    const valid = RegionStyleSchema.safeParse({
      _default: "#ffffff",
      header: "#f0f0f0",
      footer: "#e0e0e0",
    });
    expect(valid.success).toBe(true);

    // Invalid: unknown key not in regionTypes.
    const invalid = RegionStyleSchema.safeParse({
      _default: "#ffffff",
      unknownRegion: "#cccccc",
    });
    expect(invalid.success).toBe(false);
  });

  /**
   * Test 5: mapComponentType is the single boundary translation point.
   *
   * Any string that is NOT in the render vocabulary produces the
   * DEFAULT_RENDERABLE_TYPE_SENTINEL ("_default"), meaning the TypeStyleMap
   * gracefully falls back without propagating data-layer knowledge into
   * style-resolution logic.
   */
  it("mapComponentType maps every KNOWN_RENDERABLE_TYPES member 1:1 and all others to sentinel", () => {
    // Known types pass through unchanged.
    for (const t of KNOWN_RENDERABLE_TYPES) {
      expect(mapComponentType(t)).toBe(t);
    }

    // Data-layer types hypothetically added in the future are unknown to render layer.
    const unknownDataTypes = ["capacity", "goal", "assumption", "constraint"];
    for (const t of unknownDataTypes) {
      expect(mapComponentType(t)).toBe(DEFAULT_RENDERABLE_TYPE_SENTINEL);
    }
  });

  /**
   * Test 6: EvolveStylesMapSchema accepts the full EvolveTypeEnum key set.
   *
   * EvolveTypeEnum (natural/ecosystem/forced/late) is the closed render-local
   * vocabulary for arrow styles — distinct from KNOWN_RENDERABLE_TYPES.
   * This confirms the two vocabularies co-exist independently in the schema.
   */
  it("EvolveStylesMapSchema accepts all EvolveTypeEnum keys with optional _default", () => {
    const validMap: Record<string, unknown> = {};
    for (const k of EvolveTypeEnum.options) {
      validMap[k] = { stroke: "#333333" };
    }

    // All EvolveType keys, no _default (non-breaking: _default is optional here).
    expect(EvolveStylesMapSchema.safeParse(validMap).success).toBe(true);

    // All EvolveType keys + _default.
    const withDefault = { ...validMap, _default: { stroke: "#888888" } };
    expect(EvolveStylesMapSchema.safeParse(withDefault).success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Phase vocabulary flexibility — open-length phases decoupled from evolveStyles
// ══════════════════════════════════════════════════════════════════════════════

describe("Phase vocabulary flexibility — open-length phases array", () => {
  /**
   * Test 1: phases accepts a 3-element array (non-standard phase count).
   *
   * A map might render 3 evolution zones (e.g. Genesis / Developing / Mature)
   * without any constraint from the 4-entry EvolveTypeEnum.
   */
  it("EvolutionPhasesSchema.phases accepts a 3-element custom phase array", () => {
    const result = EvolutionPhasesSchema.safeParse({
      phases: ["Genesis", "Developing", "Mature"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toHaveLength(3);
      expect(result.data.phases).toEqual(["Genesis", "Developing", "Mature"]);
    }
  });

  /**
   * Test 2: phases accepts a 5-element array (more than the standard 4).
   *
   * Future maps may subdivide evolution into more granular phases.
   * The schema must not hard-code a maximum of 4.
   */
  it("EvolutionPhasesSchema.phases accepts a 5-element array (super-standard phase count)", () => {
    const fivePhases = [
      "Genesis",
      "Custom",
      "Emerging Product",
      "Mature Product",
      "Commodity",
    ];
    const result = EvolutionPhasesSchema.safeParse({ phases: fivePhases });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toHaveLength(5);
    }
  });

  /**
   * Test 3: phases array size is independent of evolveStyles key count.
   *
   * Having 3 or 5 phase labels does NOT require any change to evolveStyles.
   * The two are intentionally decoupled: phase display vocabulary ≠ arrow-style
   * vocabulary.
   */
  it("3 phases + evolveStyles with 2 named keys is a fully valid combination", () => {
    const phaseResult = EvolutionPhasesSchema.safeParse({
      phases: ["Early", "Growing", "Mature"],
    });
    expect(phaseResult.success).toBe(true);

    // evolveStyles still uses the closed natural/ecosystem/forced/late vocab.
    const styleResult = EvolveStylesMapSchema.safeParse({
      natural: { stroke: "#dc2626" },
      ecosystem: { stroke: "#2563eb" },
    });
    expect(styleResult.success).toBe(true);

    // The two schemas parse independently — no cross-validation is imposed.
  });

  /**
   * Test 4: phases array rejects an empty array (min(1) constraint).
   *
   * Providing `phases: []` would produce a phase-label row with no labels at all,
   * which is meaningless.  The schema enforces at least one entry.
   */
  it("EvolutionPhasesSchema.phases rejects an empty array", () => {
    const result = EvolutionPhasesSchema.safeParse({ phases: [] });
    expect(result.success).toBe(false);
  });

  /**
   * Test 5: phases array is absent by default (optional) — existing behavior preserved.
   *
   * Omitting `phases` is valid; the renderer falls back to locale-resolved labels
   * (Genesis / Custom-Built / Product / Commodity in English).
   */
  it("EvolutionPhasesSchema.phases is optional — omitting it leaves locale defaults in effect", () => {
    const result = EvolutionPhasesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toBeUndefined();
      // Default showPhaseDividerAndLabel is true.
      expect(result.data.showPhaseDividerAndLabel).toBe(true);
    }
  });
});
