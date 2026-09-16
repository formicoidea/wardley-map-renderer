/**
 * wardley-map-renderer — public package entry point.
 *
 * Re-exports the render orchestrator, schema utilities, and types.
 * Pure render module — no HTTP, no LLM, no transport layer.
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

// ── HTML (static page or interactive editor) ─────────────────────
export { renderToHTML, type HTMLRenderOptions } from "./render-html.js";

// ── Diff ops (what the interactive editor emits) ─────────────────
export { applyDiffOp, applyDiffOps, type DiffOp, type DiffOpName } from "./diff-ops-apply.js";
/** Zod schema of a single diff op (validate untrusted ops before `applyDiffOp`). */
export { DiffOp as DiffOpSchema } from "./diff-ops.js";

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
  SubtypeEnum,
  NatureEnum,
  MethodSchema,
  StepDecoratorSchema,
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
  // RenderConfig — kept value/leaf schemas (the public INPUT shape is
  // RenderConfigV3Schema; the legacy RenderConfigSchema + sub-schemas + DEFAULT_*
  // were removed in the v3-only cutover).
  TypographyConfigSchema,
  ConfigIntentSchema,
  DEFAULT_CONFIG_INTENT,
  resolveConfigIntent,
  EvolveStyleSchema,
  type Component,
  type Subtype,
  type Nature,
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
  // Internal nested (legacy-shaped) intermediate produced by renderConfigV3ToLegacy.
  type RenderConfigInput,
  type ResolvedRenderConfig,
  // Kept value/leaf config types
  type TypographyConfig,
  type ConfigIntent,
  type ConfigIntentInput,
  type LegendInput,
  type EvolveStyle,
  type StepDecorator,
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

// ── RenderConfig v3 — the public input schema + adapter ──────────
export {
  RenderConfigV3Schema,
  renderConfigV3ToLegacy,
  type RenderConfigV3,
  type RenderConfigV3Input,
} from "./render-config-v3.js";

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

// ── Phase mapping — range-based style resolution ──────────────────
export {
  PhaseMappingEntrySchema,
  PhaseMappingSchema,
  DEFAULT_PHASE_MAPPING,
  resolveStyleByPosition,
  type PhaseMappingEntry,
  type PhaseMapping,
} from "./phase-mapping.js";

