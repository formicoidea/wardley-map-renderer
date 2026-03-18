/**
 * Tests for OpenAPI schema and path registrations.
 *
 * Verifies that all Zod schemas are registered as named components
 * in the OpenAPI 3.1 spec, and that API paths reference them correctly.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { registry } from "../openapi.js";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registerSchemas, registerPaths } from "./schemas.js";

// Register everything once before tests run
beforeAll(() => {
  registerSchemas();
  registerPaths();
});

function generateDoc() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: { title: "WardleyAPI", version: "1.0.0" },
    servers: [
      { url: "http://localhost:3000", description: "Local" },
      { url: "https://api.wardleymap.dev", description: "Production" },
    ],
    security: [{ BearerAuth: [] }],
  });
}

const doc = (() => {
  let _doc: ReturnType<typeof generateDoc>;
  return () => {
    if (!_doc) _doc = generateDoc();
    return _doc;
  };
})();

// ── Schema registration tests ───────────────────────────────

describe("OpenAPI schema registrations", () => {
  const expectedSchemas = [
    "Evolution",
    "EvolutionRange",
    "ComponentType",
    "Nature",
    "RelationType",
    "LegendPosition",
    "Locale",
    "LabelPosition",
    "Label",
    "EvolutionField",
    "VisibilityField",
    "Position",
    "EvolvesTo",
    "PipelineGeometry",
    "Component",
    "Flow",
    "Relation",
    "AxisLabels",
    "Legend",
    "EvolveStyle",
    "RenderConfig",
    "WardleyMap",
    "ProblemDetail",
    "HealthResponse",
  ];

  it("registers all expected schemas in the OpenAPI document", () => {
    const schemas = (doc().components as any)?.schemas;
    expect(schemas).toBeDefined();

    for (const name of expectedSchemas) {
      expect(schemas[name], `Missing schema: ${name}`).toBeDefined();
    }
  });

  it("registers at least 21 schemas", () => {
    const schemas = (doc().components as any)?.schemas;
    const schemaNames = Object.keys(schemas || {});
    expect(schemaNames.length).toBeGreaterThanOrEqual(24);
  });

  // ── WardleyMap schema structure ──────────────────────────

  it("WardleyMap schema has required properties", () => {
    const schemas = (doc().components as any)?.schemas;
    const wardley = schemas?.WardleyMap;
    expect(wardley).toBeDefined();
    // Should be an object type with properties
    expect(wardley.type).toBe("object");
    expect(wardley.properties).toBeDefined();
    expect(wardley.properties.title).toBeDefined();
    expect(wardley.properties.components).toBeDefined();
    expect(wardley.properties.relations).toBeDefined();
  });

  it("WardleyMap schema includes optional renderConfig", () => {
    const schemas = (doc().components as any)?.schemas;
    const wardley = schemas?.WardleyMap;
    expect(wardley.properties.renderConfig).toBeDefined();
  });

  it("WardleyMap has an example", () => {
    const schemas = (doc().components as any)?.schemas;
    const wardley = schemas?.WardleyMap;
    expect(wardley.example).toBeDefined();
    expect(wardley.example.title).toBe("Example Map");
    expect(wardley.example.components.length).toBeGreaterThanOrEqual(2);
  });

  // ── Component schema ─────────────────────────────────────

  it("Component schema has id, label, type, position", () => {
    const schemas = (doc().components as any)?.schemas;
    const comp = schemas?.Component;
    expect(comp).toBeDefined();
    expect(comp.properties.id).toBeDefined();
    expect(comp.properties.label).toBeDefined();
    expect(comp.properties.type).toBeDefined();
    expect(comp.properties.position).toBeDefined();
  });

  // ── ProblemDetail schema (RFC 7807) ──────────────────────

  it("ProblemDetail schema has type, title, status fields", () => {
    const schemas = (doc().components as any)?.schemas;
    const problem = schemas?.ProblemDetail;
    expect(problem).toBeDefined();
    expect(problem.properties.type).toBeDefined();
    expect(problem.properties.title).toBeDefined();
    expect(problem.properties.status).toBeDefined();
  });

  it("ProblemDetail has an example with status 422", () => {
    const schemas = (doc().components as any)?.schemas;
    const problem = schemas?.ProblemDetail;
    expect(problem.example).toBeDefined();
    expect(problem.example.status).toBe(422);
  });

  // ── HealthResponse schema ────────────────────────────────

  it("HealthResponse schema has name, version, status fields", () => {
    const schemas = (doc().components as any)?.schemas;
    const health = schemas?.HealthResponse;
    expect(health).toBeDefined();
    expect(health.properties.name).toBeDefined();
    expect(health.properties.version).toBeDefined();
    expect(health.properties.status).toBeDefined();
  });

  // ── Enum schemas ─────────────────────────────────────────

  it("ComponentType enum has expected values", () => {
    const schemas = (doc().components as any)?.schemas;
    const ct = schemas?.ComponentType;
    expect(ct).toBeDefined();
    expect(ct.enum).toContain("component");
    expect(ct.enum).toContain("user-need");
    expect(ct.enum).toContain("pipeline");
  });

  it("RelationType enum has DependsOn, Flow, Constraint", () => {
    const schemas = (doc().components as any)?.schemas;
    const rt = schemas?.RelationType;
    expect(rt).toBeDefined();
    expect(rt.enum).toContain("DependsOn");
    expect(rt.enum).toContain("Flow");
    expect(rt.enum).toContain("Constraint");
  });

  // ── RenderConfig schema ──────────────────────────────────

  it("RenderConfig schema has rendering override fields", () => {
    const schemas = (doc().components as any)?.schemas;
    const rc = schemas?.RenderConfig;
    expect(rc).toBeDefined();
    expect(rc.properties.width).toBeDefined();
    // backgroundColor moved to background.color in nested structure
    expect(rc.properties.background).toBeDefined();
    expect(rc.properties.fontFamily).toBeDefined();
  });
});

// ── Path registration tests ──────────────────────────────────

describe("OpenAPI path registrations", () => {
  it("registers POST /v1/render path", () => {
    const paths = doc().paths;
    expect(paths).toBeDefined();
    expect(paths!["/v1/render"]).toBeDefined();
    expect(paths!["/v1/render"]!.post).toBeDefined();
  });

  it("POST /v1/render has operationId renderMap", () => {
    const op = doc().paths!["/v1/render"]!.post!;
    expect(op.operationId).toBe("renderMap");
  });

  it("POST /v1/render has application/json request body", () => {
    const op = doc().paths!["/v1/render"]!.post!;
    const body = op.requestBody as any;
    expect(body).toBeDefined();
    expect(body.required).toBe(true);
    expect(body.content["application/json"]).toBeDefined();
  });

  it("POST /v1/render request body references WardleyMap schema", () => {
    const op = doc().paths!["/v1/render"]!.post!;
    const body = op.requestBody as any;
    const jsonSchema = body.content["application/json"].schema;
    // Should be a $ref to the WardleyMap component schema
    expect(jsonSchema.$ref).toBe("#/components/schemas/WardleyMap");
  });

  it("POST /v1/render 200 response has SVG and PNG content types", () => {
    const op = doc().paths!["/v1/render"]!.post!;
    const resp200 = op.responses!["200"] as any;
    expect(resp200).toBeDefined();
    expect(resp200.content["image/svg+xml"]).toBeDefined();
    expect(resp200.content["image/png"]).toBeDefined();
  });

  it("POST /v1/render error responses reference ProblemDetail schema", () => {
    const op = doc().paths!["/v1/render"]!.post!;

    for (const status of ["400", "401", "406", "422", "429", "500"]) {
      const resp = op.responses![status] as any;
      expect(resp, `Missing response for ${status}`).toBeDefined();
      const problemSchema = resp.content["application/problem+json"]?.schema;
      expect(problemSchema, `Missing problem+json schema for ${status}`).toBeDefined();
      expect(problemSchema.$ref).toBe("#/components/schemas/ProblemDetail");
    }
  });

  it("POST /v1/render has BearerAuth security", () => {
    const op = doc().paths!["/v1/render"]!.post!;
    expect(op.security).toEqual([{ BearerAuth: [] }]);
  });

  it("registers GET /v1/health path", () => {
    const paths = doc().paths;
    expect(paths!["/v1/health"]).toBeDefined();
    expect(paths!["/v1/health"]!.get).toBeDefined();
  });

  it("GET /v1/health has operationId healthCheck", () => {
    const op = doc().paths!["/v1/health"]!.get!;
    expect(op.operationId).toBe("healthCheck");
  });

  it("GET /v1/health 200 response references HealthResponse schema", () => {
    const op = doc().paths!["/v1/health"]!.get!;
    const resp200 = op.responses!["200"] as any;
    expect(resp200).toBeDefined();
    const jsonSchema = resp200.content["application/json"].schema;
    expect(jsonSchema.$ref).toBe("#/components/schemas/HealthResponse");
  });

  it("GET /v1/health has no security requirement", () => {
    const op = doc().paths!["/v1/health"]!.get!;
    expect(op.security).toEqual([]);
  });
});

// ── Full spec structure tests ────────────────────────────────

describe("Generated OpenAPI spec completeness", () => {
  it("is OpenAPI 3.1.0", () => {
    expect(doc().openapi).toBe("3.1.0");
  });

  it("has BearerAuth security scheme in components", () => {
    const schemes = (doc().components as any)?.securitySchemes;
    expect(schemes?.BearerAuth).toBeDefined();
    expect(schemes.BearerAuth.type).toBe("http");
    expect(schemes.BearerAuth.scheme).toBe("bearer");
  });

  it("has both schemas and paths populated", () => {
    const schemas = (doc().components as any)?.schemas;
    const paths = doc().paths;
    expect(Object.keys(schemas || {}).length).toBeGreaterThan(0);
    expect(Object.keys(paths || {}).length).toBeGreaterThan(0);
  });
});
