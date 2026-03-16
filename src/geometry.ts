/**
 * Geometry layer — Phase 1 of the 2-phase rendering pipeline.
 *
 * Computes all pixel positions from normalized [0-1] coordinates
 * using a RenderContext derived from variable gridSize + fixed margins.
 *
 * Pure functions only — no SVG generation here.
 *
 * @module geometry
 */

import type { Component, PipelineGeometry, WardleyMap } from "./schema.js";
import {
  AXIS_MARGIN_LEFT,
  AXIS_MARGIN_BOTTOM,
  AXIS_MARGIN_TOP,
} from "./blocks/wardley-map/wardley-map-consts.js";

// ── Fixed margins (pixels, identical regardless of gridSize or axes) ──

const MARGIN_RIGHT = 20;

// ── RenderContext ─────────────────────────────────────────────────────

/**
 * Immutable geometric context computed once from a WardleyMap's gridSize.
 * Passed as parameter to all geometry/rendering functions (functional style).
 */
export interface RenderContext {
  /** Total canvas width in px (gridSize.width) */
  readonly width: number;
  /** Total canvas height in px (gridSize.height) */
  readonly height: number;

  /** Plot area boundaries (inside fixed margins) */
  readonly plotLeft: number;
  readonly plotTop: number;
  readonly plotRight: number;
  readonly plotBottom: number;
  /** Drawable area dimensions */
  readonly plotWidth: number;
  readonly plotHeight: number;
}

/**
 * Build a RenderContext from a WardleyMap (uses gridSize for canvas dimensions).
 * Margins are fixed in pixels regardless of gridSize.
 */
export function createRenderContext(map: WardleyMap): RenderContext {
  const width = map.gridSize.width;
  const height = map.gridSize.height;

  const plotLeft = AXIS_MARGIN_LEFT;
  const plotTop = AXIS_MARGIN_TOP;
  const plotRight = width - MARGIN_RIGHT;
  const plotBottom = height - AXIS_MARGIN_BOTTOM;

  return {
    width,
    height,
    plotLeft,
    plotTop,
    plotRight,
    plotBottom,
    plotWidth: plotRight - plotLeft,
    plotHeight: plotBottom - plotTop,
  };
}

// ── Coordinate conversion ─────────────────────────────────────────────

/** Map evolution (0-1 normalized) → pixel x inside plot area */
export function evoToX(evolution: number, ctx: RenderContext): number {
  return ctx.plotLeft + evolution * ctx.plotWidth;
}

/** Map visibility (0=top/visible, 1=bottom/invisible — OWM convention) → pixel y */
export function visToY(visibility: number, ctx: RenderContext): number {
  // OWM convention: visibility 0 = top (visible), 1 = bottom (invisible)
  // Matches SVG y-axis direction (y increases downward) — no inversion needed
  return ctx.plotTop + visibility * ctx.plotHeight;
}

// ── Component position ───────────────────────────────────────────────

/** Pixel position for a component node center */
export interface ComponentPosition {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
}

/** Compute pixel center for a single component */
export function componentPosition(
  comp: Component,
  ctx: RenderContext
): ComponentPosition {
  return {
    id: comp.id,
    cx: evoToX(comp.evolution, ctx),
    cy: visToY(comp.visibility, ctx),
  };
}

/** Compute pixel positions for all components in a map */
export function allComponentPositions(
  map: WardleyMap,
  ctx: RenderContext
): Map<string, ComponentPosition> {
  const positions = new Map<string, ComponentPosition>();
  for (const comp of map.components) {
    positions.set(comp.id, componentPosition(comp, ctx));
  }
  return positions;
}

// ── Pipeline geometry ─────────────────────────────────────────────────

/**
 * Pixel-space rectangle for a pipeline component.
 *
 * A pipeline is a rectangular region spanning:
 *   - horizontally from evoStart → evoEnd (evolution axis)
 *   - vertically from visStart → visEnd (value chain axis)
 *
 * The handle position (label attachment point) is computed from
 * handleEvolution (defaulting to the midpoint of evoStart–evoEnd).
 */
