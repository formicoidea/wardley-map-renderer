/**
 * Server-side Wardley Map rendering module.
 *
 * Generates SVG and PNG from WardleyMap JSON using constants from
 * wardley-map-consts.ts and @resvg/resvg-js for rasterisation.
 *
 * @module render
 */

import { Resvg } from "@resvg/resvg-js";
import type { Context } from "hono";
import {
  WardleyMapSchema,
  sanitizeMap,
  resolveColor,
  type WardleyMap,
  type Component,
} from "./schema.js";
import {
  resolvePipelines,
  resolveHandleEvolution,
  applyPipelineContainment,
} from "./pipeline-geometry.js";
import {
  createRenderContext,
  evoToX as geoEvoToX,
  visToY as geoVisToY,
  allComponentPositions,
  allEdgeSegments,
  allPipelineRects,
  componentEvolveArrows,
  type RenderContext,
  type ComponentPosition,
  type PipelineRect as GeoPipelineRect,
  type EdgeSegment as GeoEdgeSegment,
  type EvolveArrow,
} from "./geometry.js";
import {
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
  EVOLUTION_PHASES,
  EVOLUTION_BOUNDARIES,
  AXIS_MARGIN_LEFT,
  AXIS_MARGIN_BOTTOM,
  AXIS_MARGIN_TOP,
  BORDER_COLOR,
  DIVIDER_COLOR,
  BACKGROUND_COLOR,
  LABEL_COLOR,
  AXIS_LABEL_COLOR,
  AXIS_LABEL_FONT_SIZE,
  PHASE_LABEL_FONT_SIZE,
  DIRECTION_LABEL_FONT_SIZE,
  TITLE_FONT_SIZE,
  DEFAULT_X_AXIS_LABEL,
  DEFAULT_Y_AXIS_LABEL,
} from "./blocks/wardley-map/wardley-map-consts.js";

// ── Dimensions ──────────────────────────────────────────────────────
const W = WARDLEY_MAP_DEFAULT_WIDTH; // 1600
const H = WARDLEY_MAP_DEFAULT_HEIGHT; // 900

// Layout margins (right margin matches Lit spike reference)
const MARGIN_RIGHT = 20;

// Drawable area (inside margins)
const PLOT_LEFT = AXIS_MARGIN_LEFT;
const PLOT_TOP = AXIS_MARGIN_TOP;
const PLOT_RIGHT = W - MARGIN_RIGHT;
const PLOT_BOTTOM = H - AXIS_MARGIN_BOTTOM;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

// Horizontal grid lines for visibility axis (matching Lit spike)
const GRID_COLOR = "#e8e8e8";
const GRID_LINE_COUNT = 8;

// ── Component visual constants ──────────────────────────────────────
const NODE_RADIUS = 5;
const NODE_FILL = "#ffffff";
const NODE_STROKE = "#000000";
const EDGE_COLOR = "#999999";
const COMPONENT_LABEL_FONT_SIZE = 12;
const COMPONENT_LABEL_COLOR = "#333333";

// ── Pipeline visual constants ───────────────────────────────────────
const PIPELINE_FILL = "rgba(230, 230, 230, 0.35)";
const PIPELINE_STROKE = "#999999";
const PIPELINE_STROKE_WIDTH = 1;
const PIPELINE_CORNER_RADIUS = 4;
const PIPELINE_LABEL_FONT_SIZE = 11;
const PIPELINE_LABEL_COLOR = "#666666";
/** Padding (px) added around pipeline geometry to ensure contained components fit */
const PIPELINE_PADDING = 4;

// ── Phase 1+2 architecture is defined below avoidLabelCollisions ─────

// ── Output directory ────────────────────────────────────────────────

/** Default output directory for rendered files */
export const DEFAULT_OUTPUT_DIR = "tmp/renders";

/**
 * Ensure the output directory exists, creating it recursively if needed.
 * Safe to call multiple times (idempotent).
 */
export async function ensureOutputDir(
  dir: string = DEFAULT_OUTPUT_DIR
): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const resolved = path.resolve(dir);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Escape text for XML/SVG attribute/content safety */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Map evolution (0-1) to pixel x inside plot area */
function evoToX(evolution: number): number {
  return PLOT_LEFT + evolution * PLOT_W;
}

/** Map visibility (0=top, 1=bottom) to pixel y inside plot area */
function visToY(visibility: number): number {
  return PLOT_TOP + visibility * PLOT_H;
}

// ── Label collision avoidance (label-label + label-edge) ────────────

export interface LabelPlacement {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  /** Component node center — used for alternate placement trials */
  nodeCx?: number;
  nodeCy?: number;
  /** Whether this label has a user-specified labelPosition (skip repositioning) */
  pinned?: boolean;
}

