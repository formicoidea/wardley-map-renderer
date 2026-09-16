/**
 * AxesLayer — renders the plot border, grid lines, axis arrows,
 * evolution phase dividers, phase labels, axis labels, and direction indicators.
 *
 * Part of the 9-layer modular rendering architecture (Layer 2).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * @module render/axes-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import {
  EVOLUTION_PHASES,
  EVOLUTION_BOUNDARIES,
  BORDER_COLOR,
  DIVIDER_COLOR,
  LABEL_COLOR,
  AXIS_LABEL_COLOR,
  AXIS_LABEL_FONT_SIZE,
  PHASE_LABEL_FONT_SIZE,
  DIRECTION_LABEL_FONT_SIZE,
} from "../blocks/wardley-map/wardley-map-consts.js";
import { esc, scaledFontSize } from "./compose-core.js";

// ── Layer renderer ──────────────────────────────────────────────────

export const renderAxesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const parts: string[] = [];
  const { plot } = ctx;
  // Use resolvedConfig — all fields guaranteed present, no null-coalescing needed
  const rc = ctx.resolvedConfig;

  const showEvolution = rc.showEvolutionXAxis;
  const showValueChain = rc.showValueChainYAxis;
  // showPhaseDividerAndLabel controls BOTH phase dividers AND phase labels together,
  // independently of whether the evolution axis itself is shown.
  const showPhaseDividerAndLabel = rc.showPhaseDividerAndLabel;
  const labels = rc.axisLabels;
  const scales = rc.typography.elementScales;
  const evoAxisSize = scaledFontSize(ctx, AXIS_LABEL_FONT_SIZE, scales?.axisEvolution);
  const evoDirectionSize = scaledFontSize(ctx, DIRECTION_LABEL_FONT_SIZE, scales?.axisEvolution);
  const vcAxisSize = scaledFontSize(ctx, AXIS_LABEL_FONT_SIZE, scales?.axisValueChain);
  const vcDirectionSize = scaledFontSize(ctx, PHASE_LABEL_FONT_SIZE, scales?.axisValueChain);

  // Horizontal grid lines removed — cleaner visual per Wardley convention

  // ── Arrowhead marker definition ──────────────────────────
  parts.push(
    `<defs><marker id="axis-arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">` +
      `<path d="M0,0 L10,5 L0,10 Z" fill="${AXIS_LABEL_COLOR}" /></marker></defs>`
  );

  // ── X-axis: horizontal arrow at bottom of plot area ──────
  if (showEvolution) {
    parts.push(
      `<line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" ` +
        `stroke="${AXIS_LABEL_COLOR}" stroke-width="1.5" marker-end="url(#axis-arrow)" />`
    );
  }

  // ── Y-axis: vertical arrow at left of plot area ──────────
  if (showValueChain) {
    parts.push(
      `<line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.left}" y2="${plot.top}" ` +
        `stroke="${AXIS_LABEL_COLOR}" stroke-width="1.5" marker-end="url(#axis-arrow)" />`
    );
  }

  // ── Evolution phase dividers (vertical dashed lines) ───
  // Controlled independently by showPhaseDividerAndLabel, not by showEvolution.
  if (showPhaseDividerAndLabel) {
    for (const ratio of EVOLUTION_BOUNDARIES) {
      const x = ctx.evoToX(ratio);
      parts.push(
        `<line x1="${x}" y1="${plot.top}" x2="${x}" y2="${plot.bottom}" ` +
          `stroke="${DIVIDER_COLOR}" stroke-width="1" stroke-dasharray="4,4" />`
      );
    }
  }

  // ── Phase labels (left-aligned, close to x-axis) ───
  // Controlled by same showPhaseDividerAndLabel toggle as dividers.
  if (showPhaseDividerAndLabel) {
    for (let i = 0; i < EVOLUTION_PHASES.length; i++) {
      const phase = EVOLUTION_PHASES[i];
      const phaseLabel = labels.phases[i] ?? phase.label;
      const lx = ctx.evoToX(phase.startRatio) + 4;
      const ly = plot.bottom + 16;
      parts.push(
        `<text x="${lx}" y="${ly}" text-anchor="start" ` +
          `font-family="Inter, sans-serif" font-size="${scaledFontSize(ctx, PHASE_LABEL_FONT_SIZE, scales?.phases?.[i])}" ` +
          `fill="${LABEL_COLOR}">${esc(phaseLabel)}</text>`
      );
    }
  }

  // ── X-axis label (close to arrowhead end) ───────
  if (showEvolution) {
    parts.push(
      `<text x="${plot.right-16}" y="${plot.bottom + 16}" text-anchor="end" ` +
        `font-family="Inter, sans-serif" font-size="${evoAxisSize}" ` +
        `fill="${AXIS_LABEL_COLOR}">${esc(labels.xAxis)}</text>`
    );
  }

  // ── Evolution direction indicators (inside plot area, top corners) ────
  if (showEvolution) {
    parts.push(
      `<text x="${plot.left + 12}" y="${plot.top + 14}" ` +
        `font-family="Inter, sans-serif" font-size="${evoDirectionSize}" fill="${LABEL_COLOR}">${esc(labels.evolutionStart)}</text>`
    );
    parts.push(
      `<text x="${plot.right - 4}" y="${plot.top + 14}" text-anchor="end" ` +
        `font-family="Inter, sans-serif" font-size="${evoDirectionSize}" fill="${LABEL_COLOR}">${esc(labels.evolutionEnd)}</text>`
    );
  }

  // ── Y-axis label (rotated, close to axis) ─
  if (showValueChain) {
    const yCenter = plot.top + plot.height / 2;
    const labelX = plot.left - 8;
    parts.push(
      `<text x="${labelX}" y="${yCenter}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${vcAxisSize}" ` +
        `fill="${AXIS_LABEL_COLOR}" ` +
        `transform="rotate(-90, ${labelX}, ${yCenter})">${esc(labels.yAxis)}</text>`
    );
  }

  // ── Visibility direction indicators (rotated like Value Chain label) ─
  if (showValueChain) {
    // "Visible" near top of Y-axis, rotated -90°
    const visX = plot.left - 6;
    const visTopY = plot.top + 40;
    parts.push(
      `<text x="${visX}" y="${visTopY}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${vcDirectionSize}" ` +
        `fill="${LABEL_COLOR}" transform="rotate(-90, ${visX}, ${visTopY})">${esc(labels.visibilityHigh)}</text>`
    );
    // "Invisible" near bottom of Y-axis, rotated -90°
    const visBotY = plot.bottom - 30;
    parts.push(
      `<text x="${visX}" y="${visBotY}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${vcDirectionSize}" ` +
        `fill="${LABEL_COLOR}" transform="rotate(-90, ${visX}, ${visBotY})">${esc(labels.visibilityLow)}</text>`
    );
  }

  return parts;
};
