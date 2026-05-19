/**
 * constraint-graph-coverage.test.ts
 *
 * Comprehensive constraint graph tests covering:
 *   1. Valid configs — full nested structure passing all 5 constraints
 *   2. Each cross-group constraint violation — spatial→legend, spatial→typography,
 *      spatial→spatial (nodeRadii), styling phases↔evolveStyles
 *   3. Edge cases with partial/default configs — empty sub-groups, missing groups,
 *      single-field overrides, defaults filling in correctly
 *   4. evaluateConstraints policy behavior with cross-group violations
 *   5. validateRenderConfig with cross-group scenarios
 *   6. Clip handlers for cross-group constraints (nodeRadiiStrokeWidth)
 *
 * Complements config-constraint-graph.test.ts (per-constraint unit tests) and
 * render-config-constraints.test.ts (policy integration tests) by focusing on
 * cross-group interactions and partial/default edge cases.
 */

import { describe, it, expect, vi } from "vitest";
import {
  evaluateConstraints,
  validateRenderConfig,
  CONSTRAINT_CLIP_HANDLERS,
  ConstraintViolationError,
} from "./render-config-constraints.js";
import {
  checkConstraints,
  legendBoundsValidation,
  layerDependenciesConstraint,
  phaseStyleAlignmentConstraint,
  strokeWidthFontSizeRatioConstraint,
  nodeRadiiStrokeWidthConstraint,
  EXECUTABLE_CONSTRAINT_GRAPH,
  type ConstraintCheckInput,
} from "./config-constraint-graph.js";
import { RenderConfigSchema, type RenderConfig } from "./schema.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a config through Zod, applying all defaults. */
function makeConfig(overrides: Record<string, unknown> = {}): RenderConfig {
  return RenderConfigSchema.parse(overrides);
}

/** Build a raw config by spreading overrides onto parsed defaults (bypasses Zod for intentional violations). */
function makeRawConfig(overrides: Record<string, unknown>): RenderConfig {
  return {
    ...RenderConfigSchema.parse({}),
    ...overrides,
  } as unknown as RenderConfig;
}

// =============================================================================
// 1. VALID CONFIGS — full nested structure passing all 5 constraints
// =============================================================================

