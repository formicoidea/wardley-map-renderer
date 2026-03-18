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
  "component", "user-need", "pipeline", "note", "anchor",
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
}).openapi("EvolvesTo");

const PipelineGeometrySchema = z.object({
  evoStart: z.number().min(0).max(1),
  evoEnd: z.number().min(0).max(1),
  visStart: z.number().min(0).max(1),
  visEnd: z.number().min(0).max(1),
  handleEvolution: z.number().min(0).max(1).optional(),
}).openapi("PipelineGeometry");

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
}).openapi("Component");

const FlowSchema = z.object({
  label: z.string(),
  style: z.enum(["solid", "dashed", "bold"]).default("solid"),
}).openapi("Flow");

const RelationTypeEnum = z.enum(["DependsOn", "Flow", "Constraint"]).openapi("RelationType");

const RelationSchema = z.object({
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

const LegendSchema = z.object({
  show: z.boolean().default(true),
  position: z.union([
    z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "auto"]),
    z.object({ x: z.number(), y: z.number() }),
  ]).default("bottom-right"),
}).openapi("Legend");

const EvolveStyleSchema = z.object({
  stroke: z.string().optional(),
  strokeDasharray: z.string().optional(),
}).openapi("EvolveStyle");

const RenderConfigSchema = z.object({
  /** Override canvas width (defaults to 1600) */
  width: z.number().positive().optional(),
  /** Override canvas height (defaults to 800) */
  height: z.number().positive().optional(),
  /** Named visual theme preset (default: "default") */
  theme: ThemeEnum.optional(),
  /** Locale preset for axis labels (default: "en") */
  locale: LocaleEnum.optional(),
  /** Background canvas color and axis/phase display controls.
   *  backgroundColor is now background.color — no top-level backgroundColor field. */
  background: BackgroundSchema.optional(),
  fontFamily: z.string().optional(),
  labelScale: z.number().positive().max(5).optional(),
  nodeRadii: z.object({ _default: z.number().positive().max(50) })
    .catchall(z.number().positive().max(50))
    .optional(),
  avoidCollisions: z.boolean().optional(),
  /** Per-component-type color overrides. `_default` is required when provided (TypeStyleMap pattern). */
  typeColors: z.object({ _default: z.string() })
    .catchall(z.string())
    .optional(),
  evolveStyles: z.object({
    natural: EvolveStyleSchema.optional(),
    ecosystem: EvolveStyleSchema.optional(),
    forced: EvolveStyleSchema.optional(),
    late: EvolveStyleSchema.optional(),
  }).optional(),
  legend: LegendSchema.optional(),
  /** Unified visibility filters: layer toggles (post-render) + data exclusions (pre-render) */
  filters: FiltersSchema.optional(),
  /** Stroke width in pixels for edges and node outlines (defaults to 1) */
  strokeWidth: z.number().min(0.25).max(8).default(1),
}).openapi("RenderConfig");

const WardleyMapSchema = z.object({
  title: z.string(),
  components: z.array(ComponentSchema),
  relations: z.array(RelationSchema),
  context: z.string().optional(),
  renderConfig: RenderConfigSchema.optional(),
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
