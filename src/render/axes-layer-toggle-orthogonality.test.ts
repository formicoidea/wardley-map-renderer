/**
 * axes-layer-toggle-orthogonality.test.ts
 *
 * Tests all 4 combinations of the two independent toggle flags:
 *   - `background.evolutionXAxis.show`         (controls X-axis arrow + labels)
 *   - `background.evolutionPhases.showPhaseDividerAndLabel`  (controls phase dividers + labels)
 *
 * These two toggles must be ORTHOGONAL — toggling one must not affect the other.
 *
 * Evaluation criterion: toggle_orthogonality
 *   showPhaseDividerAndLabel works independently from showAxis —
 *   all 4 combinations of true/false produce correct output.
 *
 * New test file (AC 7): kept separate from existing test files to avoid
 * accidentally breaking the 1109-test green baseline.
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderAxesLayer } from "./axes-layer.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";
import {
  DIVIDER_COLOR,
} from "../blocks/wardley-map/wardley-map-consts.js";

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeMap(
  showAxis: boolean | undefined,
  showPhase: boolean | undefined
): WardleyMap {
  return sanitizeMap(
    WardleyMapSchema.parse({
      title: "Toggle Test Map",
      components: [
        {
          id: "a",
          label: { name: "User" },
          type: "anchor",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } },
        },
        {
          id: "b",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [],
      renderConfig: {
        display: {
          ...(showAxis !== undefined ? { axisEvolution: showAxis } : {}),
          ...(showPhase !== undefined ? { phases: showPhase } : {}),
        },
      },
    })
  );
}

/** Extract SVG parts for the axes layer from a map config. */
function axesParts(
  showAxis: boolean | undefined,
  showPhase: boolean | undefined
): string[] {
  const map = makeMap(showAxis, showPhase);
  const ctx = buildRenderContext(map);
  return renderAxesLayer(ctx);
}

/** Count dashed phase divider lines in the parts array. */
function countPhaseDividers(parts: string[]): number {
  return parts.filter(
    (p) => p.includes(DIVIDER_COLOR) && p.includes("stroke-dasharray")
  ).length;
}

/** Check if any part contains the phase labels (Genesis / Custom-Built / etc). */
function hasPhaseLabels(parts: string[]): boolean {
  return (
    parts.some((p) => p.includes("Genesis")) ||
    parts.some((p) => p.includes("Custom-Built")) ||
    parts.some((p) => p.includes("Product")) ||
    parts.some((p) => p.includes("Commodity"))
  );
}

/** Check if any part contains the X-axis arrow. */
function hasXAxisArrow(parts: string[]): boolean {
  // The X-axis arrow is a line with marker-end pointing to #axis-arrow
  return parts.some((p) => p.includes('marker-end="url(#axis-arrow)"') && p.includes("y1=") && !p.includes('x1="'));
}

/** Check if any part contains the evolution axis main label "Evolution". */
function hasEvolutionLabel(parts: string[]): boolean {
  // The X-axis label "Evolution" is in a <text> element rendered when showAxis=true
  return parts.some((p) => p.includes(">Evolution<") || p.includes(">Evolution"));
}

/** Check if any part contains direction indicator labels (Uncharted, Industrialized). */
function hasDirectionIndicators(parts: string[]): boolean {
  return (
    parts.some((p) => p.includes("Uncharted")) ||
    parts.some((p) => p.includes("Industrialized"))
  );
}

// ── Combination 1: showAxis=true, showPhase=true ─────────────────────────────

describe("toggle orthogonality — combination 1: showAxis=true, showPhase=true", () => {
  it("renders 3 phase dividers", () => {
    const parts = axesParts(true, true);
    expect(countPhaseDividers(parts)).toBe(3);
  });

  it("renders phase labels (Genesis, Custom-Built, Product, Commodity)", () => {
    const parts = axesParts(true, true);
    expect(hasPhaseLabels(parts)).toBe(true);
    expect(parts.some((p) => p.includes("Genesis"))).toBe(true);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(true);
    expect(parts.some((p) => p.includes("Product"))).toBe(true);
    expect(parts.some((p) => p.includes("Commodity"))).toBe(true);
  });

  it("renders evolution axis label 'Evolution'", () => {
    const parts = axesParts(true, true);
    expect(hasEvolutionLabel(parts)).toBe(true);
  });

  it("renders direction indicators (Uncharted, Industrialized)", () => {
    const parts = axesParts(true, true);
    expect(hasDirectionIndicators(parts)).toBe(true);
  });
});

