/**
 * AcceleratorsLayer — renders accelerator / deaccelerator arrows on the map.
 *
 * Part of the modular rendering architecture (gameplay layer, between steps and labels in z-order).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Visual spec (faithful to OWM — damonsk/onlinewardleymaps):
 *   - Accelerator: rightward directional arrow (▶ style SVG path)
 *   - Deaccelerator: same arrow rotated 180° (◀ style)
 *   - Default stroke colour: #000000 (black)
 *   - Arrow size: ~30px wide, ~20px tall
 *   - Label rendered beside the arrow
 *
 * @module render/accelerators-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import type { Component } from "../schema.js";
import { resolveTypeStyle } from "../schema-helpers.js";
import { componentRenderableType } from "../renderable-type.js";
import {
  renderAccelerator,
  buildArrowPath as buildArrowPathPrimitive,
  MARKET_OUTER_R,
  ECO_OUTER_R,
  METHOD_AURA_R,
} from "./svg-primitives.js";

// Re-export buildArrowPath for backward compatibility with tests
export const buildArrowPath = buildArrowPathPrimitive;

/**
 * Effective visual radius of a node, used to offset the accelerator arrow so it
 * clears the node's actual footprint (not just its nominal nodeRadii value):
 *   - ecosystem / market glyphs use fixed radii independent of nodeRadii
 *   - a method aura (when present) extends the footprint to METHOD_AURA_R
 */
export function effectiveVisualRadius(comp: Component, ctx: RenderContext): number {
  const rt = componentRenderableType(comp.type, comp.subtype);
  if (rt === "ecosystem") return ECO_OUTER_R;
  if (rt === "market") return MARKET_OUTER_R;
  let r = resolveTypeStyle<number>(ctx.resolvedConfig.nodeRadii, rt) as number;
  if (comp.method) r = Math.max(r, METHOD_AURA_R);
  return r;
}

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render accelerator / deaccelerator arrows.
 *
 * Delegates SVG fragment generation to svg-primitives.renderAccelerator()
 * for zero renderer drift between server and client.
 *
 * @param ctx - RenderContext with pre-computed geometry and map data
 * @returns Array of SVG fragment strings (empty if no accelerators)
 */
export const renderAcceleratorsLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const parts: string[] = [];
  const fontFamily = ctx.resolvedConfig.typography.fontFamily;

  // Accelerator / deaccelerator are now COMPONENT DECORATORS: render at the
  // decorated component's node position.
  for (const node of ctx.nodes) {
    const comp = node.component;
    const type = comp.accelerator
      ? "accelerator"
      : comp.deaccelerator
        ? "deaccelerator"
        : undefined;
    if (!type) continue;

    parts.push(renderAccelerator({
      cx: node.cx,
      cy: node.cy,
      label: "",
      type,
      fontFamily,
      nodeRadius: effectiveVisualRadius(comp, ctx),
    }));
  }

  return parts;
};
