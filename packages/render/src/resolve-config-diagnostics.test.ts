/**
 * @file resolve-config-diagnostics.test.ts
 *
 * Tests verifying that resolveConfig (and the underlying constraint graph)
 * correctly captures diagnostics across two complementary surfaces:
 *
 * 1. **Unrecognized-type diagnostics** — Zod-level enforcement when
 *    invalid/unknown keys appear in typed maps (evolveStyles, nodeRadii).
 *    These are caught by the schema's `.strict()` or closed-enum enforcement
 *    and surfaced as ZodError instances.
 *
 * 2. **Constraint-violation diagnostics** — cross-field issues caught by the
 *    declarative constraint graph AFTER Zod passes (e.g. legend position OOB
 *    relative to coordinateSpace, layer toggle DAG broken).  These are surfaced
 *    as `ConstraintViolation` objects with path, message, and severity.
 *
 * ## Why these tests matter
 *
 * The two diagnostic surfaces are complementary:
 *
 * - Zod catches "this key shouldn't exist / this value has the wrong shape"
 * - The constraint graph catches "these two fields are mutually inconsistent"
 *
 * Together they form a complete diagnostic picture that callers can act on.
 * This test file ensures both surfaces are covered in representative scenarios.
 */

import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import { resolveConfig } from "./resolve-conflict.js";
import {
  checkConstraints,
  EXECUTABLE_CONSTRAINT_GRAPH,
  type ConstraintCheckInput,
  type ConstraintViolation,
} from "./config-constraint-graph.js";
import {
  evaluateConstraints,
  ConstraintViolationError,
} from "./render-config-constraints.js";
import { RenderConfigSchema, type RenderConfig } from "./schema.js";
import {
  collectConfigDiagnostics,
  createDiagnosticsCollector,
  EMPTY_RESOLVE_DIAGNOSTICS,
} from "./resolve-diagnostics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a minimal valid RenderConfig through Zod. */
function makeConfig(overrides: Record<string, unknown> = {}): RenderConfig {
  return RenderConfigSchema.parse(overrides);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Unrecognized-type diagnostics: evolveStyles
// ─────────────────────────────────────────────────────────────────────────────

describe("unrecognized-type diagnostics — evolveStyles (closed EvolveTypeEnum)", () => {
  it("resolveConfig throws ZodError when evolveStyles contains unrecognized key 'genesis'", () => {
    // 'genesis' is NOT in EvolveTypeEnum (natural | ecosystem | forced | late)
    // EvolveStylesMapSchema uses .strict() → unrecognized key causes ZodError
    expect(() =>
      resolveConfig(
        {},
        {
          evolveStyles: { genesis: { stroke: "#dc2626" } } as never,
        },
      ),
    ).toThrow(ZodError);
  });

  it("ZodError for unrecognized evolveStyles key names the offending key", () => {
    let zodErr: ZodError | null = null;
    try {
      resolveConfig(
        {},
        { evolveStyles: { product: { stroke: "#000" } } as never },
      );
    } catch (err) {
      if (err instanceof ZodError) zodErr = err;
    }
    expect(zodErr).not.toBeNull();
    // ZodError issues should reference 'product' (unrecognized key)
    const allMessages = zodErr!.issues.map((i) => JSON.stringify(i)).join(" ");
    expect(allMessages.toLowerCase()).toContain("product");
  });

  it("resolveConfig throws ZodError when evolveStyles contains unrecognized key 'custom'", () => {
    // 'custom' is also not in the EvolveTypeEnum
    expect(() =>
      resolveConfig(
        {},
        {
          evolveStyles: { custom: { stroke: "#888" } } as never,
        },
      ),
    ).toThrow(ZodError);
  });

  it("resolveConfig accepts all valid EvolveTypeEnum keys without throwing", () => {
    // All four valid keys: natural, ecosystem, forced, late
    expect(() =>
      resolveConfig(
        {},
        {
          evolveStyles: {
            natural: { stroke: "#ef4444" },
            ecosystem: { stroke: "#3b82f6" },
            forced: { stroke: "#22c55e" },
            late: { stroke: "#f59e0b" },
          },
        },
      ),
    ).not.toThrow();
  });

  it("resolveConfig accepts _default without any per-type key (optional _default)", () => {
    // _default is optional for evolveStyles (non-breaking evolution)
    expect(() =>
      resolveConfig(
        {},
        {
          evolveStyles: { _default: { stroke: "#666", strokeDasharray: "4,2" } },
        },
      ),
    ).not.toThrow();
  });

  it("resolveConfig accepts empty evolveStyles without throwing", () => {
    expect(() =>
      resolveConfig({}, { evolveStyles: {} }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Unrecognized-type diagnostics: nodeRadii
// ─────────────────────────────────────────────────────────────────────────────

describe("unrecognized-type diagnostics — nodeRadii (strict KNOWN_RENDERABLE_TYPES keys)", () => {
  it("resolveConfig throws ZodError when nodeRadii contains unrecognized key 'unknown-component'", () => {
    // nodeRadii schema uses typeStyleMapSchema with .strict() → unknown keys rejected
    expect(() =>
      resolveConfig(
        {},
        {
          nodeRadii: { _default: 5, "unknown-component": 8 } as never,
        },
      ),
    ).toThrow(ZodError);
  });

  it("ZodError for unrecognized nodeRadii key contains the key name in error info", () => {
    let zodErr: ZodError | null = null;
    try {
      resolveConfig(
        {},
        { nodeRadii: { _default: 5, "mystery-type": 12 } as never },
      );
    } catch (err) {
      if (err instanceof ZodError) zodErr = err;
    }
    expect(zodErr).not.toBeNull();
    const allMessages = zodErr!.issues.map((i) => JSON.stringify(i)).join(" ");
    expect(allMessages.toLowerCase()).toContain("mystery-type");
  });

  it("resolveConfig accepts valid nodeRadii with known renderable type keys", () => {
    // Known renderable types: component, user-need, pipeline, note, anchor
    expect(() =>
      resolveConfig(
        {},
        {
          nodeRadii: {
            _default: 5,
            component: 6,
            anchor: 4,
          },
        },
      ),
    ).not.toThrow();
  });

  it("resolveConfig requires _default in nodeRadii (requireDefault:true)", () => {
    // nodeRadii requires _default (unlike evolveStyles which makes it optional)
    expect(() =>
      resolveConfig(
        {},
        {
          nodeRadii: { component: 6 } as never, // missing required _default
        },
      ),
    ).toThrow(ZodError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Constraint-violation diagnostics: inspectable ConstraintViolation objects
// ─────────────────────────────────────────────────────────────────────────────

describe("constraint-violation diagnostics — inspectable ConstraintViolation objects", () => {
  it("checkConstraints returns inspectable violations for legend OOB (path, message, severity)", () => {
    // legend.position.x=900 > coordinateSpace.width=800 — constraint fires
    const input: ConstraintCheckInput = {
      coordinateSpace: { width: 800, height: 400 },
      legend: { position: { x: 900, y: 100 } },
    };
    const { valid, results } = checkConstraints(input);
    expect(valid).toBe(false);

    const legendResult = results.get("legendBoundsValidation")!;
    expect(legendResult.violations.length).toBeGreaterThan(0);

    const v: ConstraintViolation = legendResult.violations[0];
    // Path must be dot-notation
    expect(v.path).toMatch(/^legend\.position\.[xy]$/);
    // Message must be a non-empty actionable string
    expect(v.message.length).toBeGreaterThan(0);
    // Severity must be 'error' for OOB bounds violations
    expect(v.severity).toBe("error");
  });

  it("checkConstraints returns inspectable violations for layer dependency DAG break", () => {
    // evolvesTo layer requires nodes layer — turning nodes off while evolvesTo is on
    const input: ConstraintCheckInput = {
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    };
    const { valid, results } = checkConstraints(input);
    expect(valid).toBe(false);

    const layerResult = results.get("layerDependencies")!;
    expect(layerResult.violations.length).toBeGreaterThan(0);

    const v: ConstraintViolation = layerResult.violations[0];
    // Path uses dot-notation pointing to the dependent layer
    expect(v.path).toBe("filters.layers.evolvesTo");
    // Severity is 'error' for DAG violations
    expect(v.severity).toBe("error");
    // Message mentions the dependent ('evolvesTo') and required ('nodes') layers
    expect(v.message).toContain("evolvesTo");
    expect(v.message).toContain("nodes");
  });

  it("checkConstraints returns inspectable WARNING violations for phase/evolveStyles mismatch", () => {
    // 3 phases but only 2 explicit evolveStyles keys — advisory mismatch
    const input: ConstraintCheckInput = {
      background: {
        evolutionPhases: { phases: ["Genesis", "Custom", "Product"] },
      },
      evolveStyles: {
        natural: { stroke: "#ef4444" },
        ecosystem: { stroke: "#3b82f6" },
      },
    };
    const { valid, ok, results } = checkConstraints(input, [
      EXECUTABLE_CONSTRAINT_GRAPH[2], // phaseStyleAlignment
    ]);

    expect(valid).toBe(false); // has a violation
    expect(ok).toBe(true);    // only warning — does NOT block rendering

    const phaseResult = results.get("phaseStyleAlignment")!;
    const v = phaseResult.violations[0];
    expect(v.severity).toBe("warning"); // advisory, not blocking
    // Message contains both counts (3 phases, 2 keys)
    expect(v.message).toContain("3");
    expect(v.message).toContain("2");
  });

  it("checkConstraints results map contains separate per-constraint diagnostics", () => {
    // Both legend OOB (error) and phase mismatch (warning) in one config
    const input: ConstraintCheckInput = {
      coordinateSpace: { width: 500, height: 300 },
      legend: { position: { x: 600, y: 100 } },           // x=600 > width=500
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {} },                       // 3 phases, 1 key
    };

    const { results } = checkConstraints(input);

    // Legend bounds violation should be captured
    const legendDiag = results.get("legendBoundsValidation")!;
    expect(legendDiag.valid).toBe(false);
    expect(legendDiag.violations.some((v) => v.path === "legend.position.x")).toBe(true);

    // Phase alignment warning should be captured
    const phaseDiag = results.get("phaseStyleAlignment")!;
    expect(phaseDiag.valid).toBe(false);
    expect(phaseDiag.violations[0].severity).toBe("warning");

    // Diagnostics are independent per constraint slot
    expect(results.size).toBe(3); // one entry per constraint
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. End-to-end resolveConfig diagnostic flow
// ─────────────────────────────────────────────────────────────────────────────

describe("end-to-end resolveConfig diagnostic flow — Zod + constraint graph integration", () => {
  it("resolveConfig passes Zod AND constraint graph for fully valid config", () => {
    // Valid types, valid cross-field relationships
    expect(() =>
      resolveConfig(
        { theme: "dark" },
        {
          coordinateSpace: { width: 1600, height: 800 },
          legend: { position: { x: 100, y: 100 } }, // within bounds
          evolveStyles: { natural: { stroke: "#ef4444" } },
          filters: { layers: { nodes: true, evolvesTo: true, labels: true } },
        },
      ),
    ).not.toThrow();
  });

  it("resolveConfig surfaces Zod unrecognized-type error BEFORE constraint evaluation", () => {
    // An unknown evolveStyles key is caught by Zod first — ZodError, not ConstraintViolationError
    let thrownError: unknown = null;
    try {
      resolveConfig(
        {},
        {
          evolveStyles: { "phase-1": { stroke: "#000" } } as never, // unknown key
        },
        { violationPolicy: "throw" },
      );
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).toBeInstanceOf(ZodError);
    expect(thrownError).not.toBeInstanceOf(ConstraintViolationError);
  });

  it("resolveConfig with violationPolicy:'throw' surfaces constraint violations as ConstraintViolationError (not ZodError)", () => {
    // Config passes Zod (x=900 ≤ Zod max 1600) but fails constraint (x=900 > cs.width=800)
    let thrownError: unknown = null;
    try {
      resolveConfig(
        {},
        {
          coordinateSpace: { width: 800, height: 800 },
          legend: { position: { x: 900, y: 100 } },
        },
        { violationPolicy: "throw" },
      );
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).toBeInstanceOf(ConstraintViolationError);
    expect(thrownError).not.toBeInstanceOf(ZodError);

    // ConstraintViolationError carries the inspectable violations list
    const cve = thrownError as ConstraintViolationError;
    expect(cve.violations.length).toBeGreaterThan(0);
    const paths = cve.violations.map((v) => v.path);
    expect(paths).toContain("legend.position.x");
  });

  it("resolveConfig with violationPolicy:'warn' emits diagnostics without throwing for constraint violations", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // Passes Zod, fails constraint (OOB legend) — warn policy → no throw
      const { config: result } = resolveConfig(
        {},
        {
          coordinateSpace: { width: 600, height: 400 },
          legend: { position: { x: 700, y: 50 } }, // x=700 > width=600, ≤ Zod max 1600
        },
        { violationPolicy: "warn" },
      );
      // Config returned unchanged (warn policy)
      const pos = result.legend!.position as { x: number; y: number };
      expect(pos.x).toBe(700);
      // Console warning emitted for the violation
      expect(warnSpy).toHaveBeenCalled();
      const warnMessages = warnSpy.mock.calls.map((c) => c[0] as string);
      expect(warnMessages.some((m) => m.includes("legendBoundsValidation"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("resolveConfig with violationPolicy:'clip' auto-corrects legend OOB without throwing", () => {
    // Constraint clip: legend.x clamped to coordinateSpace.width
    const { config: result } = resolveConfig(
      {},
      {
        coordinateSpace: { width: 400, height: 300 },
        legend: { position: { x: 500, y: 50 } }, // x=500 > width=400, ≤ Zod default 1600
      },
      { violationPolicy: "clip" },
    );
    const pos = result.legend!.position as { x: number; y: number };
    expect(pos.x).toBe(400); // clamped to coordinateSpace.width
    expect(pos.y).toBe(50);  // y unchanged (within bounds)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Representative scenarios: unrecognized types + constraint violations combined
// ─────────────────────────────────────────────────────────────────────────────

describe("representative diagnostic scenarios — combined unrecognized types + violations", () => {
  it("scenario: evolveStyles with unknown key is Zod-rejected before any constraint fires", () => {
    // Even if there were ALSO a constraint violation, Zod rejects first
    expect(() =>
      resolveConfig(
        {},
        {
          // Unknown evolveStyles key → Zod rejects
          evolveStyles: { "genesis-phase": { stroke: "#f00" } } as never,
          // Legend OOB would be a constraint violation — but Zod fires first
          legend: { position: { x: 9999, y: 0 } },
        },
      ),
    ).toThrow(ZodError);
  });

  it("scenario: valid types + constraint violation → only constraint graph fires", () => {
    // All types valid, but layer dependency DAG is broken
    const input: ConstraintCheckInput = {
      filters: {
        layers: {
          nodes: false,   // required layer is off
          evolvesTo: true, // dependent layer is on → violation
          labels: true,    // dependent layer is on → violation
        },
      },
    };
    const { valid, ok, results } = checkConstraints(input);
    expect(valid).toBe(false);
    expect(ok).toBe(false); // error-severity violations
    // Both evolvesTo and labels are violated
    const layerViolations = results.get("layerDependencies")!.violations;
    expect(layerViolations).toHaveLength(2);
    const paths = layerViolations.map((v) => v.path);
    expect(paths.some((p) => p.includes("evolvesTo"))).toBe(true);
    expect(paths.some((p) => p.includes("labels"))).toBe(true);
  });

  it("scenario: config that passes all checks (no Zod error, no constraint violations)", () => {
    // All known evolveStyles keys (matching 4 phases), no OOB legend, consistent layer toggles.
    // Uses all 4 EvolveTypeEnum keys so phaseStyleAlignmentConstraint finds parity (4 phases = 4 keys).
    const input: ConstraintCheckInput = {
      coordinateSpace: { width: 1600, height: 800 },
      legend: { position: { x: 1600, y: 800 } }, // exactly at boundary → valid
      evolveStyles: {
        natural: { stroke: "#ef4444" },
        ecosystem: { stroke: "#3b82f6" },
        forced: { stroke: "#22c55e" },
        late: { stroke: "#f59e0b" },
        _default: { stroke: "#666" },
      },
      filters: { layers: { nodes: true, evolvesTo: true, labels: true } },
      background: {
        evolutionPhases: {
          phases: ["Genesis", "Custom", "Product", "Commodity"],
        },
      },
    };

    // No Zod error (valid types)
    const config = makeConfig(input as Record<string, unknown>);

    // No constraint violations — 4 explicit evolveStyles keys match 4 phases
    const { valid, ok } = checkConstraints(config as ConstraintCheckInput);
    expect(valid).toBe(true);
    expect(ok).toBe(true);
  });

  it("scenario: warnings-only config is ok=true (does not block rendering)", () => {
    // Phase mismatch is advisory only (warning severity)
    // Config passes Zod AND constraint graph (ok), but has a warning
    const input: ConstraintCheckInput = {
      background: {
        evolutionPhases: { phases: ["Genesis", "Custom", "Product"] }, // 3 phases
      },
      evolveStyles: { natural: {}, ecosystem: {} }, // 2 keys — mismatch
    };

    const { valid, ok } = checkConstraints(input, [
      EXECUTABLE_CONSTRAINT_GRAPH[2], // phaseStyleAlignment
    ]);
    expect(valid).toBe(false); // has a violation record
    expect(ok).toBe(true);    // but it's only a warning → ok for rendering
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. resolveConfig { config, diagnostics } return value — unrecognized types
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveConfig { config, diagnostics } — unrecognized types in typeColors", () => {
  it("diagnostics.unrecognizedTypes is empty for fully recognized typeColors", () => {
    // All keys are recognized: _default + known renderable types
    const { diagnostics } = resolveConfig(
      {},
      {
        typeColors: { _default: "#374151", component: "#dc2626", anchor: "#2563eb" },
      },
    );
    expect(diagnostics.unrecognizedTypes).toHaveLength(0);
  });

  it("diagnostics.unrecognizedTypes captures future-type key in typeColors (catchall schema)", () => {
    // typeColors uses .catchall() → 'future-type' passes Zod but appears in diagnostics
    const { diagnostics } = resolveConfig(
      {},
      {
        typeColors: { _default: "#374151", "future-type": "#f59e0b" } as never,
      },
    );
    // 'future-type' is not in KNOWN_RENDERABLE_TYPES → unrecognized
    expect(diagnostics.unrecognizedTypes).toContain("future-type");
  });

  it("diagnostics.unrecognizedTypes captures all unrecognized keys when multiple are present", () => {
    const { diagnostics } = resolveConfig(
      {},
      {
        typeColors: {
          _default: "#374151",
          "stale-type-a": "#ef4444",
          "stale-type-b": "#3b82f6",
          component: "#22c55e", // recognized — should NOT appear
        } as never,
      },
    );
    expect(diagnostics.unrecognizedTypes).toContain("stale-type-a");
    expect(diagnostics.unrecognizedTypes).toContain("stale-type-b");
    // 'component' is recognized — not in unrecognizedTypes
    expect(diagnostics.unrecognizedTypes).not.toContain("component");
    expect(diagnostics.unrecognizedTypes).not.toContain("_default");
  });

  it("resolveConfig returns both config AND diagnostics as a two-field result", () => {
    const result = resolveConfig({}, {});
    // Must have both properties
    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("diagnostics");
    // config is a valid RenderConfig (strokeWidth defaults to 1)
    expect(result.config.strokeWidth).toBe(1);
    // diagnostics has the three arrays
    expect(result.diagnostics).toHaveProperty("unrecognizedTypes");
    expect(result.diagnostics).toHaveProperty("constraintViolations");
    expect(result.diagnostics).toHaveProperty("warnings");
  });

  it("diagnostics.unrecognizedTypes is empty when no TypeStyleMap fields are set", () => {
    const { diagnostics } = resolveConfig({}, { strokeWidth: 2 });
    expect(diagnostics.unrecognizedTypes).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. collectConfigDiagnostics — direct inspection of TypeStyleMap fields
// ─────────────────────────────────────────────────────────────────────────────

describe("collectConfigDiagnostics — unrecognized-type detection", () => {
  it("returns EMPTY_RESOLVE_DIAGNOSTICS-equivalent for recognized config", () => {
    const diag = collectConfigDiagnostics({
      typeColors: { _default: "#374151", component: "#dc2626" },
    });
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });

  it("detects unrecognized key in typeColors (catchall schema)", () => {
    const diag = collectConfigDiagnostics({
      typeColors: { _default: "#000", "legacy-component": "#f00" },
    });
    expect(diag.unrecognizedTypes).toHaveLength(1);
    expect(diag.unrecognizedTypes[0].type).toBe("legacy-component");
    expect(diag.unrecognizedTypes[0].field).toBe("typeColors");
    expect(diag.unrecognizedTypes[0].recognitionLevel).toBe("unrecognized");
  });

  it("detects multiple unrecognized keys across typeColors", () => {
    const diag = collectConfigDiagnostics({
      typeColors: {
        _default: "#000",
        "type-alpha": "#f00",
        "type-beta": "#0f0",
        component: "#00f", // recognized — excluded
      },
    });
    const unrecognized = diag.unrecognizedTypes.map((e) => e.type);
    expect(unrecognized).toContain("type-alpha");
    expect(unrecognized).toContain("type-beta");
    expect(unrecognized).not.toContain("component");
    expect(unrecognized).not.toContain("_default");
  });

  it("returns empty diagnostics for absent typeColors/evolveStyles/nodeRadii", () => {
    const diag = collectConfigDiagnostics({});
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });

  it("createDiagnosticsCollector creates an empty mutable collector", () => {
    const collector = createDiagnosticsCollector();
    expect(collector.unrecognizedTypes).toHaveLength(0);
    // Must be mutable (Array, not ReadonlyArray)
    expect(Array.isArray(collector.unrecognizedTypes)).toBe(true);
  });

  it("EMPTY_RESOLVE_DIAGNOSTICS has zero unrecognized types", () => {
    expect(EMPTY_RESOLVE_DIAGNOSTICS.unrecognizedTypes).toHaveLength(0);
  });
});