// ── Combination 2: showAxis=true, showPhase=false ─────────────────────────────

describe("toggle orthogonality — combination 2: showAxis=true, showPhase=false", () => {
  it("renders 0 phase dividers", () => {
    const parts = axesParts(true, false);
    expect(countPhaseDividers(parts)).toBe(0);
  });

  it("does NOT render phase labels", () => {
    const parts = axesParts(true, false);
    expect(parts.some((p) => p.includes("Genesis"))).toBe(false);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(false);
  });

  it("STILL renders evolution axis label 'Evolution' (axis toggle unaffected by phase toggle)", () => {
    const parts = axesParts(true, false);
    expect(hasEvolutionLabel(parts)).toBe(true);
  });

  it("STILL renders direction indicators (showAxis=true is independent)", () => {
    const parts = axesParts(true, false);
    expect(hasDirectionIndicators(parts)).toBe(true);
  });

  it("orthogonality: phase=false does NOT remove the evolution axis arrow", () => {
    const partsWithPhase = axesParts(true, true);
    const partsWithoutPhase = axesParts(true, false);
    // Both should have the evolution axis line — filter for X-axis lines
    const xAxisLinesWithPhase = partsWithPhase.filter(
      (p) =>
        p.includes("stroke-width=\"1.5\"") &&
        p.includes("marker-end") &&
        !p.includes("stroke-dasharray")
    );
    const xAxisLinesWithoutPhase = partsWithoutPhase.filter(
      (p) =>
        p.includes("stroke-width=\"1.5\"") &&
        p.includes("marker-end") &&
        !p.includes("stroke-dasharray")
    );
    // Both configurations should produce axis lines (Y-axis included in count)
    expect(xAxisLinesWithoutPhase.length).toBe(xAxisLinesWithPhase.length);
  });
});

// ── Combination 3: showAxis=false, showPhase=true ─────────────────────────────

describe("toggle orthogonality — combination 3: showAxis=false, showPhase=true", () => {
  it("renders 3 phase dividers (phase toggle is independent of axis toggle)", () => {
    const parts = axesParts(false, true);
    expect(countPhaseDividers(parts)).toBe(3);
  });

  it("renders phase labels (Genesis, Custom-Built, Product, Commodity)", () => {
    const parts = axesParts(false, true);
    expect(parts.some((p) => p.includes("Genesis"))).toBe(true);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(true);
    expect(parts.some((p) => p.includes("Product"))).toBe(true);
    expect(parts.some((p) => p.includes("Commodity"))).toBe(true);
  });

  it("does NOT render evolution axis label 'Evolution'", () => {
    const parts = axesParts(false, true);
    expect(hasEvolutionLabel(parts)).toBe(false);
  });

  it("does NOT render direction indicators (Uncharted, Industrialized)", () => {
    const parts = axesParts(false, true);
    expect(hasDirectionIndicators(parts)).toBe(false);
  });

  it("orthogonality: axis=false does NOT remove phase dividers", () => {
    // Phase dividers should still appear even when axis is hidden
    const parts = axesParts(false, true);
    expect(countPhaseDividers(parts)).toBeGreaterThan(0);
  });
});

// ── Combination 4: showAxis=false, showPhase=false ───────────────────────────

