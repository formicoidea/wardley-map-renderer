/**
 * OpenAPI schema registrations for WardleyAPI.
 *
 * Registers all Zod request/response schemas with the @asteasolutions/zod-to-openapi
 * OpenAPIRegistry so they appear as named components in the generated OpenAPI 3.1 spec.
 *
 * Schemas registered:
 *   - WardleyMap (request body input)
 *   - Component, Relation, RenderConfig (sub-schemas)
 *   - ProblemDetail (RFC 7807 error response)
 *   - HealthResponse (health check response)
 *
 * Also registers all API paths (routes) with their request/response schemas.
 *
 * @module openapi/schemas
 */

import { z } from "zod";
import { registry } from "../openapi.js";
import {
  EvolutionSchema,
  EvolutionRangeSchema,
  ComponentTypeEnum,
  NatureEnum,
  EvolvesToSchema,
  PipelineGeometrySchema,
  ComponentSchema,
  RelationTypeEnum,
  FlowSchema,
  RelationSchema,
  LabelPositionSchema,
  LabelSchema,
  EvolutionFieldSchema,
  VisibilityFieldSchema,
  PositionSchema,
  LocaleEnum,
  AxisLabelsSchema,
  LegendPositionEnum,
  LegendPositionXYSchema,
  LegendSchema,
  EvolveStyleSchema,
  RenderConfigSchema,
  WardleyMapSchema,
  MethodSchema,
  MethodConfigSchema,
  AcceleratorTypeEnum,
  AcceleratorSchema,
  StepSchema,
} from "../schema.js";
import { ProblemDetailSchema, HealthResponseSchema } from "./routes.js";

// ── Registered schema references (populated by registerSchemas) ──

let _wardleyMapSchema: typeof WardleyMapSchema;
let _problemDetailSchema: typeof ProblemDetailSchema;
let _healthResponseSchema: typeof HealthResponseSchema;

// ── Schema registrations ──────────────────────────────────────

/**
 * Register all Zod schemas with the OpenAPI registry.
 * Call once at application startup, before generating the OpenAPI document.
 *
 * Returns an object with the registered schemas (with refIds set)
 * for use in path registrations.
 */
