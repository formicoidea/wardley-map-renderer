/**
 * AC 7: Hono /render route validates new schema via Zod.
 *
 * Tests that the POST /render route correctly:
 *   1. Accepts valid WardleyMap JSON with new nested renderConfig structure
 *   2. Rejects invalid renderConfig fields (422 Validation Error)
 *   3. Passes all 4 combinations of background toggle orthogonality
 *   4. Maps nested background fields to rendering pipeline correctly
 *
 * @module render-route-schema.test
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { renderRoute } from "./render-route.js";
import { rfc7807ErrorHandler } from "./middleware/error-handler.js";

// ── Test app setup ─────────────────────────────────────────────────────

const app = new Hono();
app.onError(rfc7807ErrorHandler);
app.post("/render", renderRoute);

// ── Minimal valid WardleyMap (no renderConfig) ─────────────────────────

const BASE_MAP = {
  title: "Schema Validation Test",
  components: [
    {
      id: "anchor1",
      label: { name: "User" },
      type: "anchor",
      position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.05 } },
    },
    {
      id: "comp1",
      label: { name: "Service" },
      type: "component",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
    },
  ],
  relations: [{ id: "rel-anchor1-comp1", source: "anchor1", target: "comp1", type: "DependsOn" }],
};

/** POST /render with JSON body and SVG Accept header */
async function postSVG(body: unknown) {
  return app.request("/render", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "image/svg+xml",
    },
    body: JSON.stringify(body),
  });
}

/** POST /render and return parsed 4xx error body */
async function postExpectError(body: unknown) {
  const res = await postSVG(body);
  const json = await res.json();
  return { status: res.status, body: json };
}

// ── Valid new-schema renderConfig ───────────────────────────────────────

describe("AC7: route accepts valid new-schema renderConfig", () => {
  it("accepts map without renderConfig (all defaults)", async () => {
    const res = await postSVG(BASE_MAP);
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with empty object", async () => {
    const res = await postSVG({ ...BASE_MAP, renderConfig: {} });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with valid background.color", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { styling: { background: { color: "#f5f5f5" } } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with 3-digit hex background.color", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { styling: { background: { color: "#fff" } } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with 8-digit hex background.color (alpha)", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { styling: { background: { color: "#ffffff80" } } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with valid theme: default", async () => {
    const res = await postSVG({ ...BASE_MAP, renderConfig: { styling: { theme: "default" } } });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with valid theme: dark", async () => {
    const res = await postSVG({ ...BASE_MAP, renderConfig: { styling: { theme: "dark" } } });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with valid theme: highContrast", async () => {
    const res = await postSVG({ ...BASE_MAP, renderConfig: { styling: { theme: "highContrast" } } });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with valid width and height", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { spatial: { width: 1920, height: 1080 } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with strokeWidth", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { spatial: { strokeWidth: 2.5 } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with typography (fontFamily and labelScale)", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { typography: { fontFamily: "Roboto, sans-serif", labelScale: 1.5 } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with filters.excludeComponentTypes", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { filters: { excludeComponentTypes: ["note"] } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with legend position string", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { legend: { show: true, position: "top-left" } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with legend position {x, y}", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { legend: { position: { x: 100, y: 600 } } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with axes.locale (fr)", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: { axes: { locale: "fr" } },
    });
    expect(res.status).toBe(200);
  });

  it("accepts renderConfig with evolveStyles", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: {
          evolveStyles: {
            natural: { stroke: "#00ff00", strokeDasharray: "4 2" },
            forced: { stroke: "#ff0000" },
          },
        },
      },
    });
    expect(res.status).toBe(200);
  });
});

// ── background.evolutionPhases.showPhaseDividerAndLabel toggle ─────────

describe("AC7: background.evolutionPhases.showPhaseDividerAndLabel toggle", () => {
  it("accepts background.evolutionPhases.showPhaseDividerAndLabel=true → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: { evolutionPhases: { showPhaseDividerAndLabel: true } } },
      },
    });
    expect(res.status).toBe(200);
  });

  it("accepts background.evolutionPhases.showPhaseDividerAndLabel=false → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: { evolutionPhases: { showPhaseDividerAndLabel: false } } },
      },
    });
    expect(res.status).toBe(200);
    // SVG should be returned and valid
    const svg = await res.text();
    expect(svg).toContain("<svg");
  });

  it("accepts background.evolutionXAxis.show=true → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: { evolutionXAxis: { show: true } } },
      },
    });
    expect(res.status).toBe(200);
  });

  it("accepts background.evolutionXAxis.show=false → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: { evolutionXAxis: { show: false } } },
      },
    });
    expect(res.status).toBe(200);
  });

  it("accepts background.valueChainYAxis.show=false → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: { valueChainYAxis: { show: false } } },
      },
    });
    expect(res.status).toBe(200);
  });

  // All 4 orthogonal combinations of evolutionXAxis.show × showPhaseDividerAndLabel
  it("combination [showAxis=true, showPhase=true] → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: {
          evolutionXAxis: { show: true },
          evolutionPhases: { showPhaseDividerAndLabel: true },
        } },
      },
    });
    expect(res.status).toBe(200);
  });

  it("combination [showAxis=true, showPhase=false] → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: {
          evolutionXAxis: { show: true },
          evolutionPhases: { showPhaseDividerAndLabel: false },
        } },
      },
    });
    expect(res.status).toBe(200);
  });

  it("combination [showAxis=false, showPhase=true] → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: {
          evolutionXAxis: { show: false },
          evolutionPhases: { showPhaseDividerAndLabel: true },
        } },
      },
    });
    expect(res.status).toBe(200);
  });

  it("combination [showAxis=false, showPhase=false] → 200", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: {
          evolutionXAxis: { show: false },
          evolutionPhases: { showPhaseDividerAndLabel: false },
        } },
      },
    });
    expect(res.status).toBe(200);
  });
});

