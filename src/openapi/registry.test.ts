/**
 * Tests for the OpenAPI route registry and v1 route definitions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerRoute,
  getRoutes,
  getRoute,
  registrySize,
  clearRoutes,
  type RouteRegistration,
} from "./registry.js";
import {
  registerV1Routes,
  ProblemDetailSchema,
  HealthResponseSchema,
} from "./routes.js";

// ── Registry primitives ──────────────────────────────────────

describe("OpenAPI route registry", () => {
  beforeEach(() => {
    clearRoutes();
  });

  it("starts empty", () => {
    expect(registrySize()).toBe(0);
    expect(getRoutes()).toEqual([]);
  });

  it("registers and retrieves a route", () => {
    const route: RouteRegistration = {
      method: "GET",
      path: "/test",
      operationId: "testOp",
      summary: "A test route",
      tags: ["test"],
      responses: {
        "200": {
          description: "OK",
          contentType: "application/json",
        },
      },
    };

    registerRoute(route);

    expect(registrySize()).toBe(1);
    expect(getRoute("GET", "/test")).toEqual(route);
  });

  it("overwrites a route with the same method+path", () => {
    const route1: RouteRegistration = {
      method: "POST",
      path: "/dup",
      operationId: "dup1",
      summary: "First",
      tags: [],
      responses: {},
    };
    const route2: RouteRegistration = {
      method: "POST",
      path: "/dup",
      operationId: "dup2",
      summary: "Second",
      tags: [],
      responses: {},
    };

    registerRoute(route1);
    registerRoute(route2);

    expect(registrySize()).toBe(1);
    expect(getRoute("POST", "/dup")?.operationId).toBe("dup2");
  });

  it("returns undefined for unregistered routes", () => {
    expect(getRoute("DELETE", "/nowhere")).toBeUndefined();
  });

  it("clearRoutes empties the registry", () => {
    registerRoute({
      method: "GET",
      path: "/a",
      operationId: "a",
      summary: "a",
      tags: [],
      responses: {},
    });

    clearRoutes();
    expect(registrySize()).toBe(0);
  });
});

// ── v1 route definitions ─────────────────────────────────────

describe("registerV1Routes", () => {
  beforeEach(() => {
    clearRoutes();
    registerV1Routes();
  });

  it("registers exactly 3 routes", () => {
    expect(registrySize()).toBe(3);
  });

  it("registers POST /v1/render/svg", () => {
    const route = getRoute("POST", "/v1/render/svg");
    expect(route).toBeDefined();
    expect(route!.operationId).toBe("renderSvg");
    expect(route!.tags).toContain("render");
    expect(route!.security).toEqual([{ BearerAuth: [] }]);
  });

  it("POST /v1/render/svg has WardleyMap request schema", () => {
    const route = getRoute("POST", "/v1/render/svg")!;
    expect(route.request).toBeDefined();
    expect(route.request!.contentType).toBe("application/json");
    // The request schema should parse a valid WardleyMap
    const validMap = {
      title: "Test",
      components: [
        {
          id: "a",
          label: "A",
          type: "component",
          evolution: 0.5,
          visibility: 0.5,
        },
      ],
      relations: [],
    };
    const result = route.request!.schema.safeParse(validMap);
    expect(result.success).toBe(true);
  });

  it("POST /v1/render/svg has SVG 200 and error responses", () => {
    const route = getRoute("POST", "/v1/render/svg")!;
    expect(route.responses["200"]).toBeDefined();
    expect(route.responses["200"].contentType).toBe("image/svg+xml");
    expect(route.responses["401"]).toBeDefined();
    expect(route.responses["401"].contentType).toBe(
      "application/problem+json"
    );
    expect(route.responses["422"]).toBeDefined();
    expect(route.responses["429"]).toBeDefined();
    expect(route.responses["500"]).toBeDefined();
  });

  it("registers POST /v1/render/png", () => {
    const route = getRoute("POST", "/v1/render/png");
    expect(route).toBeDefined();
    expect(route!.operationId).toBe("renderPng");
    expect(route!.tags).toContain("render");
    expect(route!.security).toEqual([{ BearerAuth: [] }]);
  });

  it("POST /v1/render/png has PNG 200 response", () => {
    const route = getRoute("POST", "/v1/render/png")!;
    expect(route.responses["200"]).toBeDefined();
    expect(route.responses["200"].contentType).toBe("image/png");
  });

  it("registers GET /v1/health", () => {
    const route = getRoute("GET", "/v1/health");
    expect(route).toBeDefined();
    expect(route!.operationId).toBe("healthCheck");
    expect(route!.tags).toContain("operations");
  });

  it("GET /v1/health has no security requirement", () => {
    const route = getRoute("GET", "/v1/health")!;
    expect(route.security).toBeUndefined();
  });

  it("GET /v1/health 200 response uses HealthResponseSchema", () => {
    const route = getRoute("GET", "/v1/health")!;
    expect(route.responses["200"]).toBeDefined();
    expect(route.responses["200"].contentType).toBe("application/json");
    expect(route.responses["200"].schema).toBeDefined();

    // Schema should parse a valid health response
    const result = route.responses["200"].schema!.safeParse({
      name: "WardleyAPI",
      version: "0.1.0",
      status: "ok",
    });
    expect(result.success).toBe(true);
  });

  it("is idempotent — calling twice does not duplicate routes", () => {
    registerV1Routes(); // second call
    expect(registrySize()).toBe(3);
  });
});

// ── Shared schemas ───────────────────────────────────────────

describe("ProblemDetailSchema", () => {
  it("validates a minimal RFC 7807 response", () => {
    const result = ProblemDetailSchema.safeParse({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });
    expect(result.success).toBe(true);
  });

  it("validates a full RFC 7807 response with errors array", () => {
    const result = ProblemDetailSchema.safeParse({
      type: "https://wardleyapi.dev/problems/validation-error",
      title: "Validation Error",
      status: 422,
      detail: "Request validation failed",
      instance: "/v1/render",
      errors: [{ path: "components.0.evolution", message: "Too large" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = ProblemDetailSchema.safeParse({ title: "Oops" });
    expect(result.success).toBe(false);
  });
});

describe("HealthResponseSchema", () => {
  it("validates a healthy response", () => {
    const result = HealthResponseSchema.safeParse({
      name: "WardleyAPI",
      version: "0.1.0",
      status: "ok",
    });
    expect(result.success).toBe(true);
  });

  it("validates a degraded response", () => {
    const result = HealthResponseSchema.safeParse({
      name: "WardleyAPI",
      version: "0.1.0",
      status: "degraded",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = HealthResponseSchema.safeParse({
      name: "WardleyAPI",
      version: "0.1.0",
      status: "broken",
    });
    expect(result.success).toBe(false);
  });
});
