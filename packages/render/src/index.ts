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
  // RenderConfig accessor helpers
  rcWidth,
  rcHeight,
  rcStrokeWidth,
  rcFontFamily,
  rcLabelScale,
  rcTheme,
  rcLocale,
  resolveRenderConfigDefaults,
  ComponentSchema,
  RelationSchema,
  EvolutionSchema,
  EvolutionRangeSchema,
  EvolvesToSchema,
  PipelineGeometrySchema,
  ComponentTypeEnum,
  NatureEnum,
  MethodEnum,
  MethodSchema,
  AcceleratorTypeEnum,
  AcceleratorSchema,
  StepSchema,
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
  // Sub-schema exports
  SpatialConfigSchema,
  TypographyConfigSchema,
  StylingConfigSchema,
  AxesConfigSchema,
  FiltersSchema,
  // Default config exports
  DEFAULT_RENDER_CONFIG,
  DEFAULT_SPATIAL_CONFIG,
  DEFAULT_TYPOGRAPHY_CONFIG,
  DEFAULT_STYLING_CONFIG,
  DEFAULT_AXES_CONFIG,
  DEFAULT_LEGEND_CONFIG,
  DEFAULT_FILTERS_CONFIG,
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
  type Method,
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
  // Sub-schema types (output — after Zod defaults applied)
  type SpatialConfig,
  type SpatialConfigInput,
  type TypographyConfig,
  type TypographyConfigInput,
  type StylingConfig,
  type StylingConfigInput,
  type AxesConfig,
  type AxesConfigInput,
  type Filters,
  type FiltersInput,
  type ConfigIntent,
  type ConfigIntentInput,
  type LegendInput,
  type EvolveStyle,
  type AcceleratorType,
  type Accelerator,
  type Step,
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

// ── RenderConfig v2 — theme baselines, v2 schema, phase mapping ──
export {
  // Theme baseline system
  resolveThemeBaseline,
  DEFAULT_THEME_BASELINE,
  DARK_THEME_BASELINE,
  HIGH_CONTRAST_THEME_BASELINE,
  THEME_BASELINES,
  type ThemeBaseline,
  // V2 structured render config (with backward-compat flat-key preprocess)
  RenderConfigV2BaseSchema,
  RenderConfigV2Schema,
  type RenderConfigV2,
  type RenderConfigV2Input,
  // Flat-to-nested backward-compat layer toggles/filters
  DEFAULT_LAYER_TOGGLES,
  DEFAULT_FILTERS,
  type DefaultLayerToggles,
  // Phase mapping (object-keyed, complementary to phase-mapping.ts array-based)
  PHASE_KEYS,
  PhaseRangeSchema,
  PhaseMappingSchema as V2PhaseMappingSchema,
  DEFAULT_PHASE_MAPPING as V2_DEFAULT_PHASE_MAPPING,
  type PhaseKey,
  type PhaseRange,
  type PhaseMapping as V2PhaseMapping,
} from "./render-config-v2.js";

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
  strokeWidthFontSizeRatioConstraint,
  nodeRadiiStrokeWidthConstraint,
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
  validateRenderConfig,
  CONSTRAINT_CLIP_HANDLERS,
  ConstraintViolationError,
  type ConstraintPolicy,
  type ConstraintEvaluationOptions,
  type RenderConfigValidationError,
  type RenderConfigValidationResult,
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
