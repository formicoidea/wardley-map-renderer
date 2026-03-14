/**
 * AxesLayer — renders the axis arrows, evolution phase dividers,
 * phase labels, axis labels, and direction indicators.
 *
 * Part of the 8-layer modular rendering architecture (Layer 2).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * @module render/axes-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import {
  EVOLUTION_PHASES,
  EVOLUTION_BOUNDARIES,
  DIVIDER_COLOR,
  LABEL_COLOR,
  AXIS_LABEL_COLOR,
  AXIS_LABEL_FONT_SIZE,
  PHASE_LABEL_FONT_SIZE,
  DIRECTION_LABEL_FONT_SIZE,
  DEFAULT_X_AXIS_LABEL,
  DEFAULT_Y_AXIS_LABEL,
} from "../blocks/wardley-map/wardley-map-consts.js";

// ── Helpers ─────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Layer renderer ──────────────────────────────────────────────────

export const renderAxesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const parts: string[] = [];
  const { plot, map } = ctx;
  const axes = map.axes;

  // ── Arrowhead marker definition ──────────────────────────
  parts.push(
    `<defs><marker id="axis-arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">` +
      `<path d="M0,0 L10,5 L0,10 Z" fill="${AXIS_LABEL_COLOR}" /></marker></defs>`
  );

  // ── X-axis: horizontal arrow at bottom of plot area ──────
  if (axes.evolution) {
    parts.push(
      `<line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" ` +
        `stroke="${AXIS_LABEL_COLOR}" stroke-width="1.5" marker-end="url(#axis-arrow)" />`
    );
  }

  // ── Y-axis: vertical arrow at left of plot area ──────────
  if (axes.valueChain) {
    parts.push(
      `<line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.left}" y2="${plot.top}" ` +
        `stroke="${AXIS_LABEL_COLOR}" stroke-width="1.5" marker-end="url(#axis-arrow)" />`
    );
  }

  // ── Evolution phase dividers (vertical dashed lines) ───
  if (axes.evolution) {
    for (const ratio of EVOLUTION_BOUNDARIES) {
      const x = ctx.evoToX(ratio);
      parts.push(
        `<line x1="${x}" y1="${plot.top}" x2="${x}" y2="${plot.bottom}" ` +
          `stroke="${DIVIDER_COLOR}" stroke-width="1" stroke-dasharray="4,4" />`
      );
    }
  }

  // ── Phase labels (left-aligned, close to x-axis) ───
  if (axes.evolution) {
    for (const phase of EVOLUTION_PHASES) {
      const lx = ctx.evoToX(phase.startRatio) + 4;
      const ly = plot.bottom + 16;
      parts.push(
        `<text x="${lx}" y="${ly}" text-anchor="start" ` +
          `font-family="Inter, sans-serif" font-size="${PHASE_LABEL_FONT_SIZE}" ` +
          `fill="${LABEL_COLOR}">${esc(phase.label)}</text>`
      );
    }
  }

  // ── X-axis "Evolution" label (close to arrowhead end) ───────
  if (axes.evolution) {
    parts.push(
      `<text x="${plot.right-16}" y="${plot.bottom + 16}" text-anchor="end" ` +
        `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
        `fill="${AXIS_LABEL_COLOR}">${esc(DEFAULT_X_AXIS_LABEL)}</text>`
    );
  }

  // ── Y-axis "Value Chain" label (rotated, close to axis) ─
  if (axes.valueChain) {
    const yCenter = plot.top + plot.height / 2;
    const labelX = plot.left - 14;
    parts.push(
      `<text x="${labelX}" y="${yCenter}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
        `fill="${AXIS_LABEL_COLOR}" ` +
        `transform="rotate(-90, ${labelX}, ${yCenter})">${esc(DEFAULT_Y_AXIS_LABEL)}</text>`
    );
  }

  // ── Evolution direction indicators (inside plot area, top corners) ────
  if (axes.evolution) {
    parts.push(
      `<text x="${plot.left + 12}" y="${plot.top + 14}" ` +
        `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">Uncharted</text>`
    );
    parts.push(
      `<text x="${plot.right - 4}" y="${plot.top + 14}" text-anchor="end" ` +
        `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">Industrialized</text>`
    );
  }

  // ── Visibility direction indicators (rotated like Value Chain label) ─
  if (axes.valueChain) {
    // "Visible" near top of Y-axis, rotated -90°
    const visX = plot.left - 6;
    const visTopY = plot.top + 40;
    parts.push(
      `<text x="${visX}" y="${visTopY}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${PHASE_LABEL_FONT_SIZE}" ` +
        `fill="${LABEL_COLOR}" transform="rotate(-90, ${visX}, ${visTopY})">Visible</text>`
    );
    // "Invisible" near bottom of Y-axis, rotated -90°
    const visBotY = plot.bottom - 30;
    parts.push(
      `<text x="${visX}" y="${visBotY}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${PHASE_LABEL_FONT_SIZE}" ` +
        `fill="${LABEL_COLOR}" transform="rotate(-90, ${visX}, ${visBotY})">Invisible</text>`
    );
  }

  return parts;
};
