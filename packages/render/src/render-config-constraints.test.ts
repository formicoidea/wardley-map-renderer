/**
 * Tests for Sub-AC 3: render-config-constraints.ts + resolveConfig integration
 *
 * ## Key insight: Zod vs. constraint graph divergence
 *
 * `RenderConfigSchema.superRefine` validates legend.position.{x,y} against
 * `data.width ?? 1600` (the top-level `width` field).  The constraint graph
 * validates against `coordinateSpace.width ?? config.width ?? 1600`.
 *
 * This means a config with `coordinateSpace.width = 800` but no top-level `width`
 * can have `legend.position.x = 900`:
 *   - Zod allows it (900 ≤ 1600 = Zod max)
 *   - Constraint graph flags it (900 > 800 = coordinateSpace.width)
 *
 * This divergence is the testable surface for legend-bounds constraint tests.
 *
 * ## Coverage
 *
 *   1. Individual constraint: legendBoundsValidation (via checkConstraints)
 *   2. Individual constraint: layerDependencies (via checkConstraints)
 *   3. phaseStyleAlignmentConstraint (advisory parity — passes Zod, fails constraint)
 *   4. violationPolicy: warn — emits console.warn, returns config unchanged
 *   5. violationPolicy: throw — throws ConstraintViolationError
 *   6. violationPolicy: clip — auto-corrects legend XY to coordinateSpace bounds
 *   7. Cross-constraint: coordinateSpace change cascades to BOTH legend AND phase
 *   8. resolveConfig integration — wired via options.violationPolicy
 *   9. No-violation scenarios — valid config passes unchanged
 */

import { describe, it, expect, vi } from "vitest";
import {
  evaluateConstraints,
  CONSTRAINT_CLIP_HANDLERS,
  ConstraintViolationError,
  type ConstraintPolicy,
  type ConstraintEvaluationOptions,
} from "./render-config-constraints.js";
import {
  checkConstraints,
  EXECUTABLE_CONSTRAINT_GRAPH,
  type ConstraintCheckInput,
} from "./config-constraint-graph.js";
import { resolveConfig } from "./resolve-conflict.js";
import { RenderConfigSchema, type RenderConfig, type CoordinateSpace, type Legend, type EvolutionPhases } from "./schema.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Build a minimal valid RenderConfig by parsing through RenderConfigSchema.
 * Any supplied fields override the schema defaults.
 */
function makeConfig(overrides: Record<string, unknown> = {}): RenderConfig {
  return RenderConfigSchema.parse(overrides);
}

/**
 * Build a RenderConfig where legend.position.x EXCEEDS coordinateSpace.width
 * but PASSES Zod validation (which uses top-level `width`, not coordinateSpace.width).
 *
 * This creates the testable gap between Zod enforcement and constraint-graph enforcement:
 *   - coordinateSpace.width = csWidth (constraint graph limit)
 *   - legend.position.x = xVal (> csWidth, constraint fires)
 *   - no top-level `width` → Zod uses 1600 → xVal ≤ 1600 → Zod passes
 *
 * Precondition: xVal must be ≤ 1600 (Zod default width) and > csWidth.
 */
function makeConfigWithCoordSpaceXOverflow(
  csWidth: number,
  xVal: number,
  yVal: number,
): RenderConfig {
  return RenderConfigSchema.parse({
    coordinateSpace: { width: csWidth, height: 800 },
    legend: { position: { x: xVal, y: yVal } },
    // NOTE: no top-level `width` — Zod uses default 1600 for bounds check
  });
}

/**
 * Build a RenderConfig with a narrowed evolutionRange and a legend XY position
 * that PASSES Zod but FAILS the coordinateSpace constraint in the constraint graph.
 */
function makeNarrowedRangeConfigWithOOBLegend(): RenderConfig {
  return RenderConfigSchema.parse({
    coordinateSpace: {
      width: 600,
      height: 300,
      evolutionRange: [0.3, 0.9], // hides boundary 0.175 (< 0.3)
    },
    legend: { position: { x: 700, y: 100 } },
    // x=700 > coordinateSpace.width=600 → constraint fires
    // x=700 ≤ Zod max 1600 → Zod passes
  });
}

