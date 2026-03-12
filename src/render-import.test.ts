/**
 * Test: render module is importable internally by the API chain.
 *
 * Verifies that renderMap(), renderMapToSVG(), renderMapToPNG(),
 * negotiateFormat(), RenderResult, and utility exports are all
 * accessible from other modules without going through Hono.
 */
import { describe, it, expect } from "vitest";
import {
  renderMap,
  renderMapToSVG,
  renderMapToPNG,
  negotiateFormat,
  ensureOutputDir,
  DEFAULT_OUTPUT_DIR,
  type RenderResult,
} from "./render.js";
import { sanitizeMap } from "./schema.js";

const MINIMAL_MAP = sanitizeMap({
  title: "Internal API Test",
  components: [
    {
      id: "user",
      label: "User",
      type: "anchor",
      nature: null,
      evolution: 0.15,
      visibility: 0.1,
    },
    {
      id: "app",
      label: "Application",
      type: "capacity",
      nature: "activity",
      evolution: 0.65,
      visibility: 0.5,
    },
  ],
  relations: [{ from: "user", to: "app", type: "dependency" }],
});

describe("render module internal API", () => {
  it("exports renderMap as a function", () => {
    expect(typeof renderMap).toBe("function");
  });

  it("exports renderMapToSVG as a function", () => {
    expect(typeof renderMapToSVG).toBe("function");
  });

  it("exports renderMapToPNG as a function", () => {
    expect(typeof renderMapToPNG).toBe("function");
  });

  it("exports negotiateFormat as a function", () => {
    expect(typeof negotiateFormat).toBe("function");
  });

  it("exports ensureOutputDir as a function", () => {
    expect(typeof ensureOutputDir).toBe("function");
  });

  it("exports DEFAULT_OUTPUT_DIR as a string", () => {
    expect(typeof DEFAULT_OUTPUT_DIR).toBe("string");
    expect(DEFAULT_OUTPUT_DIR).toBe("tmp/renders");
  });

  describe("renderMap() internal API", () => {
    it("returns SVG RenderResult when format is 'svg'", async () => {
      const result: RenderResult = await renderMap(MINIMAL_MAP, "svg");
      expect(result.format).toBe("svg");
      expect(result.contentType).toBe("image/svg+xml");
      expect(typeof result.data).toBe("string");
      expect((result.data as string).startsWith("<svg")).toBe(true);
    });

    it("returns PNG RenderResult when format is 'png'", async () => {
      const result: RenderResult = await renderMap(MINIMAL_MAP, "png");
      expect(result.format).toBe("png");
      expect(result.contentType).toBe("image/png");
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect((result.data as Buffer).length).toBeGreaterThan(0);
    });

    it("defaults to SVG when no format specified", async () => {
      const result = await renderMap(MINIMAL_MAP);
      expect(result.format).toBe("svg");
    });

    it("SVG contains map components", async () => {
      const result = await renderMap(MINIMAL_MAP, "svg");
      const svg = result.data as string;
      expect(svg).toContain("User");
      expect(svg).toContain("Application");
      expect(svg).toContain("Internal API Test");
    });

    it("can be used in a pipeline: schema → sanitize → renderMap", async () => {
      // Simulates how the API chain would call render internally
      const rawInput = {
        title: "Pipeline Test",
        components: [
          {
            id: "c1",
            label: "Component",
            type: "anchor" as const,
            nature: null,
            evolution: 0.5,
            visibility: 0.2,
          },
        ],
        relations: [],
      };

      const sanitized = sanitizeMap(rawInput);
      const { data, contentType, format } = await renderMap(sanitized, "png");

      expect(format).toBe("png");
      expect(contentType).toBe("image/png");
      expect(Buffer.isBuffer(data)).toBe(true);
    });
  });
});
