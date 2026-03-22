/**
 * StepsLayer — renders step stickers as filled circles with white centred numbers.
 *
 * Part of the modular rendering architecture (between nodes and labels in z-order).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Visual spec (faithful to OWM):
 *   - Filled circle (default colour: #cc0000 red, overridable via step.color)
 *   - White number centred inside the circle
 *   - Radius: 14px
 *   - Font: bold, 13px, white (#ffffff)
 *
 * @module render/steps-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { resolveColor } from "../schema.js";
import { renderStep, STEP_DEFAULT_FILL } from "./svg-primitives.js";

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render step stickers as filled circles with white centred numbers.
 *
 * Delegates SVG fragment generation to svg-primitives.renderStep()
 * for zero renderer drift between server and client.
 *
 * @param ctx - RenderContext with pre-computed geometry and map data
 * @returns Array of SVG fragment strings (empty if no steps)
 */
export const renderStepsLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const steps = ctx.map.steps;
  if (!steps || steps.length === 0) return [];

  const parts: string[] = [];
  const fontFamily = ctx.resolvedConfig.typography.fontFamily;
  const interactive = ctx.options?.interactive === true;

  for (const step of steps) {
    const cx = ctx.evoToX(step.position.evolution.scalar);
    const cy = ctx.visToY(step.position.visibility.scalar);
    const fill = step.color ? resolveColor(step.color) : STEP_DEFAULT_FILL;

    parts.push(renderStep({
      cx, cy,
      number: step.number,
      fill,
      fontFamily,
      stepId: step.id,
      interactive,
    }));
  }

  return parts;
};
