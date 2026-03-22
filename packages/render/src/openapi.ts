/**
 * OpenAPI 3.1 specification auto-generated from Zod schemas.
 *
 * Uses @asteasolutions/zod-to-openapi to derive the spec from the same
 * Zod schemas that validate requests at runtime — single source of truth.
 *
 * @module openapi
 */

import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with .openapi() — must be called before any schema uses .openapi()
extendZodWithOpenApi(z);

// ── Re-declare schemas with OpenAPI metadata ──────────────────
// We re-declare rather than import from schema.ts to avoid side-effect
// coupling (schema.ts must remain usable without openapi extension).

const EvolutionSchema = z.number().min(0).max(1).openapi("Evolution");

const EvolutionRangeSchema = z
  .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
  .openapi("EvolutionRange");

const ComponentTypeEnum = z.enum([
  "component", "user-need", "pipeline", "note", "anchor", "market", "ecosystem",
]).openapi("ComponentType");

const NatureEnum = z.enum([
  "activity", "practice", "data", "knowledge",
  "natural_need", "technical_system_need",
]).optional().openapi("Nature");

const LabelPositionSchema = z.object({
  dx: z.number(),
  dy: z.number(),
}).openapi("LabelPosition");

const LabelSchema = z.object({
  name: z.string(),
  position: LabelPositionSchema.optional(),
}).openapi("Label");

const EvolutionFieldSchema = z.object({
  scalar: z.number().min(0).max(1),
  range: EvolutionRangeSchema.optional(),
}).openapi("EvolutionField");

const VisibilityFieldSchema = z.object({
  scalar: z.number().min(0).max(1),
}).openapi("VisibilityField");

const PositionSchema = z.object({
  evolution: EvolutionFieldSchema,
  visibility: VisibilityFieldSchema,
}).openapi("Position");

const EvolvesToSchema = z.object({
  position: z.object({
    evolution: z.object({ scalar: z.number().min(0).max(1) }),
    visibility: z.object({ scalar: z.number().min(0).max(1) }),
  }),
  evolveType: z.enum(["natural", "ecosystem", "forced", "late"]).default("natural"),
  inertia: z.boolean().optional(),
}).openapi("EvolvesTo");

const PipelineGeometrySchema = z.object({
  evoStart: z.number().min(0).max(1),
  evoEnd: z.number().min(0).max(1),
  visStart: z.number().min(0).max(1),
  visEnd: z.number().min(0).max(1),
  handleEvolution: z.number().min(0).max(1).optional(),
}).openapi("PipelineGeometry");

const MethodSchema = z.object({
  type: z.string(),
  preconisation: z.string(),
}).openapi("Method");

const ComponentSchema = z.object({
  id: z.string(),
  label: LabelSchema,
  type: ComponentTypeEnum,
  nature: NatureEnum,
  position: PositionSchema,
  description: z.string().optional(),
  evolvesTo: z.array(EvolvesToSchema).optional(),
  pipelineGeometry: PipelineGeometrySchema.optional(),
  color: z.string().optional(),
  method: MethodSchema.optional(),
}).openapi("Component");

const FlowSchema = z.object({
  label: z.string(),
  style: z.enum(["solid", "dashed", "bold"]).default("solid"),
}).openapi("Flow");

const RelationTypeEnum = z.enum(["DependsOn", "Flow", "Constraint"]).openapi("RelationType");

const RelationSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: RelationTypeEnum.default("DependsOn"),
  flow: FlowSchema.optional(),
}).openapi("Relation");

const LocaleEnum = z.enum(["en", "fr"]).openapi("Locale");

const ThemeEnum = z.enum(["default", "dark", "highContrast"]).openapi("Theme");

const EvolutionXAxisSchema = z.object({
  /** Show evolution (X) axis arrow and main label (default: true) */
  show: z.boolean().optional(),
  /** i18n override for the x-axis main label (e.g. "Evolution") */
  xAxis: z.string().optional(),
}).openapi("EvolutionXAxis");

const ValueChainYAxisSchema = z.object({
  /** Show value chain (Y) axis arrow and main label (default: true) */
  show: z.boolean().optional(),
  /** i18n override for the y-axis main label (e.g. "Value Chain") */
  yAxis: z.string().optional(),
}).openapi("ValueChainYAxis");

const EvolutionPhasesSchema = z.object({
  /** Show evolution phase dividers AND phase labels together (default: true) */
  showPhaseDividerAndLabel: z.boolean().default(true),
  /** i18n overrides for the 4 evolution phase labels */
  phases: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
}).openapi("EvolutionPhases");