export function registerSchemas(): void {
  // ── Primitive / enum schemas ────────────────────────────────

  registry.register("Evolution", EvolutionSchema.openapi({
    description: "Normalized evolution axis value [0, 1]. 0 = Genesis, 1 = Commodity.",
    example: 0.65,
  }));

  registry.register("EvolutionRange", EvolutionRangeSchema.openapi({
    description: "Evolution uncertainty span as [min, max], both normalized [0, 1].",
    example: [0.3, 0.6],
  }));

  registry.register("ComponentType", ComponentTypeEnum.openapi({
    description: "Type of Wardley Map component.",
  }));

  registry.register("Nature", NatureEnum.unwrap().openapi({
    description: "Optional semantic nature annotation for a component.",
  }));

  registry.register("RelationType", RelationTypeEnum.openapi({
    description: "Type of relation between components.",
  }));

  registry.register("Method", MethodSchema.openapi({
    description: "Method annotation for a component (type + preconisation, free strings).",
  }));

  registry.register("AcceleratorType", AcceleratorTypeEnum.openapi({
    description: "Whether the gameplay element accelerates or decelerates evolution.",
  }));

  registry.register("LegendPosition", LegendPositionEnum.openapi({
    description: "Position of the legend on the rendered map.",
  }));

  registry.register("LegendPositionXY", LegendPositionXYSchema.openapi({
    description: "Absolute {x, y} coordinates for legend placement.",
  }));

  registry.register("Locale", LocaleEnum.openapi({
    description: "Supported locale for axis label presets.",
  }));

  // ── Object schemas ─────────────────────────────────────────

  registry.register("LabelPosition", LabelPositionSchema.openapi({
    description: "Optional label offset for rendering (pixels relative to component center).",
  }));

  registry.register("Label", LabelSchema.openapi({
    description: "Component label with name and optional position offset.",
    example: { name: "Platform", position: { dx: 10, dy: -5 } },
  }));

  registry.register("EvolutionField", EvolutionFieldSchema.openapi({
    description: "Evolution axis value with optional uncertainty range.",
    example: { scalar: 0.65, range: [0.5, 0.8] },
  }));

  registry.register("VisibilityField", VisibilityFieldSchema.openapi({
    description: "Visibility axis value (0 = top/visible, 1 = bottom/invisible).",
    example: { scalar: 0.3 },
  }));

  registry.register("Position", PositionSchema.openapi({
    description: "Component position on evolution and visibility axes.",
  }));

  registry.register("EvolvesTo", EvolvesToSchema.openapi({
    description: "Evolution movement target for a component. When inertia is true, a resistance barrier is drawn at the phase boundary.",
  }));

  registry.register("PipelineGeometry", PipelineGeometrySchema.openapi({
    description: "Bounding box and handle position for pipeline components.",
  }));

  registry.register("Component", ComponentSchema.openapi({
    description: "A single component on the Wardley Map.",
    example: {
      id: "platform",
      label: { name: "Platform" },
      type: "component",
      position: {
        evolution: { scalar: 0.65 },
        visibility: { scalar: 0.3 },
      },
    },
  }));

  registry.register("Flow", FlowSchema.openapi({
    description: "Semantic annotation describing what flows along a relation edge.",
  }));

  registry.register("Relation", RelationSchema.openapi({
    description: "A directed relation (edge) between two components.",
    example: {
      source: "web-app",
      target: "platform",
      type: "DependsOn",
    },
  }));

  registry.register("AxisLabels", AxisLabelsSchema.openapi({
    description: "i18n axis label overrides (per-field). Locale preset selected via renderConfig.locale.",
  }));

  registry.register("Legend", LegendSchema.openapi({
    description: "Legend visibility and position configuration.",
  }));

  registry.register("EvolveStyle", EvolveStyleSchema.openapi({
    description: "Stroke style overrides for evolution arrows.",
  }));

  registry.register("MethodConfig", MethodConfigSchema.openapi({
    description: "Per-method rendering configuration: type identifier, indicator color, and i18n legend labels (exactly 3 keys).",
    example: {
      type: "build",
      color: "#00a86b",
      legend: { en: "Build", fr: "Construire", de: "Bauen" },
    },
  }));

  registry.register("Accelerator", AcceleratorSchema.openapi({
    description: "A gameplay accelerator or deaccelerator placed on the map, indicating forces that speed up or slow down evolution.",
    example: {
      id: "open-source",
      label: "Open Source",
      position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } },
      type: "accelerator",
    },
  }));

  registry.register("Step", StepSchema.openapi({
    description: "A numbered step sticker placed on the map. Step numbers are rendered as circled markers; descriptive text is managed client-side.",
    example: {
      number: 1,
      position: { evolution: { scalar: 0.4 }, visibility: { scalar: 0.3 } },
    },
  }));

  registry.register("RenderConfig", RenderConfigSchema.openapi({
    description: "Optional visual rendering overrides that travel with the map payload.",
  }));

  // ── Root request schema ────────────────────────────────────

  _wardleyMapSchema = registry.register("WardleyMap", WardleyMapSchema.openapi({
    description: "Complete Wardley Map JSON payload for rendering.",
    example: {
      title: "Example Map",
      components: [
        {
          id: "user",
          label: { name: "User" },
          type: "user-need",
          position: { evolution: { scalar: 0.95 }, visibility: { scalar: 0.05 } },
        },
        {
          id: "web-app",
          label: { name: "Web App" },
          type: "component",
          position: { evolution: { scalar: 0.65 }, visibility: { scalar: 0.3 } },
        },
        {
          id: "platform",
          label: { name: "Platform" },
          type: "component",
          position: { evolution: { scalar: 0.45 }, visibility: { scalar: 0.6 } },
        },
      ],
      relations: [
        { source: "user", target: "web-app", type: "DependsOn" },
        { source: "web-app", target: "platform", type: "DependsOn" },
      ],
    },
  }));

  // ── Response schemas ───────────────────────────────────────

  _problemDetailSchema = registry.register("ProblemDetail", ProblemDetailSchema.openapi({
    description: "RFC 7807 Problem Details error response.",
    example: {
      type: "https://wardleyapi.dev/problems/validation-error",
      title: "Validation Error",
      status: 422,
      detail: "Request validation failed",
      instance: "/v1/render",
      errors: [{ path: "components.0.position.evolution.scalar", message: "Number must be at most 1" }],
    },
  }));

  _healthResponseSchema = registry.register("HealthResponse", HealthResponseSchema.openapi({
    description: "Health check response indicating service status.",
    example: {
      name: "WardleyAPI",
      version: "1.0.0",
      status: "ok",
    },
  }));
}

