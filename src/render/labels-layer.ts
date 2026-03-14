/**
 * LabelsLayer — renders component labels with collision avoidance.
 *
 * Part of the 8-layer modular rendering architecture (Layer 7).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Uses the existing avoidLabelCollisions() algorithm from render.ts
 * (to be extracted to label-placement.ts) with:
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
import type { LabelPlacement, EdgeSegment } from "../render.js";
import { avoidLabelCollisions } from "../render.js";

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

    // Label offset: pipelines centered above handle, others to the right of node
    const hasCustomPos = comp.labelPosition != null;
    let dx: number;
    let dy: number;
    let anchor: string;

    if (comp.type === "pipeline") {
      dx = comp.labelPosition?.dx ?? 0;
      dy = comp.labelPosition?.dy ?? -(NODE_RADIUS + 4);
      anchor = "middle";
    } else {
      dx = comp.labelPosition?.dx ?? NODE_RADIUS + 4;
      dy = comp.labelPosition?.dy ?? 4;
      anchor = dx < 0 ? "end" : "start";
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

  // Convert edge geometry to EdgeSegment format for collision avoidance
  const edgeSegments: EdgeSegment[] = ctx.edges.map((e) => ({
    x1: e.x1,
    y1: e.y1,
    x2: e.x2,
    y2: e.y2,
  }));

  // Apply collision avoidance algorithm
  const adjusted = avoidLabelCollisions(labelPlacements, edgeSegments);

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