/** Background layer: canvas color + axis/phase display controls */
const BackgroundSchema = z.object({
  /** Canvas background color (CSS hex, 3–8 digit, defaults to "#ffffff") */
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  /** Evolution (X) axis show toggle and main label override */
  evolutionXAxis: EvolutionXAxisSchema.optional(),
  /** Value Chain (Y) axis show toggle and main label override */
  valueChainYAxis: ValueChainYAxisSchema.optional(),
  /** Phase divider/label show toggle and phase label overrides */
  evolutionPhases: EvolutionPhasesSchema.optional(),
}).openapi("Background");

const LayerTogglesSchema = z.object({
  title: z.boolean().optional(),
  pipelines: z.boolean().optional(),
  edges: z.boolean().optional(),
  evolvesTo: z.boolean().optional(),
  nodes: z.boolean().optional(),
  labels: z.boolean().optional(),
  notes: z.boolean().optional(),
}).openapi("LayerToggles");

/** Unified visibility filters — consolidates layer toggles and data-level type exclusions */
const FiltersSchema = z.object({
  /** Visual layer toggles (post-render): enable/disable entire SVG layer renderers */
  layers: LayerTogglesSchema.optional(),
  /** Data filter (pre-render): component types to exclude from all layers */
  excludeComponentTypes: z.array(ComponentTypeEnum).optional(),
}).openapi("Filters");

const LegendOverflowEnum = z.enum(["clip", "allow", "warn"]).openapi("LegendOverflow");

const LegendSchema = z.object({
  show: z.boolean().default(true),
  position: z.union([
    z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "auto"]),
    z.object({ x: z.number(), y: z.number() }),
  ]).default("bottom-right"),
  legendOverflow: LegendOverflowEnum.default("allow"),
}).openapi("Legend");

const EvolveStyleSchema = z.object({
  stroke: z.string().optional(),
  strokeDasharray: z.string().optional(),
}).openapi("EvolveStyle");

const MethodConfigSchema = z.object({
  type: z.string(),
  color: z.string(),
  legend: z.record(z.string(), z.string()).refine(
    (rec) => Object.keys(rec).length === 3,
    { message: "methods[].legend must have exactly 3 keys" },
  ),
}).openapi("MethodConfig");

const AxesConfigSchema = z.object({
  /** Locale preset for axis labels (default: "en") */
  locale: LocaleEnum.default("en"),
  /** i18n axis label overrides */
  axisLabels: z.object({
    xAxis: z.string().optional(),
    yAxis: z.string().optional(),
    phases: z.array(z.string().optional()).min(1).optional(),
    evolutionStart: z.string().optional(),
    evolutionEnd: z.string().optional(),
    visibilityHigh: z.string().optional(),
    visibilityLow: z.string().optional(),
  }).optional(),
}).openapi("AxesConfig");

const CoordinateSpaceOpenApiSchema = z.object({
  units: z.enum(["px", "normalized"]).default("px"),
  origin: z.enum(["top-left", "bottom-left"]).default("top-left"),
}).openapi("CoordinateSpace");

const NodeRadiiOpenApiSchema = z.object({ _default: z.number().positive().max(50) })
  .catchall(z.number().positive().max(50))
  .openapi("NodeRadii");

const TypeColorsOpenApiSchema = z.object({ _default: z.string() })
  .catchall(z.string())
  .openapi("TypeColors");

const EvolveStylesMapOpenApiSchema = z.object({
  natural: EvolveStyleSchema.optional(),
  ecosystem: EvolveStyleSchema.optional(),
  forced: EvolveStyleSchema.optional(),
  late: EvolveStyleSchema.optional(),
}).openapi("EvolveStylesMap");

/** Spatial — canvas dimensions, coordinate space, stroke width, node radii */
const SpatialConfigOpenApiSchema = z.object({
  /** Canvas width in pixels (default: 1600) */
  width: z.number().positive().max(10000).default(1600),
  /** Canvas height in pixels (default: 800) */
  height: z.number().positive().max(10000).default(800),
  /** Explicit coordinate space declaration */
  coordinateSpace: CoordinateSpaceOpenApiSchema.optional(),
  /** Stroke width in pixels for edges and node outlines (default: 1) */
  strokeWidth: z.number().min(0.25).max(8).default(1),
  /** Per-type node circle radii (default: { _default: 5 }) */
  nodeRadii: NodeRadiiOpenApiSchema.default({ _default: 5 }),
}).openapi("SpatialConfig");