export interface PipelineRect {
  /** Component ID of the pipeline */
  readonly id: string;
  /** Left edge x in pixels */
  readonly x: number;
  /** Top edge y in pixels */
  readonly y: number;
  /** Rectangle width in pixels */
  readonly width: number;
  /** Rectangle height in pixels */
  readonly height: number;
  /** Right edge x in pixels (convenience: x + width) */
  readonly x2: number;
  /** Bottom edge y in pixels (convenience: y + height) */
  readonly y2: number;
  /** Handle attachment point x in pixels (for label placement) */
  readonly handleX: number;
  /** Handle attachment point y in pixels (top edge of pipeline) */
  readonly handleY: number;
}

/**
 * Compute the pixel-space rectangle for a pipeline component.
 *
 * Requires pipelineGeometry to be defined on the component.
 * Returns null if pipelineGeometry is missing.
 *
 * The geometry normalised coordinates are:
 *   - evoStart/evoEnd: horizontal span on evolution axis [0-1]
 *   - visStart/visEnd: vertical span on value chain axis [0-1]
 *     (visStart < visEnd, OWM convention: 0=top, 1=bottom)
 *
 * @param comp - Pipeline component with pipelineGeometry
 * @param ctx  - RenderContext for coordinate conversion
 */
export function computePipelineRect(
  comp: Component,
  ctx: RenderContext
): PipelineRect | null {
  const pg = comp.pipelineGeometry;
  if (!pg) return null;

  // Convert normalized coordinates to pixel positions
  const x1 = evoToX(pg.evoStart, ctx);
  const x2 = evoToX(pg.evoEnd, ctx);
  const y1 = visToY(pg.visStart, ctx);
  const y2 = visToY(pg.visEnd, ctx);

  // Ensure correct ordering (min/max) for robust rendering
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  // Handle position defaults to midpoint of evo range if not specified
  const handleEvo =
    pg.handleEvolution ?? (pg.evoStart + pg.evoEnd) / 2;
  const handleX = evoToX(handleEvo, ctx);
  const handleY = y; // handle attaches at top edge

  return {
    id: comp.id,
    x,
    y,
    width: right - x,
    height: bottom - y,
    x2: right,
    y2: bottom,
    handleX,
    handleY,
  };
}

/**
 * Compute pipeline rectangles for all pipeline components in a map.
 * Non-pipeline components and pipelines without geometry are skipped.
 */
export function allPipelineRects(
  map: WardleyMap,
  ctx: RenderContext
): PipelineRect[] {
  const rects: PipelineRect[] = [];
  for (const comp of map.components) {
    if (comp.type !== "pipeline") continue;
    const rect = computePipelineRect(comp, ctx);
    if (rect) rects.push(rect);
  }
  return rects;
}

// ── Edge geometry ─────────────────────────────────────────────────────

/** Pixel-space line segment for a relation edge */
export interface EdgeSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Compute pixel-space edge segments for all relations in a map.
 * Uses pre-computed component positions for efficiency.
 */
export function allEdgeSegments(
  map: WardleyMap,
  positions: Map<string, ComponentPosition>
): EdgeSegment[] {
  const segments: EdgeSegment[] = [];
  for (const rel of map.relations) {
    const src = positions.get(rel.source);
    const tgt = positions.get(rel.target);
    if (!src || !tgt) continue;
    segments.push({
      x1: src.cx,
      y1: src.cy,
      x2: tgt.cx,
      y2: tgt.cy,
    });
  }
  return segments;
}

// ── EvolvesTo geometry ────────────────────────────────────────────────

/** Pixel-space evolution arrow (from current position to evolved position) */
export interface EvolveArrow {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly evolveType: "natural" | "ecosystem" | "forced" | "late";
}

/**
 * Compute pixel-space evolution arrows for a single component.
 */
export function componentEvolveArrows(
  comp: Component,
  ctx: RenderContext
): EvolveArrow[] {
  if (!comp.evolvesTo || comp.evolvesTo.length === 0) return [];

  const fromX = evoToX(comp.evolution, ctx);
  const fromY = visToY(comp.visibility, ctx);

  return comp.evolvesTo.map((e) => ({
    fromX,
    fromY,
    toX: evoToX(e.evolution, ctx),
    toY: visToY(e.visibility, ctx),
    evolveType: e.evolveType ?? "natural",
  }));
}
