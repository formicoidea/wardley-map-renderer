/**
 * config-constraint-graph.test.ts
 *
 * Tests for Sub-AC 2 executable constraint implementations:
 *   - legendBoundsValidation
 *   - layerDependenciesConstraint
 *   - phaseStyleAlignmentConstraint
 *   - CONFIG_CONSTRAINT_GRAPH (populated declarative graph)
 *   - EXECUTABLE_CONSTRAINT_GRAPH (flat array)
 *   - checkConstraints (aggregation utility)
 *
 * Also exercises the Sub-AC 1 skeleton types via the populated graph.
 */

import { describe, it, expect } from "vitest";
import {
  // Sub-AC 1 types/values
  EMPTY_CONFIG_CONSTRAINT_GRAPH,
  // Sub-AC 2 implementations
  legendBoundsValidation,
  layerDependenciesConstraint,
  phaseStyleAlignmentConstraint,
  CONFIG_CONSTRAINT_GRAPH,
  EXECUTABLE_CONSTRAINT_GRAPH,
  checkConstraints,
  type ConstraintCheckInput,
  type ConstraintResult,
  type ConstraintViolation,
  type ExecutableConstraint,
} from "./config-constraint-graph.js";
import { DEFAULT_COORDINATE_SPACE } from "./coordinate-space.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function expectValid(result: ConstraintResult, label = "") {
  const prefix = label ? `[${label}] ` : "";
  expect(result.valid, `${prefix}valid`).toBe(true);
  expect(result.ok, `${prefix}ok`).toBe(true);
  expect(result.violations, `${prefix}violations`).toHaveLength(0);
}