// ── Invalid renderConfig → 422 Validation Error ────────────────────────

describe("AC7: route rejects invalid new-schema renderConfig with 422", () => {
  it("rejects background.color as CSS named color → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { styling: { background: { color: "red" } } },
    });
    expect(status).toBe(422);
    expect(body.type).toBeDefined();
    expect(body.title).toBe("Validation Error");
    expect(body.errors).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);
    // Error should reference background.color path
    const colorError = body.errors.find((e: any) =>
      e.path?.includes("background") || e.path?.includes("color")
    );
    expect(colorError).toBeDefined();
  });

  it("rejects background.color as non-hex string → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { styling: { background: { color: "#xyz" } } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects unknown theme → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { styling: { theme: "neon" } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects negative width → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { spatial: { width: -100 } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects zero height → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { spatial: { height: 0 } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects labelScale above 5 → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { typography: { labelScale: 10 } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects strokeWidth below minimum (0.1) → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { spatial: { strokeWidth: 0.1 } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects strokeWidth above maximum (8) → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { spatial: { strokeWidth: 100 } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid filters.excludeComponentTypes entry → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { filters: { excludeComponentTypes: ["invalid-type"] } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid legend position string → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { legend: { position: "invalid-position" } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid locale in axes → 422", async () => {
    // locale is inside axes group
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { axes: { locale: "de" } },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects evolveStyles with unknown key → 422", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: {
        styling: { evolveStyles: { unknown: { stroke: "#000" } } },
      },
    });
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThan(0);
  });
});

// ── Validation error shape (RFC 7807) ──────────────────────────────────

describe("AC7: route returns RFC 7807 error shape for invalid renderConfig", () => {
  it("422 response includes type, title, status, detail, errors fields", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { styling: { theme: "bad-theme" } },
    });
    expect(status).toBe(422);
    expect(body).toHaveProperty("type");
    expect(body).toHaveProperty("title");
    expect(body).toHaveProperty("status", 422);
    expect(body).toHaveProperty("detail");
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("each error object has path, message, code fields", async () => {
    const { status, body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { spatial: { width: -1 }, styling: { theme: "invalid" } },
    });
    expect(status).toBe(422);
    for (const err of body.errors) {
      expect(err).toHaveProperty("path");
      expect(err).toHaveProperty("message");
      expect(err).toHaveProperty("code");
    }
  });

  it("error detail mentions 'Invalid WardleyMap JSON'", async () => {
    const { body } = await postExpectError({
      ...BASE_MAP,
      renderConfig: { styling: { background: { color: "notahex" } } },
    });
    expect(body.detail).toContain("Invalid WardleyMap JSON");
  });
});

// ── Full nested renderConfig round-trip ────────────────────────────────

describe("AC7: full nested renderConfig accepted end-to-end", () => {
  it("accepts fully-specified new-schema renderConfig → 200 SVG", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        spatial: { width: 1600, height: 800, strokeWidth: 1, nodeRadii: { _default: 5 } },
        styling: {
          theme: "default",
          background: {
            color: "#ffffff",
            evolutionXAxis: { show: true },
            valueChainYAxis: { show: true },
            evolutionPhases: { showPhaseDividerAndLabel: true },
          },
          palette: { _default: "#374151", component: "#374151" },
          evolveStyles: {
            natural: { stroke: "#374151" },
          },
        },
        typography: { fontFamily: "Inter, sans-serif", labelScale: 1.0 },
        avoidCollisions: true,
        filters: { excludeComponentTypes: [] },
        axes: { locale: "en" },
        legend: { show: true, position: "bottom-right" },
      },
    });
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).toContain("<svg");
    expect(svg).toContain("Schema Validation Test");
  });

  it("renders correctly with showPhaseDividerAndLabel=false (no phase labels in SVG)", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: {
          evolutionPhases: { showPhaseDividerAndLabel: false },
        } },
      },
    });
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).toContain("<svg");
    // Phase labels (Genesis/Custom-Built/Product/Commodity) should NOT appear
    expect(svg).not.toContain("Genesis");
    expect(svg).not.toContain("Custom-Built");
    expect(svg).not.toContain("Commodity");
  });

  it("renders correctly with showPhaseDividerAndLabel=true (phase labels in SVG)", async () => {
    const res = await postSVG({
      ...BASE_MAP,
      renderConfig: {
        styling: { background: {
          evolutionPhases: { showPhaseDividerAndLabel: true },
        } },
      },
    });
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).toContain("<svg");
    // Phase labels should appear
    expect(svg).toContain("Genesis");
    expect(svg).toContain("Commodity");
  });
});