/** Typography — font family and label scale multiplier */
const TypographyConfigOpenApiSchema = z.object({
  /** CSS font-family stack (default: "Inter, sans-serif") */
  fontFamily: z.string().default("Inter, sans-serif"),
  /** Label font size multiplier (default: 1.0) */
  labelScale: z.number().positive().max(5).default(1.0),
}).openapi("TypographyConfig");

/** Styling — theme, palette (colors), evolve styles, background */
const StylingConfigOpenApiSchema = z.object({
  /** Named visual theme preset (default: "default") */
  theme: ThemeEnum.default("default"),
  /** Per-renderable-type color overrides */
  palette: TypeColorsOpenApiSchema.optional(),
  /** Per-evolve-type arrow stroke style overrides */
  evolveStyles: EvolveStylesMapOpenApiSchema.optional(),
  /** Background canvas color and axis/phase display controls */
  background: BackgroundSchema.optional(),
}).openapi("StylingConfig");

/** ConfigIntent — scope-boundary intent flags */
const ConfigIntentOpenApiSchema = z.object({
  /** Output is a one-shot static SVG/PNG (default: true) */
  staticExport: z.boolean().default(true),
  /** Temporal diffing excluded (default: true) */
  noTemporalDiff: z.boolean().default(true),
  /** SVG output is inert — no JS, no event listeners (default: true) */
  noInteraction: z.boolean().default(true),
}).openapi("ConfigIntent");

const RenderConfigSchema = z.object({
  /** Spatial — canvas dimensions, coordinate space, stroke width, node radii */
  spatial: SpatialConfigOpenApiSchema.optional(),
  /** Typography — font family and label scale multiplier */
  typography: TypographyConfigOpenApiSchema.optional(),
  /** Styling — theme, palette (colors), evolve styles, background */
  styling: StylingConfigOpenApiSchema.optional(),
  /** Unified visibility filters: layer toggles (post-render) + data exclusions (pre-render) */
  filters: FiltersSchema.optional(),
  /** Legend visibility and position */
  legend: LegendSchema.optional(),
  /** Axes configuration — locale and axis label overrides */
  axes: AxesConfigSchema.optional(),
  /** Enable/disable label collision avoidance */
  avoidCollisions: z.boolean().optional(),
  /** Per-method rendering configuration (type, color, i18n legend labels) */
  methods: z.array(MethodConfigSchema).optional(),
  /** Scope-boundary intent flags */
  configIntent: ConfigIntentOpenApiSchema.partial().optional(),
}).openapi("RenderConfig");

const AcceleratorTypeEnum = z.enum(["accelerator", "deaccelerator"]).openapi("AcceleratorType");

const AcceleratorSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: PositionSchema,
  type: AcceleratorTypeEnum,
}).openapi("Accelerator");

const StepSchema = z.object({
  id: z.string(),
  number: z.number().int().min(1),
  position: PositionSchema,
  color: z.string().optional(),
}).openapi("Step");

// ── Diff-op schemas (interactive editing) ──────────────────────
const MoveLabelPayloadSchema = z.object({
  id: z.string().min(1).openapi({ description: "The component id whose label is being repositioned" }),
  dx: z.number().openapi({ description: "Horizontal offset relative to the node center (normalized coordinates)" }),
  dy: z.number().openapi({ description: "Vertical offset relative to the node center (normalized coordinates)" }),
}).openapi("MoveLabelPayload");

const MoveLabelOpSchema = z.object({
  op: z.literal("move_label"),
  payload: MoveLabelPayloadSchema,
}).openapi("MoveLabelOp");

const MoveStepPayloadSchema = z.object({
  id: z.string().openapi({ description: "The step id identifying the step sticker to move" }),
  evolution: z.number().min(0).max(1).openapi({ description: "New evolution position [0, 1]" }),
  visibility: z.number().min(0).max(1).openapi({ description: "New visibility position [0, 1]" }),
}).openapi("MoveStepPayload");

const MoveStepOpSchema = z.object({
  op: z.literal("move_step"),
  payload: MoveStepPayloadSchema,
}).openapi("MoveStepOp");

const WardleyMapSchema = z.object({
  title: z.string(),
  components: z.array(ComponentSchema),
  relations: z.array(RelationSchema),
  context: z.string().optional(),
  renderConfig: RenderConfigSchema.optional(),
  accelerators: z.array(AcceleratorSchema).optional(),
  steps: z.array(StepSchema).optional(),
}).openapi("WardleyMap");

