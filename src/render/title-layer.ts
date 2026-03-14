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
import { TITLE_FONT_SIZE } from "../blocks/wardley-map/wardley-map-consts.js";

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

  const padX = 8;
  const padY = 4;

  // Approximate text width: char count × font size × 0.55
  const textWidth = trimmed.length * TITLE_FONT_SIZE * 0.55;
  const rectWidth = textWidth + padX * 2;
  const rectHeight = TITLE_FONT_SIZE + padY * 2;

  // Position: centered horizontally above the plot area
  const centerX = ctx.plot.left + ctx.plot.width / 2;
  const rectX = centerX - rectWidth / 2;
  const rectY = ctx.plot.top - rectHeight - 2;

  // Text: centered inside the rect
  const textX = centerX;
  const textY = rectY + rectHeight - padY;

  return [
    `<rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" ` +
      `fill="white" stroke="#c0c0c0" stroke-width="1" rx="2" ry="2"/>`,
    `<text x="${textX}" y="${textY}" text-anchor="middle" ` +
      `font-family="Inter, sans-serif" font-size="${TITLE_FONT_SIZE}" ` +
      `font-weight="600" fill="#333333">${esc(trimmed)}</text>`,
  ];
};
