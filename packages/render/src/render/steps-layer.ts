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

// ── Visual constants ─────────────────────────────────────────────────

/** Default step sticker fill colour (OWM red) */
const STEP_DEFAULT_FILL = "#cc0000";

/** Radius of the step circle in pixels */
const STEP_RADIUS = 14;

/** Font size for the step number */
const STEP_FONT_SIZE = 13;

/** Colour of the step number text */
const STEP_TEXT_COLOR = "#ffffff";

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Render step stickers as filled circles with white centred numbers.
 *
 * Each step from `ctx.map.steps` is rendered as:
 *   1. A filled circle at the step's position
 *   2. A white number centred in the circle
 *
 * Steps without a colour override use the default red (#cc0000).
 * Steps with a `color` field use `resolveColor()` for CSS colour resolution.
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

  for (const step of steps) {
    // Convert normalised [0-1] coordinates to pixel positions
    const cx = ctx.evoToX(step.position.evolution.scalar);
    const cy = ctx.visToY(step.position.visibility.scalar);

    // Resolve fill colour: step.color > default red
    const fill = step.color ? resolveColor(step.color) : STEP_DEFAULT_FILL;

    // Filled circle
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${STEP_RADIUS}" ` +
        `fill="${fill}" stroke="none" />`
    );

    // White number centred inside the circle
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="${fontFamily}" font-size="${STEP_FONT_SIZE}" ` +
        `font-weight="bold" fill="${STEP_TEXT_COLOR}">${step.number}</text>`
    );
  }

  return parts;
};
