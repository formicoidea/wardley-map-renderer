/**
 * NotesLayer — renders note components as text annotations on the map.
 *
 * Part of the 9-layer modular rendering architecture (Layer 8).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Notes are rendered as italic text at their computed position.
 * They do not have a circle node (handled in nodes-layer exclusion).
 * Multi-line note text is split on newlines and rendered as separate
 * <tspan> elements with vertical spacing.
 *
 * @module render/notes-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";

// ── Visual constants ─────────────────────────────────────────────────

const NOTE_FONT_SIZE = 11;
const NOTE_LINE_HEIGHT = 15;
const NOTE_COLOR = "#666666";
const NOTE_FONT_STYLE = "italic";

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

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render note components as styled text annotations.
 *
 * Notes use their label as display text (or description if available).
 * Multi-line content is split on newlines with vertical spacing via tspan.
 *
 * @param ctx - RenderContext with pre-computed node geometry
 * @returns Array of SVG fragment strings
 */
export const renderNotesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  // Skip entire notes layer if "note" type is excluded
  if (ctx.resolvedConfig.excludeComponentTypes.includes("note")) return [];

  const fontFamily = ctx.resolvedConfig.fontFamily;
  const parts: string[] = [];

  for (const node of ctx.nodes) {
    const comp = node.component;

    // Only render note-type components
    if (comp.type !== "note") continue;

    // Use description if available, otherwise fall back to label
    const text = comp.description?.trim() || comp.label.name;
    const lines = text.split("\n");

    if (lines.length === 1) {
      // Single-line note: simple text element
      parts.push(
        `<text x="${node.cx}" y="${node.cy}" text-anchor="start" ` +
          `font-family="${fontFamily}" font-size="${NOTE_FONT_SIZE}" ` +
          `font-style="${NOTE_FONT_STYLE}" fill="${NOTE_COLOR}">${esc(lines[0])}</text>`
      );
    } else {
      // Multi-line note: text element with tspan children
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${node.cx}" dy="${i === 0 ? 0 : NOTE_LINE_HEIGHT}">${esc(line)}</tspan>`
        )
        .join("");

      parts.push(
        `<text x="${node.cx}" y="${node.cy}" text-anchor="start" ` +
          `font-family="${fontFamily}" font-size="${NOTE_FONT_SIZE}" ` +
          `font-style="${NOTE_FONT_STYLE}" fill="${NOTE_COLOR}">${tspans}</text>`
      );
    }
  }

  return parts;
};