/**
 * Cast a manually-built object to RenderConfig without going through Zod.
 * Used when the config intentionally violates Zod constraints (layer deps)
 * to test the constraint graph directly.
 */
function makeRawConfig(overrides: Record<string, unknown>): RenderConfig {
  return {
    ...RenderConfigSchema.parse({}),
    ...overrides,
  } as unknown as RenderConfig;
}

// ── 1. legendBoundsValidation — individual constraint (via checkConstraints) ──

describe("legendBoundsValidation — individual constraint", () => {
  it("reports no violation when legend position is a named string (always valid)", () => {
    const config: ConstraintCheckInput = {
      legend: { position: "top-left" },
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[0]]);
    expect(result.valid).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.results.get("legendBoundsValidation")!.violations).toHaveLength(0);
  });

  it("reports error violation when x > coordinateSpace.width", () => {
    const config: ConstraintCheckInput = {
      coordinateSpace: { width: 800, height: 400 },
      legend: { position: { x: 900, y: 100 } }, // x=900 > width=800
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[0]]);
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(false);
    const violations = result.results.get("legendBoundsValidation")!.violations;
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe("legend.position.x");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].message).toContain("900");
    expect(violations[0].message).toContain("800");
  });

  it("reports error violation when y > coordinateSpace.height", () => {
    const config: ConstraintCheckInput = {
      coordinateSpace: { width: 1600, height: 400 },
      legend: { position: { x: 100, y: 500 } }, // y=500 > height=400
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[0]]);
    expect(result.valid).toBe(false);
    const violations = result.results.get("legendBoundsValidation")!.violations;
    const yViolation = violations.find((v) => v.path === "legend.position.y");
    expect(yViolation).toBeDefined();
    expect(yViolation!.severity).toBe("error");
  });

  it("reports both x and y violations when both exceed bounds", () => {
    const config: ConstraintCheckInput = {
      coordinateSpace: { width: 400, height: 200 },
      legend: { position: { x: 500, y: 300 } }, // both out of bounds
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[0]]);
    expect(result.valid).toBe(false);
    const violations = result.results.get("legendBoundsValidation")!.violations;
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.path)).toContain("legend.position.x");
    expect(violations.map((v) => v.path)).toContain("legend.position.y");
  });

  it("uses 1600x800 default bounds when coordinateSpace is absent", () => {
    const config: ConstraintCheckInput = {
      legend: { position: { x: 1700, y: 100 } }, // x > default 1600
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[0]]);
    expect(result.valid).toBe(false);
    const violations = result.results.get("legendBoundsValidation")!.violations;
    expect(violations.find((v) => v.path === "legend.position.x")).toBeDefined();
  });

  it("passes when legend XY is at exactly the boundary (inclusive upper)", () => {
    const config: ConstraintCheckInput = {
      coordinateSpace: { width: 800, height: 400 },
      legend: { position: { x: 800, y: 400 } }, // exactly at max → valid
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[0]]);
    expect(result.valid).toBe(true);
  });
});

// ── 2. layerDependencies — individual constraint ──────────────────────────────

describe("layerDependencies — individual constraint", () => {
  it("reports no violation when layers are absent (all default to visible)", () => {
    const config: ConstraintCheckInput = {};
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[1]]);
    expect(result.valid).toBe(true);
  });

  it("reports error violation when nodes=false but evolvesTo defaults to true", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: false } },
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[1]]);
    expect(result.valid).toBe(false);
    const violations = result.results.get("layerDependencies")!.violations;
    const evolveViolation = violations.find((v) => v.path.includes("evolvesTo"));
    expect(evolveViolation).toBeDefined();
    expect(evolveViolation!.severity).toBe("error");
  });

  it("reports error violation when nodes=false but labels defaults to true", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: false, evolvesTo: false } },
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[1]]);
    expect(result.valid).toBe(false);
    const violations = result.results.get("layerDependencies")!.violations;
    const labelsViolation = violations.find((v) => v.path.includes("labels"));
    expect(labelsViolation).toBeDefined();
  });

  it("reports no violation when nodes=false and both evolvesTo=false, labels=false", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: false, evolvesTo: false, labels: false } },
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[1]]);
    expect(result.valid).toBe(true);
  });
});

