/**
 * Browser renderer — the SAME layer pipeline as renderToSVG, split so the
 * zod-dependent part (sanitize + resolveTheme) runs once on the server.
 *
 *   server:  prepared = prepareRender(map, options)        → JSON into the page
 *   browser: svg = renderSVGFromPrepared(editedMap, prepared)
 *
 * `renderSVGFromPrepared(m, prepareRender(m, o)) === renderToSVG(m, o)` for any
 * sanitized map `m` (the map embedded in the page is already sanitized, and
 * edits come from the pure applyDiffOp). The resolved config is frozen at
 * prepare time: edits to `map.renderConfig` need a new prepareRender().
 *
 * This module is browser-safe: no runtime import of zod, node:*, resvg or fonts
 * (schema.ts is imported for types only). prepareRender lives in the sibling
 * server module prepare-render.ts because resolveTheme/sanitizeMap need zod
 * (v3 renderConfig defaults are applied by RenderConfigV3Schema.parse) and an
 * esbuild entry keeps all of its exports.
 *
 * @module render/browser-render
 */

import type { ResolvedRenderConfig, WardleyMap } from "../schema.js";
import type { RenderOptions } from "./types.js";
import { buildRenderContextFromConfig, computeCanvasFrame } from "./context-core.js";
import { composeSVG } from "./compose-core.js";
import { LAYERS, applyLayerToggles } from "./layer-list.js";

/** JSON-serializable render inputs resolved on the server. */
export interface PreparedRender {
  /** `resolveTheme(sanitizeMap(map).renderConfig)` */
  readonly config: ResolvedRenderConfig;
  /** Render options as passed to renderToSVG (e.g. `{ interactive: true }`). */
  readonly options: RenderOptions;
}

/** Render a sanitized map to the exact SVG string renderToSVG produces. */
export function renderSVGFromPrepared(map: WardleyMap, prepared: PreparedRender): string {
  const ctx = buildRenderContextFromConfig(map, prepared.options, prepared.config);
  return composeSVG(ctx, applyLayerToggles(LAYERS, ctx.resolvedConfig.layerToggles));
}

/** SVG user-space pixel → normalized map coordinates (not clamped). */
export function pxToMap(prepared: PreparedRender, x: number, y: number): { evo: number; vis: number } {
  const { plot } = computeCanvasFrame(prepared.options, prepared.config);
  const [e0, e1] = prepared.config.coordinateSpace.evolutionRange;
  const [v0, v1] = prepared.config.coordinateSpace.visibilityRange;
  return {
    evo: e0 + ((x - plot.left) / plot.width) * (e1 - e0),
    vis: v0 + ((y - plot.top) / plot.height) * (v1 - v0),
  };
}

/** Normalized map coordinates → SVG user-space pixel (same converters as the renderer). */
export function mapToPx(prepared: PreparedRender, evo: number, vis: number): { x: number; y: number } {
  const { evoToX, visToY } = computeCanvasFrame(prepared.options, prepared.config);
  return { x: evoToX(evo), y: visToY(vis) };
}
