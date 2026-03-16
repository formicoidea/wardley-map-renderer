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
import { HttpProblem } from "./middleware/error-handler.js";
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
  resolveAxisLabels,
  type ResolvedAxisLabels,
} from "./blocks/wardley-map/wardley-map-consts.js";

// ── Dimensions ──────────────────────────────────────────────────────
const W = WARDLEY_MAP_DEFAULT_WIDTH; // 1600
const H = WARDLEY_MAP_DEFAULT_HEIGHT; // 900

// Default plot bounds (used as fallback in avoidLabelCollisions)
const PLOT_TOP = AXIS_MARGIN_TOP;
const PLOT_BOTTOM = H - AXIS_MARGIN_BOTTOM;

// ── Component visual constants ──────────────────────────────────────
const NODE_RADIUS = 5;
const NODE_FILL = "#ffffff";
const NODE_STROKE = "#000000";
const EDGE_COLOR = "#999999";

/** Visual style per relation type: color + default dash pattern */
const RELATION_TYPE_STYLES: Record<string, { color: string; dashArray: string }> = {
  DependsOn:  { color: "#999999", dashArray: "" },
  Flow:       { color: "#2563eb", dashArray: "8,4" },
  Constraint: { color: "#dc2626", dashArray: "3,3" },
};
const COMPONENT_LABEL_FONT_SIZE = 12;
const COMPONENT_LABEL_COLOR = "#333333";

// ── Pipeline visual constants ───────────────────────────────────────
const PIPELINE_FILL = "rgb(255, 255, 255, 0.35)";
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

/** Compute placement penalty: label-label overlap (high weight) + edge crossings (low weight) */
function placementPenalty(box: LabelBox, others: LabelBox[], selfIndex: number, edges: EdgeSegment[]): number {
  // Label-label overlap (weight ×1000 — dominates)
  let penalty = 0;
  for (let k = 0; k < others.length; k++) {
    if (k === selfIndex) continue;
    const other = others[k];
    if (boxesOverlap(box, other)) {
      const ox = Math.min(box.right, other.right) - Math.max(box.left, other.left);
      const oy = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
      penalty += ox * oy * 1000;
    }
  }

  // Edge-crossing (weight ×1 — tiebreaker for "fond blanc")
  for (const e of edges) {
    if (segmentIntersectsRect(e.x1, e.y1, e.x2, e.y2, box.left, box.top, box.right, box.bottom)) {
      penalty += 1;
    }
  }

  return penalty;
}


/** Plot area bounds for label clamping */
export interface PlotBounds {
  top: number;
  bottom: number;
}

