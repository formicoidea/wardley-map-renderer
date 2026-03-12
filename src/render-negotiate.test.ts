/**
 * Tests for content negotiation in POST /render endpoint.
 *
 * AC 2: Accept image/svg+xml returns SVG, Accept image/png or ambiguous returns PNG by default.
 */
import { describe, it, expect } from "vitest";
import { negotiateFormat } from "./render.js";

describe("negotiateFormat", () => {
  // ── SVG cases ────────────────────────────────────────────
  it("returns svg for Accept: image/svg+xml", () => {
    expect(negotiateFormat("image/svg+xml")).toBe("svg");
  });

  it("returns svg when image/svg+xml has higher quality than image/png", () => {
    expect(negotiateFormat("image/svg+xml;q=1.0, image/png;q=0.5")).toBe("svg");
  });

  // ── PNG explicit cases ───────────────────────────────────
  it("returns png for Accept: image/png", () => {
    expect(negotiateFormat("image/png")).toBe("png");
  });

  it("returns png when image/png has higher quality than image/svg+xml", () => {
    expect(negotiateFormat("image/png;q=1.0, image/svg+xml;q=0.5")).toBe("png");
  });

  // ── PNG default / ambiguous cases ────────────────────────
  it("returns png when Accept header is missing (undefined)", () => {
    expect(negotiateFormat(undefined)).toBe("png");
  });

  it("returns png when Accept header is empty string", () => {
    // Empty string is falsy → same as missing
    expect(negotiateFormat("")).toBe("png");
  });

  it("returns png for Accept: */*", () => {
    expect(negotiateFormat("*/*")).toBe("png");
  });

  it("returns png for Accept: image/*", () => {
    expect(negotiateFormat("image/*")).toBe("png");
  });

  it("returns png for browser-like Accept header", () => {
    // Chrome sends something like this
    expect(
      negotiateFormat(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
      )
    ).toBe("png");
  });

  // ── 406 cases ────────────────────────────────────────────
  it("returns null for unsupported Accept: text/plain", () => {
    expect(negotiateFormat("text/plain")).toBeNull();
  });

  it("returns null for unsupported Accept: application/json", () => {
    expect(negotiateFormat("application/json")).toBeNull();
  });

  // ── Edge cases ───────────────────────────────────────────
  it("handles quality factor q=0 (explicitly rejected)", () => {
    // image/png with q=0 means client does NOT want PNG
    expect(negotiateFormat("image/png;q=0, image/svg+xml")).toBe("svg");
  });

  it("handles mixed with wildcards and explicit types", () => {
    expect(negotiateFormat("image/svg+xml;q=0.9, */*;q=0.1")).toBe("svg");
  });

  it("is case-insensitive for media type", () => {
    expect(negotiateFormat("Image/SVG+XML")).toBe("svg");
    expect(negotiateFormat("IMAGE/PNG")).toBe("png");
  });
});
