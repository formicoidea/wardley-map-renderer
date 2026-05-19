/**
 * Pipeline geometry module.
 *
 * Handles pipeline-specific layout logic:
 * - Detecting which components belong to a pipeline (bounding-box containment)
 * - Positioning sub-components within a pipeline's evolution range
 * - Computing the pipeline handle (label) position from handleEvolution
 *
 * Pipelines are treated as visual background containers.
 * Sub-components inside a pipeline are rendered at their own coordinates,
 * but this module provides helpers to detect containment and clamp positions.
 *
 * @module pipeline-geometry
 */

import type { Component, PipelineGeometry, WardleyMap } from "./schema.js";
import { evo, vis } from "./schema.js";

// ── Types ──────────────────────────────────────────────────────────

/** A pipeline component paired with its resolved geometry */
export interface ResolvedPipeline {
  /** The pipeline component */
  component: Component;
  /** The resolved pipeline geometry (guaranteed non-null) */
  geometry: PipelineGeometry;
  /** IDs of sub-components contained within this pipeline */
  childIds: string[];
}

/** Pixel-space rectangle for a pipeline */
export interface PipelineRect {
  /** Pipeline component ID */
  id: string;
  /** Left edge in pixels */
  x: number;
  /** Top edge in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Handle (label) x position in pixels */
  handleX: number;
  /** Handle (label) y position in pixels (top of pipeline) */
  handleY: number;
}

/** Coordinate conversion functions passed as context */
export interface CoordConverters {
  /** Map evolution [0-1] → pixel x */
  evoToX: (evolution: number) => number;
  /** Map visibility [0-1] → pixel y */
  visToY: (visibility: number) => number;
}

// ── Pipeline detection ─────────────────────────────────────────────

/**
 * Check if a component (by its normalized coordinates) falls within
 * a pipeline's bounding box.
 *
 * Uses a small tolerance (epsilon) to handle floating-point edge cases
 * where components sit exactly on the pipeline boundary.
 *
 * @param comp - The candidate sub-component
 * @param geo  - The pipeline's geometry
 * @param epsilon - Tolerance for boundary inclusion (default 0.015)
 */
export function isInsidePipeline(
  comp: Component,
  geo: PipelineGeometry,
  epsilon = 0.015
): boolean {
  return (
    evo(comp) >= geo.evoStart - epsilon &&
    evo(comp) <= geo.evoEnd + epsilon &&
    vis(comp) >= geo.visStart - epsilon &&
    vis(comp) <= geo.visEnd + epsilon
  );
}

/**
 * Extract all pipelines from a map and resolve their sub-components.
 *
 * For each pipeline component (type === "pipeline") that has valid
 * pipelineGeometry, this function identifies all non-pipeline, non-note
 * components that fall within the pipeline's bounding box.
 *
 * @param map - The Wardley map
 * @returns Array of resolved pipelines with their child component IDs
 */
export function resolvePipelines(map: WardleyMap): ResolvedPipeline[] {
  const pipelines: ResolvedPipeline[] = [];

  // Collect pipeline components with valid geometry
  const pipelineComps = map.components.filter(
    (c) => c.type === "pipeline" && c.pipelineGeometry != null
  );

  // Candidate sub-components (everything except pipelines and notes)
  const candidates = map.components.filter(
    (c) => c.type !== "pipeline" && c.type !== "note"
  );

  for (const pipe of pipelineComps) {
    const geo = pipe.pipelineGeometry!;
    const childIds: string[] = [];

    for (const cand of candidates) {
      if (isInsidePipeline(cand, geo)) {
        childIds.push(cand.id);
      }
    }

    pipelines.push({
      component: pipe,
      geometry: geo,
      childIds,
    });
  }

  return pipelines;
}

/**
 * Build a lookup: component ID → pipeline ID (if the component is inside a pipeline).
 *
 * If a component falls within multiple pipelines (rare edge case),
 * the first matching pipeline wins.
 */
export function buildPipelineMembership(
  pipelines: ResolvedPipeline[]
): Map<string, string> {
  const membership = new Map<string, string>();
  for (const pipe of pipelines) {
    for (const childId of pipe.childIds) {
      if (!membership.has(childId)) {
        membership.set(childId, pipe.component.id);
      }
    }
  }
  return membership;
}

// ── Pipeline center ────────────────────────────────────────────────

/**
 * Compute the center point of a pipeline's geometry bounds.
 *
 * A pipeline's `position` represents its center — the midpoint of
 * its evoStart/evoEnd and visStart/visEnd bounds. This function
 * extracts that center from the geometry.
 *
 * @param geo - Pipeline geometry
 * @returns Center point as { evolution, visibility } in [0-1] space
 */
export function pipelineCenter(geo: PipelineGeometry): {
  evolution: number;
  visibility: number;
} {
  return {
    evolution: (geo.evoStart + geo.evoEnd) / 2,
    visibility: (geo.visStart + geo.visEnd) / 2,
  };
}

/**
 * Recompute pipeline geometry bounds from a new center position,
 * preserving the original width and height.
 *
 * Used when dragging a pipeline to a new position: the center moves
 * and the bounds are recomputed from the half-widths.
 *
 * Values are clamped to [0, 1] range.
 *
 * @param geo - Original pipeline geometry (for dimensions)
 * @param newCenter - New center { evolution, visibility } in [0-1] space
 * @returns New pipeline geometry with updated bounds
 */
