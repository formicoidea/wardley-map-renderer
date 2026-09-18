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
import { scaledFontSize } from "./compose-core.js";
import { resolveTypeStyle } from "../schema-helpers.js";
import { componentRenderableType } from "../renderable-type.js";

// ── Visual constants ─────────────────────────────────────────────────

const NODE_RADIUS = 5;

/** Component types that get a text label on the map */
const LABEL_TYPES = new Set(["component", "user-need", "anchor", "pipeline", "market", "ecosystem"]);

import { renderLabel, COMPONENT_LABEL_BASE_FONT_SIZE } from "./svg-primitives.js";

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
  const excluded = new Set(ctx.resolvedConfig.excludeComponentTypes);
  const { fontFamily, labelScale, elementScales } = ctx.resolvedConfig.typography;
  const nodeScales = elementScales?.nodes ?? {};
  const fontSizeById = new Map<string, number>();

  for (const node of ctx.nodes) {
    const comp = node.component;

    // Skip notes (rendered by notes-layer)
    if (!LABEL_TYPES.has(comp.type)) continue;

    // Skip excluded component types
    if (excluded.has(comp.type)) continue;

    const cx = node.cx;
    const cy = node.cy;

    // base × textScale × labelScale × style.nodes cascade label.scale
    const nodeScale = resolveTypeStyle(nodeScales, componentRenderableType(comp.type, comp.subtype)) ?? 1;
    fontSizeById.set(comp.id, Math.round(scaledFontSize(ctx, COMPONENT_LABEL_BASE_FONT_SIZE, labelScale * nodeScale)));

    // Label offset: to the right of node (pipelines: above handle center)
    // Pinned = placed explicitly, so collision avoidance must leave it alone.
    const pinned = comp.label.position != null || comp.locked?.label === true;
    let dx: number;
    let dy: number;
    let anchor: "start" | "middle" | "end" = "middle";

    if (comp.type === "pipeline") {
      dx = comp.label.position?.dx ?? (NODE_RADIUS + 4);
      dy = comp.label.position?.dy ?? 4;
      anchor = "middle";
    } else {
      dx = comp.label.position?.dx ?? NODE_RADIUS + 4;
      dy = comp.label.position?.dy ?? 4;
      anchor = dx < 0 ? "end" : anchor;
      anchor = dx > 0 ? "start" : anchor;
    }

    // A stored anchor wins over the sign of dx: a label the collision avoider
    // (or the editor) placed keeps its side instead of flipping when dragged.
    anchor = comp.label.position?.anchor ?? anchor;

    labelPlacements.push({
      x: cx + dx,
      y: cy + dy,
      text: comp.label.name,
      anchor,
      nodeCx: cx,
      nodeCy: cy,
      pinned,
      componentId: comp.id,
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
  // Respects resolvedConfig.avoidCollisions — if false, use placements as-is
  const adjusted = ctx.resolvedConfig.avoidCollisions
    ? avoidLabelCollisions(
        labelPlacements, edgeSegments,
        7, 16,
        { top: ctx.plot.top, bottom: ctx.plot.bottom }
      )
    : labelPlacements;

  // Generate SVG text elements — delegates to svg-primitives.renderLabel()
  const interactive = ctx.options?.interactive === true;
  const parts: string[] = [];
  for (const lbl of adjusted) {
    parts.push(renderLabel({
      x: lbl.x,
      y: lbl.y,
      text: lbl.text,
      anchor: lbl.anchor,
      fontFamily,
      fontSize: fontSizeById.get(lbl.componentId!) ?? COMPONENT_LABEL_BASE_FONT_SIZE,
      componentId: lbl.componentId,
      interactive,
    }));
  }

  return parts;
};