/** A line segment representing a relation edge in pixel coordinates */
export interface EdgeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LabelBox {
  label: LabelPlacement;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Compute the bounding box for a label placement. */
function labelToBox(l: LabelPlacement, charWidth: number, lineHeight: number): LabelBox {
  const textW = l.text.length * charWidth;
  let left: number, right: number;
  if (l.anchor === "start") {
    left = l.x;
    right = l.x + textW;
  } else if (l.anchor === "end") {
    left = l.x - textW;
    right = l.x;
  } else {
    left = l.x - textW / 2;
    right = l.x + textW / 2;
  }
  return {
    label: l,
    left,
    right,
    top: l.y - lineHeight * 0.7,
    bottom: l.y + lineHeight * 0.3,
  };
}

/**
 * Check if a line segment intersects an axis-aligned rectangle
 * using the Liang-Barsky clipping algorithm.
 *
 * @param x1 - Segment start x
 * @param y1 - Segment start y
 * @param x2 - Segment end x
 * @param y2 - Segment end y
 * @param left - Rectangle left edge
 * @param top - Rectangle top edge
 * @param right - Rectangle right edge
 * @param bottom - Rectangle bottom edge
 */
export function segmentIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  left: number, top: number, right: number, bottom: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Liang-Barsky edge parameters
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - left, right - x1, y1 - top, bottom - y1];

  let tMin = 0;
  let tMax = 1;

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-10) {
      // Line is parallel to this edge — if outside, no intersection
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        tMin = Math.max(tMin, t);
      } else {
        tMax = Math.min(tMax, t);
      }
      if (tMin > tMax) return false;
    }
  }
  return true;
}

/** Candidate offsets for alternate label positions around a node (right, left, top, bottom) */
const LABEL_CANDIDATES: { dx: number; dy: number; anchor: "start" | "end" | "middle" }[] = [
  { dx: NODE_RADIUS + 4, dy: 4, anchor: "start" },    // right (default)
  { dx: -(NODE_RADIUS + 4), dy: 4, anchor: "end" },    // left
  { dx: 0, dy: -(NODE_RADIUS + 6), anchor: "middle" }, // top
  { dx: 0, dy: NODE_RADIUS + 14, anchor: "middle" },   // bottom
];

/** Check if two boxes overlap */
function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Compute total overlap area between a box and all other boxes (excluding self by index) */
function overlapPenalty(box: LabelBox, others: LabelBox[], selfIndex: number): number {
  let penalty = 0;
  for (let k = 0; k < others.length; k++) {
    if (k === selfIndex) continue;
    const other = others[k];
    if (boxesOverlap(box, other)) {
      const ox = Math.min(box.right, other.right) - Math.max(box.left, other.left);
      const oy = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
      penalty += ox * oy;
    }
  }
  return penalty;
}

/** Check if any edge segment intersects a label bounding box. */
function labelCollidesWithEdges(box: LabelBox, edges: EdgeSegment[]): boolean {
  for (const e of edges) {
    if (segmentIntersectsRect(e.x1, e.y1, e.x2, e.y2, box.left, box.top, box.right, box.bottom)) {
      return true;
    }
  }
  return false;
}

/** Recompute a box's left/right/top/bottom from its label position. */
function refreshBox(box: LabelBox, charWidth: number, lineHeight: number): void {
  const fresh = labelToBox(box.label, charWidth, lineHeight);
  box.left = fresh.left;
  box.right = fresh.right;
  box.top = fresh.top;
  box.bottom = fresh.bottom;
}

export function avoidLabelCollisions(
  labels: LabelPlacement[],
  edges: EdgeSegment[] = [],
  charWidth = 7,
  lineHeight = 16
): LabelPlacement[] {
  const boxes: LabelBox[] = labels.map((l) => labelToBox(l, charWidth, lineHeight));

  // ── Phase 1: Alternate-placement repositioning ──────────
  // For each non-pinned label that overlaps others, try alternate
  // anchor positions (right, left, top, bottom of node) and pick
  // the placement with the smallest overlap penalty.
  for (let i = 0; i < boxes.length; i++) {
    const lbl = boxes[i].label;

    // Skip pinned labels (user-specified position)
    if (lbl.pinned) continue;

    // Skip labels without node info
    if (lbl.nodeCx == null || lbl.nodeCy == null) continue;

    const currentPenalty = overlapPenalty(boxes[i], boxes, i);
    if (currentPenalty === 0) continue; // no collision

    let bestPenalty = currentPenalty;
    let bestCandidate: LabelPlacement | null = null;

    for (const cand of LABEL_CANDIDATES) {
      const trial: LabelPlacement = {
        ...lbl,
        x: lbl.nodeCx + cand.dx,
        y: lbl.nodeCy + cand.dy,
        anchor: cand.anchor,
      };
      const trialBox = labelToBox(trial, charWidth, lineHeight);
      // Temporarily replace for penalty calculation
      const saved = boxes[i];
      boxes[i] = trialBox;
      const penalty = overlapPenalty(trialBox, boxes, i);
      boxes[i] = saved;

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestCandidate = trial;
        if (penalty === 0) break; // perfect placement found
      }
    }

    if (bestCandidate) {
      boxes[i] = labelToBox(bestCandidate, charWidth, lineHeight);
    }
  }

  // ── Phase 2: Vertical push-apart for remaining overlaps ──
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (boxesOverlap(a, b)) {
          const overlapY = Math.min(a.bottom - b.top, b.bottom - a.top);
          const shift = overlapY / 2 + 2;
          if (a.label.y <= b.label.y) {
            a.label.y -= shift; a.top -= shift; a.bottom -= shift;
            b.label.y += shift; b.top += shift; b.bottom += shift;
          } else {
            b.label.y -= shift; b.top -= shift; b.bottom -= shift;
            a.label.y += shift; a.top += shift; a.bottom += shift;
          }
        }
      }
    }
  }

  // ── Pass 2: label-edge collision avoidance ───────────────
  // For each label that overlaps an edge, nudge it vertically
  if (edges.length > 0) {
    const EDGE_NUDGE = lineHeight + 2; // px to shift away from edge
    for (let pass = 0; pass < 3; pass++) {
      for (const box of boxes) {
        if (labelCollidesWithEdges(box, edges)) {
          // Save original position
          const savedY = box.label.y;
          const savedTop = box.top;
          const savedBottom = box.bottom;

          // Try shifting down first
          box.label.y += EDGE_NUDGE;
          refreshBox(box, charWidth, lineHeight);

          if (labelCollidesWithEdges(box, edges)) {
            // Shifting down still collides — revert and shift up instead
            box.label.y = savedY - EDGE_NUDGE;
            refreshBox(box, charWidth, lineHeight);
          }
        }
      }
    }
  }

  // Clamp labels inside plot area
  for (const b of boxes) {
    if (b.label.y < PLOT_TOP + lineHeight) b.label.y = PLOT_TOP + lineHeight;
    if (b.label.y > PLOT_BOTTOM) b.label.y = PLOT_BOTTOM;
  }

  return boxes.map((b) => b.label);
}

