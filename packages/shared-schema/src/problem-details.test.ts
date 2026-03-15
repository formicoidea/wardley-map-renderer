import { describe, it, expect } from "vitest";
import {
  ProblemDetailSchema,
  ValidationProblemDetailSchema,
  ProblemTypes,
  PROBLEM_CONTENT_TYPE,
  createProblemDetail,
  createValidationProblem,
} from "./problem-details.js";
import type { ProblemDetail, ValidationProblemDetail } from "./problem-details.js";

describe("ProblemDetailSchema (RFC 7807)", () => {
  it("parses a minimal valid problem detail", () => {
    const result = ProblemDetailSchema.safeParse({
      type: "https://example.com/problem",
      title: "Not Found",
      status: 404,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("https://example.com/problem");
      expect(result.data.title).toBe("Not Found");
      expect(result.data.status).toBe(404);
      expect(result.data.detail).toBeUndefined();
      expect(result.data.instance).toBeUndefined();
    }
  });

  it("parses a full problem detail with all fields", () => {
    const input = {
      type: "https://api.wardleyapi.com/problems/validation-error",
      title: "Validation Error",
      status: 422,
      detail: "The field 'evolution' must be between 0 and 1.",
      instance: "/v1/render/abc-123",
    };
    const result = ProblemDetailSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject(input);
    }
  });

  it("allows extension members (passthrough)", () => {
    const input = {
      type: "https://example.com/problem",
      title: "Rate Limited",
      status: 429,
      retryAfter: 60,
      customField: "extra",
    };
    const result = ProblemDetailSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retryAfter).toBe(60);
      expect(result.data.customField).toBe("extra");
    }
  });

  it("defaults type to about:blank when omitted", () => {
    const result = ProblemDetailSchema.safeParse({
      title: "Internal Server Error",
      status: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("about:blank");
    }
  });

  it("rejects missing required title", () => {
    const result = ProblemDetailSchema.safeParse({
      status: 400,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required status", () => {
    const result = ProblemDetailSchema.safeParse({
      title: "Bad Request",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status codes", () => {
    expect(
      ProblemDetailSchema.safeParse({ title: "X", status: 99 }).success
    ).toBe(false);
    expect(
      ProblemDetailSchema.safeParse({ title: "X", status: 600 }).success
    ).toBe(false);
    expect(
      ProblemDetailSchema.safeParse({ title: "X", status: 200.5 }).success
    ).toBe(false);
  });

  it("rejects invalid type URI", () => {
    const result = ProblemDetailSchema.safeParse({
      type: "not a uri",
      title: "Bad",
      status: 400,
    });
    expect(result.success).toBe(false);
  });
});

describe("ValidationProblemDetailSchema", () => {
  it("parses a validation error with field-level errors", () => {
    const input: ValidationProblemDetail = {
      type: ProblemTypes.VALIDATION_ERROR,
      title: "Validation Error",
      status: 422,
      detail: "Request body failed validation.",
      errors: [
        { field: "components[0].evolution", message: "Must be between 0 and 1" },
        { field: "title", message: "Required", code: "invalid_type" },
      ],
    };
    const result = ValidationProblemDetailSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors).toHaveLength(2);
      expect(result.data.errors[0].field).toBe("components[0].evolution");
    }
  });

  it("rejects wrong problem type URI", () => {
    const result = ValidationProblemDetailSchema.safeParse({
      type: "https://example.com/wrong-type",
      title: "Validation Error",
      status: 422,
      errors: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing errors array", () => {
    const result = ValidationProblemDetailSchema.safeParse({
      type: ProblemTypes.VALIDATION_ERROR,
      title: "Validation Error",
      status: 422,
    });
    expect(result.success).toBe(false);
  });
});

describe("ProblemTypes constants", () => {
  it("has well-known problem type URIs", () => {
    expect(ProblemTypes.VALIDATION_ERROR).toContain("validation-error");
    expect(ProblemTypes.AUTHENTICATION_ERROR).toContain("authentication-error");
    expect(ProblemTypes.RATE_LIMIT_EXCEEDED).toContain("rate-limit-exceeded");
    expect(ProblemTypes.NOT_FOUND).toContain("not-found");
    expect(ProblemTypes.NOT_ACCEPTABLE).toContain("not-acceptable");
    expect(ProblemTypes.INTERNAL_ERROR).toContain("internal-error");
  });

  it("all URIs start with the base URL", () => {
    for (const uri of Object.values(ProblemTypes)) {
      expect(uri).toMatch(/^https:\/\/api\.wardleyapi\.com\/problems\//);
    }
  });
});

describe("PROBLEM_CONTENT_TYPE", () => {
  it("is application/problem+json", () => {
    expect(PROBLEM_CONTENT_TYPE).toBe("application/problem+json");
  });
});

describe("createProblemDetail", () => {
  it("creates a problem detail with defaults", () => {
    const problem = createProblemDetail({
      title: "Not Found",
      status: 404,
    });
    expect(problem.type).toBe("about:blank");
    expect(problem.title).toBe("Not Found");
    expect(problem.status).toBe(404);
  });

  it("creates a problem detail with all fields", () => {
    const problem = createProblemDetail({
      type: ProblemTypes.INTERNAL_ERROR,
      title: "Internal Server Error",
      status: 500,
      detail: "Render pipeline failed unexpectedly.",
      instance: "/v1/render/req-456",
    });
    expect(problem.type).toBe(ProblemTypes.INTERNAL_ERROR);
    expect(problem.detail).toBe("Render pipeline failed unexpectedly.");
    expect(problem.instance).toBe("/v1/render/req-456");
  });

  it("supports extension members", () => {
    const problem = createProblemDetail({
      title: "Rate Limited",
      status: 429,
      type: ProblemTypes.RATE_LIMIT_EXCEEDED,
      retryAfter: 30,
    });
    expect(problem.retryAfter).toBe(30);
  });
});

describe("createValidationProblem", () => {
  it("creates a validation problem with field errors", () => {
    const problem = createValidationProblem([
      { field: "evolution", message: "Must be a number" },
    ]);
    expect(problem.type).toBe(ProblemTypes.VALIDATION_ERROR);
    expect(problem.title).toBe("Validation Error");
    expect(problem.status).toBe(422);
    expect(problem.errors).toHaveLength(1);
    expect(problem.detail).toBe("The request body failed schema validation.");
  });

  it("allows custom detail and instance", () => {
    const problem = createValidationProblem(
      [{ field: "title", message: "Required" }],
      "Custom detail",
      "/v1/render/req-789"
    );
    expect(problem.detail).toBe("Custom detail");
    expect(problem.instance).toBe("/v1/render/req-789");
  });

  it("validates against the schema", () => {
    const problem = createValidationProblem([
      { field: "x", message: "bad", code: "custom" },
    ]);
    const result = ValidationProblemDetailSchema.safeParse(problem);
    expect(result.success).toBe(true);
  });
});

// Type-level checks (compile-time only, no runtime assertions)
describe("TypeScript type compatibility", () => {
  it("ProblemDetail type has all RFC 7807 fields", () => {
    const pd: ProblemDetail = {
      type: "https://example.com/test",
      title: "Test",
      status: 200,
      detail: "ok",
      instance: "/test",
    };
    expect(pd).toBeDefined();
  });

  it("ValidationProblemDetail extends ProblemDetail", () => {
    const vpd: ValidationProblemDetail = {
      type: ProblemTypes.VALIDATION_ERROR,
      title: "Validation Error",
      status: 422,
      errors: [],
    };
    // A ValidationProblemDetail should be assignable to ProblemDetail
    const pd: ProblemDetail = vpd;
    expect(pd).toBeDefined();
  });
});