describe("valid configs — full nested structure passing all constraints", () => {
  it("empty config (all defaults) passes all 5 constraints", () => {
    const config = makeConfig();
    const { valid, ok } = checkConstraints(config as ConstraintCheckInput);
    expect(valid).toBe(true);
    expect(ok).toBe(true);
  });

  it("fully specified nested config with consistent values passes all constraints", () => {
    const config = makeConfig({
      spatial: {
        width: 1600,
        height: 800,
        coordinateSpace: { width: 1600, height: 800 },
        strokeWidth: 1,
        nodeRadii: { _default: 5 },
      },
      typography: {
        fontFamily: "Inter, sans-serif",
        labelScale: 1.0,
      },
      styling: {
        theme: "default",
        background: {
          evolutionPhases: {
            phases: ["Genesis", "Custom", "Product", "Commodity"],
          },
        },
        evolveStyles: {
          natural: { stroke: "#666" },
          ecosystem: { stroke: "#888" },
          forced: { stroke: "#aaa" },
          late: { stroke: "#ccc" },
        },
      },
      filters: {
        layers: {
          nodes: true,
          edges: true,
          labels: true,
          evolvesTo: true,
        },
      },
      legend: { position: { x: 100, y: 700 } },
    });
    const result = validateRenderConfig(config);
    expect(result.valid).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("config with named legend position passes all constraints", () => {
    const config = makeConfig({
      legend: { position: "top-left" },
      spatial: { strokeWidth: 2, nodeRadii: { _default: 5 } },
      typography: { labelScale: 1.5 },
    });
    const result = validateRenderConfig(config);
    expect(result.valid).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("config with large canvas and proportional nodeRadii/strokeWidth passes", () => {
    const config = makeConfig({
      spatial: {
        width: 3200,
        height: 1600,
        coordinateSpace: { width: 3200, height: 1600 },
        strokeWidth: 4,
        nodeRadii: { _default: 10 },
      },
      legend: { position: { x: 3000, y: 1500 } },
    });
    const result = validateRenderConfig(config);
    expect(result.valid).toBe(true);
  });

  it("config with all layers disabled consistently passes layer deps", () => {
    const config: ConstraintCheckInput = {
      filters: {
        layers: {
          nodes: false,
          evolvesTo: false,
          labels: false,
          edges: false,
        },
      },
    };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("config with nodeRadii._default exactly equal to strokeWidth passes", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 4, nodeRadii: { _default: 4 } },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.valid).toBe(true);
  });

  it("config with strokeWidth at exact threshold ratio with labelScale passes", () => {
    // ratio = 6 / (12 × 1.0) = 0.5 = threshold → valid (≤)
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 6 },
      typography: { labelScale: 1.0 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// 2. CROSS-GROUP CONSTRAINT VIOLATIONS — one per constraint type
// =============================================================================

describe("cross-group: spatial → legend (legendBoundsValidation)", () => {
  it("legend.position.x exceeds coordinateSpace.width", () => {
    const config: ConstraintCheckInput = {
      spatial: { coordinateSpace: { width: 800, height: 600 } },
      legend: { position: { x: 900, y: 100 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].path).toBe("legend.position.x");
    expect(result.violations[0].severity).toBe("error");
  });

  it("legend.position.y exceeds coordinateSpace.height", () => {
    const config: ConstraintCheckInput = {
      spatial: { coordinateSpace: { width: 1600, height: 400 } },
      legend: { position: { x: 100, y: 500 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations[0].path).toBe("legend.position.y");
  });

  it("falls back to spatial.width when coordinateSpace.width absent", () => {
    const config: ConstraintCheckInput = {
      spatial: { width: 800 },
      legend: { position: { x: 900, y: 100 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations[0].path).toBe("legend.position.x");
  });

  it("falls back to spatial.height when coordinateSpace.height absent", () => {
    const config: ConstraintCheckInput = {
      spatial: { height: 400 },
      legend: { position: { x: 100, y: 500 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations[0].path).toBe("legend.position.y");
  });

  it("negative coordinates violate bounds", () => {
    const config: ConstraintCheckInput = {
      legend: { position: { x: -10, y: -5 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

describe("cross-group: spatial.strokeWidth → typography.labelScale (strokeWidthFontSizeRatio)", () => {
  it("thick strokeWidth with small labelScale exceeds ratio threshold", () => {
    // ratio = 8 / (12 × 0.5) = 8/6 = 1.333 > 0.5
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 8 },
      typography: { labelScale: 0.5 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(true); // warning only
    expect(result.violations[0].severity).toBe("warning");
    expect(result.violations[0].path).toBe("spatial.strokeWidth");
  });

  it("moderate strokeWidth with very small labelScale exceeds threshold", () => {
    // ratio = 3 / (12 × 0.25) = 3/3 = 1.0 > 0.5
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 3 },
      typography: { labelScale: 0.25 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations[0].severity).toBe("warning");
  });

  it("large labelScale keeps ratio below threshold even with thick stroke", () => {
    // ratio = 8 / (12 × 2.0) = 8/24 = 0.333 < 0.5
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 8 },
      typography: { labelScale: 2.0 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(true);
  });

  it("violation message contains both strokeWidth value and rendered font size", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 7 },
      typography: { labelScale: 1.0 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.violations[0].message).toContain("7");
    expect(result.violations[0].message).toContain("12.0"); // 12 × 1.0
  });
});

describe("intra-group: spatial.nodeRadii._default < spatial.strokeWidth (nodeRadiiStrokeWidth)", () => {
  it("default radius smaller than stroke width produces error", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 6, nodeRadii: { _default: 3 } },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.violations[0].severity).toBe("error");
    expect(result.violations[0].path).toBe("spatial.nodeRadii._default");
  });

  it("violation message includes both radius and stroke values", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 7, nodeRadii: { _default: 2 } },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.violations[0].message).toContain("2"); // radius
    expect(result.violations[0].message).toContain("7"); // strokeWidth
  });

  it("radius of 1 with strokeWidth of 8 — extreme case", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 8, nodeRadii: { _default: 1 } },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(false);
  });
});

describe("cross-group: filters.layers (layerDependencies)", () => {
  it("nodes=false with evolvesTo defaulting to true produces error", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: false } },
    };
    const result = layerDependenciesConstraint.check(config);
    expect(result.valid).toBe(false);
    const paths = result.violations.map((v) => v.path);
    expect(paths).toContain("filters.layers.evolvesTo");
    expect(paths).toContain("filters.layers.labels");
  });

  it("nodes=false with only evolvesTo=false still violates for labels", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: false, evolvesTo: false } },
    };
    const result = layerDependenciesConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.path.includes("labels"))).toBe(true);
  });
});