export function avoidLabelCollisions(
  labels: LabelPlacement[],
  edges: EdgeSegment[] = [],
  charWidth = 7,
  lineHeight = 16,
  plotBounds?: PlotBounds
): LabelPlacement[] {
  const clampTop = plotBounds?.top ?? PLOT_TOP;
  const clampBottom = plotBounds?.bottom ?? PLOT_BOTTOM;
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

    const currentPenalty = placementPenalty(boxes[i], boxes, i, edges);

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
      const penalty = placementPenalty(trialBox, boxes, i, edges);
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

  // Clamp labels inside plot area
  for (const b of boxes) {
    if (b.label.y < clampTop + lineHeight) b.label.y = clampTop + lineHeight;
    if (b.label.y > clampBottom) b.label.y = clampBottom;
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
  /** Relation type — determines base visual style (color + dash pattern) */
  readonly relationType?: "DependsOn" | "Flow" | "Constraint";
}

/** Pre-computed evolution arrow geometry */
export interface EvolveArrowGeometry {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly evolveType: "natural" | "ecosystem" | "forced" | "late";
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
  /** Resolved i18n axis labels */
  readonly axisLabels: ResolvedAxisLabels;
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
      relationType: rel.type ?? "DependsOn",
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

  // Add evolve arrows as collision segments
  for (const a of evolveArrows) {
    edgeSegmentsForCollision.push({ x1: a.fromX, y1: a.fromY, x2: a.toX, y2: a.toY });
  }

  // Add pipeline borders as collision segments (4 sides per pipeline)
  for (const p of pipelineRects) {
    const pad = PIPELINE_PADDING;
    const left = p.x - pad, top = p.y - pad;
    const right = p.x + p.width + pad, bottom = p.y + p.height + pad;
    edgeSegmentsForCollision.push(
      { x1: left, y1: top, x2: right, y2: top },       // top
      { x1: left, y1: bottom, x2: right, y2: bottom },  // bottom
      { x1: left, y1: top, x2: left, y2: bottom },      // left
      { x1: right, y1: top, x2: right, y2: bottom },    // right
    );
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
    axisLabels: resolveAxisLabels(map.axes.labels),
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
  // for (let i = 1; i < GRID_LINE_COUNT; i++) {
  //   const y = ctx.plotTop + (ctx.plotHeight * i) / GRID_LINE_COUNT;
  //   parts.push(
  //     `<line x1="${ctx.plotLeft}" y1="${y}" x2="${ctx.plotRight}" y2="${y}" ` +
  //       `stroke="${GRID_COLOR}" stroke-width="0.5" />`
  //   );
  // }

  // Resolved i18n axis labels
  const axisLabels = geometry.axisLabels;

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
    for (let i = 0; i < EVOLUTION_PHASES.length; i++) {
      const phase = EVOLUTION_PHASES[i];
      const phaseLabel = axisLabels.phases[i] ?? phase.label;
      const cx = ctx.plotLeft + ((phase.startRatio + phase.endRatio) / 2) * ctx.plotWidth;
      const cy = ctx.plotBottom + AXIS_MARGIN_BOTTOM / 2 + 4;
      parts.push(
        `<text x="${cx}" y="${cy}" text-anchor="middle" ` +
          `font-family="Inter, sans-serif" font-size="${PHASE_LABEL_FONT_SIZE}" ` +
          `fill="${LABEL_COLOR}">${esc(phaseLabel)}</text>`
      );
    }

    // X-axis label
    parts.push(
      `<text x="${ctx.plotLeft + ctx.plotWidth / 2}" y="${H - 4}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
        `fill="${AXIS_LABEL_COLOR}">${esc(axisLabels.xAxis)}</text>`
    );
  }

  // Y-axis label (rotated) — shown when valueChain axis is enabled
  if (geometry.showValueChainAxis) {
    parts.push(
      `<text x="14" y="${ctx.plotTop + ctx.plotHeight / 2}" text-anchor="middle" ` +
        `font-family="Inter, sans-serif" font-size="${AXIS_LABEL_FONT_SIZE}" ` +
        `fill="${AXIS_LABEL_COLOR}" ` +
        `transform="rotate(-90, 14, ${ctx.plotTop + ctx.plotHeight / 2})">${esc(axisLabels.yAxis)}</text>`
    );

    // Visibility direction indicators
    parts.push(
      `<text x="${ctx.plotLeft + 4}" y="${ctx.plotTop + 14}" ` +
        `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">${esc(axisLabels.visibilityHigh)}</text>`
    );
    parts.push(
      `<text x="${ctx.plotLeft + 4}" y="${ctx.plotBottom - 4}" ` +
        `font-family="Inter, sans-serif" font-size="${DIRECTION_LABEL_FONT_SIZE}" fill="${LABEL_COLOR}">${esc(axisLabels.visibilityLow)}</text>`
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
    // Resolve base visual style from relation type
    const typeStyle = RELATION_TYPE_STYLES[edge.relationType ?? "DependsOn"] ?? RELATION_TYPE_STYLES.DependsOn;
    let strokeColor = typeStyle.color;
    let strokeWidth = 1.5;
    let dashArray = typeStyle.dashArray;

    // Flow metadata can override line style
    if (edge.style === "dashed") {
      dashArray = "6,4";
    } else if (edge.style === "bold") {
      strokeWidth = 3;
    }

    const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
    parts.push(
      `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" ` +
        `stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashAttr} />`
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
    [...geometry.edgeSegmentsForCollision],
    7, 16,
    { top: ctx.plotTop, bottom: ctx.plotBottom }
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

// ── SVG Generation (delegates to Phase 1+2) ─────────────────────────

/**
 * Render a WardleyMap to an SVG string.
 *
 * Thin wrapper around the 2-phase pipeline: computeGeometry → renderSvg.
 */
export function renderMapToSVG(inputMap: WardleyMap): string {
  return renderSvg(computeGeometry(inputMap));
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
    throw new HttpProblem(415, "Unsupported Media Type", {
      detail: "Content-Type must be application/json",
    });
  }

  // ── Parse body ──────────────────────────────────────────
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpProblem(400, "Bad Request", {
      detail: "Request body must be valid JSON",
    });
  }

  // ── Validate against WardleyMap schema ──────────────────
  const parsed = WardleyMapSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpProblem(422, "Validation Error", {
      detail: "Invalid WardleyMap JSON",
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const map = sanitizeMap(parsed.data);

  // ── Content negotiation ─────────────────────────────────
  const accept = c.req.header("Accept");
  const format = negotiateFormat(accept);

  if (format === null) {
    throw new HttpProblem(406, "Not Acceptable", {
      detail: "Supported formats: image/svg+xml, image/png. Set Accept header accordingly.",
    });
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
    // Re-throw HttpProblem errors (handled by global error handler)
    if (err instanceof HttpProblem) throw err;
    const detail = err instanceof Error ? err.message : "Rendering failed";
    console.error("[render] Error:", detail);
    throw new HttpProblem(500, "Internal Server Error", { detail });
  }
}