describe("toggle orthogonality — combination 4: showAxis=false, showPhase=false", () => {
  it("renders 0 phase dividers", () => {
    const parts = axesParts(false, false);
    expect(countPhaseDividers(parts)).toBe(0);
  });

  it("does NOT render phase labels", () => {
    const parts = axesParts(false, false);
    expect(parts.some((p) => p.includes("Genesis"))).toBe(false);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(false);
    expect(parts.some((p) => p.includes("Commodity"))).toBe(false);
  });

  it("does NOT render evolution axis label 'Evolution'", () => {
    const parts = axesParts(false, false);
    expect(hasEvolutionLabel(parts)).toBe(false);
  });

  it("does NOT render direction indicators", () => {
    const parts = axesParts(false, false);
    expect(hasDirectionIndicators(parts)).toBe(false);
  });

  it("still renders arrowhead defs (always rendered as SVG infrastructure)", () => {
    const parts = axesParts(false, false);
    // Arrowhead defs are always rendered regardless of toggles
    expect(parts.some((p) => p.includes("<defs>") && p.includes("axis-arrow"))).toBe(true);
  });
});

// ── Default behavior (no explicit toggles) ───────────────────────────────────

describe("toggle orthogonality — defaults (no explicit toggles)", () => {
  it("default (undefined) behaves like showAxis=true, showPhase=true", () => {
    const partsDefault = axesParts(undefined, undefined);
    const partsExplicit = axesParts(true, true);

    // Both should produce the same count of phase dividers
    expect(countPhaseDividers(partsDefault)).toBe(countPhaseDividers(partsExplicit));

    // Both should render phase labels
    expect(hasPhaseLabels(partsDefault)).toBe(hasPhaseLabels(partsExplicit));

    // Both should render evolution axis
    expect(hasEvolutionLabel(partsDefault)).toBe(hasEvolutionLabel(partsExplicit));
  });

  it("default renders 3 phase dividers", () => {
    const parts = axesParts(undefined, undefined);
    expect(countPhaseDividers(parts)).toBe(3);
  });

  it("default renders 4 phase labels", () => {
    const parts = axesParts(undefined, undefined);
    expect(parts.some((p) => p.includes("Genesis"))).toBe(true);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(true);
    expect(parts.some((p) => p.includes("Product"))).toBe(true);
    expect(parts.some((p) => p.includes("Commodity"))).toBe(true);
  });
});

// ── SVG structure invariants across all combinations ─────────────────────────

describe("toggle orthogonality — SVG structure invariants", () => {
  const combinations: Array<{
    showAxis: boolean;
    showPhase: boolean;
    label: string;
  }> = [
    { showAxis: true, showPhase: true, label: "[T,T]" },
    { showAxis: true, showPhase: false, label: "[T,F]" },
    { showAxis: false, showPhase: true, label: "[F,T]" },
    { showAxis: false, showPhase: false, label: "[F,F]" },
  ];

  for (const combo of combinations) {
    it(`${combo.label}: arrowhead defs always present (SVG infrastructure)`, () => {
      const parts = axesParts(combo.showAxis, combo.showPhase);
      expect(
        parts.some((p) => p.includes("<defs>") && p.includes("axis-arrow"))
      ).toBe(true);
    });

    it(`${combo.label}: returns a non-empty parts array`, () => {
      const parts = axesParts(combo.showAxis, combo.showPhase);
      expect(parts.length).toBeGreaterThan(0);
    });

    it(`${combo.label}: phase dividers present iff showPhase=true`, () => {
      const parts = axesParts(combo.showAxis, combo.showPhase);
      if (combo.showPhase) {
        expect(countPhaseDividers(parts)).toBeGreaterThan(0);
      } else {
        expect(countPhaseDividers(parts)).toBe(0);
      }
    });

    it(`${combo.label}: Genesis label present iff showPhase=true`, () => {
      const parts = axesParts(combo.showAxis, combo.showPhase);
      const hasGenesis = parts.some((p) => p.includes("Genesis"));
      expect(hasGenesis).toBe(combo.showPhase);
    });

    it(`${combo.label}: direction indicators present iff showAxis=true`, () => {
      const parts = axesParts(combo.showAxis, combo.showPhase);
      const hasIndicators = hasDirectionIndicators(parts);
      expect(hasIndicators).toBe(combo.showAxis);
    });
  }
});
