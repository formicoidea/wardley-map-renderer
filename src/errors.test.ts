import { describe, it, expect } from "vitest";
import {
  ValidationError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  InternalError,
  NotAcceptableError,
  MethodNotAllowedError,
  validationError,
  authenticationError,
  rateLimitError,
  notFoundError,
  internalError,
  notAcceptableError,
  methodNotAllowedError,
  toProblemDetails,
  HttpProblem,
} from "./errors.js";

// ── Error classes ───────────────────────────────────────────

describe("Error classes", () => {
  it("ValidationError has status 422 and carries field errors", () => {
    const err = new ValidationError("Invalid map", [
      { path: "components[0].evolution", message: "must be between 0 and 1" },
    ]);
    expect(err).toBeInstanceOf(HttpProblem);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(422);
    expect(err.title).toBe("Validation Error");
    expect(err.problemType).toContain("validation-error");
    expect(err.message).toBe("Invalid map");
    expect(err.errors).toHaveLength(1);
  });

  it("ValidationError without field errors has no errors array", () => {
    const err = new ValidationError("bad input");
    expect(err.errors).toBeUndefined();
  });

  it("AuthenticationError has status 401", () => {
    const err = new AuthenticationError();
    expect(err.status).toBe(401);
    expect(err.title).toBe("Authentication Required");
    expect(err.message).toBe("Missing or invalid API key");
  });

  it("AuthenticationError accepts custom detail", () => {
    const err = new AuthenticationError("Token expired");
    expect(err.message).toBe("Token expired");
  });

  it("RateLimitError has status 429 and retryAfter", () => {
    const err = new RateLimitError({ retryAfter: 60 });
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(60);
    expect(err.title).toBe("Rate Limit Exceeded");
  });

  it("RateLimitError default detail", () => {
    const err = new RateLimitError({ retryAfter: 10 });
    expect(err.message).toBe("Too many requests. Please retry later.");
  });

  it("NotFoundError has status 404", () => {
    const err = new NotFoundError("Map xyz not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Map xyz not found");
  });

  it("InternalError has status 500", () => {
    const err = new InternalError();
    expect(err.status).toBe(500);
    expect(err.title).toBe("Internal Server Error");
  });

  it("NotAcceptableError has status 406", () => {
    const err = new NotAcceptableError("Only image/svg+xml and image/png");
    expect(err.status).toBe(406);
    expect(err.message).toBe("Only image/svg+xml and image/png");
  });

  it("MethodNotAllowedError has status 405", () => {
    const err = new MethodNotAllowedError("Use POST for /v1/render");
    expect(err.status).toBe(405);
  });

  it("all errors have the correct name property", () => {
    expect(new ValidationError("x").name).toBe("ValidationError");
    expect(new AuthenticationError().name).toBe("AuthenticationError");
    expect(new RateLimitError({ retryAfter: 1 }).name).toBe("RateLimitError");
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new InternalError().name).toBe("InternalError");
    expect(new NotAcceptableError().name).toBe("NotAcceptableError");
    expect(new MethodNotAllowedError().name).toBe("MethodNotAllowedError");
  });

  it("all errors extend HttpProblem", () => {
    expect(new ValidationError("x")).toBeInstanceOf(HttpProblem);
    expect(new AuthenticationError()).toBeInstanceOf(HttpProblem);
    expect(new RateLimitError({ retryAfter: 1 })).toBeInstanceOf(HttpProblem);
    expect(new NotFoundError()).toBeInstanceOf(HttpProblem);
    expect(new InternalError()).toBeInstanceOf(HttpProblem);
    expect(new NotAcceptableError()).toBeInstanceOf(HttpProblem);
    expect(new MethodNotAllowedError()).toBeInstanceOf(HttpProblem);
  });
});

// ── Factory functions ───────────────────────────────────────