// ── Phase 1+2 Types ─────────────────────────────────────────────────

/** Pre-computed node geometry for a single component */
export interface NodeGeometry {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly label: string;
  readonly type: Component["type"];
  /** Resolved hex color for the node stroke */
  readonly color: string;
}

/** Pre-computed pipeline rectangle geometry */
export interface PipelineGeometryRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  /** Handle attachment point x for label */
  readonly handleX: number;
  /** Handle attachment point y for label (top of pipeline) */
  readonly handleY: number;
}

/** Pre-computed edge segment with metadata */
export interface RelationSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** Optional flow style (solid, dashed, bold) */
  readonly style?: "solid" | "dashed" | "bold";
}

/** Pre-computed evolution arrow geometry */
export interface EvolveArrowGeometry {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly evolveType: "natural" | "ecosystem" | "forced";
}

/**
 * Complete pre-computed geometry for a Wardley Map (Phase 1 output).
 *
 * Contains all pixel positions, dimensions, and layout information
 * needed by Phase 2 (renderSvg) to produce the final SVG string.
 * No further coordinate calculations needed — purely consumed.
 */
export interface RenderGeometry {
  /** Render context with canvas dimensions and plot area */
  readonly ctx: RenderContext;
  /** Map title text */
  readonly title: string;
  /** Whether to show the value chain (Y) axis */
  readonly showValueChainAxis: boolean;
  /** Whether to show the evolution (X) axis */
  readonly showEvolutionAxis: boolean;
  /** Pre-computed node positions for non-pipeline components */
  readonly nodes: readonly NodeGeometry[];
  /** Pre-computed pipeline rectangles */
  readonly pipelines: readonly PipelineGeometryRect[];
  /** Pre-computed relation edge segments */
  readonly edges: readonly RelationSegment[];
  /** Pre-computed evolution arrow segments */
  readonly evolveArrows: readonly EvolveArrowGeometry[];
  /** Pre-computed label placements (before collision avoidance) */
  readonly initialLabels: readonly LabelPlacement[];
  /** Edge segments for collision avoidance (matches edges but typed for avoidLabelCollisions) */
  readonly edgeSegmentsForCollision: readonly EdgeSegment[];
}

/**
 * Options for SVG rendering (Phase 2).
 * Controls visual styling without affecting geometry.
 */
export interface RenderOptions {
  /** Pipeline visual padding in pixels (default: 4) */
  readonly pipelinePadding?: number;
  /** Pipeline corner radius (default: 4) */
  readonly pipelineCornerRadius?: number;
  /** Pipeline fill color (default: semi-transparent gray) */
  readonly pipelineFill?: string;
  /** Pipeline stroke color */
  readonly pipelineStroke?: string;
  /** Node radius (default: 5) */
  readonly nodeRadius?: number;
  /** Background color override */
  readonly backgroundColor?: string;
}

// ── Phase 1: Geometry computation ───────────────────────────────────

/**
 * Phase 1 — Compute all geometry from a WardleyMap.
 *
 * Takes a (sanitized) WardleyMap and produces a RenderGeometry
 * containing all pixel positions, pipeline rects, edge segments,
 * evolution arrows, and initial label placements.
 *
 * This is a pure function: no SVG generation, no side effects.
 *
 * @param inputMap - A validated WardleyMap (ideally after sanitizeMap)
 * @returns Complete pre-computed geometry for Phase 2
 */
