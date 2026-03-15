/**
 * TitleLayer — renders the map title as a bordered box above the axes area.
 *
 * Part of the 8-layer modular rendering architecture (Layer 1).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Style: centered horizontally above the plot area, white background rect
 * with thin gray border, matching the MapKeep reference rendering.
 *
 * Skips rendering when title is blank or "Untitled" (MapKeep default).
 *
 * @module render/title-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { TITLE_FONT_SIZE } from "./consts.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Escape text for XML/SVG attribute/content safety */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Layer renderer ──────────────────────────────────────────────────

/**
 * Render the map title as a centered bordered box above the plot area.
 *
 * Returns an empty array if the title is blank or "Untitled".
 *
 * @param ctx - RenderContext with map data and computed layout dimensions
 * @returns Array of SVG fragment strings
 */
export const renderTitleLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const trimmed = ctx.map.title.trim();
  if (!trimmed || trimmed.toLowerCase() === "untitled") return [];

  // Position: centered horizontally at half canvas width, above the plot area
  const textX = ctx.canvasWidth / 2;
  const textY = ctx.plot.top - 6;

  return [
    `<text x="${textX}" y="${textY}" text-anchor="middle" ` +
      `font-family="Inter, sans-serif" font-size="${TITLE_FONT_SIZE}" ` +
      `font-weight="600" fill="#333333">${esc(trimmed)}</text>`,
  ];
};
