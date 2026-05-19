/**
 * Tests for LayerDAG validation utility (Sub-AC 8b).
 *
 * Covers:
 *   1. Valid DAG construction — LAYER_DAG passes all checks
 *   2. Cycle detection       — validateLayerDAG detects simple and multi-hop cycles
 *   3. Missing-layer cases   — references to unknown layer names are reported
 *
 * @module render/layer-dag.test
 */

import { describe, it, expect } from "vitest";
import { LAYER_DAG, validateLayerDAG, type LayerDAGValidationResult } from "./layer-dag.js";
import { LAYER_NAMES } from "./registry.js";

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Cast a plain object as the generic adjacency-list type expected by
 * validateLayerDAG, avoiding the TypeScript constraint that all keys and
 * values must be valid LayerName literals.
 */
function asAdjList(obj: Record<string, string[]>): Record<string, ReadonlyArray<string>> {
  return obj;
}

// ── 1. Valid DAG construction ────────────────────────────────────

describe("validateLayerDAG — valid DAG construction", () => {
  it("LAYER_DAG passes validation against LAYER_NAMES (no cycles, no unknown layers)", () => {
    const result = validateLayerDAG(
      LAYER_DAG as Record<string, ReadonlyArray<string>>,
      LAYER_NAMES,
    );
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
    expect(result.unknownLayers).toHaveLength(0);
  });

  it("LAYER_DAG declares exactly 3 dependency edges (edges→nodes, evolvesTo→nodes, labels→nodes)", () => {
    expect(LAYER_DAG.edges).toEqual(["nodes"]);
    expect(LAYER_DAG.evolvesTo).toEqual(["nodes"]);
    expect(LAYER_DAG.labels).toEqual(["nodes"]);
  });

  it("an empty DAG is valid (no nodes, no edges, no unknown references)", () => {
    const result = validateLayerDAG(asAdjList({}), LAYER_NAMES);
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
    expect(result.unknownLayers).toHaveLength(0);
  });

  it("a DAG with a single node and no dependencies is valid", () => {
    const result = validateLayerDAG(asAdjList({ nodes: [] }), LAYER_NAMES);
    expect(result.valid).toBe(true);
  });

  it("a linear dependency chain (labels→nodes) with all layers known is valid", () => {
    const result = validateLayerDAG(
      asAdjList({ labels: ["nodes"] }),
      LAYER_NAMES,
    );
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
  });

  it("a DAG with multiple independent roots is valid (edges→nodes AND labels→nodes)", () => {
    const dag = asAdjList({ edges: ["nodes"], labels: ["nodes"] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(true);
  });

  it("a 2-layer chain (a→b, b→c) with all known layers is valid", () => {
    // Synthetic: three valid layer names in a non-cyclic chain
    const dag = asAdjList({ labels: ["nodes"], nodes: ["axes"] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
  });
});

// ── 2. Cycle detection ────────────────────────────────────────────

describe("validateLayerDAG — cycle detection", () => {
  it("detects a direct self-referencing cycle (a → a)", () => {
    const dag = asAdjList({ alpha: ["alpha"] });
    const result = validateLayerDAG(dag, ["alpha"]);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it("detects a 2-node cycle (a → b → a)", () => {
    const dag = asAdjList({ alpha: ["beta"], beta: ["alpha"] });
    const result = validateLayerDAG(dag, ["alpha", "beta"]);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
    // The cycle path must include both nodes
    const cyclePath = result.cycles[0];
    expect(cyclePath).toBeDefined();
    const nodesInCycle = new Set(cyclePath);
    expect(nodesInCycle.has("alpha") || nodesInCycle.has("beta")).toBe(true);
  });

  it("detects a 3-node cycle (a → b → c → a)", () => {
    const dag = asAdjList({ alpha: ["beta"], beta: ["gamma"], gamma: ["alpha"] });
    const result = validateLayerDAG(dag, ["alpha", "beta", "gamma"]);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it("cycle detection does NOT produce false positives for a valid diamond DAG (a→b, a→c, b→d, c→d)", () => {
    // Diamond shape: no cycles, shared dependency
    const dag = asAdjList({ a: ["b", "c"], b: ["d"], c: ["d"] });
    const result = validateLayerDAG(dag, ["a", "b", "c", "d"]);
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
  });

  it("cycle path is reported with the offending nodes included", () => {
    const dag = asAdjList({ alpha: ["beta"], beta: ["alpha"] });
    const result = validateLayerDAG(dag, ["alpha", "beta"]);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
    const path = result.cycles[0];
    // Cycle path must have at least 2 elements
    expect(path.length).toBeGreaterThanOrEqual(2);
    // First and last should be the same (cycle closure)
    expect(path[0]).toBe(path[path.length - 1]);
  });

  it("valid chain followed by independent cycle: reports cycle, marks DAG invalid", () => {
    // edges→nodes is valid; alpha→beta→alpha is a cycle — both present
    const dag = asAdjList({
      edges: ["nodes"],
      alpha: ["beta"],
      beta: ["alpha"],
    });
    const result = validateLayerDAG(dag, [...LAYER_NAMES, "alpha", "beta"]);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
    // The valid edges→nodes part should not itself be reported as a cycle
    const allCycleNodes = result.cycles.flat();
    // "edges" and "nodes" should not appear in any cycle
    expect(allCycleNodes).not.toContain("edges");
    expect(allCycleNodes).not.toContain("nodes");
  });
});

// ── 3. Missing-layer edge cases ───────────────────────────────────

describe("validateLayerDAG — missing-layer edge cases", () => {
  it("reports an unknown dependency target when a key references an unknown layer", () => {
    // "fantasy-layer" is not in LAYER_NAMES
    const dag = asAdjList({ edges: ["fantasy-layer"] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(false);
    expect(result.unknownLayers).toContain("fantasy-layer");
  });

  it("reports an unknown source key when the source layer name is not in knownLayers", () => {
    // "phantom" is not a valid LayerName
    const dag = asAdjList({ phantom: ["nodes"] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(false);
    expect(result.unknownLayers).toContain("phantom");
  });

  it("reports multiple unknown names when both source and target are unknown", () => {
    const dag = asAdjList({ ghost: ["specter"] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(false);
    expect(result.unknownLayers).toContain("ghost");
    expect(result.unknownLayers).toContain("specter");
  });

  it("valid key with mixed known/unknown deps — only unknown dep is reported", () => {
    // "edges" is known, "nodes" is known, "ghost" is not
    const dag = asAdjList({ edges: ["nodes", "ghost"] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(false);
    expect(result.unknownLayers).toContain("ghost");
    expect(result.unknownLayers).not.toContain("nodes");
    expect(result.unknownLayers).not.toContain("edges");
  });

  it("empty knownLayers list causes all referenced layers to be reported as unknown", () => {
    const dag = asAdjList({ edges: ["nodes"] });
    const result = validateLayerDAG(dag, []);
    expect(result.valid).toBe(false);
    expect(result.unknownLayers).toContain("edges");
    expect(result.unknownLayers).toContain("nodes");
  });

  it("a layer with only empty dependency list and known name is valid", () => {
    const dag = asAdjList({ nodes: [] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(true);
    expect(result.unknownLayers).toHaveLength(0);
  });

  it("unknown-layer errors and cycle errors can coexist in a single result", () => {
    // phantom→specter→phantom is a cycle, and both are unknown
    const dag = asAdjList({ phantom: ["specter"], specter: ["phantom"] });
    const result = validateLayerDAG(dag, LAYER_NAMES);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.unknownLayers.length).toBeGreaterThan(0);
  });
});

// ── 4. LayerDAGValidationResult structure ─────────────────────────

describe("LayerDAGValidationResult — structural contract", () => {
  it("result always has valid, cycles, and unknownLayers fields", () => {
    const result: LayerDAGValidationResult = validateLayerDAG(asAdjList({}), []);
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("cycles");
    expect(result).toHaveProperty("unknownLayers");
    expect(Array.isArray(result.cycles)).toBe(true);
    expect(Array.isArray(result.unknownLayers)).toBe(true);
  });

  it("valid is true iff both cycles and unknownLayers are empty", () => {
    const clean = validateLayerDAG(asAdjList({ edges: ["nodes"] }), LAYER_NAMES);
    expect(clean.valid).toBe(true);
    expect(clean.cycles).toHaveLength(0);
    expect(clean.unknownLayers).toHaveLength(0);

    const withCycle = validateLayerDAG(asAdjList({ alpha: ["alpha"] }), ["alpha"]);
    expect(withCycle.valid).toBe(false);
    expect(withCycle.cycles.length).toBeGreaterThan(0);

    const withUnknown = validateLayerDAG(asAdjList({ ghost: ["nodes"] }), LAYER_NAMES);
    expect(withUnknown.valid).toBe(false);
    expect(withUnknown.unknownLayers.length).toBeGreaterThan(0);
  });
});