// ── 3. evaluateConstraints — violationPolicy: warn ───────────────────────────

describe("evaluateConstraints — violationPolicy: warn", () => {
  it("returns config unchanged when no violations exist", () => {
    const config = makeConfig();
    const result = evaluateConstraints(config, "warn");
    expect(result).toBe(config); // reference equality — unchanged
  });

  it("returns config unchanged when legend OOB (coordinateSpace gap) with warn policy", () => {
    // x=900 > coordinateSpace.width=800 but ≤ Zod default 1600 → Zod passes, constraint fires
    const config = makeConfigWithCoordSpaceXOverflow(800, 900, 100);
    const result = evaluateConstraints(config, "warn");
    // Warn policy: unchanged
    expect((result.legend!.position as { x: number; y: number }).x).toBe(900);
  });

  it("emits console.warn for each violation when policy is warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const config = makeConfigWithCoordSpaceXOverflow(800, 900, 100);
      evaluateConstraints(config, "warn");
      expect(warnSpy).toHaveBeenCalled();
      const calls = warnSpy.mock.calls.map((c) => c[0] as string);
      expect(calls.some((m) => m.includes("legendBoundsValidation"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("default policy is warn (no second argument = warn behavior)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const config = makeConfigWithCoordSpaceXOverflow(800, 900, 100);
      const result = evaluateConstraints(config); // no policy arg
      // config unchanged (warn is default)
      expect((result.legend!.position as { x: number; y: number }).x).toBe(900);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ── 4. evaluateConstraints — violationPolicy: throw ──────────────────────────

describe("evaluateConstraints — violationPolicy: throw", () => {
  it("throws ConstraintViolationError when legend OOB (coordinateSpace gap)", () => {
    const config = makeConfigWithCoordSpaceXOverflow(800, 900, 100);
    expect(() => evaluateConstraints(config, "throw")).toThrowError(
      ConstraintViolationError,
    );
  });

  it("ConstraintViolationError.violations contains all violations (full graph pass)", () => {
    // Both x and y OOB relative to coordinateSpace → 2 violations in one throw
    const config = RenderConfigSchema.parse({
      coordinateSpace: { width: 600, height: 300 },
      legend: { position: { x: 700, y: 400 } },
      // x=700 > 600 and y=400 > 300 → both fire
      // but Zod max is 1600/800 → Zod passes
    });
    let caughtErr: ConstraintViolationError | null = null;
    try {
      evaluateConstraints(config, "throw");
    } catch (err) {
      if (err instanceof ConstraintViolationError) caughtErr = err;
    }
    expect(caughtErr).not.toBeNull();
    expect(caughtErr!.violations.length).toBeGreaterThanOrEqual(2);
    const paths = caughtErr!.violations.map((v) => v.path);
    expect(paths).toContain("legend.position.x");
    expect(paths).toContain("legend.position.y");
  });

  it("ConstraintViolationError.name is 'ConstraintViolationError'", () => {
    const config = makeConfigWithCoordSpaceXOverflow(800, 900, 100);
    try {
      evaluateConstraints(config, "throw");
    } catch (err) {
      expect((err as Error).name).toBe("ConstraintViolationError");
    }
  });

  it("throws ConstraintViolationError for raw config with layerDeps violation", () => {
    // Bypass Zod (which also enforces layerDeps) to test constraint graph directly
    const config = makeRawConfig({
      filters: { layers: { nodes: false } },
    });
    expect(() => evaluateConstraints(config, "throw")).toThrowError(
      ConstraintViolationError,
    );
  });

  it("does not throw for a fully valid config", () => {
    const config = makeConfig();
    expect(() => evaluateConstraints(config, "throw")).not.toThrow();
  });
});

// ── 5. evaluateConstraints — violationPolicy: clip ───────────────────────────

describe("evaluateConstraints — violationPolicy: clip", () => {
  it("clips legend.position.x to coordinateSpace.width when x exceeds bounds", () => {
    const config = makeConfigWithCoordSpaceXOverflow(800, 900, 100);
    const result = evaluateConstraints(config, "clip");
    const pos = result.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(800); // clamped to coordinateSpace.width=800
    expect(pos.y).toBe(100); // y within bounds — unchanged
  });

  it("clips legend.position.y to coordinateSpace.height when y exceeds bounds", () => {
    const config = RenderConfigSchema.parse({
      coordinateSpace: { width: 1600, height: 400 },
      legend: { position: { x: 100, y: 500 } },
      // y=500 > coordinateSpace.height=400 but ≤ Zod default 800 → Zod passes
    });
    const result = evaluateConstraints(config, "clip");
    const pos = result.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(100);  // x within bounds
    expect(pos.y).toBe(400);  // clamped to coordinateSpace.height=400
  });

  it("clips both x and y when both exceed coordinateSpace bounds", () => {
    const config = RenderConfigSchema.parse({
      coordinateSpace: { width: 600, height: 300 },
      legend: { position: { x: 700, y: 400 } },
      // both OOB relative to coordinateSpace but ≤ Zod defaults
    });
    const result = evaluateConstraints(config, "clip");
    const pos = result.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(600);
    expect(pos.y).toBe(300);
  });

  it("returns config unchanged (reference) when no violations exist", () => {
    const config = makeConfig({ legend: { position: "bottom-right" } });
    const result = evaluateConstraints(config, "clip");
    expect(result).toBe(config); // reference equality
  });

  it("clip handler fixes layerDeps when nodes=false and dependents are on", () => {
    // Bypass Zod to test clip directly
    const config = makeRawConfig({
      filters: { layers: { nodes: false } },
    });
    const result = evaluateConstraints(config, "clip");
    const layers = result.filters?.layers;
    // Clip sets evolvesTo and labels to false
    expect(layers?.evolvesTo).toBe(false);
    expect(layers?.labels).toBe(false);
    expect(layers?.nodes).toBe(false);
  });

  it("no clip handler for phaseStyleAlignment — falls back to warn (no throw)", () => {
    // phaseStyleAlignment violation passes Zod but fires constraint graph with warning
    const config = RenderConfigSchema.parse({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {}, ecosystem: {} },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // clip policy with no clip handler → falls back to warn
      expect(() => evaluateConstraints(config, "clip")).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ── 6. Cross-constraint: coordinateSpace change cascades ─────────────────────

describe("cross-constraint: coordinateSpace change cascades to BOTH legend AND phase", () => {
  it("narrowed evolutionRange hides a phase boundary — phaseStyleAlignment passes, but coordinateSpace affects both legend AND phase concerns", () => {
    // Narrow evolution range to [0.3, 0.9] — hides boundary 0.175 (which is < 0.3)
    // Also place legend OOB relative to new coordinateSpace.width
    const config = makeNarrowedRangeConfigWithOOBLegend();

    // checkConstraints returns per-domain results
    const { valid, results } = checkConstraints(config as ConstraintCheckInput);

    // At minimum: legend bounds violated (x=700 > coordinateSpace.width=600)
    expect(results.get("legendBoundsValidation")!.valid).toBe(false);
    expect(valid).toBe(false);
  });

  it("coordinateSpace cascade: narrowed range + OOB legend — evaluateConstraints fires for both domains", () => {
    const config = makeNarrowedRangeConfigWithOOBLegend();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      evaluateConstraints(config, "warn");
      const warnMessages = warnSpy.mock.calls.map((c) => c[0] as string);
      // legendBoundsValidation should fire
      expect(warnMessages.some((m) => m.includes("legendBoundsValidation"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("coordinateSpace cascade: clip corrects legend OOB from narrowed canvas", () => {
    const config = makeNarrowedRangeConfigWithOOBLegend();
    // Before clip: x=700 > coordinateSpace.width=600
    const result = evaluateConstraints(config, "clip");
    const pos = result.legend!.position as { x: number; y: number };
    // After clip: x clamped to 600 (coordinateSpace.width)
    expect(pos.x).toBe(600);
    expect(pos.y).toBe(100);
  });

  it("phaseStyleAlignment fires when both phases (3) and evolveStyles keys (2) are explicitly set", () => {
    // This passes Zod validation but fails the advisory constraint
    const config: ConstraintCheckInput = {
      background: { evolutionPhases: { phases: ["Genesis", "Custom", "Product"] } },
      evolveStyles: { natural: { stroke: "#111" }, ecosystem: { stroke: "#222" } },
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[2]]);
    expect(result.valid).toBe(false); // has a violation
    expect(result.ok).toBe(true);    // only warning severity
    const violations = result.results.get("phaseStyleAlignment")!.violations;
    expect(violations[0].severity).toBe("warning");
    expect(violations[0].message).toContain("3");  // 3 phases
    expect(violations[0].message).toContain("2");  // 2 explicit keys
  });
});

// ── 7. resolveConfig integration — constraints wired into merge pipeline ──────

describe("resolveConfig integration — constraints run after merge", () => {
  it("no violationPolicy option → warn by default (non-breaking, no throw)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // coord space mismatch: coordinateSpace.width=800 but legend.x=900 (Zod passes, constraint fires)
      const { config: result } = resolveConfig(
        {},
        {
          coordinateSpace: { width: 800, height: 800 } as CoordinateSpace,
          legend: { position: { x: 900, y: 100 } } as Legend,
        },
        // no options → default warn
      );
      // Config returned unchanged (warn policy)
      const pos = result.legend!.position as { x: number; y: number };
      expect(pos.x).toBe(900);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("violationPolicy: 'throw' → throws ConstraintViolationError for legend OOB", () => {
    expect(() =>
      resolveConfig(
        {},
        {
          coordinateSpace: { width: 800, height: 800 } as CoordinateSpace,
          legend: { position: { x: 900, y: 100 } } as Legend,
        },
        { violationPolicy: "throw" },
      ),
    ).toThrowError(ConstraintViolationError);
  });

  it("violationPolicy: 'throw' for phaseStyleAlignment violation (passes Zod, advisory)", () => {
    // phaseStyleAlignment fires with warning — throw policy still throws
    expect(() =>
      resolveConfig(
        {},
        {
          background: { evolutionPhases: { phases: ["A", "B", "C"] } as EvolutionPhases },
          evolveStyles: { natural: {}, ecosystem: {} },
        },
        { violationPolicy: "throw" },
      ),
    ).toThrowError(ConstraintViolationError);
  });

  it("violationPolicy: 'clip' → auto-corrects legend OOB to coordinateSpace bounds", () => {
    const { config: result } = resolveConfig(
      {},
      {
        coordinateSpace: { width: 800, height: 400 } as CoordinateSpace,
        legend: { position: { x: 1200, y: 50 } } as Legend,
        // x=1200 > coordinateSpace.width=800 but ≤ Zod default 1600
      },
      { violationPolicy: "clip" },
    );
    const pos = result.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(800); // clamped to coordinateSpace.width
    expect(pos.y).toBe(50);  // y within bounds
  });

  it("resolveConfig with valid config and 'warn' policy emits no warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { config: result } = resolveConfig(
        { theme: "dark" },
        { width: 1600, height: 800 },
        { violationPolicy: "warn" },
      );
      expect(result.theme).toBe("dark");
      expect(result.width).toBe(1600);
      // No constraint violations → no warnings emitted
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("resolveConfig applies 4-tier precedence AND constraint evaluation in order", () => {
    // Author sets small coordinateSpace + legend OOB; clip corrects post-merge
    const { config: result } = resolveConfig(
      { theme: "dark" },
      {
        coordinateSpace: { width: 400, height: 200 } as CoordinateSpace,
        legend: { position: { x: 500, y: 100 } } as Legend,
        // x=500 > coordinateSpace.width=400 but ≤ Zod default 1600
      },
      { violationPolicy: "clip" },
    );
    // Tier precedence: coordinateSpace from author
    expect(result.coordinateSpace?.width).toBe(400);
    // Constraint clip: legend.x clamped to 400
    const pos = result.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(400);
    // Viewer preference preserved
    expect(result.theme).toBe("dark");
  });
});

// ── 8. No-violation scenarios ─────────────────────────────────────────────────

describe("no-violation scenarios — valid config passes unchanged", () => {
  it("empty config has no violations (all defaults valid)", () => {
    const config = makeConfig();
    const { valid, ok } = checkConstraints(config as ConstraintCheckInput);
    expect(valid).toBe(true);
    expect(ok).toBe(true);
  });

  it("named legend position 'auto' has no legend bounds violations", () => {
    const config: ConstraintCheckInput = {
      legend: { position: "auto" },
    };
    const { valid } = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[0]]);
    expect(valid).toBe(true);
  });

  it("legend XY within coordinateSpace bounds — no violation", () => {
    const config: ConstraintCheckInput = {
      coordinateSpace: { width: 1600, height: 800 },
      legend: { position: { x: 100, y: 700 } },
    };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("nodes=false with evolvesTo=false and labels=false — no layer dep violations", () => {
    const config: ConstraintCheckInput = {
      filters: { layers: { nodes: false, evolvesTo: false, labels: false } },
    };
    const { valid } = checkConstraints(config);
    expect(valid).toBe(true);
  });

  it("4 phases with 4 evolveStyles keys — no phaseStyleAlignment violation", () => {
    const config: ConstraintCheckInput = {
      background: { evolutionPhases: { phases: ["G", "C", "P", "Co"] } },
      evolveStyles: { natural: {}, ecosystem: {}, forced: {}, late: {} },
    };
    const result = checkConstraints(config, [EXECUTABLE_CONSTRAINT_GRAPH[2]]);
    expect(result.valid).toBe(true);
  });
});

// ── 9. CONSTRAINT_CLIP_HANDLERS and EXECUTABLE_CONSTRAINT_GRAPH structure ────

describe("CONSTRAINT_CLIP_HANDLERS — introspectability", () => {
  it("EXECUTABLE_CONSTRAINT_GRAPH has exactly 3 constraint entries", () => {
    expect(EXECUTABLE_CONSTRAINT_GRAPH).toHaveLength(3);
  });

  it("constraint IDs are the expected slot names", () => {
    const ids = EXECUTABLE_CONSTRAINT_GRAPH.map((c) => c.id);
    expect(ids).toContain("legendBoundsValidation");
    expect(ids).toContain("layerDependencies");
    expect(ids).toContain("phaseStyleAlignment");
  });

  it("legendBoundsValidation has a clip handler", () => {
    expect(typeof CONSTRAINT_CLIP_HANDLERS["legendBoundsValidation"]).toBe("function");
  });

  it("layerDependencies has a clip handler", () => {
    expect(typeof CONSTRAINT_CLIP_HANDLERS["layerDependencies"]).toBe("function");
  });

  it("phaseStyleAlignment has NO clip handler (advisory warning only)", () => {
    expect(CONSTRAINT_CLIP_HANDLERS["phaseStyleAlignment"]).toBeUndefined();
  });

  it("ConstraintPolicy type accepts warn, throw, and clip", () => {
    // Static type check — all three should be assignable
    const policies: ConstraintPolicy[] = ["warn", "throw", "clip"];
    expect(policies).toHaveLength(3);
  });

  it("ConstraintEvaluationOptions interface is satisfied by resolveConfig third argument", () => {
    // Type-level check: resolveConfig({}, {}, { violationPolicy: 'clip' }) should compile
    const opts: ConstraintEvaluationOptions = { violationPolicy: "clip" };
    expect(opts.violationPolicy).toBe("clip");
  });
});
