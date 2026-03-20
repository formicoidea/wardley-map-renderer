/**
 * Modular Wardley Map renderer — public API.
 *
 * Re-exports core types, registry, and all 9 layer renderers.
 *
 * Layer execution order (back-to-front z-order):
 *   1. title      — Map title text above the plot area
 *   2. axes       — Plot border, grid lines, phase dividers, axis labels
 *   3. pipelines  — Pipeline background rectangles (visual backdrop)
 *   4. edges      — Dependency relation lines (source → target)
 *   5. evolvesTo  — Evolution movement arrows (dashed)
 *   6. nodes      — Component circles/markers
 *   7. labels     — Component text labels (with collision avoidance)
 *   8. notes      — Note annotations
 *
 * @module render
 */

// ── Core types ──────────────────────────────────────────────────────
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

// ── Registry ────────────────────────────────────────────────────────
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

// ── Layer dependency DAG ─────────────────────────────────────────────
export type { LayerDAG } from "./layer-dag.js";
export { LAYER_DAG } from "./layer-dag.js";

// ── Context builder (Phase 1) ───────────────────────────────────────
export { buildRenderContext } from "./build-context.js";

// ── SVG Composer (Phase 2 orchestration) ──────────────────────────────
export {
  composeSVG,
  renderMapToSVGComposed,
  renderMapToSVGPartial,
  esc,
} from "./svg-composer.js";

// ── Layer renderers (Phase 2) ───────────────────────────────────────
export { renderTitleLayer } from "./title-layer.js";
export { renderAxesLayer } from "./axes-layer.js";
export { renderPipelinesLayer } from "./pipelines-layer.js";
export { renderEdgesLayer } from "./edges-layer.js";
export { renderEvolvesToLayer } from "./evolvesto-layer.js";
export { renderNodesLayer } from "./nodes-layer.js";
export { renderStepsLayer } from "./steps-layer.js";
export { renderAcceleratorsLayer } from "./accelerators-layer.js";
export { renderLabelsLayer } from "./labels-layer.js";
export { renderNotesLayer } from "./notes-layer.js";
export { renderLegendLayer } from "./legend-layer.js";