function expectViolation(
  result: ConstraintResult,
  opts: {
    count?: number;
    severity?: "error" | "warning";
    pathIncludes?: string;
  } = {},
) {
  expect(result.valid).toBe(false);
  if (opts.count !== undefined) {
    expect(result.violations).toHaveLength(opts.count);
  } else {
    expect(result.violations.length).toBeGreaterThan(0);
  }
  if (opts.severity !== undefined) {
    for (const v of result.violations) {
      expect(v.severity).toBe(opts.severity);
    }
  }
  if (opts.pathIncludes !== undefined) {
    const paths = result.violations.map((v) => v.path);
    expect(paths.some((p) => p.includes(opts.pathIncludes!))).toBe(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// legendBoundsValidation
// ─────────────────────────────────────────────────────────────────────────────

describe("legendBoundsValidation", () => {
  it("has id 'legendBoundsValidation'", () => {
    expect(legendBoundsValidation.id).toBe("legendBoundsValidation");
  });

  it("has metadata with source='coordinateSpace' and target='legend'", () => {
    expect(legendBoundsValidation.metadata.source).toBe("coordinateSpace");
    expect(legendBoundsValidation.metadata.target).toBe("legend");
  });

  it("has metadata violationPolicy='error'", () => {
    expect(legendBoundsValidation.metadata.violationPolicy).toBe("error");
  });

  it("returns valid for empty config (no legend)", () => {
    expectValid(legendBoundsValidation.check({}), "empty config");
  });

  it("returns valid when legend.position is absent", () => {
    expectValid(legendBoundsValidation.check({ legend: {} }), "legend without position");
  });

  it("returns valid for named position 'top-left'", () => {
    expectValid(
      legendBoundsValidation.check({ legend: { position: "top-left" } }),
      "top-left",
    );
  });

  it("returns valid for named position 'bottom-right'", () => {
    expectValid(
      legendBoundsValidation.check({ legend: { position: "bottom-right" } }),
      "bottom-right",
    );
  });

  it("returns valid for named position 'auto'", () => {
    expectValid(
      legendBoundsValidation.check({ legend: { position: "auto" } }),
      "auto",
    );
  });

  it("returns valid for any arbitrary named string position", () => {
    expectValid(
      legendBoundsValidation.check({ legend: { position: "some-custom-string" } }),
      "arbitrary string",
    );
  });

  it("returns valid for {x,y} at origin (0,0)", () => {
    expectValid(
      legendBoundsValidation.check({ legend: { position: { x: 0, y: 0 } } }),
      "origin",
    );
  });

  it("returns valid for {x,y} within default canvas bounds", () => {
    expectValid(
      legendBoundsValidation.check({
        legend: { position: { x: 800, y: 400 } },
      }),
      "midpoint",
    );
  });

  it("returns valid for {x,y} at exact canvas edge (default 1600×800)", () => {
    const w = DEFAULT_COORDINATE_SPACE.width;
    const h = DEFAULT_COORDINATE_SPACE.height;
    expectValid(
      legendBoundsValidation.check({ legend: { position: { x: w, y: h } } }),
      "exact edge",
    );
  });

  it("returns error for x beyond default canvas width", () => {
    const result = legendBoundsValidation.check({
      legend: { position: { x: DEFAULT_COORDINATE_SPACE.width + 1, y: 0 } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "legend.position.x" });
  });

  it("returns error for y beyond default canvas height", () => {
    const result = legendBoundsValidation.check({
      legend: { position: { x: 0, y: DEFAULT_COORDINATE_SPACE.height + 1 } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "legend.position.y" });
  });

  it("returns two errors when both x and y are out of bounds", () => {
    const result = legendBoundsValidation.check({
      legend: {
        position: {
          x: DEFAULT_COORDINATE_SPACE.width + 100,
          y: DEFAULT_COORDINATE_SPACE.height + 100,
        },
      },
    });
    expectViolation(result, { count: 2, severity: "error" });
    const paths = result.violations.map((v) => v.path);
    expect(paths).toContain("legend.position.x");
    expect(paths).toContain("legend.position.y");
  });

  it("returns error for negative x", () => {
    const result = legendBoundsValidation.check({
      legend: { position: { x: -1, y: 0 } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "legend.position.x" });
  });

  it("returns error for negative y", () => {
    const result = legendBoundsValidation.check({
      legend: { position: { x: 0, y: -1 } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "legend.position.y" });
  });

  it("uses custom coordinateSpace.width for bounds check", () => {
    // x=900 exceeds custom width=800 but is within default 1600
    const result = legendBoundsValidation.check({
      coordinateSpace: { width: 800, height: 600 },
      legend: { position: { x: 900, y: 100 } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "legend.position.x" });
  });

  it("uses custom coordinateSpace.height for bounds check", () => {
    // y=700 exceeds custom height=600 but is within default 800
    const result = legendBoundsValidation.check({
      coordinateSpace: { width: 800, height: 600 },
      legend: { position: { x: 100, y: 700 } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "legend.position.y" });
  });

  it("returns valid for XY within custom coordinateSpace bounds", () => {
    expectValid(
      legendBoundsValidation.check({
        coordinateSpace: { width: 800, height: 600 },
        legend: { position: { x: 800, y: 600 } },
      }),
      "exact custom edge",
    );
  });

  it("returns valid for XY at custom canvas exact boundary", () => {
    expectValid(
      legendBoundsValidation.check({
        coordinateSpace: { width: 1200, height: 900 },
        legend: { position: { x: 1200, y: 900 } },
      }),
      "custom exact edge 1200×900",
    );
  });

  it("violation message mentions the offending value and canvas bound", () => {
    const result = legendBoundsValidation.check({
      coordinateSpace: { width: 500, height: 400 },
      legend: { position: { x: 999, y: 0 } },
    });
    expect(result.violations[0].message).toContain("999");
    expect(result.violations[0].message).toContain("500");
  });

  it("ok is false when x is out of bounds (error severity)", () => {
    const result = legendBoundsValidation.check({
      legend: { position: { x: 9999, y: 0 } },
    });
    expect(result.ok).toBe(false);
  });

  it("has a non-empty rule in metadata", () => {
    expect(legendBoundsValidation.metadata.rule.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// layerDependenciesConstraint
// ─────────────────────────────────────────────────────────────────────────────

describe("layerDependenciesConstraint", () => {
  it("has id 'layerDependencies'", () => {
    expect(layerDependenciesConstraint.id).toBe("layerDependencies");
  });

  it("has metadata source/target relating to filters.layers", () => {
    expect(layerDependenciesConstraint.metadata.source).toContain("filters");
    expect(layerDependenciesConstraint.metadata.target).toContain("filters");
  });

  it("has metadata violationPolicy='error'", () => {
    expect(layerDependenciesConstraint.metadata.violationPolicy).toBe("error");
  });

  it("returns valid for empty config (all layers default to true)", () => {
    expectValid(layerDependenciesConstraint.check({}), "empty config");
  });

  it("returns valid when filters is absent", () => {
    expectValid(layerDependenciesConstraint.check({ legend: {} }), "no filters");
  });

  it("returns valid when filters.layers is absent", () => {
    expectValid(layerDependenciesConstraint.check({ filters: {} }), "no layers");
  });

  it("returns valid when all layers are explicitly true", () => {
    expectValid(
      layerDependenciesConstraint.check({
        filters: { layers: { nodes: true, evolvesTo: true, labels: true } },
      }),
      "all true",
    );
  });

  it("returns valid when nodes=true and evolvesTo=false", () => {
    // Dependent is off even though required is on — no violation
    expectValid(
      layerDependenciesConstraint.check({
        filters: { layers: { nodes: true, evolvesTo: false } },
      }),
      "nodes=true, evolvesTo=false",
    );
  });

  it("returns valid when nodes=true and labels=false", () => {
    expectValid(
      layerDependenciesConstraint.check({
        filters: { layers: { nodes: true, labels: false } },
      }),
      "nodes=true, labels=false",
    );
  });

  it("returns valid when nodes=false AND evolvesTo=false AND labels=false", () => {
    // All dependents are also turned off — consistent state
    expectValid(
      layerDependenciesConstraint.check({
        filters: { layers: { nodes: false, evolvesTo: false, labels: false } },
      }),
      "nodes=false, both dependents=false",
    );
  });

  it("returns error when nodes=false and evolvesTo defaults to true", () => {
    // evolvesTo absent → defaults to true (visible) while nodes=false
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false } },
    });
    // Both evolvesTo and labels default to true → 2 violations
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("returns error for evolvesTo=true when nodes=false", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "evolvesTo" });
  });

  it("returns error for labels=true when nodes=false", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: false, labels: true } },
    });
    expectViolation(result, { count: 1, severity: "error", pathIncludes: "labels" });
  });

  it("returns two errors when nodes=false and both evolvesTo=true and labels=true", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: true, labels: true } },
    });
    expectViolation(result, { count: 2, severity: "error" });
    const paths = result.violations.map((v) => v.path);
    expect(paths.some((p) => p.includes("evolvesTo"))).toBe(true);
    expect(paths.some((p) => p.includes("labels"))).toBe(true);
  });

  it("violation path uses dot-notation format", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    expect(result.violations[0].path).toBe("filters.layers.evolvesTo");
  });

  it("violation message mentions both dependent and required layer names", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    expect(result.violations[0].message).toContain("evolvesTo");
    expect(result.violations[0].message).toContain("nodes");
  });

  it("violation message contains actionable guidance", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    // Should mention setting evolvesTo to false
    expect(result.violations[0].message).toContain("false");
  });

  it("ok is false for error-severity violations", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    expect(result.ok).toBe(false);
  });

  it("has a non-empty rule in metadata", () => {
    expect(layerDependenciesConstraint.metadata.rule.length).toBeGreaterThan(10);
  });

  it("rule mentions 'LAYER_TOGGLE_DAG'", () => {
    expect(layerDependenciesConstraint.metadata.rule).toContain("LAYER_TOGGLE_DAG");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phaseStyleAlignmentConstraint
// ─────────────────────────────────────────────────────────────────────────────

describe("phaseStyleAlignmentConstraint", () => {
  it("has id 'phaseStyleAlignment'", () => {
    expect(phaseStyleAlignmentConstraint.id).toBe("phaseStyleAlignment");
  });

  it("has metadata source containing 'phases' and target='evolveStyles'", () => {
    expect(phaseStyleAlignmentConstraint.metadata.source).toContain("phases");
    expect(phaseStyleAlignmentConstraint.metadata.target).toBe("evolveStyles");
  });

  it("has metadata violationPolicy='warn'", () => {
    expect(phaseStyleAlignmentConstraint.metadata.violationPolicy).toBe("warn");
  });

  it("returns valid for empty config (neither field present)", () => {
    expectValid(phaseStyleAlignmentConstraint.check({}), "empty config");
  });

  it("skips check when phases is absent", () => {
    expectValid(
      phaseStyleAlignmentConstraint.check({
        evolveStyles: { natural: { stroke: "#000" } },
      }),
      "no phases",
    );
  });

  it("skips check when evolveStyles is absent", () => {
    expectValid(
      phaseStyleAlignmentConstraint.check({
        background: { evolutionPhases: { phases: ["A", "B", "C", "D"] } },
      }),
      "no evolveStyles",
    );
  });

  it("skips check when evolveStyles has only _default (no per-type keys)", () => {
    expectValid(
      phaseStyleAlignmentConstraint.check({
        background: { evolutionPhases: { phases: ["A", "B", "C"] } },
        evolveStyles: { _default: { stroke: "#888" } },
      }),
      "only _default",
    );
  });

  it("returns valid when 4 phases match 4 explicit evolveStyles keys", () => {
    expectValid(
      phaseStyleAlignmentConstraint.check({
        background: { evolutionPhases: { phases: ["A", "B", "C", "D"] } },
        evolveStyles: {
          natural: { stroke: "#f00" },
          ecosystem: { stroke: "#0f0" },
          forced: { stroke: "#00f" },
          late: { stroke: "#ff0" },
        },
      }),
      "4 phases, 4 keys",
    );
  });

  it("returns valid when 2 phases match 2 explicit evolveStyles keys", () => {
    expectValid(
      phaseStyleAlignmentConstraint.check({
        background: { evolutionPhases: { phases: ["X", "Y"] } },
        evolveStyles: { natural: {}, ecosystem: {} },
      }),
      "2 phases, 2 keys",
    );
  });

  it("returns warning when phase count ≠ evolveStyles key count", () => {
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {}, ecosystem: {} },
    });
    expectViolation(result, { count: 1, severity: "warning" });
  });

  it("warning severity means ok=true (warnings don't block rendering)", () => {
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B"] } },
      evolveStyles: { natural: {}, ecosystem: {}, forced: {} },
    });
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(true); // ok=true because only warnings
  });

  it("violation path is 'background.evolutionPhases.phases'", () => {
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {} },
    });
    expect(result.violations[0].path).toBe("background.evolutionPhases.phases");
  });

  it("violation message includes both counts", () => {
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {}, ecosystem: {} },
    });
    // 3 phases, 2 keys
    expect(result.violations[0].message).toContain("3");
    expect(result.violations[0].message).toContain("2");
  });

  it("violation message lists the declared evolveStyles keys", () => {
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {}, ecosystem: {} },
    });
    expect(result.violations[0].message).toContain("natural");
    expect(result.violations[0].message).toContain("ecosystem");
  });

  it("violation message mentions _default as a fallback option", () => {
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {} },
    });
    expect(result.violations[0].message).toContain("_default");
  });

  it("skips _default when counting evolveStyles keys but counts per-type keys", () => {
    // 2 per-type keys (natural, ecosystem) plus _default — _default should not be counted
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { _default: {}, natural: {}, ecosystem: {} },
    });
    // 3 phases vs 2 per-type keys (natural + ecosystem) — mismatch → warning
    expect(result.valid).toBe(false);
    expect(result.violations[0].message).toContain("2"); // 2 per-type keys
    expect(result.violations[0].message).toContain("3"); // 3 phases
  });

  it("ignores undefined values in evolveStyles when counting keys", () => {
    // forced is present as undefined — should not be counted
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {}, ecosystem: {}, forced: undefined },
    });
    // 3 phases vs 2 defined keys → warning
    expect(result.valid).toBe(false);
  });

  it("returns valid for 1 phase matching 1 explicit key", () => {
    expectValid(
      phaseStyleAlignmentConstraint.check({
        background: { evolutionPhases: { phases: ["Solo"] } },
        evolveStyles: { natural: {} },
      }),
      "1 phase, 1 key",
    );
  });

  it("has a non-empty rule in metadata", () => {
    expect(phaseStyleAlignmentConstraint.metadata.rule.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG_CONSTRAINT_GRAPH — populated declarative graph
// ─────────────────────────────────────────────────────────────────────────────

describe("CONFIG_CONSTRAINT_GRAPH", () => {
  it("has the three required slots", () => {
    expect(CONFIG_CONSTRAINT_GRAPH).toHaveProperty("legendBoundsValidation");
    expect(CONFIG_CONSTRAINT_GRAPH).toHaveProperty("layerDependencies");
    expect(CONFIG_CONSTRAINT_GRAPH).toHaveProperty("phaseStyleAlignment");
  });

  it("legendBoundsValidation slot has name='legendBoundsValidation'", () => {
    expect(CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.name).toBe("legendBoundsValidation");
  });

  it("layerDependencies slot has name='layerDependencies'", () => {
    expect(CONFIG_CONSTRAINT_GRAPH.layerDependencies.name).toBe("layerDependencies");
  });

  it("phaseStyleAlignment slot has name='phaseStyleAlignment'", () => {
    expect(CONFIG_CONSTRAINT_GRAPH.phaseStyleAlignment.name).toBe("phaseStyleAlignment");
  });

  it("each slot has a non-empty description", () => {
    expect(CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.description.length).toBeGreaterThan(10);
    expect(CONFIG_CONSTRAINT_GRAPH.layerDependencies.description.length).toBeGreaterThan(10);
    expect(CONFIG_CONSTRAINT_GRAPH.phaseStyleAlignment.description.length).toBeGreaterThan(10);
  });

  it("each slot has at least one constraint", () => {
    expect(CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.constraints).toHaveLength(1);
    expect(CONFIG_CONSTRAINT_GRAPH.layerDependencies.constraints).toHaveLength(1);
    expect(CONFIG_CONSTRAINT_GRAPH.phaseStyleAlignment.constraints).toHaveLength(1);
  });

  it("legendBoundsValidation constraint has source='coordinateSpace'", () => {
    const c = CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.constraints[0];
    expect(c.source).toBe("coordinateSpace");
  });

  it("layerDependencies constraint has violationPolicy='error'", () => {
    const c = CONFIG_CONSTRAINT_GRAPH.layerDependencies.constraints[0];
    expect(c.violationPolicy).toBe("error");
  });

  it("phaseStyleAlignment constraint has violationPolicy='warn'", () => {
    const c = CONFIG_CONSTRAINT_GRAPH.phaseStyleAlignment.constraints[0];
    expect(c.violationPolicy).toBe("warn");
  });

  it("is JSON-serialisable (no functions)", () => {
    expect(() => JSON.stringify(CONFIG_CONSTRAINT_GRAPH)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(CONFIG_CONSTRAINT_GRAPH));
    expect(parsed).toHaveProperty("legendBoundsValidation");
    expect(parsed).toHaveProperty("layerDependencies");
    expect(parsed).toHaveProperty("phaseStyleAlignment");
  });

  it("differs from EMPTY_CONFIG_CONSTRAINT_GRAPH (slots are populated)", () => {
    expect(CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.constraints).not.toEqual(
      EMPTY_CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.constraints,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTABLE_CONSTRAINT_GRAPH — flat array
// ─────────────────────────────────────────────────────────────────────────────

describe("EXECUTABLE_CONSTRAINT_GRAPH", () => {
  it("contains exactly 3 constraints", () => {
    expect(EXECUTABLE_CONSTRAINT_GRAPH).toHaveLength(3);
  });

  it("first constraint is legendBoundsValidation", () => {
    expect(EXECUTABLE_CONSTRAINT_GRAPH[0].id).toBe("legendBoundsValidation");
  });

  it("second constraint is layerDependencies", () => {
    expect(EXECUTABLE_CONSTRAINT_GRAPH[1].id).toBe("layerDependencies");
  });

  it("third constraint is phaseStyleAlignment", () => {
    expect(EXECUTABLE_CONSTRAINT_GRAPH[2].id).toBe("phaseStyleAlignment");
  });

  it("each entry has id, metadata, and check function", () => {
    for (const c of EXECUTABLE_CONSTRAINT_GRAPH) {
      expect(typeof c.id).toBe("string");
      expect(typeof c.metadata).toBe("object");
      expect(typeof c.check).toBe("function");
    }
  });

  it("all IDs are unique", () => {
    const ids = EXECUTABLE_CONSTRAINT_GRAPH.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the same constraint instances as the named exports", () => {
    expect(EXECUTABLE_CONSTRAINT_GRAPH[0]).toBe(legendBoundsValidation);
    expect(EXECUTABLE_CONSTRAINT_GRAPH[1]).toBe(layerDependenciesConstraint);
    expect(EXECUTABLE_CONSTRAINT_GRAPH[2]).toBe(phaseStyleAlignmentConstraint);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkConstraints
// ─────────────────────────────────────────────────────────────────────────────

describe("checkConstraints", () => {
  it("returns valid=true, ok=true for an empty config", () => {
    const { valid, ok } = checkConstraints({});
    expect(valid).toBe(true);
    expect(ok).toBe(true);
  });

  it("results map contains entries for all three constraint IDs", () => {
    const { results } = checkConstraints({});
    expect(results.has("legendBoundsValidation")).toBe(true);
    expect(results.has("layerDependencies")).toBe(true);
    expect(results.has("phaseStyleAlignment")).toBe(true);
  });

  it("all per-constraint results are valid for empty config", () => {
    const { results } = checkConstraints({});
    for (const result of results.values()) {
      expect(result.valid).toBe(true);
    }
  });

  it("returns valid=false when legend position is out of bounds (error)", () => {
    const { valid, ok } = checkConstraints({
      legend: { position: { x: 9999, y: 0 } },
    });
    expect(valid).toBe(false);
    expect(ok).toBe(false);
  });

  it("correct per-constraint result for legend violation", () => {
    const { results } = checkConstraints({
      legend: { position: { x: 9999, y: 0 } },
    });
    expect(results.get("legendBoundsValidation")!.valid).toBe(false);
    // Other constraints should be valid
    expect(results.get("layerDependencies")!.valid).toBe(true);
    expect(results.get("phaseStyleAlignment")!.valid).toBe(true);
  });

  it("returns valid=false when layer dependency is violated (error)", () => {
    const { valid, ok } = checkConstraints({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    expect(valid).toBe(false);
    expect(ok).toBe(false);
  });

  it("returns valid=false but ok=true for only phase style warning", () => {
    const { valid, ok } = checkConstraints({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {} },
    });
    expect(valid).toBe(false);
    expect(ok).toBe(true); // only warning, no error
  });

  it("returns valid=false and ok=false when both error and warning violations exist", () => {
    // Legend out of bounds (error) + phase mismatch (warning)
    const { valid, ok } = checkConstraints({
      legend: { position: { x: 9999, y: 0 } },
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {} },
    });
    expect(valid).toBe(false);
    expect(ok).toBe(false);
  });

  it("accepts a custom graph of a single constraint", () => {
    // Only run legendBoundsValidation
    const { results } = checkConstraints(
      { legend: { position: { x: 9999, y: 0 } } },
      [legendBoundsValidation],
    );
    expect(results.size).toBe(1);
    expect(results.has("legendBoundsValidation")).toBe(true);
    expect(results.has("layerDependencies")).toBe(false);
  });

  it("returns valid=true for empty graph", () => {
    const { valid, ok } = checkConstraints({}, []);
    expect(valid).toBe(true);
    expect(ok).toBe(true);
  });

  it("results is a ReadonlyMap (not a plain object)", () => {
    const { results } = checkConstraints({});
    expect(results instanceof Map).toBe(true);
    expect(typeof (results as unknown as Map<string, unknown>).get).toBe("function");
  });

  it("layerDependencies violation is visible via results.get()", () => {
    const { results } = checkConstraints({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    const layerResult = results.get("layerDependencies");
    expect(layerResult).toBeDefined();
    expect(layerResult!.valid).toBe(false);
    expect(layerResult!.violations[0].path).toBe("filters.layers.evolvesTo");
  });

  it("phaseStyleAlignment violation is visible via results.get()", () => {
    const { results } = checkConstraints({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {}, ecosystem: {} },
    });
    const phaseResult = results.get("phaseStyleAlignment");
    expect(phaseResult).toBeDefined();
    expect(phaseResult!.valid).toBe(false);
    expect(phaseResult!.ok).toBe(true); // warning only
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY_CONFIG_CONSTRAINT_GRAPH (Sub-AC 1 backward compat)
// ─────────────────────────────────────────────────────────────────────────────

describe("EMPTY_CONFIG_CONSTRAINT_GRAPH", () => {
  it("has the three required slots", () => {
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH).toHaveProperty("legendBoundsValidation");
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH).toHaveProperty("layerDependencies");
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH).toHaveProperty("phaseStyleAlignment");
  });

  it("all constraint arrays are empty", () => {
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.constraints).toHaveLength(0);
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH.layerDependencies.constraints).toHaveLength(0);
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH.phaseStyleAlignment.constraints).toHaveLength(0);
  });

  it("slot names match their slot keys", () => {
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH.legendBoundsValidation.name).toBe("legendBoundsValidation");
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH.layerDependencies.name).toBe("layerDependencies");
    expect(EMPTY_CONFIG_CONSTRAINT_GRAPH.phaseStyleAlignment.name).toBe("phaseStyleAlignment");
  });

  it("is JSON-serialisable", () => {
    expect(() => JSON.stringify(EMPTY_CONFIG_CONSTRAINT_GRAPH)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ConstraintResult shape validation
// ─────────────────────────────────────────────────────────────────────────────

describe("ConstraintResult shape", () => {
  it("valid=true implies violations is empty array", () => {
    const result = legendBoundsValidation.check({});
    if (result.valid) {
      expect(result.violations).toHaveLength(0);
    }
  });

  it("valid=false implies violations has at least one entry", () => {
    const result = legendBoundsValidation.check({
      legend: { position: { x: 9999, y: 0 } },
    });
    if (!result.valid) {
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  it("ok=false implies at least one error-severity violation", () => {
    const result = layerDependenciesConstraint.check({
      filters: { layers: { nodes: false, evolvesTo: true, labels: false } },
    });
    if (!result.ok) {
      const hasError = result.violations.some((v) => v.severity === "error");
      expect(hasError).toBe(true);
    }
  });

  it("ok=true with valid=false means only warning violations", () => {
    const result = phaseStyleAlignmentConstraint.check({
      background: { evolutionPhases: { phases: ["A", "B", "C"] } },
      evolveStyles: { natural: {} },
    });
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(true);
    for (const v of result.violations) {
      expect(v.severity).toBe("warning");
    }
  });
});
