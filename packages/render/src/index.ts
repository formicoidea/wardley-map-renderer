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
  resolveTheme,
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
  ConfigIntentSchema,
  DEFAULT_CONFIG_INTENT,
  resolveConfigIntent,
  EvolveStyleSchema,
  // Field-category taxonomy (2-tier legacy)
  RENDER_CONFIG_FIELD_TAXONOMY,
  COORDINATE_SPACE_FIELD_TAXONOMY,
  BACKGROUND_FIELD_TAXONOMY,
  LEGEND_FIELD_TAXONOMY,
  FILTERS_FIELD_TAXONOMY,
  TYPE_STYLE_MAP_TAXONOMY,
  getRenderConfigFieldCategory,
  isViewerOverridable,
  getViewerOverridableFields,
  // Field-category taxonomy (4-tier tiered)
  TIER_PRECEDENCE,
  TIERED_RENDER_CONFIG_TAXONOMY,
  getFieldTierCategory,
  type FieldCategory,
  type FieldMetadata,
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
  type RenderConfigInput,
  type ResolvedRenderConfig,
  type EvolveStyle,
  type WardleyMap,
} from "./schema.js";

// ── Coordinate space ─────────────────────────────────────────────
export {
  CoordinateSpaceSchema,
  DEFAULT_COORDINATE_SPACE,
  OutputHintSchema,
  computeScaleFactor,
  type CoordinateSpace,
  type OutputHint,
  type ScaleFactor,
} from "./coordinate-space.js";

// ── Rendering-local type vocabulary ──────────────────────────────
export {
  KNOWN_RENDERABLE_TYPES,
  isKnownRenderableType,
  isRenderableType,
  asRenderableType,
  type KnownRenderableType,
  type BrandedRenderableType,
  type RenderableType,
} from "./renderable-type.js";

// ── Author/viewer conflict resolution ────────────────────────────
export {
  // 2-tier (backward compat)
  resolveConflict,
  AUTHOR_INTENT_FIELDS,
  VIEWER_PREFERENCE_FIELDS,
  type AuthorIntentField,
  type ViewerPreferenceField,
  // 4-tier (tiered precedence — data-driven from TIERED_RENDER_CONFIG_TAXONOMY)
  resolveConfig,
  PLATFORM_CONSTRAINT_FIELDS,
  LAYOUT_STRUCTURAL_FIELDS,
  // Diagnostics (Sub-AC 1 of AC 6: type + schema definitions)
  RenderDiagnosticsSchema,
  EMPTY_RENDER_DIAGNOSTICS,
  type RenderDiagnostics,
} from "./resolve-conflict.js";

// ── Config constraint graph — declarative field-interaction grammar ───────────
export {
  // Sub-AC 1: declarative schema types
  ViolationPolicyEnum,
  ConstraintSchema,
  ConstraintGraphSchema,
  ConfigConstraintGraphSchema,
  EMPTY_CONFIG_CONSTRAINT_GRAPH,
  type ViolationPolicy,
  type Constraint,
  type ConstraintGraph,
  type ConfigConstraintGraph,
  // Sub-AC 2: executable constraint implementations
  legendBoundsValidation,
  layerDependenciesConstraint,
  phaseStyleAlignmentConstraint,
  CONFIG_CONSTRAINT_GRAPH,
  EXECUTABLE_CONSTRAINT_GRAPH,
  checkConstraints,
  type ConstraintViolation,
  type ConstraintResult,
  type ConstraintCheckInput,
  type ExecutableConstraint,
  type ExecutableConstraintGraph,
} from "./config-constraint-graph.js";

// ── Config constraint evaluation — Sub-AC 3: violationPolicy wiring ──────────
export {
  evaluateConstraints,
  CONSTRAINT_CLIP_HANDLERS,
  ConstraintViolationError,
  type ConstraintPolicy,
  type ConstraintEvaluationOptions,
} from "./render-config-constraints.js";

// ── Runtime diagnostics — Sub-AC 2 of AC 6: unrecognized type detection ──────
export {
  collectConfigDiagnostics,
  createDiagnosticsCollector,
  EMPTY_RESOLVE_DIAGNOSTICS,
  type RenderableTypeRecognitionLevel,
  type UnrecognizedTypeEntry,
  type ResolveDiagnostics,
  type DiagnosticsCollector,
} from "./resolve-diagnostics.js";

// ── Phase mapping — range-based style resolution ──────────────────
export {
  PhaseMappingEntrySchema,
  PhaseMappingSchema,
  DEFAULT_PHASE_MAPPING,
  resolveStyleByPosition,
  type PhaseMappingEntry,
  type PhaseMapping,
} from "./phase-mapping.js";

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