export function recomputeGeometryFromCenter(
  geo: PipelineGeometry,
  newCenter: { evolution: number; visibility: number }
): PipelineGeometry {
  const halfEvo = (geo.evoEnd - geo.evoStart) / 2;
  const halfVis = (geo.visEnd - geo.visStart) / 2;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  return {
    ...geo,
    evoStart: clamp01(newCenter.evolution - halfEvo),
    evoEnd: clamp01(newCenter.evolution + halfEvo),
    visStart: clamp01(newCenter.visibility - halfVis),
    visEnd: clamp01(newCenter.visibility + halfVis),
  };
}

// ── Handle positioning ─────────────────────────────────────────────

/**
 * Compute the handle (label anchor) evolution value for a pipeline.
 *
 * If `handleEvolution` is explicitly set in the geometry, use it.
 * Otherwise, default to the midpoint of the pipeline's evolution range.
 *
 * @param geo - Pipeline geometry
 * @returns Evolution value [0-1] for the handle position
 */
export function resolveHandleEvolution(geo: PipelineGeometry): number {
  if (geo.handleEvolution != null) {
    return geo.handleEvolution;
  }
  // Default: midpoint of evolution range
  return (geo.evoStart + geo.evoEnd) / 2;
}

// ── Pixel-space pipeline rectangles ────────────────────────────────

/**
 * Convert a resolved pipeline to a pixel-space rectangle.
 *
 * The pipeline rect spans from evoStart→evoEnd (x-axis) and
 * visStart→visEnd (y-axis) in pixel coordinates.
 * The handle is positioned at handleEvolution along the x-axis,
 * at the top edge (visStart) of the pipeline.
 *
 * @param pipe - Resolved pipeline
 * @param conv - Coordinate converters (evoToX, visToY)
 * @returns Pixel-space rectangle with handle position
 */
export function pipelineToRect(
  pipe: ResolvedPipeline,
  conv: CoordConverters
): PipelineRect {
  const geo = pipe.geometry;

  const x1 = conv.evoToX(geo.evoStart);
  const x2 = conv.evoToX(geo.evoEnd);
  const y1 = conv.visToY(geo.visStart);
  const y2 = conv.visToY(geo.visEnd);

  const handleEvo = resolveHandleEvolution(geo);

  return {
    id: pipe.component.id,
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    handleX: conv.evoToX(handleEvo),
    handleY: Math.min(y1, y2),
  };
}

/**
 * Convert all resolved pipelines to pixel-space rectangles.
 */
export function pipelinesToRects(
  pipelines: ResolvedPipeline[],
  conv: CoordConverters
): PipelineRect[] {
  return pipelines.map((p) => pipelineToRect(p, conv));
}

// ── Sub-component positioning ──────────────────────────────────────

/**
 * Clamp a sub-component's evolution to stay within its parent pipeline's
 * evolution range.
 *
 * This ensures sub-components don't visually escape the pipeline bounds
 * even if their raw coordinates are slightly out of range.
 *
 * @param evolution - The sub-component's raw evolution value
 * @param geo - The parent pipeline's geometry
 * @param padding - Normalized padding inside pipeline edges (default 0.005)
 * @returns Clamped evolution value
 */
export function clampEvolutionToPipeline(
  evolution: number,
  geo: PipelineGeometry,
  padding = 0.005
): number {
  const min = geo.evoStart + padding;
  const max = geo.evoEnd - padding;
  return Math.max(min, Math.min(max, evolution));
}

/**
 * Clamp a sub-component's visibility to stay within its parent pipeline's
 * visibility range.
 *
 * @param visibility - The sub-component's raw visibility value
 * @param geo - The parent pipeline's geometry
 * @param padding - Normalized padding inside pipeline edges (default 0.005)
 * @returns Clamped visibility value
 */
export function clampVisibilityToPipeline(
  visibility: number,
  geo: PipelineGeometry,
  padding = 0.005
): number {
  const min = geo.visStart + padding;
  const max = geo.visEnd - padding;
  return Math.max(min, Math.min(max, visibility));
}

/**
 * Apply pipeline containment: for each sub-component inside a pipeline,
 * clamp its coordinates to the pipeline's bounding box.
 *
 * Returns a new map with adjusted component positions (does not mutate input).
 * Only affects components that are detected as pipeline children.
 * Pipeline components themselves and notes are left unchanged.
 *
 * @param map - The Wardley map
 * @returns New map with sub-components clamped to their parent pipeline bounds
 */
export function applyPipelineContainment(map: WardleyMap): WardleyMap {
  const pipelines = resolvePipelines(map);
  if (pipelines.length === 0) return map;

  const membership = buildPipelineMembership(pipelines);
  const geoById = new Map(
    pipelines.map((p) => [p.component.id, p.geometry])
  );

  const newComponents = map.components.map((comp) => {
    const pipelineId = membership.get(comp.id);
    if (!pipelineId) return comp;

    const geo = geoById.get(pipelineId);
    if (!geo) return comp;

    return {
      ...comp,
      position: {
        evolution: {
          scalar: clampEvolutionToPipeline(evo(comp), geo),
          range: comp.position.evolution.range,
        },
        visibility: {
          scalar: clampVisibilityToPipeline(vis(comp), geo),
        },
      },
    };
  });

  return { ...map, components: newComponents };
}
