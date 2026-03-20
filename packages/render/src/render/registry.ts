/**
 * Layer registry for the modular Wardley Map renderer.
 *
 * Registers the 8 visual layers in z-order (back-to-front):
 *   1. title      — Map title text above the plot area
 *   2. axes       — Plot border, grid lines, phase dividers, axis labels
 *   3. pipelines  — Pipeline background rectangles (visual backdrop)
 *   4. edges      — Dependency relation lines (source → target)
 *   5. evolvesTo  — Evolution movement arrows (dashed)
 *   6. nodes      — Component circles/markers
 *   7. labels     — Component text labels (with collision avoidance)
 *   8. notes      — Note annotations
 *
 * Pipelines are treated as visual background — they render behind edges
 * and nodes, and do NOT impact label placement.
 *
 * @module render/registry
 */

import type { LayerName, LayerRegistration, LayerRenderer } from "./types.js";

// ── Execution order constants ────────────────────────────────────
// Lower order = rendered first = further back in SVG z-order

export const LAYER_ORDER: Record<LayerName, number> = {
  title: 10,
  axes: 20,
  pipelines: 30,
  edges: 40,
  evolvesTo: 50,
  nodes: 60,
  steps: 65,
  accelerators: 67,
  labels: 70,
  notes: 80,
  legend: 90,
} as const;

/** All layer names in execution order */
export const LAYER_NAMES: readonly LayerName[] = [
  "title",
  "axes",
  "pipelines",
  "edges",
  "evolvesTo",
  "nodes",
  "steps",
  "accelerators",
  "labels",
  "notes",
  "legend",
] as const;

// ── Registry ─────────────────────────────────────────────────────

/** Mutable internal registry — populated by registerLayer() */
const registry: Map<LayerName, LayerRegistration> = new Map();

/**
 * Register a layer renderer.
 *
 * Overwrites any previous registration for the same layer name.
 * The order is taken from the LAYER_ORDER constant to ensure
 * consistent z-ordering regardless of registration order.
 *
 * @param name   — One of the 8 canonical layer names
 * @param render — Pure function (RenderContext) → string[]
 */
export function registerLayer(name: LayerName, render: LayerRenderer): void {
  registry.set(name, {
    name,
    order: LAYER_ORDER[name],
    render,
  });
}

/**
 * Get all registered layers sorted by execution order (ascending).
 *
 * Returns a fresh array each time — safe to iterate without
 * worrying about mutation.
 */
export function getOrderedLayers(): LayerRegistration[] {
  return Array.from(registry.values()).sort((a, b) => a.order - b.order);
}

/**
 * Get a specific layer registration by name.
 * Returns undefined if the layer has not been registered.
 */
export function getLayer(name: LayerName): LayerRegistration | undefined {
  return registry.get(name);
}

/**
 * Check whether all 8 expected layers are registered.
 * Useful for startup validation.
 */
export function validateRegistry(): { valid: boolean; missing: LayerName[] } {
  const missing = LAYER_NAMES.filter((name) => !registry.has(name));
  return { valid: missing.length === 0, missing };
}

/**
 * Clear all registrations. Primarily for testing.
 */
export function clearRegistry(): void {
  registry.clear();
}

/**
 * Get the number of registered layers.
 */
export function registrySize(): number {
  return registry.size;
}
