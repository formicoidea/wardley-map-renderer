/**
 * Tests for the SVG Composer — Phase 2 orchestration.
 *
 * Verifies that:
 *   - composeSVG produces a valid SVG document structure
 *   - Layers are rendered in the correct z-order
 *   - Each layer's output is wrapped in a <g data-layer="..."> group
 *   - Background rect is always rendered first
 *   - Empty layers are skipped (no empty groups)
 *   - renderMapToSVGComposed orchestrates the full pipeline
 *   - renderMapToSVGPartial filters layers correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import { composeSVG, renderMapToSVGComposed, renderMapToSVGPartial, esc } from "./svg-composer.js";
import { buildRenderContext } from "./build-context.js";
import { registerLayer, clearRegistry, getOrderedLayers, LAYER_NAMES } from "./registry.js";
import type { RenderContext, LayerRegistration } from "./types.js";
import { sanitizeMap, type WardleyMap } from "../schema.js";
import { WardleyMapSchema } from "../schema.js";

// ── Test fixtures ────────────────────────────────────────────────────

const MINIMAL_MAP: WardleyMap = WardleyMapSchema.parse({
  title: "Composer Test",
  components: [
    {
      id: "c1",
      label: { name: "User" },
      type: "anchor",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } },
    },
    {
      id: "c2",
      label: { name: "Platform" },
      type: "component",
      position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.6 } },
    },
  ],
  relations: [{ id: "rel-c1-c2", consumer: "c1", supplier: "c2" }],
});

// ── esc() helper ─────────────────────────────────────────────────────

describe("esc()", () => {
  it("escapes XML special characters", () => {
    expect(esc('a<b>c&d"e\'f')).toBe(
      "a&lt;b&gt;c&amp;d&quot;e&#39;f"
    );
  });

  it("passes through plain text unchanged", () => {
    expect(esc("Hello World")).toBe("Hello World");
  });
});

// ── composeSVG() ─────────────────────────────────────────────────────

describe("composeSVG()", () => {
  let ctx: RenderContext;

  beforeEach(() => {
    ctx = buildRenderContext(MINIMAL_MAP);
  });

  it("produces valid SVG document with header and footer", () => {
    const svg = composeSVG(ctx, []);
    expect(svg).toContain("<svg xmlns=");
    expect(svg).toContain("</svg>");
  });

  it("sets viewBox from canvas dimensions", () => {
    const svg = composeSVG(ctx, []);
    expect(svg).toContain(`viewBox="0 0 ${ctx.canvasWidth} ${ctx.canvasHeight}"`);
  });

  it("renders white background rect before layers", () => {
    const svg = composeSVG(ctx, []);
    expect(svg).toContain('fill="#ffffff"');
    // Background should come before any layer group
    const bgIdx = svg.indexOf('fill="#ffffff"');
    const layerIdx = svg.indexOf("data-layer=");
    // With no layers, no data-layer should exist
    expect(layerIdx).toBe(-1);
  });

  it("wraps each layer output in a named <g> group", () => {
    const testLayer: LayerRegistration = {
      name: "title",
      order: 10,
      render: () => ['<text x="10" y="20">Test</text>'],
    };
    const svg = composeSVG(ctx, [testLayer]);
    expect(svg).toContain('<g data-layer="title">');
    expect(svg).toContain("</g>");
  });

  it("renders layers in the order provided", () => {
    const layerA: LayerRegistration = {
      name: "title",
      order: 10,
      render: () => ["<!-- LAYER_A -->"],
    };
    const layerB: LayerRegistration = {
      name: "axes",
      order: 20,
      render: () => ["<!-- LAYER_B -->"],
    };
    const svg = composeSVG(ctx, [layerA, layerB]);
    const idxA = svg.indexOf("LAYER_A");
    const idxB = svg.indexOf("LAYER_B");
    expect(idxA).toBeLessThan(idxB);
  });

  it("skips layers that return empty arrays", () => {
    const emptyLayer: LayerRegistration = {
      name: "notes",
      order: 80,
      render: () => [],
    };
    const svg = composeSVG(ctx, [emptyLayer]);
    expect(svg).not.toContain('data-layer="notes"');
  });

  it("renders multiple fragments from a single layer", () => {
    const multiLayer: LayerRegistration = {
      name: "edges",
      order: 40,
      render: () => [
        '<line x1="0" y1="0" x2="100" y2="100" />',
        '<line x1="50" y1="50" x2="200" y2="200" />',
      ],
    };
    const svg = composeSVG(ctx, [multiLayer]);
    expect(svg).toContain('x2="100"');
    expect(svg).toContain('x2="200"');
  });
});

// ── No legacy plot-area rect ─────────────────────────────────────────

describe("composeSVG() plot-area rect (removed)", () => {
  it("never adds a data-plot-area rect", () => {
    for (const options of [undefined, { interactive: false }, { interactive: true }]) {
      expect(composeSVG(buildRenderContext(MINIMAL_MAP, options), [])).not.toContain("data-plot-area");
    }
  });
});

// ── composeSVG with global registry ──────────────────────────────────

describe("composeSVG() with global registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("uses global registry when no layers argument provided", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);

    registerLayer("title", () => ["<!-- GLOBAL_TITLE -->"]);
    registerLayer("axes", () => ["<!-- GLOBAL_AXES -->"]);

    const svg = composeSVG(ctx);
    expect(svg).toContain("GLOBAL_TITLE");
    expect(svg).toContain("GLOBAL_AXES");
  });

  it("renders global layers in z-order", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);

    registerLayer("labels", () => ["<!-- LABELS -->"]);
    registerLayer("title", () => ["<!-- TITLE -->"]);

    const svg = composeSVG(ctx);
    const titleIdx = svg.indexOf("TITLE");
    const labelsIdx = svg.indexOf("LABELS");
    // title (order 10) should come before labels (order 70)
    expect(titleIdx).toBeLessThan(labelsIdx);
  });
});

// ── renderMapToSVGComposed() ─────────────────────────────────────────

describe("renderMapToSVGComposed()", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("builds context and composes SVG in one call", () => {
    registerLayer("title", (ctx) => [
      `<text>${ctx.map.title}</text>`,
    ]);

    const svg = renderMapToSVGComposed(MINIMAL_MAP);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Composer Test");
    expect(svg).toContain("</svg>");
  });

  it("supports explicit layers parameter", () => {
    const explicitLayer: LayerRegistration = {
      name: "nodes",
      order: 60,
      render: () => ["<!-- EXPLICIT_NODES -->"],
    };

    const svg = renderMapToSVGComposed(MINIMAL_MAP, [explicitLayer]);
    expect(svg).toContain("EXPLICIT_NODES");
  });
});

// ── renderMapToSVGPartial() ──────────────────────────────────────────

describe("renderMapToSVGPartial()", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("renders only specified layers", () => {
    registerLayer("title", () => ["<!-- TITLE -->"]);
    registerLayer("axes", () => ["<!-- AXES -->"]);
    registerLayer("labels", () => ["<!-- LABELS -->"]);

    const svg = renderMapToSVGPartial(MINIMAL_MAP, ["title", "axes"]);
    expect(svg).toContain("TITLE");
    expect(svg).toContain("AXES");
    expect(svg).not.toContain("LABELS");
  });

  it("preserves z-order even when names are out of order", () => {
    registerLayer("labels", () => ["<!-- LABELS -->"]);
    registerLayer("title", () => ["<!-- TITLE -->"]);

    const svg = renderMapToSVGPartial(MINIMAL_MAP, ["labels", "title"]);
    const titleIdx = svg.indexOf("TITLE");
    const labelsIdx = svg.indexOf("LABELS");
    // title (order 10) should still come before labels (order 70)
    expect(titleIdx).toBeLessThan(labelsIdx);
  });
});

// ── RenderContext validation ─────────────────────────────────────────

describe("buildRenderContext()", () => {
  it("computes canvas dimensions from defaults", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);
    expect(ctx.canvasWidth).toBe(1600);
    expect(ctx.canvasHeight).toBe(800);
  });

  it("computes plot area with fixed margins", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);
    expect(ctx.plot.left).toBe(28);   // AXIS_MARGIN_LEFT
    expect(ctx.plot.top).toBe(28);    // AXIS_MARGIN_TOP
    expect(ctx.plot.right).toBe(1580); // 1600 - 20
    expect(ctx.plot.bottom).toBe(772); // 800 - 28
    expect(ctx.plot.width).toBe(1552); // 1580 - 28
    expect(ctx.plot.height).toBe(744); // 772 - 28
  });

  it("provides evoToX and visToY converters", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);
    // evoToX(0) = plotLeft, evoToX(1) = plotRight
    expect(ctx.evoToX(0)).toBe(ctx.plot.left);
    expect(ctx.evoToX(1)).toBe(ctx.plot.right);
    // OWM convention: visToY(0) = plotTop (visible), visToY(1) = plotBottom (invisible)
    expect(ctx.visToY(0)).toBe(ctx.plot.top);
    expect(ctx.visToY(1)).toBe(ctx.plot.bottom);
  });

  it("computes node positions for all components", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);
    expect(ctx.nodes).toHaveLength(2);
    const user = ctx.nodes.find((n) => n.id === "c1");
    expect(user).toBeDefined();
    expect(user!.cx).toBeCloseTo(ctx.evoToX(0.5));
    expect(user!.cy).toBeCloseTo(ctx.visToY(0.1));
  });

  it("computes edge segments for relations", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);
    expect(ctx.edges).toHaveLength(1);
    expect(ctx.edges[0].relation.consumer).toBe("c1");
    expect(ctx.edges[0].relation.supplier).toBe("c2");
  });

  it("preserves the original map reference", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);
    expect(ctx.map.title).toBe("Composer Test");
  });

  it("works with custom renderConfig dimensions", () => {
    const customMap = WardleyMapSchema.parse({
      title: "Custom Grid",
      components: [
        { id: "a", label: { name: "A" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
      renderConfig: { style: { background: { canvas: { default: { width: 800, height: 400 } } } } },
    });

    const ctx = buildRenderContext(customMap);
    expect(ctx.canvasWidth).toBe(800);
    expect(ctx.canvasHeight).toBe(400);
    // Margins are still fixed
    expect(ctx.plot.left).toBe(28);
    expect(ctx.plot.right).toBe(780); // 800 - 20
  });

  it("includes componentById lookup", () => {
    const ctx = buildRenderContext(MINIMAL_MAP);
    expect(ctx.componentById.get("c1")?.label.name).toBe("User");
    expect(ctx.componentById.get("c2")?.label.name).toBe("Platform");
    expect(ctx.componentById.get("nonexistent")).toBeUndefined();
  });
});
