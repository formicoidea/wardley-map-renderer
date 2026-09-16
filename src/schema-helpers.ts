/**
 * Zod-free schema helpers — accessors and style lookups used by the render
 * path. Kept free of runtime `zod` so the renderer can run in the browser.
 * Re-exported from schema.ts (the public import site is unchanged).
 *
 * @module schema-helpers
 */

import type { Component, EvolvesTo, TypeStyleMap } from "./schema.js";

// ── Accessor shortcuts ──────────────────────────────────────
// Reduce verbosity of .position.evolution.scalar everywhere

/** Get evolution scalar from a component */
export function evo(c: Component): number { return c.position.evolution.scalar; }

/** Get visibility scalar from a component */
export function vis(c: Component): number { return c.position.visibility.scalar; }

/** Get evolution scalar from an evolvesTo target */
export function evoTarget(e: EvolvesTo): number { return e.position.evolution.scalar; }

/** Get visibility scalar from an evolvesTo target */
export function visTarget(e: EvolvesTo): number { return e.position.visibility.scalar; }

/**
 * Resolve a value from a TypeStyleMap by component type, falling back to `_default`.
 *
 * Canonical per-type-with-fallback lookup used across all TypeStyleMap
 * consumers (nodeRadii, typeColors, evolveStyles).
 *
 * Lookup precedence: `map[type]` → `map._default`
 *
 * @example
 *   const r = resolveTypeStyle(nodeRadii, comp.type); // number
 *   const c = resolveTypeStyle(typeColors, "anchor");  // string | undefined
 */
export function resolveTypeStyle<T>(
  map: Partial<TypeStyleMap<T>>,
  type: string
): T | undefined {
  return (map as Record<string, T | undefined>)[type] ?? map._default;
}

// ── Color mapping ──────────────────────────────────────────
// Minimal Tailwind-to-hex mapping with black fallback
const COLOR_MAP: Record<string, string> = {
  "red-600": "#dc2626",
  "blue-600": "#2563eb",
  "green-600": "#16a34a",
  "yellow-600": "#ca8a04",
  "orange-600": "#ea580c",
  "purple-600": "#9333ea",
};

/** Resolve a Tailwind-style color name to hex, with black fallback */
export function resolveColor(color: string | undefined): string {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color;
  return COLOR_MAP[color] ?? "#000000";
}
