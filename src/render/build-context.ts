/**
 * Phase 1 — Geometry: builds a RenderContext from a WardleyMap.
 *
 * Computes all pixel positions from normalised [0-1] coordinates,
 * resolves pipeline rects, edge segments, and evolve arrows.
 *
 * Pure function — no SVG generation.
 *
 * @module render/build-context
 */

import type { WardleyMap, Component } from "../schema.js";
import type {
  RenderContext,
  RenderGeometry,
  RenderOptions,
  Margins,
  PlotArea,
  NodeGeometry,
  EdgeGeometry,
  EvolveGeometry,
  PipelineGeometryPixels,
  AxesZoneGeometry,
  ComponentBoundingBox,
} from "./types.js";
import {
  AXIS_MARGIN_LEFT,
  AXIS_MARGIN_BOTTOM,
  AXIS_MARGIN_TOP,
  EVOLUTION_PHASES,
} from "../blocks/wardley-map/wardley-map-consts.js";
import { applyPipelineContainment, resolvePipelines, pipelineToRect } from "../pipeline-geometry.js";

// ── Fixed margins (pixels, identical regardless of gridSize or axes) ──

const FIXED_MARGINS: Margins = {
  top: AXIS_MARGIN_TOP,     // 24
  right: 20,
  bottom: AXIS_MARGIN_BOTTOM, // 48
  left: AXIS_MARGIN_LEFT,     // 48
};

// ── Coordinate conversion helpers ─────────────────────────────────────

function makeEvoToX(plot: PlotArea): (evolution: number) => number {
  return (evolution: number) => plot.left + evolution * plot.width;
}

function makeVisToY(plot: PlotArea): (visibility: number) => number {
  // MapKeep convention: visibility 1 = top (visible to user), 0 = bottom (invisible)
  // SVG convention: y increases downward → invert
  return (visibility: number) => plot.top + (1 - visibility) * plot.height;
}

// ── Context builder ───────────────────────────────────────────────────

/** Default render options — used when no overrides are provided */
const DEFAULT_OPTIONS: RenderOptions = {};

export function buildRenderContext(map: WardleyMap, options: RenderOptions = DEFAULT_OPTIONS): RenderContext {
  // Apply pipeline containment (clamps sub-component positions)
  const adjustedMap = applyPipelineContainment(map);

  // Canvas dimensions from gridSize (or options overrides)
  const canvasWidth = options.width ?? adjustedMap.gridSize.width;
  const canvasHeight = options.height ?? adjustedMap.gridSize.height;

  // Compute plot area (drawable region inside margins)
  const plot: PlotArea = {
    left: FIXED_MARGINS.left,
    top: FIXED_MARGINS.top,
    right: canvasWidth - FIXED_MARGINS.right,
    bottom: canvasHeight - FIXED_MARGINS.bottom,
    width: canvasWidth - FIXED_MARGINS.left - FIXED_MARGINS.right,
    height: canvasHeight - FIXED_MARGINS.top - FIXED_MARGINS.bottom,
  };

  // Coordinate converters
  const evoToX = makeEvoToX(plot);
  const visToY = makeVisToY(plot);

  // Component lookup
  const componentById = new Map<string, Component>(
    adjustedMap.components.map((c) => [c.id, c])
  );

  // ── Phase 1: Compute all geometry ───────────────────────

  // Pipeline geometry (computed FIRST so we can override node positions)
  const resolvedPipelines = resolvePipelines(adjustedMap);
  const pipelines: PipelineGeometryPixels[] = resolvedPipelines.map((rp) => {
    const rect = pipelineToRect(rp, { evoToX, visToY });
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      handleX: rect.handleX,
      handleY: rect.y, // Top border of pipeline (Fix 7)
      component: rp.component,
    };
  });

  // Build pipeline handle lookup for node position override (Fix 5)
  const pipelineHandleMap = new Map(
    pipelines.map((p) => [p.component.id, p])
  );

  // Node positions — pipeline components use handle position for edge connections
  const nodes: NodeGeometry[] = adjustedMap.components.map((comp) => {
    const pl = pipelineHandleMap.get(comp.id);
    if (pl) {
      // Pipeline: edge connection at handle position (top border)
      return { id: comp.id, cx: pl.handleX, cy: pl.handleY, component: comp };
    }
    return {
      id: comp.id,
      cx: evoToX(comp.evolution),
      cy: visToY(comp.visibility),
      component: comp,
    };
  });

  // Node lookup for edge resolution (uses corrected pipeline positions)
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Edge geometry
  const edges: EdgeGeometry[] = [];
  for (const rel of adjustedMap.relations) {
    const src = nodeById.get(rel.source);
    const tgt = nodeById.get(rel.target);
    if (!src || !tgt) continue;
    edges.push({
      x1: src.cx,
      y1: src.cy,
      x2: tgt.cx,
      y2: tgt.cy,
      relation: rel,
    });
  }

  // EvolvesTo arrows
  const evolves: EvolveGeometry[] = [];
  for (const comp of adjustedMap.components) {
    if (!comp.evolvesTo || comp.evolvesTo.length === 0) continue;
    const fromX = evoToX(comp.evolution);
    const fromY = visToY(comp.visibility);
    for (const e of comp.evolvesTo) {
      evolves.push({
        fromX,
        fromY,
        toX: evoToX(e.evolution),
        toY: visToY(e.visibility),
        evolveType: e.evolveType ?? "natural",
        component: comp,
      });
    }
  }

  // Axes zone geometry (evolution phase zones in pixel coords)
  const axesZones: AxesZoneGeometry[] = EVOLUTION_PHASES.map((phase) => ({
    label: phase.label,
    x: evoToX(phase.startRatio),
    width: evoToX(phase.endRatio) - evoToX(phase.startRatio),
    y: plot.top,
    height: plot.height,
    startRatio: phase.startRatio,
    endRatio: phase.endRatio,
  }));

  // Component bounding boxes (node radius for circle components, rect for pipelines)
  const nodeRadius = options.nodeRadius ?? 5;
  const boundingBoxes: ComponentBoundingBox[] = [];

  for (const node of nodes) {
    if (node.component.type === "pipeline") continue;
    boundingBoxes.push({
      id: node.id,
      left: node.cx - nodeRadius,
      top: node.cy - nodeRadius,
      right: node.cx + nodeRadius,
      bottom: node.cy + nodeRadius,
      component: node.component,
    });
  }

  for (const pl of pipelines) {
    boundingBoxes.push({
      id: pl.component.id,
      left: pl.x,
      top: pl.y,
      right: pl.x + pl.width,
      bottom: pl.y + pl.height,
      component: pl.component,
    });
  }

  // Unified geometry object
  const geometry: RenderGeometry = {
    nodes,
    edges,
    evolves,
    pipelines,
    axesZones,
    boundingBoxes,
  };

  return {
    map: adjustedMap,
    canvasWidth,
    canvasHeight,
    margins: FIXED_MARGINS,
    plot,
    geometry,
    nodes,
    edges,
    evolves,
    pipelines,
    componentById,
    evoToX,
    visToY,
    options,
  };
}