describe("cross-group: styling.phases ↔ styling.evolveStyles (phaseStyleAlignment)", () => {
  it("3 phases with 1 evolveStyles key produces warning", () => {
    const config: ConstraintCheckInput = {
      styling: {
        background: { evolutionPhases: { phases: ["A", "B", "C"] } },
        evolveStyles: { natural: {} },
      },
    };
    const result = phaseStyleAlignmentConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(true); // warning only
    expect(result.violations[0].severity).toBe("warning");
  });

  it("5 phases with 4 evolveStyles keys produces warning (more phases than keys)", () => {
    const config: ConstraintCheckInput = {
      styling: {
        background: {
          evolutionPhases: { phases: ["A", "B", "C", "D", "E"] },
        },
        evolveStyles: {
          natural: {},
          ecosystem: {},
          forced: {},
          late: {},
        },
      },
    };
    const result = phaseStyleAlignmentConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations[0].message).toContain("5"); // phase count
    expect(result.violations[0].message).toContain("4"); // key count
  });

  it("1 phase with 4 evolveStyles keys produces warning (more keys than phases)", () => {
    const config: ConstraintCheckInput = {
      styling: {
        background: { evolutionPhases: { phases: ["Solo"] } },
        evolveStyles: {
          natural: {},
          ecosystem: {},
          forced: {},
          late: {},
        },
      },
    };
    const result = phaseStyleAlignmentConstraint.check(config);
    expect(result.valid).toBe(false);
    expect(result.violations[0].severity).toBe("warning");
  });
});

// =============================================================================
// 3. EDGE CASES — partial/default configs
// =============================================================================

