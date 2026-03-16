/**
 * LabelsLayer — renders component labels with collision avoidance.
 *
 * Part of the 9-layer modular rendering architecture (Layer 7).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Uses avoidLabelCollisions() from label-placement.ts with:
 *   - Phase 1: Alternate placement (4 candidates: right, left, top, bottom)
 *   - Phase 2: Vertical push-apart for remaining overlaps
 *   - Phase 3: Label-edge collision avoidance (Liang-Barsky)
 *   - Final: Clamp inside plot area
 *
 * Pipelines and notes are excluded — they have their own layers.
 *
 * @module render/labels-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import type { LabelPlacement, EdgeSegment } from "./label-placement.js";
import { avoidLabelCollisions } from "./label-placement.js";

// ── Visual constants ─────────────────────────────────────────────────

const NODE_RADIUS = 5;
const COMPONENT_LABEL_FONT_SIZE = 12;
const COMPONENT_LABEL_COLOR = "#333333";

/** Component types that get a text label on the map */
const LABEL_TYPES = new Set(["component", "user-need", "anchor", "pipeline"]);

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
 * Render component labels with collision avoidance.
 *
 * Builds LabelPlacement entries for each renderable component,
 * applies avoidLabelCollisions() with the pre-computed edge segments,
 * then generates SVG text elements.
 *
 * @param ctx - RenderContext with pre-computed node and edge geometry
 * @returns Array of SVG fragment strings
 */
export const renderLabelsLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const labelPlacements: LabelPlacement[] = [];

  for (const node of ctx.nodes) {
    const comp = node.component;

    // Skip notes (rendered by notes-layer)
    if (!LABEL_TYPES.has(comp.type)) continue;

    const cx = node.cx;
    const cy = node.cy;

    // Label offset: to the right of node (pipelines: above handle center)
    const hasCustomPos = comp.labelPosition != null;
    let dx: number;
    let dy: number;
    let anchor: "start" | "middle" | "end" = "middle";

    if (comp.type === "pipeline") {
      dx = comp.labelPosition?.dx ?? (NODE_RADIUS + 4);
      dy = comp.labelPosition?.dy ?? 4;
      anchor = "middle";
    } else {
      dx = comp.labelPosition?.dx ?? NODE_RADIUS + 4;
      dy = comp.labelPosition?.dy ?? 4;
      anchor = dx < 0 ? "end" : anchor;
      anchor = dx > 0 ? "start" : anchor;
    }

    labelPlacements.push({
      x: cx + dx,
      y: cy + dy,
      text: comp.label,
      anchor,
      nodeCx: cx,
      nodeCy: cy,
      pinned: hasCustomPos,
    });
  }

  if (labelPlacements.length === 0) return [];

  // Build collision segments: relation edges + evolve arrows + pipeline borders
  const edgeSegments: EdgeSegment[] = ctx.edges.map((e) => ({
    x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
  }));

  // Evolve arrows
  for (const a of ctx.evolves) {
    edgeSegments.push({ x1: a.fromX, y1: a.fromY, x2: a.toX, y2: a.toY });
  }

  // Pipeline borders (4 sides each)
  const PIPELINE_PADDING = 4;
  for (const p of ctx.pipelines) {
    const left = p.x - PIPELINE_PADDING, top = p.y - PIPELINE_PADDING;
    const right = p.x + p.width + PIPELINE_PADDING, bottom = p.y + p.height + PIPELINE_PADDING;
    edgeSegments.push(
      { x1: left, y1: top, x2: right, y2: top },
      { x1: left, y1: bottom, x2: right, y2: bottom },
      { x1: left, y1: top, x2: left, y2: bottom },
      { x1: right, y1: top, x2: right, y2: bottom },
    );
  }

  // Apply label collision avoidance (label-label + edge-crossing scoring)
  const adjusted = avoidLabelCollisions(
    labelPlacements, edgeSegments,
    7, 16,
    { top: ctx.plot.top, bottom: ctx.plot.bottom }
  );

  // Generate SVG text elements
  const parts: string[] = [];
  for (const lbl of adjusted) {
    if (lbl.text.includes("\n")) {
      // Multi-line: first line as text content, subsequent lines as tspan elements
      const lines = lbl.text.split("\n");
      const firstLine = esc(lines[0]);
      const restLines = lines
        .slice(1)
        .map((line) => `<tspan x="${lbl.x}" dy="14">${esc(line)}</tspan>`)
        .join("");
      parts.push(
        `<text x="${lbl.x}" y="${lbl.y}" text-anchor="${lbl.anchor}" ` +
          `font-family="Inter, sans-serif" font-size="${COMPONENT_LABEL_FONT_SIZE}" ` +
          `fill="${COMPONENT_LABEL_COLOR}">${firstLine}${restLines}</text>`
      );
    } else {
      parts.push(
        `<text x="${lbl.x}" y="${lbl.y}" text-anchor="${lbl.anchor}" ` +
          `font-family="Inter, sans-serif" font-size="${COMPONENT_LABEL_FONT_SIZE}" ` +
          `fill="${COMPONENT_LABEL_COLOR}">${esc(lbl.text)}</text>`
      );
    }
  }

  return parts;
};