export function computeGeometry(inputMap: WardleyMap): RenderGeometry {
  // Apply pipeline containment (clamps sub-components to pipeline bounds)
  const map = applyPipelineContainment(inputMap);

  // Build render context from gridSize
  const ctx = createRenderContext(map);

  // ── Component positions ──────────────────────────────────
  const positions = allComponentPositions(map, ctx);

  // ── Pipeline rects ───────────────────────────────────────
  const resolvedPipelines = resolvePipelines(map);
  const pipelineRects: PipelineGeometryRect[] = resolvedPipelines
    .filter((rp) => rp.geometry)
    .map((rp) => {
      const pg = rp.geometry;
      const x1 = geoEvoToX(pg.evoStart, ctx);
      const x2 = geoEvoToX(pg.evoEnd, ctx);
      const y1 = geoVisToY(pg.visStart, ctx);
      const y2 = geoVisToY(pg.visEnd, ctx);
      const handleEvo = resolveHandleEvolution(pg);
      return {
        id: rp.component.id,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        label: rp.component.label,
        handleX: geoEvoToX(handleEvo, ctx),
        handleY: Math.min(y1, y2),
      };
    });

  // ── Edge segments ────────────────────────────────────────
  const edgeSegments: RelationSegment[] = [];
  const edgeSegmentsForCollision: EdgeSegment[] = [];
  const compById = new Map(map.components.map((c) => [c.id, c]));

  for (const rel of map.relations) {
    const src = positions.get(rel.source);
    const tgt = positions.get(rel.target);
    if (!src || !tgt) continue;

    const seg = { x1: src.cx, y1: src.cy, x2: tgt.cx, y2: tgt.cy };
    edgeSegments.push({
      ...seg,
      style: rel.flow?.style ?? "solid",
    });
    edgeSegmentsForCollision.push(seg);
  }

  // ── Nodes (non-pipeline components) ──────────────────────
  const nodes: NodeGeometry[] = [];
  const initialLabels: LabelPlacement[] = [];

  for (const comp of map.components) {
    if (comp.type === "pipeline") continue;

    const pos = positions.get(comp.id);
    if (!pos) continue;

    nodes.push({
      id: comp.id,
      cx: pos.cx,
      cy: pos.cy,
      label: comp.label,
      type: comp.type,
      color: resolveColor(comp.color),
    });

    // Build initial label placement
    const hasCustomPos = comp.labelPosition != null;
    const dx = comp.labelPosition?.dx ?? NODE_RADIUS + 4;
    const dy = comp.labelPosition?.dy ?? 4;
    initialLabels.push({
      x: pos.cx + dx,
      y: pos.cy + dy,
      text: comp.label,
      anchor: dx < 0 ? "end" : "start",
      nodeCx: pos.cx,
      nodeCy: pos.cy,
      pinned: hasCustomPos,
    });
  }

  // ── Evolution arrows ─────────────────────────────────────
  const evolveArrows: EvolveArrowGeometry[] = [];
  for (const comp of map.components) {
    const arrows = componentEvolveArrows(comp, ctx);
    for (const a of arrows) {
      evolveArrows.push({
        fromX: a.fromX,
        fromY: a.fromY,
        toX: a.toX,
        toY: a.toY,
        evolveType: a.evolveType,
      });
    }
  }

  return {
    ctx,
    title: map.title,
    showValueChainAxis: map.axes.valueChain,
    showEvolutionAxis: map.axes.evolution,
    nodes,
    pipelines: pipelineRects,
    edges: edgeSegments,
    evolveArrows,
    initialLabels,
    edgeSegmentsForCollision,
  };
}

// ── Phase 2: SVG rendering ──────────────────────────────────────────

/**
 * Phase 2 — Render pre-computed geometry to an SVG string.
 *
 * Consumes a RenderGeometry (from computeGeometry) and produces
 * the final SVG string. This function handles only SVG generation:
 * template literal assembly, label collision avoidance, and styling.
 *
 * No coordinate calculations are performed here — all positions
 * come from the RenderGeometry input.
 *
 * @param geometry - Pre-computed geometry from Phase 1
 * @param options  - Optional visual styling overrides
 * @returns Complete SVG string
 */
