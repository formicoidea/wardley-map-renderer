/**
 * @wardleyapi/render — public package entry point.
 *
 * Re-exports the render orchestrator, schema utilities, types,
 * and the Hono server app so consumers can import everything
 * from a single path.
 */

// ── Orchestrator (render pipeline) ───────────────────────────────
export {
  render,
  renderToSVG,
  renderToPNG,
  computeMapGeometry,
  type OrchestrationOptions,
  type RenderResult,
} from "./render-orchestrator.js";

// ── Types from the modular renderer ──────────────────────────────
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
} from "./render/index.js";

// ── Schema, validation, conversion ───────────────────────────────
export {
  WardleyMapSchema,
  sanitizeMap,
  validateMap,
  toOWM,
  fromMapKeep,
  resolveColor,
  validateComponent,
  evo,
  vis,
  evoTarget,
  visTarget,
  ComponentSchema,
  RelationSchema,
  EvolutionSchema,
  EvolutionRangeSchema,
  EvolvesToSchema,
  PipelineGeometrySchema,
  ComponentTypeEnum,
  NatureEnum,
  RelationTypeEnum,
  FlowSchema,
  LabelSchema,
  LabelPositionSchema,
  EvolutionFieldSchema,
  VisibilityFieldSchema,
  PositionSchema,
  AxisLabelsSchema,
  LocaleEnum,
  LegendSchema,
  LegendPositionEnum,
  LegendPositionXYSchema,
  RenderConfigSchema,
  EvolveStyleSchema,
  type Component,
  type Label,
  type LabelPosition,
  type EvolutionField,
  type VisibilityField,
  type Position,
  type EvolutionRange,
  type EvolvesTo,
  type PipelineGeometry,
  type Relation,
  type Flow,
  type RelationType,
  type AxisLabels,
  type Locale,
  type Legend,
  type LegendPosition,
  type LegendPositionXY,
  type RenderConfig,
  type EvolveStyle,
  type WardleyMap,
} from "./schema.js";

// ── RFC 7807 Problem Details ─────────────────────────────────────
export {
  ProblemTypes,
  PROBLEM_CONTENT_TYPE,
  PROBLEM_HINTS,
  ProblemDetailSchema,
  ValidationProblemDetailSchema,
  createProblemDetail,
  createValidationProblem,
  type ProblemDetail,
  type ProblemDetail as ProblemDetailType,
  type ValidationProblemDetail,
  type ProblemType,
} from "./middleware/problem-details.js";

export { HttpProblem } from "./middleware/error-handler.js";

// ── Server (Hono app) ────────────────────────────────────────────
export { app } from "./server.js";
