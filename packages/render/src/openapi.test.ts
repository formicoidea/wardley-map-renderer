/**
 * Tests for OpenAPI spec generation and GET /v1/docs/openapi.json endpoint.
 *
 * Verifies:
 * - OpenAPI 3.1 document is generated correctly from Zod schemas
 * - GET /v1/docs/openapi.json serves the spec with correct content-type
 * - Spec contains expected paths, schemas, and security definitions
 * - Endpoint is accessible without authentication
 * - Cached responses are consistent
 */

import { describe, it, expect } from "vitest";
import { getOpenApiDocument } from "./openapi.js";
import { app } from "./server.js";

// ── Unit tests: OpenAPI document generation ─────────────────────

describe("OpenAPI document generation", () => {
  const doc = getOpenApiDocument();

  it("generates a valid OpenAPI 3.1 document", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("has correct API title and version", () => {
    expect(doc.info.title).toBe("WardleyAPI");
    expect(doc.info.version).toBe("1.0.0");
  });

  it("has a non-empty description", () => {
    expect(doc.info.description).toBeTruthy();
    expect(doc.info.description!.length).toBeGreaterThan(20);
  });

  it("registers BearerAuth security scheme", () => {
    const schemes = (doc.components as any)?.securitySchemes;
    expect(schemes).toBeDefined();
    expect(schemes.BearerAuth).toBeDefined();
    expect(schemes.BearerAuth.type).toBe("http");
    expect(schemes.BearerAuth.scheme).toBe("bearer");
  });

  it("applies global security requirement", () => {
    expect(doc.security).toEqual([{ BearerAuth: [] }]);
  });

  it("includes all expected API paths", () => {
    const paths = Object.keys(doc.paths ?? {});
    expect(paths).toContain("/v1/render");
    expect(paths).toContain("/v1/generate");
    expect(paths).toContain("/v1/docs/openapi.json");
  });

  it("includes WardleyMap and related schemas in components", () => {
    const schemas = (doc.components as any)?.schemas;
    expect(schemas).toBeDefined();
    expect(schemas.WardleyMap).toBeDefined();
    expect(schemas.Component).toBeDefined();
    expect(schemas.Relation).toBeDefined();
    expect(schemas.ProblemDetail).toBeDefined();
    expect(schemas.RenderConfig).toBeDefined();
    expect(schemas.Legend).toBeDefined();
  });

  it("defines POST /v1/render with content negotiation responses", () => {
    const renderPath = (doc.paths as any)?.["/v1/render"];
    expect(renderPath?.post).toBeDefined();
    expect(renderPath.post.operationId).toBe("renderMap");
    const resp200 = renderPath.post.responses["200"];
    expect(resp200.content["image/png"]).toBeDefined();
    expect(resp200.content["image/svg+xml"]).toBeDefined();
  });

  it("defines error responses with application/problem+json", () => {
    const renderPost = (doc.paths as any)?.["/v1/render"]?.post;
    expect(renderPost.responses["400"].content["application/problem+json"]).toBeDefined();
    expect(renderPost.responses["401"].content["application/problem+json"]).toBeDefined();
    expect(renderPost.responses["406"].content["application/problem+json"]).toBeDefined();
  });

  it("marks /v1/docs/openapi.json as requiring no auth", () => {
    const docsPath = (doc.paths as any)?.["/v1/docs/openapi.json"];
    expect(docsPath.get.security).toEqual([]);
  });
});

// ── Integration tests: HTTP endpoint ────────────────────────────

describe("GET /v1/docs/openapi.json endpoint", () => {
  it("returns 200 with JSON content-type", async () => {
    const res = await app.request("/v1/docs/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("returns valid OpenAPI 3.1 JSON body", async () => {
    const res = await app.request("/v1/docs/openapi.json");
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("WardleyAPI");
    expect(body.paths).toBeDefined();
    expect(body.components?.schemas).toBeDefined();
  });

  it("returns consistent spec on repeated calls (cached)", async () => {
    const res1 = await app.request("/v1/docs/openapi.json");
    const doc1 = await res1.json();
    const res2 = await app.request("/v1/docs/openapi.json");
    const doc2 = await res2.json();
    expect(JSON.stringify(doc1)).toBe(JSON.stringify(doc2));
  });

  it("is accessible without Authorization header", async () => {
    // Endpoint should bypass auth — returns 200, not 401
    const res = await app.request("/v1/docs/openapi.json");
    expect(res.status).toBe(200);
  });
});
