/**
 * SVG composition core (zod-free, browser-safe): composeSVG + shared text
 * helpers. Re-exported by svg-composer.ts, which adds the high-level
 * map → SVG convenience functions.
 *
 * @module render/compose-core
 */

import type { RenderContext, LayerRegistration } from "./types.js";
import { getOrderedLayers } from "./registry.js";

// ── SVG helpers ──────────────────────────────────────────────────────

/**
 * Escape text for XML/SVG attribute/content safety.
 * Imported from svg-primitives.ts — the single source of truth.
 */
import { esc } from "./svg-primitives.js";
export { esc };

/**
 * Effective font size: `base × typography.textScale × elementScale`
 * (absent scales → 1), rounded to 2 decimals.
 */
export function scaledFontSize(ctx: RenderContext, base: number, elementScale?: number): number {
  const textScale = ctx.resolvedConfig.typography.textScale ?? 1;
  return Math.round(base * textScale * (elementScale ?? 1) * 100) / 100;
}

// ── Background pseudo-layer ──────────────────────────────────────────

/**
 * Render the SVG background rect.
 * Always rendered first (z-order 0), before the 8 named layers.
 * Uses ctx.resolvedConfig.background.color (from resolveTheme, defaults to "#ffffff").
 */
function renderBackground(ctx: RenderContext): string {
  const bgColor = ctx.resolvedConfig.background.color;
  return `<rect width="${ctx.canvasWidth}" height="${ctx.canvasHeight}" fill="${esc(bgColor)}" />`;
}

// ── SVG document structure ───────────────────────────────────────────

/** Generate the SVG opening tag with proper namespace and viewBox. */
function svgHeader(ctx: RenderContext): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${ctx.canvasWidth}" height="${ctx.canvasHeight}" ` +
    `viewBox="0 0 ${ctx.canvasWidth} ${ctx.canvasHeight}">`
  );
}

/** Generate the SVG closing tag. */
function svgFooter(): string {
  return "</svg>";
}

// ── Core composition ─────────────────────────────────────────────────

/**
 * Compose the final SVG document by orchestrating layers in z-order.
 *
 * This is the main entry point for Phase 2 of the rendering pipeline.
 * It takes a pre-computed RenderContext and an ordered list of layer
 * registrations, calls each layer's render function, and concatenates
 * the results into a complete SVG document.
 *
 * Each layer's output is wrapped in a `<g data-layer="...">` group
 * for debugging and DOM inspection.
 *
 * The background rect is always rendered first (before named layers).
 *
 * @param ctx    - RenderContext built from Phase 1 (buildRenderContext)
 * @param layers - Ordered layer registrations (defaults to global registry)
 * @returns Complete SVG document as a string
 */
export function composeSVG(
  ctx: RenderContext,
  layers?: readonly LayerRegistration[]
): string {
  const orderedLayers = layers ?? getOrderedLayers();
  const parts: string[] = [];

  // SVG document open
  parts.push(svgHeader(ctx));

  // Background (always first, before named layers)
  parts.push(renderBackground(ctx));

  // Render each layer in z-order
  for (const layer of orderedLayers) {
    const fragments = layer.render(ctx);
    if (fragments.length > 0) {
      parts.push(`<g data-layer="${esc(layer.name)}">`);
      parts.push(...fragments);
      parts.push("</g>");
    }
  }

  // SVG document close
  parts.push(svgFooter());

  return parts.join("\n");
}

