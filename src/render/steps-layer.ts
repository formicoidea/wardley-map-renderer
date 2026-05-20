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
  const parts: string[] = [];
  const fontFamily = ctx.resolvedConfig.typography.fontFamily;
  const interactive = ctx.options?.interactive === true;

  // Steps are now COMPONENT DECORATORS: render at the decorated component's
  // node position, using the component id as the step target id.
  for (const node of ctx.nodes) {
    const step = node.component.step;
    if (!step) continue;
    const fill = step.color ? resolveColor(step.color) : STEP_DEFAULT_FILL;

    parts.push(renderStep({
      cx: node.cx,
      cy: node.cy,
      number: step.number,
      fill,
      fontFamily,
      stepId: node.component.id,
      interactive,
    }));
  }

  return parts;
};