// ── SVG/PNG response schemas ─────────────────────────────────
// Simple Zod schemas for documenting binary/string outputs

const SvgResponseSchema = z.string().openapi({
  description: "SVG markup of the rendered Wardley Map.",
});

const PngResponseSchema = z.string().openapi({
  description: "PNG binary of the rendered Wardley Map.",
  format: "binary",
});

// ── Path (route) registrations ────────────────────────────────

/**
 * Register all API paths with the OpenAPI registry.
 * Call after registerSchemas().
 */
export function registerPaths(): void {
  // ── POST /v1/render (content negotiation via Accept) ────────
  registry.registerPath({
    method: "post",
    path: "/v1/render",
    operationId: "renderMap",
    summary: "Render a Wardley Map",
    description:
      "Accepts a WardleyMap JSON payload and returns a rendered image. " +
      "Use the Accept header to choose output format: " +
      "image/svg+xml (default) or image/png.",
    tags: ["render"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        required: true,
        description: "WardleyMap JSON object to render",
        content: {
          "application/json": {
            schema: _wardleyMapSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Rendered Wardley Map image (SVG or PNG depending on Accept header)",
        content: {
          "image/svg+xml": {
            schema: SvgResponseSchema,
          },
          "image/png": {
            schema: PngResponseSchema,
          },
        },
      },
      "400": {
        description: "Invalid request body (malformed JSON)",
        content: {
          "application/problem+json": {
            schema: _problemDetailSchema,
          },
        },
      },
      "401": {
        description: "Missing or invalid API key",
        content: {
          "application/problem+json": {
            schema: _problemDetailSchema,
          },
        },
      },
      "406": {
        description: "Requested format not supported (Accept header mismatch)",
        content: {
          "application/problem+json": {
            schema: _problemDetailSchema,
          },
        },
      },
      "422": {
        description: "WardleyMap JSON validation failed",
        content: {
          "application/problem+json": {
            schema: _problemDetailSchema,
          },
        },
      },
      "429": {
        description: "Rate limit exceeded",
        content: {
          "application/problem+json": {
            schema: _problemDetailSchema,
          },
        },
      },
      "500": {
        description: "Internal server error during rendering",
        content: {
          "application/problem+json": {
            schema: _problemDetailSchema,
          },
        },
      },
    },
  });

  // ── GET /v1/health ──────────────────────────────────────────
  registry.registerPath({
    method: "get",
    path: "/v1/health",
    operationId: "healthCheck",
    summary: "Health check endpoint",
    description:
      "Returns the service name, version, and health status. " +
      "Does not require authentication.",
    tags: ["operations"],
    security: [], // explicitly no auth
    responses: {
      "200": {
        description: "Service is healthy",
        content: {
          "application/json": {
            schema: _healthResponseSchema,
          },
        },
      },
    },
  });
}
