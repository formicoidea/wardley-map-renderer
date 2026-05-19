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
import { evo, vis, evoTarget, visTarget, resolveTheme, resolveTypeStyle } from "../schema.js";
import type {
  RenderContext,
  RenderGeometry,
  RenderOptions,
  Margins,
  PlotArea,
  NodeGeometry,
  EdgeGeometry,
  EvolveGeometry,
  InertiaGeometry,
  PipelineGeometryPixels,
  AxesZoneGeometry,
  ComponentBoundingBox,
} from "./types.js";
import {
  AXIS_MARGIN_LEFT,
  AXIS_MARGIN_BOTTOM,
  AXIS_MARGIN_TOP,
  EVOLUTION_PHASES,
  EVOLUTION_BOUNDARIES,
} from "../blocks/wardley-map/wardley-map-consts.js";
import { applyPipelineContainment, resolvePipelines, pipelineToRect } from "../pipeline-geometry.js";
import { computeScaleFactor } from "../coordinate-space.js";

// ── Fixed margins (pixels, identical regardless of canvas size or axes) ──

const FIXED_MARGINS: Margins = {
  top: AXIS_MARGIN_TOP,     // 28
  right: 20,
  bottom: AXIS_MARGIN_BOTTOM, // 28
  left: AXIS_MARGIN_LEFT,     // 28
};

// ── Coordinate conversion helpers ─────────────────────────────────────

/**
 * Create evoToX converter using coordinateSpace evolution range.
 *
 * Maps a normalized [0, 1] evolution value to an x pixel coordinate within
 * the plot area, respecting the [evolutionStart, evolutionEnd] display range.
 *
 * With DEFAULT_COORDINATE_SPACE (evolutionStart=0, evolutionEnd=1) the formula
 * simplifies to: plot.left + evolution * plot.width  (same as the previous impl).
 *
 * @param plot - Plot area dimensions
 * @param evolutionStart - Start of evolution display range [0, 1] (default 0)
 * @param evolutionEnd   - End of evolution display range [0, 1] (default 1)
 */
function makeEvoToX(
  plot: PlotArea,
  evolutionStart: number,
  evolutionEnd: number
): (evolution: number) => number {
  const range = evolutionEnd - evolutionStart;
  return (evolution: number) =>
    plot.left + ((evolution - evolutionStart) / range) * plot.width;
}

/**
 * Create visToY converter using coordinateSpace visibilityRange.
 *
 * Maps a normalized [0, 1] visibility value to a y pixel coordinate within
 * the plot area, respecting the [high, low] display range from visibilityRange.
 *
 * OWM convention: visibility 0 = top (visible/high), 1 = bottom (invisible/low).
 * Matches SVG y-axis direction — no inversion needed.
 *
 * With DEFAULT_COORDINATE_SPACE (visibilityRange=[0, 1]) the formula
 * simplifies to: plot.top + visibility * plot.height  (same as the previous impl).
 *
 * @param plot             - Plot area dimensions
 * @param visibilityHigh   - High/top end of visibility display range [0, 1] (default 0)
 * @param visibilityLow    - Low/bottom end of visibility display range [0, 1] (default 1)
 */
function makeVisToY(
  plot: PlotArea,
  visibilityHigh: number,
  visibilityLow: number
): (visibility: number) => number {
  const range = visibilityLow - visibilityHigh;
  return (visibility: number) =>
    plot.top + ((visibility - visibilityHigh) / range) * plot.height;
}

// ── Context builder ───────────────────────────────────────────────────

/** Default render options — used when no overrides are provided */
const DEFAULT_OPTIONS: RenderOptions = {};

