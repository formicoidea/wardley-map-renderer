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
  const accelerators = ctx.map.accelerators;
  if (!accelerators || accelerators.length === 0) return [];

  const parts: string[] = [];
  const fontFamily = ctx.resolvedConfig.typography.fontFamily;

  for (const acc of accelerators) {
    const cx = ctx.evoToX(acc.position.evolution.scalar);
    const cy = ctx.visToY(acc.position.visibility.scalar);

    parts.push(renderAccelerator({
      cx, cy,
      label: acc.label,
      type: acc.type as "accelerator" | "deaccelerator",
      fontFamily,
    }));
  }

  return parts;
};