// ── RFC 7807 Problem Detail (manually defined, not from Zod) ──
const ProblemDetailSchema = z.object({
  type: z.string().default("about:blank").openapi({ description: "URI reference identifying the problem type" }),
  title: z.string().openapi({ description: "Short human-readable summary" }),
  status: z.number().int().openapi({ description: "HTTP status code" }),
  detail: z.string().optional().openapi({ description: "Human-readable explanation" }),
  instance: z.string().optional().openapi({ description: "URI identifying this occurrence" }),
  errors: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })).optional().openapi({ description: "Validation errors (extension for 400s)" }),
}).openapi("ProblemDetail");

// ── Registry ────────────────────────────────────────────────────
const registry = new OpenAPIRegistry();

// Register security scheme
registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "API key passed as a Bearer token in the Authorization header",
});

// ── POST /render ────────────────────────────────────────────────
registry.registerPath({
  method: "post",
  path: "/v1/render",
  operationId: "renderMap",
  summary: "Render a Wardley Map to SVG or PNG",
  description:
    "Accepts a WardleyMap JSON body and returns the rendered map. " +
    "Use the Accept header for content negotiation: image/svg+xml for SVG, image/png for PNG (default).",
  tags: ["Render"],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: WardleyMapSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Rendered map image",
      content: {
        "image/png": {
          schema: z.string().openapi({ format: "binary" }),
        },
        "image/svg+xml": {
          schema: z.string(),
        },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
    401: {
      description: "Missing or invalid API key",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
    406: {
      description: "Unsupported Accept header value",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
    429: {
      description: "Rate limit exceeded",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
  },
});

// ── POST /generate ──────────────────────────────────────────────
const GenerateRequestSchema = z.object({
  prompt: z.string().openapi({ description: "Natural language description of the business domain to map" }),
  format: z.enum(["json", "owm", "both"]).default("json").openapi({ description: "Output format" }),
}).openapi("GenerateRequest");

const GenerateResponseSchema = z.object({
  meta: z.object({
    elapsed_ms: z.number().int(),
    warnings: z.array(z.string()),
    engine: z.string(),
  }),
  map: WardleyMapSchema.optional(),
  owm: z.string().optional().openapi({ description: "OWM text format output" }),
}).openapi("GenerateResponse");

registry.registerPath({
  method: "post",
  path: "/v1/generate",
  operationId: "generateMap",
  summary: "Generate a Wardley Map from a natural language prompt",
  description: "Uses LLM to extract Wardley Map components and relations from a natural language description.",
  tags: ["Generate"],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: GenerateRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Generated Wardley Map",
      content: {
        "application/json": { schema: GenerateResponseSchema },
      },
    },
    400: {
      description: "Missing or invalid prompt",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
    401: {
      description: "Missing or invalid API key",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
    500: {
      description: "Generation failed",
      content: {
        "application/problem+json": { schema: ProblemDetailSchema },
      },
    },
  },
});

// ── GET /docs/openapi.json ──────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/v1/docs/openapi.json",
  operationId: "getOpenApiSpec",
  summary: "OpenAPI 3.1 specification",
  description: "Returns the auto-generated OpenAPI 3.1.0 JSON specification for this API.",
  tags: ["Documentation"],
  security: [],
  responses: {
    200: {
      description: "OpenAPI specification document",
      content: {
        "application/json": {
          schema: z.object({}).passthrough(),
        },
      },
    },
  },
});

// ── Document generator (cached) ─────────────────────────────────
let _cachedDoc: ReturnType<OpenApiGeneratorV31["generateDocument"]> | null = null;

/**
 * Generate the full OpenAPI 3.1 document from the registry.
 * Result is cached after first call.
 */
export function getOpenApiDocument() {
  if (_cachedDoc) return _cachedDoc;

  const generator = new OpenApiGeneratorV31(registry.definitions);
  _cachedDoc = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "WardleyAPI",
      version: "1.0.0",
      description:
        "Production-grade API for rendering Wardley Maps. " +
        "Accepts WardleyMap JSON and returns rendered visuals (SVG/PNG). " +
        "Content negotiation via Accept header. RFC 7807 error responses.",
      license: { name: "ISC" },
    },
    servers: [{ url: "/", description: "Current server" }],
    security: [{ BearerAuth: [] }],
  });

  return _cachedDoc;
}

export { registry };