export function buildRenderContext(map: WardleyMap, options: RenderOptions = DEFAULT_OPTIONS): RenderContext {
  // Apply pipeline containment (clamps sub-component positions)
  const adjustedMap = applyPipelineContainment(map);

  // Resolve theme defaults — single source of truth for all config values
  const resolvedConfig = resolveTheme(adjustedMap.renderConfig);

  // ── Resolution-independence: compute scale factor from outputHint ──────────
  //
  // When coordinateSpace.outputHint.targetWidth / targetHeight are provided,
  // the output canvas is sized to those target dimensions and all px-space
  // values (nodeRadii, strokeWidth) are scaled proportionally.
  //
  // labelScale is a unitless multiplier — it is NEVER scaled.
  //
  // Priority for canvas dimensions (highest wins):
  //   1. options.width / options.height  (runtime override)
  //   2. outputHint.targetWidth / targetHeight  (resolution-independence hint)
  //   3. resolvedConfig.width / height  (renderConfig default)
  const scaleFactor = computeScaleFactor(resolvedConfig.coordinateSpace);
  const hintWidth = resolvedConfig.coordinateSpace.outputHint?.targetWidth;
  const hintHeight = resolvedConfig.coordinateSpace.outputHint?.targetHeight;

  // Canvas dimensions: options override takes precedence, then outputHint target, then resolved config defaults
  const canvasWidth = options.width ?? hintWidth ?? resolvedConfig.width;
  const canvasHeight = options.height ?? hintHeight ?? resolvedConfig.height;

  // When a scale factor is active, apply it to px-space values in the resolved config.
  // nodeRadii and strokeWidth are in canvas px-space — they must scale with the canvas.
  // labelScale is a unitless multiplier — it must NOT change.
  const scaledResolvedConfig = scaleFactor.uniform !== 1
    ? {
        ...resolvedConfig,
        nodeRadii: Object.fromEntries(
          Object.entries(resolvedConfig.nodeRadii).map(([k, v]) => [k, v * scaleFactor.uniform])
        ) as typeof resolvedConfig.nodeRadii,
        strokeWidth: resolvedConfig.strokeWidth * scaleFactor.uniform,
      }
    : resolvedConfig;

  // Compute plot area (drawable region inside margins)
  const plot: PlotArea = {
    left: FIXED_MARGINS.left,
    top: FIXED_MARGINS.top,
    right: canvasWidth - FIXED_MARGINS.right,
    bottom: canvasHeight - FIXED_MARGINS.bottom,
    width: canvasWidth - FIXED_MARGINS.left - FIXED_MARGINS.right,
    height: canvasHeight - FIXED_MARGINS.top - FIXED_MARGINS.bottom,
  };

  // Coordinate converters — read from coordinateSpace with DEFAULT_COORDINATE_SPACE fallback
  const cs = resolvedConfig.coordinateSpace;
  const evoToX = makeEvoToX(plot, cs.evolutionRange[0], cs.evolutionRange[1]);
  const visToY = makeVisToY(plot, cs.visibilityRange[0], cs.visibilityRange[1]);

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
      cx: evoToX(evo(comp)),
      cy: visToY(vis(comp)),
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
    const fromX = evoToX(evo(comp));
    const fromY = visToY(vis(comp));
    for (const e of comp.evolvesTo) {
      evolves.push({
        fromX,
        fromY,
        toX: evoToX(evoTarget(e)),
        toY: visToY(visTarget(e)),
        evolveType: e.evolveType ?? "natural",
        component: comp,
        inertia: e.inertia,
      });
    }
  }

  // Inertia barriers — thick vertical lines at phase boundaries crossed by evolve arrows
  const INERTIA_HALF_HEIGHT = 15; // pixels above and below the arrow's Y at the boundary
  const inertiaBarriers: InertiaGeometry[] = [];
  for (const evolve of evolves) {
    if (!evolve.inertia) continue;
    // Determine the normalized evolution range of this arrow
    const fromEvo = evo(evolve.component);
    const toEvo = evoTarget(
      evolve.component.evolvesTo!.find(
        (e) => evoToX(evoTarget(e)) === evolve.toX && visToY(visTarget(e)) === evolve.toY
      )!
    );
    const minEvo = Math.min(fromEvo, toEvo);
    const maxEvo = Math.max(fromEvo, toEvo);

    for (const boundary of EVOLUTION_BOUNDARIES) {
      if (boundary > minEvo && boundary < maxEvo) {
        const bx = evoToX(boundary);
        // Interpolate Y at the boundary crossing point
        const t = (boundary - fromEvo) / (toEvo - fromEvo);
        const yAtBoundary = evolve.fromY + t * (evolve.toY - evolve.fromY);
        inertiaBarriers.push({
          x: bx,
          y1: yAtBoundary - INERTIA_HALF_HEIGHT,
          y2: yAtBoundary + INERTIA_HALF_HEIGHT,
          component: evolve.component,
        });
      }
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
  // Effective nodeRadii: caller options override (spread) the scaled resolved baseline.
  // scaledResolvedConfig.nodeRadii already has the outputHint scale applied — options.nodeRadii
  // (runtime override) is spread on top as highest priority.
  const effectiveNodeRadii: { _default: number } & Record<string, number> = options.nodeRadii
    ? { ...scaledResolvedConfig.nodeRadii, ...options.nodeRadii }
    : scaledResolvedConfig.nodeRadii;

  /**
   * Resolve per-type radius for bounding box computation.
   * Delegates to `resolveTypeStyle` — the canonical TypeStyleMap per-type-with-fallback lookup.
   * Precedence: nodeRadii[type] → nodeRadii._default
   */
  function resolveNodeRadius(type: string): number {
    // resolveTypeStyle returns T | undefined; effectiveNodeRadii guarantees _default is present,
    // so the result is always a number.  The non-null assertion is safe here.
    return resolveTypeStyle<number>(effectiveNodeRadii, type) as number;
  }

  const boundingBoxes: ComponentBoundingBox[] = [];

  for (const node of nodes) {
    if (node.component.type === "pipeline") continue;
    const r = resolveNodeRadius(node.component.type);
    boundingBoxes.push({
      id: node.id,
      left: node.cx - r,
      top: node.cy - r,
      right: node.cx + r,
      bottom: node.cy + r,
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
    inertiaBarriers,
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
    inertiaBarriers,
    pipelines,
    componentById,
    evoToX,
    visToY,
    options,
    resolvedConfig: scaledResolvedConfig,
  };
}