export function renderSvg(
  geometry: RenderGeometry,
  options: RenderOptions = {}
): string {
  const { ctx } = geometry;
  const W = ctx.width;
  const H = ctx.height;

  // Resolve options with defaults
  const pipelinePadding = options.pipelinePadding ?? PIPELINE_PADDING;
  const pipelineCornerRadius = options.pipelineCornerRadius ?? PIPELINE_CORNER_RADIUS;
  const pipelineFillColor = options.pipelineFill ?? PIPELINE_FILL;
  const pipelineStrokeColor = options.pipelineStroke ?? PIPELINE_STROKE;
  const nodeRadius = options.nodeRadius ?? NODE_RADIUS;
  const bgColor = options.backgroundColor ?? BACKGROUND_COLOR;

  const parts: string[] = [];

  // ── SVG header ──────────────────────────────────────────
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  );

  // ── Layer 1: Background ─────────────────────────────────
  parts.push(
    `<rect width="${W}" height="${H}" fill="${bgColor}" />`
  );

  // ── Layer 2: Title ──────────────────────────────────────
  if (geometry.title.trim()) {
    const titleY = ctx.plotTop - 6;
    parts.push(
      `<text x="${W / 2}" y="${titleY}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${TITLE_FONT_SIZE}" ` +
        `font-weight="600" fill="#333333">${esc(geometry.title.trim())}</text>`
    );
  }

  // ── Layer 3: Axes (plot border, grid, dividers, labels) ──
  // Plot area border
  parts.push(
    `<rect x="${ctx.plotLeft}" y="${ctx.plotTop}" width="${ctx.plotWidth}" height="${ctx.plotHeight}" ` +
      `fill="none" stroke="${BORDER_COLOR}" stroke-width="1" />`
  );

  // Horizontal grid lines (visibility axis)
  for (let i = 1; i < GRID_LINE_COUNT; i++) {
    const y = ctx.plotTop + (ctx.plotHeight * i) / GRID_LINE_COUNT;
    parts.push(
      `<line x1="${ctx.plotLeft}" y1="${y}" x2="${ctx.plotRight}" y2="${y}" ` +
        `stroke="${GRID_COLOR}" stroke-width="0.5" />`
    );
  }

  // Evolution phase dividers (vertical dashed lines)
  if (geometry.showEvolutionAxis) {
    for (const ratio of EVOLUTION_BOUNDARIES) {
      const x = ctx.plotLeft + ratio * ctx.plotWidth;
      parts.push(
        `<line x1="${x}" y1="${ctx.plotTop}" x2="${x}" y2="${ctx.plotBottom}" ` +
          `stroke="${DIVIDER_COLOR}" stroke-width="1" stroke-dasharray="4,4" />`
      );
    }

    // Phase labels (below x-axis)
    for (const phase of EVOLUTION_PHASES) {
      const cx = ctx.plotLeft + ((phase.startRatio + phase.endRatio) / 2) * ctx.plotWidth;
      const cy = ctx.plotBottom + AXIS_MARGIN_BOTTOM / 2 + 4;
      parts.push(
        `<text x="${cx}" y="${cy}" text-anchor="middle" ` +
          `font-family="Inter, sans-serif" font-size="${PHASE_LABEL_FONT_SIZE}" ` +
          `fill="${LABEL_COLOR}">${esc(phase.label)}</text>`
      );
    }

    // X-axis label
    parts.push(
      `<text x="${ctx.plotLeft + ctx.plotWidth / 2}" y="${H - 4}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
        `fill="${AXIS_LABEL_COLOR}">${esc(DEFAULT_X_AXIS_LABEL)}</text>`
    );
  }

  // Y-axis label (rotated) — shown when valueChain axis is enabled
  if (geometry.showValueChainAxis) {
    parts.push(
      `<text x="14" y="${ctx.plotTop + ctx.plotHeight / 2}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
        `fill="${AXIS_LABEL_COLOR}" ` +
        `transform="rotate(-90, 14, ${ctx.plotTop + ctx.plotHeight / 2})">${esc(DEFAULT_Y_AXIS_LABEL)}</text>`
    );

    // Visibility direction indicators
    parts.push(
      `<text x="${ctx.plotLeft + 4}" y="${ctx.plotTop + 14}" ` +
        `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">Visible</text>`
    );
    parts.push(
      `<text x="${ctx.plotLeft + 4}" y="${ctx.plotBottom - 4}" ` +
        `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">Invisible</text>`
    );
  }

  // ── Layer 4: Pipelines (background rectangles) ──────────
  for (const pipe of geometry.pipelines) {
    const px = pipe.x - pipelinePadding;
    const py = pipe.y - pipelinePadding;
    const pw = pipe.width + pipelinePadding * 2;
    const ph = pipe.height + pipelinePadding * 2;

    parts.push(
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" ` +
        `rx="${pipelineCornerRadius}" ry="${pipelineCornerRadius}" ` +
        `fill="${pipelineFillColor}" stroke="${pipelineStrokeColor}" ` +
        `stroke-width="${PIPELINE_STROKE_WIDTH}" />`
    );

    // Pipeline label — above the rectangle
    const labelY = py - 4;
    parts.push(
      `<text x="${pipe.handleX}" y="${labelY}" text-anchor="start" ` +
        `font-family="Inter, sans-serif" font-size="${PIPELINE_LABEL_FONT_SIZE}" ` +
        `fill="${PIPELINE_LABEL_COLOR}">${esc(pipe.label)}</text>`
    );
  }

  // ── Layer 5: Relations (edges) ──────────────────────────
  for (const edge of geometry.edges) {
    const dashAttr = edge.style === "dashed"
      ? ` stroke-dasharray="6,3"`
      : "";
    const strokeWidth = edge.style === "bold" ? "2.5" : "1.5";
    parts.push(
      `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" ` +
        `stroke="${EDGE_COLOR}" stroke-width="${strokeWidth}"${dashAttr} />`
    );
  }

  // ── Layer 6: Evolution arrows ───────────────────────────
  for (const arrow of geometry.evolveArrows) {
    // Evolve arrow style varies by type
    const strokeColor = arrow.evolveType === "forced"
      ? "#dc2626"
      : arrow.evolveType === "ecosystem"
        ? "#2563eb"
        : "#666666";
    const dashAttr = arrow.evolveType === "forced"
      ? ` stroke-dasharray="4,2"`
      : "";

    parts.push(
      `<line x1="${arrow.fromX}" y1="${arrow.fromY}" x2="${arrow.toX}" y2="${arrow.toY}" ` +
        `stroke="${strokeColor}" stroke-width="1.5"${dashAttr} ` +
        `marker-end="url(#arrowhead-${arrow.evolveType})" />`
    );
  }

  // Add arrowhead markers if there are evolution arrows
  if (geometry.evolveArrows.length > 0) {
    const markerTypes = Array.from(new Set(geometry.evolveArrows.map((a) => a.evolveType)));
    const markerDefs: string[] = [];
    for (const type of markerTypes) {
      const color = type === "forced"
        ? "#dc2626"
        : type === "ecosystem"
          ? "#2563eb"
          : "#666666";
      markerDefs.push(
        `<marker id="arrowhead-${type}" markerWidth="8" markerHeight="6" ` +
          `refX="8" refY="3" orient="auto">` +
          `<polygon points="0 0, 8 3, 0 6" fill="${color}" /></marker>`
      );
    }
    // Insert defs block right after the SVG opening tag
    // We insert it at index 1 (after header, before background)
    parts.splice(1, 0, `<defs>${markerDefs.join("")}</defs>`);
  }

  // ── Layer 7: Components (nodes) ─────────────────────────
  for (const node of geometry.nodes) {
    const strokeColor = node.color !== "#000000" ? node.color : NODE_STROKE;
    parts.push(
      `<circle cx="${node.cx}" cy="${node.cy}" r="${nodeRadius}" ` +
        `fill="${NODE_FILL}" stroke="${strokeColor}" stroke-width="1.5" />`
    );
  }

  // ── Layer 8: Labels (with collision avoidance) ──────────
  const adjusted = avoidLabelCollisions(
    [...geometry.initialLabels],
    [...geometry.edgeSegmentsForCollision]
  );
  for (const lbl of adjusted) {
    parts.push(
      `<text x="${lbl.x}" y="${lbl.y}" text-anchor="${lbl.anchor}" ` +
        `font-family="Inter, sans-serif" font-size="${COMPONENT_LABEL_FONT_SIZE}" ` +
        `fill="${COMPONENT_LABEL_COLOR}">${esc(lbl.text)}</text>`
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

// ── SVG Generation (legacy monolithic — delegates to Phase 1+2) ─────

/**
 * Render a WardleyMap to an SVG string.
 *
 * This is the original monolithic entry point, now implemented as
 * a thin wrapper around the 2-phase pipeline: computeGeometry → renderSvg.
 */
export function renderMapToSVG(inputMap: WardleyMap): string {
  // Apply pipeline containment before rendering (clamps sub-components to pipeline bounds)
  const map = applyPipelineContainment(inputMap);
  const parts: string[] = [];

  // SVG header
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  );

  // Background
  parts.push(
    `<rect width="${W}" height="${H}" fill="${BACKGROUND_COLOR}" />`
  );

  // ── Title (above axes) ──────────────────────────────────
  if (map.title.trim()) {
    // Position title baseline just above the plot area border.
    // PLOT_TOP is 24 (AXIS_MARGIN_TOP), so titleY ≈ 18 keeps the
    // title clearly above the axes while staying within the viewport.
    const titleY = PLOT_TOP - 6;
    parts.push(
      `<text x="${W / 2}" y="${titleY}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${TITLE_FONT_SIZE}" ` +
        `font-weight="600" fill="#333333">${esc(map.title.trim())}</text>`
    );
  }

  // ── Plot area border ────────────────────────────────────
  parts.push(
    `<rect x="${PLOT_LEFT}" y="${PLOT_TOP}" width="${PLOT_W}" height="${PLOT_H}" ` +
      `fill="none" stroke="${BORDER_COLOR}" stroke-width="1" />`
  );

  // ── Horizontal grid lines (visibility axis) ────────────
  for (let i = 1; i < GRID_LINE_COUNT; i++) {
    const y = PLOT_TOP + (PLOT_H * i) / GRID_LINE_COUNT;
    parts.push(
      `<line x1="${PLOT_LEFT}" y1="${y}" x2="${PLOT_RIGHT}" y2="${y}" ` +
        `stroke="${GRID_COLOR}" stroke-width="0.5" />`
    );
  }

  // ── Evolution phase dividers (vertical dashed lines) ───
  for (const ratio of EVOLUTION_BOUNDARIES) {
    const x = evoToX(ratio);
    parts.push(
      `<line x1="${x}" y1="${PLOT_TOP}" x2="${x}" y2="${PLOT_BOTTOM}" ` +
        `stroke="${DIVIDER_COLOR}" stroke-width="1" stroke-dasharray="4,4" />`
    );
  }

  // ── Phase labels (below x-axis) ────────────────────────
  for (const phase of EVOLUTION_PHASES) {
    const cx = evoToX((phase.startRatio + phase.endRatio) / 2);
    const cy = PLOT_BOTTOM + AXIS_MARGIN_BOTTOM / 2 + 4;
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${PHASE_LABEL_FONT_SIZE}" ` +
        `fill="${LABEL_COLOR}">${esc(phase.label)}</text>`
    );
  }

  // ── Axis labels ─────────────────────────────────────────
  // X-axis label
  parts.push(
    `<text x="${PLOT_LEFT + PLOT_W / 2}" y="${H - 4}" text-anchor="middle" ` +
      `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
      `fill="${AXIS_LABEL_COLOR}">${esc(DEFAULT_X_AXIS_LABEL)}</text>`
  );

  // Y-axis label (rotated)
  parts.push(
    `<text x="14" y="${PLOT_TOP + PLOT_H / 2}" text-anchor="middle" ` +
      `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
      `fill="${AXIS_LABEL_COLOR}" ` +
      `transform="rotate(-90, 14, ${PLOT_TOP + PLOT_H / 2})">${esc(DEFAULT_Y_AXIS_LABEL)}</text>`
  );

  // ── Visibility direction indicators ─────────────────────
  parts.push(
    `<text x="${PLOT_LEFT + 4}" y="${PLOT_TOP + 14}" ` +
      `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">Visible</text>`
  );
  parts.push(
    `<text x="${PLOT_LEFT + 4}" y="${PLOT_BOTTOM - 4}" ` +
      `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">Invisible</text>`
  );

  // ── Build component lookup ──────────────────────────────
  const compById = new Map(map.components.map((c) => [c.id, c]));

  // ── Pipelines (background rectangles) ──────────────────
  // Rendered before edges/nodes so they appear behind everything.
  // Per constraint: "Pipelines traités comme fond visuel sans impact sur placement des labels"
  const resolvedPipelines = resolvePipelines(map);

  for (const rp of resolvedPipelines) {
    const pg = rp.geometry;

    // Convert normalised [0-1] coordinates to pixel positions
    const x = evoToX(pg.evoStart) - PIPELINE_PADDING;
    const y = visToY(pg.visStart) - PIPELINE_PADDING;
    const w = evoToX(pg.evoEnd) - evoToX(pg.evoStart) + PIPELINE_PADDING * 2;
    const h = visToY(pg.visEnd) - visToY(pg.visStart) + PIPELINE_PADDING * 2;

    // Pipeline rectangle (rounded corners)
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" ` +
        `rx="${PIPELINE_CORNER_RADIUS}" ry="${PIPELINE_CORNER_RADIUS}" ` +
        `fill="${PIPELINE_FILL}" stroke="${PIPELINE_STROKE}" ` +
        `stroke-width="${PIPELINE_STROKE_WIDTH}" />`
    );

    // Pipeline label — positioned at handleEvolution along x-axis,
    // above the pipeline rectangle. handleEvolution determines where
    // the pipeline's label/handle sits within its evolution range.
    const handleEvo = resolveHandleEvolution(pg);
    const labelX = evoToX(handleEvo);
    const labelY = y - 4; // 4px above the rectangle top
    parts.push(
      `<text x="${labelX}" y="${labelY}" text-anchor="start" ` +
        `font-family="Inter, sans-serif" font-size="${PIPELINE_LABEL_FONT_SIZE}" ` +
        `fill="${PIPELINE_LABEL_COLOR}">${esc(rp.component.label)}</text>`
    );
  }

  // ── Relations (edges) ───────────────────────────────────
  const edgeSegments: EdgeSegment[] = [];
  for (const rel of map.relations) {
    const src = compById.get(rel.source);
    const tgt = compById.get(rel.target);
    if (!src || !tgt) continue;

    const x1 = evoToX(src.evolution);
    const y1 = visToY(src.visibility);
    const x2 = evoToX(tgt.evolution);
    const y2 = visToY(tgt.visibility);

    edgeSegments.push({ x1, y1, x2, y2 });
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
        `stroke="${EDGE_COLOR}" stroke-width="1.5" />`
    );
  }

  // ── Components (nodes) ──────────────────────────────────
  const labelPlacements: LabelPlacement[] = [];

  for (const comp of map.components) {
    // Skip pipeline components — they are rendered as rectangles above
    if (comp.type === "pipeline") continue;

    const cx = evoToX(comp.evolution);
    const cy = visToY(comp.visibility);

    // Node circle
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS}" ` +
        `fill="${NODE_FILL}" stroke="${NODE_STROKE}" stroke-width="1.5" />`
    );

    // Collect label for collision avoidance
    // Use labelPosition offset if provided, otherwise default to right of node
    const hasCustomPos = comp.labelPosition != null;
    const dx = comp.labelPosition?.dx ?? NODE_RADIUS + 4;
    const dy = comp.labelPosition?.dy ?? 4;
    labelPlacements.push({
      x: cx + dx,
      y: cy + dy,
      text: comp.label,
      anchor: dx < 0 ? "end" : "start",
      nodeCx: cx,
      nodeCy: cy,
      pinned: hasCustomPos,
    });
  }

  // ── Apply label collision avoidance and render labels ───
  const adjusted = avoidLabelCollisions(labelPlacements, edgeSegments);
  for (const lbl of adjusted) {
    parts.push(
      `<text x="${lbl.x}" y="${lbl.y}" text-anchor="${lbl.anchor}" ` +
        `font-family="Inter, sans-serif" font-size="${COMPONENT_LABEL_FONT_SIZE}" ` +
        `fill="${COMPONENT_LABEL_COLOR}">${esc(lbl.text)}</text>`
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

// ── PNG Rasterisation ───────────────────────────────────────────────

/** Font loading — lazy-loaded Inter TTF for resvg */
let interFontData: Uint8Array | null = null;

async function loadInterFont(): Promise<Uint8Array> {
  if (interFontData) return interFontData;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const fontPath = path.join(
    import.meta.dirname ?? ".",
    "..",
    "assets",
    "fonts",
    "Inter-Regular.ttf"
  );

  try {
    interFontData = new Uint8Array(await fs.readFile(fontPath));
  } catch {
    // Fallback: render without custom font (system sans-serif)
    console.warn(
      `[render] Inter font not found at ${fontPath}, using default sans-serif`
    );
    interFontData = new Uint8Array(0);
  }
  return interFontData;
}

/**
 * Render a WardleyMap to a PNG Buffer.
 */
export async function renderMapToPNG(map: WardleyMap): Promise<Buffer> {
  const svg = renderMapToSVG(map);
  const fontData = await loadInterFont();

  const opts: any = {
    background: "#ffffff", // Ensure opaque white background for PNG
    fitTo: { mode: "width" as const, value: W },
  };

  if (fontData.length > 0) {
    opts.font = {
      fontFiles: [fontData],
      defaultFontFamily: "Inter",
    };
  }

  const resvg = new Resvg(svg, opts);
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

// ── Content Negotiation ──────────────────────────────────────────────

/** Supported media types and their format mapping */
const SUPPORTED_FORMATS = new Map<string, "svg" | "png">([
  ["image/svg+xml", "svg"],
  ["image/png", "png"],
  ["image/*", "png"],   // wildcard image → default to PNG
  ["*/*", "png"],       // full wildcard → default to PNG
]);

/**
 * Parse the Accept header and determine the best supported format.
 * Returns "svg", "png", or null if no supported format matches.
 *
 * Default behaviour: PNG is returned when the Accept header is missing,
 * ambiguous (`*​/*`, `image/*`), or does not express a preference.
 * To receive SVG, clients must explicitly request `image/svg+xml`.
 */
export function negotiateFormat(accept: string | undefined): "svg" | "png" | null {
  if (!accept) return "png"; // default to PNG when no Accept header

  // Parse Accept header into media types sorted by quality factor
  const types = accept
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1.0;
      return { type: type.trim().toLowerCase(), q };
    })
    .filter((t) => t.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { type } of types) {
    const format = SUPPORTED_FORMATS.get(type);
    if (format) return format;
  }

  return null; // No supported format found → 406
}

// ── Internal API (importable by other modules) ──────────────────────

/**
 * Result of a programmatic render call.
 * Used internally by the API chain (e.g., conversational mode)
 * without requiring a Hono Context.
 */
export interface RenderResult {
  /** The rendered output — SVG string or PNG Buffer */
  data: string | Buffer;
  /** MIME type of the output */
  contentType: "image/svg+xml" | "image/png";
  /** Format shorthand */
  format: "svg" | "png";
}

/**
 * Render a WardleyMap to the specified format.
 *
 * This is the primary internal API for programmatic rendering.
 * It accepts an already-validated WardleyMap (e.g., from sanitizeMap)
 * and returns the rendered output with metadata.
 *
 * @example
 * ```ts
 * import { renderMap } from "./render.js";
 * import { sanitizeMap } from "./schema.js";
 *
 * const map = sanitizeMap(parsedMap);
 * const { data, contentType } = await renderMap(map, "png");
 * ```
 */
export async function renderMap(
  map: WardleyMap,
  format: "svg" | "png" = "svg"
): Promise<RenderResult> {
  if (format === "svg") {
    return {
      data: renderMapToSVG(map),
      contentType: "image/svg+xml",
      format: "svg",
    };
  }
  return {
    data: await renderMapToPNG(map),
    contentType: "image/png",
    format: "png",
  };
}

// ── Hono Route Handler ──────────────────────────────────────────────

/**
 * POST /render route handler.
 *
 * Accepts direct WardleyMap JSON as the POST body (no wrapper).
 * Uses the Accept header for content negotiation:
 *   - image/svg+xml  → returns SVG with Content-Type: image/svg+xml
 *   - image/png      → returns PNG with Content-Type: image/png
 *   - missing/wildcard → defaults to PNG
 *   - unsupported    → 406 Not Acceptable
 */
export async function renderRoute(c: Context): Promise<Response> {
  // ── Validate Content-Type ──────────────────────────────
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
    return c.json(
      {
        error: "Unsupported Media Type",
        message: "Content-Type must be application/json",
      },
      415
    );
  }

  // ── Parse body ──────────────────────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: "Invalid JSON body", message: "Request body must be valid JSON" },
      400
    );
  }

  // ── Validate against WardleyMap schema ──────────────────
  const parsed = WardleyMapSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid WardleyMap JSON",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }

  const map = sanitizeMap(parsed.data);

  // ── Content negotiation ─────────────────────────────────
  const accept = c.req.header("Accept");
  const format = negotiateFormat(accept);

  if (format === null) {
    return c.json(
      {
        error: "Not Acceptable",
        message: "Supported formats: image/svg+xml, image/png",
      },
      406
    );
  }

  // ── Render ──────────────────────────────────────────────
  try {
    if (format === "svg") {
      const svg = renderMapToSVG(map);
      return new Response(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } else {
      const png = await renderMapToPNG(map);
      return new Response(new Uint8Array(png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(png.length),
          "Cache-Control": "no-store",
        },
      });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Rendering failed";
    console.error("[render] Error:", detail);
    return c.json(
      { error: "Internal Server Error", message: detail },
      500
    );
  }
}