describe("Factory functions", () => {
  it("validationError() creates a ValidationError", () => {
    const err = validationError("bad input", [{ path: "title", message: "required" }]);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.errors).toEqual([{ path: "title", message: "required" }]);
  });

  it("authenticationError() creates an AuthenticationError", () => {
    expect(authenticationError()).toBeInstanceOf(AuthenticationError);
    expect(authenticationError("custom").message).toBe("custom");
  });

  it("rateLimitError() creates a RateLimitError with retryAfter", () => {
    const err = rateLimitError(30, "Slow down");
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(30);
    expect(err.message).toBe("Slow down");
  });

  it("notFoundError() creates a NotFoundError", () => {
    expect(notFoundError()).toBeInstanceOf(NotFoundError);
  });

  it("internalError() creates an InternalError", () => {
    expect(internalError()).toBeInstanceOf(InternalError);
  });

  it("notAcceptableError() creates a NotAcceptableError", () => {
    expect(notAcceptableError()).toBeInstanceOf(NotAcceptableError);
  });

  it("methodNotAllowedError() creates a MethodNotAllowedError", () => {
    expect(methodNotAllowedError()).toBeInstanceOf(MethodNotAllowedError);
  });
});

// ── toProblemDetails mapper ─────────────────────────────────

describe("toProblemDetails", () => {
  it("maps a ValidationError to RFC 7807 shape", () => {
    const err = validationError("Invalid", [{ path: "x", message: "bad" }]);
    const pd = toProblemDetails(err);
    expect(pd.type).toBe("https://wardleyapi.dev/problems/validation-error");
    expect(pd.title).toBe("Validation Error");
    expect(pd.status).toBe(422);
    expect(pd.detail).toBe("Invalid");
    expect(pd.errors).toEqual([{ path: "x", message: "bad" }]);
    expect(pd.instance).toBeUndefined();
  });

  it("maps an AuthenticationError", () => {
    const pd = toProblemDetails(authenticationError());
    expect(pd.status).toBe(401);
    expect(pd.type).toContain("authentication-error");
  });

  it("maps a RateLimitError with retryAfter extension", () => {
    const pd = toProblemDetails(rateLimitError(120));
    expect(pd.status).toBe(429);
    expect((pd as any).retryAfter).toBe(120);
  });

  it("includes instance when provided", () => {
    const pd = toProblemDetails(notFoundError(), "/v1/render");
    expect(pd.instance).toBe("/v1/render");
  });

  it("maps unknown Error to 500 with message", () => {
    const pd = toProblemDetails(new Error("disk full"));
    expect(pd.status).toBe(500);
    expect(pd.title).toBe("Internal Server Error");
    expect(pd.detail).toBe("disk full");
  });

  it("maps non-Error throwable to 500 with default message", () => {
    const pd = toProblemDetails("random string");
    expect(pd.status).toBe(500);
    expect(pd.detail).toBe("An unexpected error occurred");
  });

  it("maps non-Error objects (e.g. null) to 500", () => {
    const pd = toProblemDetails(null);
    expect(pd.status).toBe(500);
  });

  it("maps a raw HttpProblem via toProblemDetail()", () => {
    const err = new HttpProblem(503, "Service Unavailable", {
      detail: "Database down",
    });
    const pd = toProblemDetails(err);
    expect(pd.status).toBe(503);
    expect(pd.detail).toBe("Database down");
  });
});

// ── toProblemDetail() method on typed errors ────────────────

describe("toProblemDetail() serialization", () => {
  it("ValidationError.toProblemDetail() includes errors array", () => {
    const pd = validationError("bad", [{ path: "a", message: "b" }]).toProblemDetail();
    expect(pd.errors).toEqual([{ path: "a", message: "b" }]);
  });

  it("RateLimitError.toProblemDetail() includes retryAfter", () => {
    const pd = rateLimitError(45).toProblemDetail();
    expect((pd as any).retryAfter).toBe(45);
  });

  it("NotFoundError.toProblemDetail() has correct type URI", () => {
    const pd = notFoundError().toProblemDetail();
    expect(pd.type).toBe("https://wardleyapi.dev/problems/not-found");
  });
});

// ── Integration: errors work with rfc7807ErrorHandler ───────

describe("Integration with rfc7807ErrorHandler", () => {
  it("typed errors are caught as HttpProblem by instanceof", () => {
    // This is the check rfc7807ErrorHandler uses
    const err = validationError("test");
    expect(err instanceof HttpProblem).toBe(true);
  });

  it("thrown typed errors produce correct status", () => {
    try {
      throw rateLimitError(30);
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect(e).toBeInstanceOf(HttpProblem);
      expect((e as RateLimitError).status).toBe(429);
    }
  });
});