describe("edge cases: partial configs with missing groups", () => {
  it("completely empty ConstraintCheckInput passes all constraints", () => {
    const { valid, ok, results } = checkConstraints({});
    expect(valid).toBe(true);
    expect(ok).toBe(true);
    expect(results.size).toBe(5);
  });

  it("only spatial group provided (no other groups) — passes all constraints", () => {
    const config: ConstraintCheckInput = {
      spatial: { width: 1600, height: 800, strokeWidth: 1 },
    };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("only typography group provided — passes all constraints", () => {
    const config: ConstraintCheckInput = {
      typography: { fontFamily: "Arial", labelScale: 1.5 },
    };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("only legend group provided with named position — passes", () => {
    const config: ConstraintCheckInput = {
      legend: { position: "bottom-right" },
    };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("only filters group provided with all true — passes", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: true, evolvesTo: true, labels: true } },
    };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("only styling group provided without evolveStyles — skips phaseStyleAlignment", () => {
    const config: ConstraintCheckInput = {
      styling: {
        background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      },
    };
    const result = phaseStyleAlignmentConstraint.check(config);
    expect(result.valid).toBe(true); // skipped — evolveStyles absent
  });

  it("only styling group provided without phases — skips phaseStyleAlignment", () => {
    const config: ConstraintCheckInput = {
      styling: {
        evolveStyles: { natural: {}, ecosystem: {} },
      },
    };
    const result = phaseStyleAlignmentConstraint.check(config);
    expect(result.valid).toBe(true); // skipped — phases absent
  });
});

describe("edge cases: empty sub-groups", () => {
  it("empty spatial object — all constraints pass (defaults used)", () => {
    const config: ConstraintCheckInput = { spatial: {} };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("empty typography object — strokeWidthFontSizeRatio skipped (no labelScale)", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 8 },
      typography: {},
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(true); // skipped — labelScale absent
  });

  it("empty filters object — layerDependencies pass (no layers = all defaults true)", () => {
    const config: ConstraintCheckInput = { filters: {} };
    const result = layerDependenciesConstraint.check(config);
    expect(result.valid).toBe(true);
  });

  it("empty legend object — legendBounds pass (no position = named default)", () => {
    const config: ConstraintCheckInput = { legend: {} };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(true);
  });

  it("empty styling object — phaseStyleAlignment skipped", () => {
    const config: ConstraintCheckInput = { styling: {} };
    const result = phaseStyleAlignmentConstraint.check(config);
    expect(result.valid).toBe(true);
  });
});

describe("edge cases: single-field overrides", () => {
  it("only spatial.strokeWidth provided — nodeRadii skipped (no nodeRadii)", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 8 },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.valid).toBe(true); // skipped
  });

  it("only spatial.nodeRadii provided — nodeRadii skipped (no strokeWidth)", () => {
    const config: ConstraintCheckInput = {
      spatial: { nodeRadii: { _default: 2 } },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.valid).toBe(true); // skipped
  });

  it("only typography.labelScale provided — strokeWidthFontSize skipped", () => {
    const config: ConstraintCheckInput = {
      typography: { labelScale: 0.3 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(true); // skipped
  });

  it("only legend.position as string — legendBounds valid", () => {
    const config: ConstraintCheckInput = {
      legend: { position: "auto" },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(true);
  });

  it("only legend.position as {x,y} within default bounds — valid", () => {
    const config: ConstraintCheckInput = {
      legend: { position: { x: 800, y: 400 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(true);
  });
});

describe("edge cases: defaults fill in correctly", () => {
  it("Zod-parsed empty config has all defaults applied", () => {
    const config = makeConfig();
    // All constraints should pass on defaults
    const result = validateRenderConfig(config);
    expect(result.valid).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("partial spatial with only strokeWidth — Zod fills other defaults", () => {
    const config = makeConfig({ spatial: { strokeWidth: 2 } });
    const result = validateRenderConfig(config);
    expect(result.valid).toBe(true);
    // Default nodeRadii._default (5) > strokeWidth (2) — constraint passes
  });

  it("partial typography with only labelScale — Zod fills fontFamily default", () => {
    const config = makeConfig({ typography: { labelScale: 1.5 } });
    const result = validateRenderConfig(config);
    expect(result.valid).toBe(true);
  });

  it("partial filters with only nodes=true — defaults fill other layers as true", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: true } },
    };
    // evolvesTo/labels default to true → nodes=true satisfies dependency
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });
});

// =============================================================================
// 4. MULTIPLE SIMULTANEOUS CROSS-GROUP VIOLATIONS
// =============================================================================

describe("multiple simultaneous cross-group violations", () => {
  it("legend OOB + layer deps + nodeRadii < strokeWidth — 3 constraint domains fire", () => {
    const config: ConstraintCheckInput = {
      spatial: {
        coordinateSpace: { width: 500, height: 300 },
        strokeWidth: 8,
        nodeRadii: { _default: 3 },
      },
      legend: { position: { x: 600, y: 100 } },
      filters: { layers: { nodes: false } },
    };
    const { valid, ok, results } = checkConstraints(config);
    expect(valid).toBe(false);
    expect(ok).toBe(false);

    expect(results.get("legendBoundsValidation")!.valid).toBe(false);
    expect(results.get("layerDependencies")!.valid).toBe(false);
    expect(results.get("nodeRadiiStrokeWidth")!.valid).toBe(false);
  });

  it("all 5 constraints fire simultaneously — maximum violation scenario", () => {
    const config: ConstraintCheckInput = {
      spatial: {
        coordinateSpace: { width: 500, height: 300 },
        strokeWidth: 8,
        nodeRadii: { _default: 2 },
      },
      typography: { labelScale: 0.3 },
      legend: { position: { x: 600, y: 400 } },
      filters: { layers: { nodes: false } },
      styling: {
        background: { evolutionPhases: { phases: ["A", "B", "C"] } },
        evolveStyles: { natural: {} },
      },
    };
    const { valid, ok, results } = checkConstraints(config);
    expect(valid).toBe(false);
    expect(ok).toBe(false);

    // All 5 should fire
    expect(results.get("legendBoundsValidation")!.valid).toBe(false);
    expect(results.get("layerDependencies")!.valid).toBe(false);
    expect(results.get("phaseStyleAlignment")!.valid).toBe(false);
    expect(results.get("strokeWidthFontSizeRatio")!.valid).toBe(false);
    expect(results.get("nodeRadiiStrokeWidth")!.valid).toBe(false);
  });

  it("validateRenderConfig collects all violations from multiple constraints", () => {
    const config = makeRawConfig({
      spatial: {
        coordinateSpace: { width: 500, height: 300 },
        strokeWidth: 8,
        nodeRadii: { _default: 2 },
      },
      typography: { labelScale: 0.3 },
      legend: { position: { x: 600, y: 400 } },
      filters: { layers: { nodes: false } },
      styling: {
        background: { evolutionPhases: { phases: ["A", "B", "C"] } },
        evolveStyles: { natural: {} },
      },
    });
    const result = validateRenderConfig(config);
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(false);

    const constraintIds = new Set(result.errors.map((e) => e.constraintId));
    expect(constraintIds.size).toBeGreaterThanOrEqual(4); // at least 4 of 5
    expect(constraintIds.has("legendBoundsValidation")).toBe(true);
    expect(constraintIds.has("layerDependencies")).toBe(true);
    expect(constraintIds.has("nodeRadiiStrokeWidth")).toBe(true);
  });

  it("warning + error mix: ok=false when any error exists alongside warnings", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 8, nodeRadii: { _default: 2 } }, // error
      typography: { labelScale: 0.3 }, // warning
      styling: {
        background: { evolutionPhases: { phases: ["A", "B", "C"] } },
        evolveStyles: { natural: {} }, // warning
      },
    };
    const { valid, ok, results } = checkConstraints(config);
    expect(valid).toBe(false);
    expect(ok).toBe(false); // error from nodeRadiiStrokeWidth

    // nodeRadii is error, strokeWidthFontSize is warning, phaseStyle is warning
    expect(results.get("nodeRadiiStrokeWidth")!.ok).toBe(false);
    expect(results.get("strokeWidthFontSizeRatio")!.ok).toBe(true);
    expect(results.get("phaseStyleAlignment")!.ok).toBe(true);
  });
});

// =============================================================================
// 5. EVALUATE CONSTRAINTS — cross-group policy behavior
// =============================================================================

describe("evaluateConstraints — cross-group policy behavior", () => {
  it("warn policy with nodeRadii violation emits console.warn but returns config unchanged", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const config = makeRawConfig({
        spatial: { strokeWidth: 8, nodeRadii: { _default: 2 } },
      });
      const result = evaluateConstraints(config, "warn");
      // Config unchanged
      expect((result.spatial as any).nodeRadii._default).toBe(2);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("throw policy with multiple cross-group violations collects ALL violations before throwing", () => {
    const config = makeRawConfig({
      spatial: {
        coordinateSpace: { width: 500, height: 300 },
        strokeWidth: 8,
        nodeRadii: { _default: 2 },
      },
      legend: { position: { x: 600, y: 100 } },
      filters: { layers: { nodes: false } },
    });

    let caught: ConstraintViolationError | null = null;
    try {
      evaluateConstraints(config, "throw");
    } catch (err) {
      if (err instanceof ConstraintViolationError) caught = err;
    }

    expect(caught).not.toBeNull();
    // Should have violations from legendBounds + layerDeps + nodeRadii at minimum
    expect(caught!.violations.length).toBeGreaterThanOrEqual(3);
    const paths = caught!.violations.map((v) => v.path);
    expect(paths.some((p) => p.includes("legend"))).toBe(true);
    expect(paths.some((p) => p.includes("layers"))).toBe(true);
    expect(paths.some((p) => p.includes("nodeRadii"))).toBe(true);
  });

  it("clip policy auto-corrects nodeRadii._default to strokeWidth", () => {
    const config = makeRawConfig({
      spatial: { strokeWidth: 6, nodeRadii: { _default: 2 } },
    });
    const result = evaluateConstraints(config, "clip");
    // nodeRadii._default should be bumped to strokeWidth (6)
    expect((result.spatial as any).nodeRadii._default).toBe(6);
  });

  it("clip policy cascades: legend clip + layer clip + nodeRadii clip in one pass", () => {
    const config = makeRawConfig({
      spatial: {
        coordinateSpace: { width: 500, height: 300 },
        strokeWidth: 6,
        nodeRadii: { _default: 2 },
      },
      legend: { position: { x: 600, y: 100 } },
      filters: { layers: { nodes: false } },
    });

    const result = evaluateConstraints(config, "clip");

    // Legend clipped to coordinateSpace bounds
    const pos = result.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(500);

    // Layer deps clipped: dependents set to false
    expect(result.filters?.layers?.evolvesTo).toBe(false);
    expect(result.filters?.layers?.labels).toBe(false);

    // nodeRadii clipped: bumped to strokeWidth
    expect((result.spatial as any).nodeRadii._default).toBe(6);
  });

  it("clip policy with phaseStyleAlignment (no handler) falls back to warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const config = makeRawConfig({
        styling: {
          background: { evolutionPhases: { phases: ["A", "B", "C"] } },
          evolveStyles: { natural: {} },
        },
      });
      const result = evaluateConstraints(config, "clip");
      // Config unchanged for phaseStyle (no clip handler)
      expect(warnSpy).toHaveBeenCalled();
      const warnMessages = warnSpy.mock.calls.map((c) => c[0] as string);
      expect(warnMessages.some((m) => m.includes("phaseStyleAlignment"))).toBe(true);
      expect(warnMessages.some((m) => m.includes("no clip handler"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("clip policy with strokeWidthFontSizeRatio (no handler) falls back to warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const config = makeRawConfig({
        spatial: { strokeWidth: 8, nodeRadii: { _default: 10 } },
        typography: { labelScale: 0.3 },
      });
      evaluateConstraints(config, "clip");
      const warnMessages = warnSpy.mock.calls.map((c) => c[0] as string);
      expect(warnMessages.some((m) => m.includes("strokeWidthFontSizeRatio"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// =============================================================================
// 6. CONSTRAINT_CLIP_HANDLERS — registry completeness
// =============================================================================

describe("CONSTRAINT_CLIP_HANDLERS — registry", () => {
  it("has clip handler for legendBoundsValidation", () => {
    expect(typeof CONSTRAINT_CLIP_HANDLERS["legendBoundsValidation"]).toBe("function");
  });

  it("has clip handler for layerDependencies", () => {
    expect(typeof CONSTRAINT_CLIP_HANDLERS["layerDependencies"]).toBe("function");
  });

  it("has clip handler for nodeRadiiStrokeWidth", () => {
    expect(typeof CONSTRAINT_CLIP_HANDLERS["nodeRadiiStrokeWidth"]).toBe("function");
  });

  it("has NO clip handler for phaseStyleAlignment (advisory only)", () => {
    expect(CONSTRAINT_CLIP_HANDLERS["phaseStyleAlignment"]).toBeUndefined();
  });

  it("has NO clip handler for strokeWidthFontSizeRatio (advisory only)", () => {
    expect(CONSTRAINT_CLIP_HANDLERS["strokeWidthFontSizeRatio"]).toBeUndefined();
  });

  it("nodeRadiiStrokeWidth clip handler bumps _default to strokeWidth", () => {
    const handler = CONSTRAINT_CLIP_HANDLERS["nodeRadiiStrokeWidth"]!;
    const config = makeRawConfig({
      spatial: { strokeWidth: 7, nodeRadii: { _default: 3 } },
    });
    const clipped = handler(config);
    expect((clipped.spatial as any).nodeRadii._default).toBe(7);
  });

  it("nodeRadiiStrokeWidth clip handler returns unchanged when radius >= strokeWidth", () => {
    const handler = CONSTRAINT_CLIP_HANDLERS["nodeRadiiStrokeWidth"]!;
    const config = makeRawConfig({
      spatial: { strokeWidth: 3, nodeRadii: { _default: 5 } },
    });
    const clipped = handler(config);
    expect(clipped).toBe(config); // reference equality — unchanged
  });

  it("legendBoundsValidation clip handler clamps negative coordinates to 0", () => {
    const handler = CONSTRAINT_CLIP_HANDLERS["legendBoundsValidation"]!;
    const config = makeRawConfig({
      legend: { position: { x: -50, y: -30 } },
    });
    const clipped = handler(config);
    const pos = clipped.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it("legendBoundsValidation clip handler returns unchanged for named position", () => {
    const handler = CONSTRAINT_CLIP_HANDLERS["legendBoundsValidation"]!;
    const config = makeRawConfig({
      legend: { position: "top-left" },
    });
    const clipped = handler(config);
    expect(clipped).toBe(config); // reference equality
  });

  it("layerDependencies clip handler disables both dependents when nodes=false", () => {
    const handler = CONSTRAINT_CLIP_HANDLERS["layerDependencies"]!;
    const config = makeRawConfig({
      filters: { layers: { nodes: false, evolvesTo: true, labels: true } },
    });
    const clipped = handler(config);
    expect(clipped.filters?.layers?.evolvesTo).toBe(false);
    expect(clipped.filters?.layers?.labels).toBe(false);
    expect(clipped.filters?.layers?.nodes).toBe(false);
  });
});

// =============================================================================
// 7. BOUNDARY CONDITIONS
// =============================================================================

describe("boundary conditions", () => {
  it("legend at exact canvas edge (x=width, y=height) — valid", () => {
    const config: ConstraintCheckInput = {
      spatial: { coordinateSpace: { width: 800, height: 400 } },
      legend: { position: { x: 800, y: 400 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(true);
  });

  it("legend at origin (0,0) — valid", () => {
    const config: ConstraintCheckInput = {
      legend: { position: { x: 0, y: 0 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(true);
  });

  it("legend 1 pixel beyond canvas — invalid", () => {
    const config: ConstraintCheckInput = {
      spatial: { coordinateSpace: { width: 800, height: 400 } },
      legend: { position: { x: 801, y: 400 } },
    };
    const result = legendBoundsValidation.check(config);
    expect(result.valid).toBe(false);
  });

  it("strokeWidth/font ratio at exactly 0.5 threshold — valid (≤ comparison)", () => {
    // ratio = 6 / (12 × 1.0) = 0.5 exactly
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 6 },
      typography: { labelScale: 1.0 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(true);
  });

  it("strokeWidth/font ratio at 0.501 — invalid", () => {
    // ratio = 6.012 / (12 × 1.0) = 0.501 > 0.5
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 6.012 },
      typography: { labelScale: 1.0 },
    };
    const result = strokeWidthFontSizeRatioConstraint.check(config);
    expect(result.valid).toBe(false);
  });

  it("nodeRadii._default exactly equal to strokeWidth — valid (≥ comparison)", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 5, nodeRadii: { _default: 5 } },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.valid).toBe(true);
  });

  it("nodeRadii._default one below strokeWidth — invalid", () => {
    const config: ConstraintCheckInput = {
      spatial: { strokeWidth: 5, nodeRadii: { _default: 4.99 } },
    };
    const result = nodeRadiiStrokeWidthConstraint.check(config);
    expect(result.valid).toBe(false);
  });

  it("empty phases array with evolveStyles — no violation (0 === 0 per-type keys)", () => {
    const config: ConstraintCheckInput = {
      styling: {
        background: { evolutionPhases: { phases: [] } },
        evolveStyles: { _default: {} },
      },
    };
    const result = phaseStyleAlignmentConstraint.check(config);
    expect(result.valid).toBe(true); // 0 per-type keys → skipped
  });
});
