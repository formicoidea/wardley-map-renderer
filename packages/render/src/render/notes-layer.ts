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
import { renderNote } from "./svg-primitives.js";

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render note components as styled text annotations.
 *
 * Delegates SVG fragment generation to svg-primitives.renderNote()
 * for zero renderer drift between server and client.
 *
 * @param ctx - RenderContext with pre-computed node geometry
 * @returns Array of SVG fragment strings
 */
export const renderNotesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  // Skip entire notes layer if "note" type is excluded
  if (ctx.resolvedConfig.excludeComponentTypes.includes("note")) return [];

  const fontFamily = ctx.resolvedConfig.typography.fontFamily;
  const parts: string[] = [];

  for (const node of ctx.nodes) {
    const comp = node.component;
    if (comp.type !== "note") continue;

    const text = comp.description?.trim() || comp.label.name;
    parts.push(renderNote({ cx: node.cx, cy: node.cy, text, fontFamily }));
  }

  return parts;
};
