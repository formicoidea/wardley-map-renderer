/**
 * @wardleyapi/render — Wardley Map render pipeline
 *
 * Generates SVG/PNG visuals from WardleyMap JSON input.
 * This package contains the composable layer-based rendering engine.
 *
 * Public API:
 *   - render()            — Main orchestrator (SVG or PNG)
 *   - renderToSVG()       — Synchronous SVG rendering
 *   - renderToPNG()       — Async PNG rendering
 *   - computeMapGeometry()— Phase 1 only (geometry computation)
 *   - buildRenderContext() — Low-level Phase 1
 *   - composeSVG()        — Low-level Phase 2
 *
 * @module @wardleyapi/render
 */

export const RENDER_VERSION = "0.1.0";

// ── Main orchestrator API ────────────────────────────────────────────
export {
  render,
  renderToSVG,
  renderToPNG,
  computeMapGeometry,
  type OrchestrationOptions,
  type RenderResult,
} from "./render-orchestrator.js";

// ── Core types ───────────────────────────────────────────────────────
export type {
  Margins,
  PlotArea,
  NodeGeometry,
  EdgeGeometry,
  EvolveGeometry,
  PipelineGeometryPixels,
  AxesZoneGeometry,
  BoundingBox,
  ComponentBoundingBox,
  RenderGeometry,
  RenderOptions,
  RenderContext,
  LayerRenderer,
  LayerName,
  LayerRegistration,
} from "./types.js";

// ── Registry ─────────────────────────────────────────────────────────
export {
  LAYER_ORDER,
  LAYER_NAMES,
  registerLayer,
  getOrderedLayers,
  getLayer,
  validateRegistry,
  clearRegistry,
  registrySize,
} from "./registry.js";

// ── Context builder (Phase 1) ────────────────────────────────────────
export { buildRenderContext } from "./build-context.js";

// ── SVG Composer (Phase 2 orchestration) ─────────────────────────────
export {
  composeSVG,
  renderMapToSVGComposed,
  renderMapToSVGPartial,
  esc,
} from "./svg-composer.js";

// ── Layer renderers (Phase 2) ────────────────────────────────────────
export { renderTitleLayer } from "./title-layer.js";
export { renderAxesLayer } from "./axes-layer.js";
export { renderPipelinesLayer } from "./pipelines-layer.js";
export { renderEdgesLayer } from "./edges-layer.js";
export { renderEvolvesToLayer } from "./evolvesto-layer.js";
export { renderNodesLayer } from "./nodes-layer.js";
export { renderLabelsLayer } from "./labels-layer.js";
export { renderNotesLayer } from "./notes-layer.js";
export { renderLegendLayer } from "./legend-layer.js";

// ── Schema types (re-exported for consumer convenience) ──────────────
export type {
  WardleyMap,
  Component,
  Relation,
  RelationType,
  PipelineGeometry,
  EvolvesTo,
  GridSize,
  Axes,
  AxisLabels,
  Legend,
  LegendPosition,
} from "./schema.js";

export {
  WardleyMapSchema,
  ComponentSchema,
  RelationSchema,
  sanitizeMap,
  resolveColor,
} from "./schema.js";

// ── Label placement algorithm ────────────────────────────────────────
export {
  avoidLabelCollisions,
  segmentIntersectsRect,
  type LabelPlacement,
  type EdgeSegment,
  type PlotBounds,
} from "./label-placement.js";

// ── Constants ────────────────────────────────────────────────────────
export {
  EVOLUTION_PHASES,
  EVOLUTION_BOUNDARIES,
  AXIS_LABELS_EN,
  AXIS_LABELS_FR,
  resolveAxisLabels,
  type EvolutionPhase,
  type ResolvedAxisLabels,
} from "./consts.js";

// ── Pipeline geometry ────────────────────────────────────────────────
export {
  resolvePipelines,
  applyPipelineContainment,
  pipelineToRect,
  isInsidePipeline,
  type ResolvedPipeline,
  type PipelineRect,
  type CoordConverters,
} from "./pipeline-geometry.js";
