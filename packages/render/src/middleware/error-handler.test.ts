/**
 * Tests for RFC 7807 error-handling middleware.
 *
 * Verifies that all error types are mapped to RFC 7807 Problem Details
 * with Content-Type: application/problem+json.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  rfc7807ErrorHandler,
  rfc7807NotFound,
  HttpProblem,
  type ProblemDetail,
} from "./error-handler.js";

// ── Test app factory ─────────────────────────────────────────────────

function createApp() {
  const app = new Hono();
  app.onError(rfc7807ErrorHandler);
  app.notFound(rfc7807NotFound);

  // Route that throws HttpProblem
  app.get("/throw-problem", () => {
    throw new HttpProblem(422, "Unprocessable Entity", {
      detail: "Component 'x' has invalid evolution",
      type: "https://wardleyapi.dev/problems/validation-error",
    });
  });

  // Route that throws HttpProblem with errors array
  app.get("/throw-problem-errors", () => {
    throw new HttpProblem(400, "Bad Request", {
      detail: "Validation failed",
      errors: [
        { path: "components.0.evolution", message: "Must be between 0 and 1" },
        { path: "title", message: "Required" },
      ],
    });
  });

  // Route that throws Hono HTTPException
  app.get("/throw-http-exception", () => {
    throw new HTTPException(403, { message: "API key does not have access" });
  });

  // Route that throws ZodError
  app.get("/throw-zod", (c) => {
    const schema = z.object({ name: z.string(), age: z.number() });
    return c.json(schema.parse({ name: 123, age: "not a number" }));
  });

  // Route that throws a generic Error
  app.get("/throw-generic", () => {
    throw new Error("Something broke internally");
  });

  // Route that throws a non-standard Error (no status property)
  app.get("/throw-type-error", (c) => {
    const obj: any = null;
    return c.json(obj.nonExistent()); // triggers TypeError
  });

  // Successful route (control)
  app.get("/ok", (c) => c.json({ status: "ok" }));

  return app;
}

// ── Helper ───────────────────────────────────────────────────────────

async function getProblem(app: Hono, path: string): Promise<{ res: Response; body: ProblemDetail & { errors?: Array<{ path: string; message: string }> } }> {
  const res = await app.request(path);
  const body = await res.json() as ProblemDetail & { errors?: Array<{ path: string; message: string }> };
  return { res, body };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("RFC 7807 error handler", () => {
  const app = createApp();

  describe("Content-Type", () => {
    it("sets application/problem+json on error responses", async () => {
      const { res } = await getProblem(app, "/throw-generic");
      expect(res.headers.get("content-type")).toContain("application/problem+json");
    });

    it("does NOT set problem+json on success responses", async () => {
      const res = await app.request("/ok");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("content-type")).not.toContain("problem+json");
    });
  });

  describe("HttpProblem errors", () => {
    it("serializes HttpProblem with custom type, title, status, detail", async () => {
      const { res, body } = await getProblem(app, "/throw-problem");
      expect(res.status).toBe(422);
      expect(body.type).toBe("https://wardleyapi.dev/problems/validation-error");
      expect(body.title).toBe("Unprocessable Entity");
      expect(body.status).toBe(422);
      expect(body.detail).toBe("Component 'x' has invalid evolution");
    });

    it("includes errors array when provided", async () => {
      const { res, body } = await getProblem(app, "/throw-problem-errors");
      expect(res.status).toBe(400);
      expect(body.errors).toBeDefined();
      expect(body.errors).toHaveLength(2);
      expect(body.errors![0].path).toBe("components.0.evolution");
      expect(body.errors![1].path).toBe("title");
    });
  });

  describe("Hono HTTPException", () => {
    it("maps HTTPException to RFC 7807 with correct status", async () => {
      const { res, body } = await getProblem(app, "/throw-http-exception");
      expect(res.status).toBe(403);
      expect(body.type).toBe("about:blank");
      expect(body.title).toBe("Forbidden");
      expect(body.status).toBe(403);
      expect(body.detail).toBe("API key does not have access");
    });
  });

  describe("ZodError", () => {
    it("maps ZodError to 400 with validation errors", async () => {
      const { res, body } = await getProblem(app, "/throw-zod");
      expect(res.status).toBe(400);
      expect(body.title).toBe("Bad Request");
      expect(body.status).toBe(400);
      expect(body.detail).toBe("Request validation failed");
      expect(body.errors).toBeDefined();
      expect(body.errors!.length).toBeGreaterThan(0);
      // Each error should have path and message
      for (const err of body.errors!) {
        expect(err).toHaveProperty("path");
        expect(err).toHaveProperty("message");
      }
    });
  });

  describe("Generic errors", () => {
    it("maps generic Error to 500", async () => {
      const { res, body } = await getProblem(app, "/throw-generic");
      expect(res.status).toBe(500);
      expect(body.type).toBe("https://api.wardleyapi.com/problems/internal-error");
      expect(body.title).toBe("Internal Server Error");
      expect(body.status).toBe(500);
    });

    it("maps TypeError to 500", async () => {
      const { res, body } = await getProblem(app, "/throw-type-error");
      expect(res.status).toBe(500);
      expect(body.title).toBe("Internal Server Error");
      expect(body.status).toBe(500);
    });
  });

  describe("404 Not Found", () => {
    it("returns RFC 7807 for unknown routes", async () => {
      const { res, body } = await getProblem(app, "/nonexistent");
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/problem+json");
      expect(body.type).toBe("https://api.wardleyapi.com/problems/not-found");
      expect(body.title).toBe("Not Found");
      expect(body.status).toBe(404);
      expect(body.detail).toContain("/nonexistent");
    });
  });

  describe("RFC 7807 structure", () => {
    it("always includes type, title, and status fields", async () => {
      const paths = [
        "/throw-problem",
        "/throw-http-exception",
        "/throw-zod",
        "/throw-generic",
        "/nonexistent",
      ];
      for (const path of paths) {
        const { body } = await getProblem(app, path);
        expect(body).toHaveProperty("type");
        expect(body).toHaveProperty("title");
        expect(body).toHaveProperty("status");
        expect(typeof body.type).toBe("string");
        expect(typeof body.title).toBe("string");
        expect(typeof body.status).toBe("number");
      }
    });
  });
});

// ── HttpProblem class unit tests ─────────────────────────────────────

describe("HttpProblem", () => {
  it("defaults type to about:blank", () => {
    const err = new HttpProblem(400, "Bad Request");
    expect(err.problemType).toBe("about:blank");
  });

  it("extends Error with correct message", () => {
    const err = new HttpProblem(400, "Bad Request", { detail: "Missing field" });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Missing field");
    expect(err.name).toBe("HttpProblem");
  });

  it("uses title as message when detail is absent", () => {
    const err = new HttpProblem(500, "Internal Server Error");
    expect(err.message).toBe("Internal Server Error");
  });

  it("toProblemDetail() returns clean RFC 7807 object", () => {
    const err = new HttpProblem(429, "Too Many Requests", {
      detail: "Rate limit exceeded",
      type: "https://wardleyapi.dev/problems/rate-limit",
      instance: "/v1/render",
    });
    const pd = err.toProblemDetail();
    expect(pd).toEqual({
      type: "https://wardleyapi.dev/problems/rate-limit",
      title: "Too Many Requests",
      status: 429,
      detail: "Rate limit exceeded",
      instance: "/v1/render",
    });
  });

  it("toProblemDetail() omits undefined optional fields", () => {
    const err = new HttpProblem(404, "Not Found");
    const pd = err.toProblemDetail();
    expect(pd).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
    });
    expect("detail" in pd).toBe(false);
    expect("instance" in pd).toBe(false);
    expect("errors" in pd).toBe(false);
  });
});
