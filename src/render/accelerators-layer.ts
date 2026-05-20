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
import {
  renderAccelerator,
  buildArrowPath as buildArrowPathPrimitive,
} from "./svg-primitives.js";

// Re-export buildArrowPath for backward compatibility with tests
export const buildArrowPath = buildArrowPathPrimitive;

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
    }));
  }

  return parts;
};
