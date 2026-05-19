/**
 * Layer dependency DAG (Directed Acyclic Graph) for the Wardley Map renderer.
 *
 * This module declares the *data dependencies* between rendering layers.
 * A dependency edge `A → B` means layer A requires data produced by layer B
 * before it can render correctly.
 *
 * Important distinction:
 *   - LAYER_ORDER (in registry.ts) — controls visual z-order (back-to-front stacking)
 *   - LAYER_DAG  (this file)       — declares data dependencies (what must be available)
 *
 * These two concerns are intentionally separate:
 *   - `edges` renders *before* `nodes` in z-order (order 40 < 60) so that edge
 *     lines appear underneath node circles visually, yet `edges` still *depends on*
 *     `nodes` data to know the pixel positions of edge endpoints.
 *   - `evolvesTo` similarly renders before `nodes` but depends on their geometry.
 *   - `labels` renders after `nodes` (z-order 70 > 60) and also depends on node
 *     positions for collision-avoidance placement.
 *
 * In the current 2-phase architecture all geometry is precomputed during Phase 1
 * (buildRenderContext), so the DAG serves as *declarative documentation* of intent
 * and enables future tooling (topological sort, incremental invalidation, etc.)
 * without coupling it to validation logic.
 *
 * @module render/layer-dag
 */

import type { LayerName } from "./types.js";

// ── LayerDAG type ─────────────────────────────────────────────────

/**
 * A Directed Acyclic Graph of layer dependencies, represented as an
 * adjacency list.
 *
 * Each entry maps a `LayerName` to the set of layers it depends on.
 * A layer A whose entry contains B means: "A needs data from B."
 *
 * Layers with no dependencies (e.g. title, axes) are simply omitted —
 * absence means an empty dependency set, not "unregistered".
 *
 * @example
 * ```ts
 * // "edges depends on nodes"
 * const dag: LayerDAG = { edges: ["nodes"] };
 * ```
 */
export type LayerDAG = Readonly<Partial<Record<LayerName, ReadonlyArray<LayerName>>>>;

// ── Concrete dependency data ──────────────────────────────────────

/**
 * Canonical layer dependency graph for the Wardley Map renderer.
 *
 * Declared edges (A depends on B):
 *
 * | Layer      | Depends on | Reason                                              |
 * |------------|------------|-----------------------------------------------------|
 * | `edges`    | `nodes`    | Edge endpoints require node pixel positions          |
 * | `evolvesTo`| `nodes`    | Arrow origins require source node pixel positions    |
 * | `labels`   | `nodes`    | Label placement uses node bounding boxes for avoidance |
 *
 * Layers omitted from this map (title, axes, pipelines, nodes, notes, legend)
 * have no declared data dependencies on other layers.
 */
export const LAYER_DAG: LayerDAG = {
  edges: ["nodes"],
  evolvesTo: ["nodes"],
  labels: ["nodes"],
} as const;

// ── LayerDAG validation ───────────────────────────────────────────

/**
 * Result of validating a LayerDAG for structural correctness.
 *
 * `valid` is true only when no cycles and no unknown layers are found.
 * `cycles`        — each entry is a path array describing one detected cycle.
 * `unknownLayers` — layer names referenced in the DAG not present in `knownLayers`.
 */
export interface LayerDAGValidationResult {
  readonly valid: boolean;
  /** Each detected cycle, represented as an ordered path (first node = last node in the cycle). */
  readonly cycles: ReadonlyArray<ReadonlyArray<string>>;
  /** Layer names that appear as keys or dependency targets but are absent from `knownLayers`. */
  readonly unknownLayers: ReadonlyArray<string>;
}

/**
 * Validate a LayerDAG (or any adjacency-list DAG) for structural correctness.
 *
 * Performs two checks:
 *
 * 1. **Unknown layer check** — every key and every dependency target in `dag`
 *    must be present in `knownLayers`. Any name that is not known is reported
 *    in `result.unknownLayers`.
 *
 * 2. **Cycle check** — performs a depth-first search (DFS) over the dependency
 *    graph. A "depends on" edge `A → B` means A requires B. If a cycle is found
 *    (e.g. A → B → A), the offending path is recorded in `result.cycles`.
 *
 * The function accepts a generic `Record<string, ReadonlyArray<string>>` shape
 * so it can be used with `LAYER_DAG` (cast as needed) and with synthetic test
 * fixtures without requiring conformance to the `LayerName` union.
 *
 * @param dag         — Adjacency list: `{ layerName: [dep1, dep2, ...] }`
 * @param knownLayers — The set of valid layer names (used for the unknown-layer check)
 * @returns           A validation result with `valid`, `cycles`, and `unknownLayers`.
 *
 * @example
 * ```ts
 * const result = validateLayerDAG(LAYER_DAG as Record<string, string[]>, LAYER_NAMES);
 * // result.valid === true (LAYER_DAG is acyclic and uses only known names)
 * ```
 */
export function validateLayerDAG(
  dag: Readonly<Partial<Record<string, ReadonlyArray<string>>>>,
  knownLayers: ReadonlyArray<string>,
): LayerDAGValidationResult {
  const knownSet = new Set(knownLayers);
  const unknownSet = new Set<string>();

  // ── Step 1: collect all unknown layer references ─────────────────
  for (const [key, deps] of Object.entries(dag)) {
    if (!knownSet.has(key)) unknownSet.add(key);
    for (const dep of deps ?? []) {
      if (!knownSet.has(dep)) unknownSet.add(dep);
    }
  }

  // ── Step 2: DFS cycle detection ───────────────────────────────────
  // Standard 3-colour DFS: WHITE (0) = unvisited, GRAY (1) = in-stack, BLACK (2) = done.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour = new Map<string, 0 | 1 | 2>();
  const cycles: string[][] = [];

  // Collect all node names that appear in the DAG (keys + any dep targets)
  const allNodes = new Set<string>(Object.keys(dag));
  for (const deps of Object.values(dag)) {
    for (const dep of deps ?? []) allNodes.add(dep);
  }

  function dfs(node: string, stack: string[]): void {
    colour.set(node, GRAY);
    stack.push(node);

    for (const dep of dag[node] ?? []) {
      const depColour = colour.get(dep) ?? WHITE;
      if (depColour === GRAY) {
        // Found a back-edge → cycle. Reconstruct the cycle path.
        const cycleStart = stack.indexOf(dep);
        cycles.push([...stack.slice(cycleStart), dep]);
      } else if (depColour === WHITE) {
        dfs(dep, stack);
      }
    }

    stack.pop();
    colour.set(node, BLACK);
  }

  for (const node of allNodes) {
    if ((colour.get(node) ?? WHITE) === WHITE) {
      dfs(node, []);
    }
  }

  const unknownLayers = [...unknownSet];
  return {
    valid: cycles.length === 0 && unknownLayers.length === 0,
    cycles,
    unknownLayers,
  };
}
