/**
 * Phase 1 — Geometry: builds a RenderContext from a WardleyMap.
 *
 * Computes all pixel positions from normalised [0-1] coordinates,
 * resolves pipeline rects, edge segments, and evolve arrows.
 *
 * Pure function — no SVG generation. Resolves the render config via
 * resolveTheme() (zod-dependent) and delegates to the zod-free core in
 * context-core.ts, which the browser renderer calls with a pre-resolved config.
 *
 * @module render/build-context
 */

import type { WardleyMap } from "../schema.js";
import { resolveTheme } from "../schema.js";
import type { RenderContext, RenderOptions } from "./types.js";
import { buildRenderContextFromConfig } from "./context-core.js";

export { buildRenderContextFromConfig, computeCanvasFrame, type CanvasFrame } from "./context-core.js";

/** Default render options — used when no overrides are provided */
const DEFAULT_OPTIONS: RenderOptions = {};

export function buildRenderContext(map: WardleyMap, options: RenderOptions = DEFAULT_OPTIONS): RenderContext {
  // Resolve theme defaults — single source of truth for all config values.
  // (Pipeline containment in the core never alters renderConfig.)
  return buildRenderContextFromConfig(map, options, resolveTheme(map.renderConfig));
}
