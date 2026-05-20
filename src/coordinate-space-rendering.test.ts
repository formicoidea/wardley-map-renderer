/**
 * coordinate-space-rendering.test.ts — Rendering invariant tests for CoordinateSpace
 *
 * Sub-AC 6c: Asserts that moving coordinate values into CoordinateSpace and leaving
 * MapChrome with only presentational fields does not change rendered output.
 *
 * The four invariants tested here:
 *
 *   1. Explicit default CoordinateSpace produces byte-identical SVG to omitting coordinateSpace
 *      → proves the CoordinateSpace container is transparent when values match defaults
 *
 *   2. coordinateSpace.evolutionRange correctly maps component x positions
 *      → a zoomed-in evolution range changes pixel x positions for the same evo scalar
 *
 *   3. MapChrome (background) presentational changes do NOT move component pixel positions
 *      → axes show/hide, phase label toggles are chrome-only, not coordinate changes
 *
 *   4. coordinateSpace.visibilityRange correctly maps component y positions
 *      → a zoomed-in visibility range changes pixel y positions for the same vis scalar
 *
 * Additional structural-equality checks covering varied coordinateSpace configurations:
 *
 *   5. Non-default canvas dimensions (800×400) with matching coordinateSpace produce
 *      same SVG as top-level width/height only
 *
 *   6. CoordinateSpace evolutionRange [0.25, 0.75] — boundary components map to
 *      exact plot edges
 *
 * @module coordinate-space-rendering.test
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./render/build-context.js";
import { renderToSVG } from "./render-orchestrator.js";
import { WardleyMapSchema, sanitizeMap } from "./schema.js";
import type { WardleyMap } from "./schema.js";

// ── Test fixtures ────────────────────────────────────────────────────────────

/**
 * Build a minimal valid WardleyMap with three components spread across the canvas.
 * Accepts a renderConfig override for all coordinate/chrome variations.
 */
function makeTestMap(renderConfig: Record<string, unknown> = {}): WardleyMap {
  return sanitizeMap(
    WardleyMapSchema.parse({
      title: "CoordinateSpace Test Map",
      components: [
        // Top-left: low evolution, high visibility
        {
          id: "anchor",
          label: { name: "User Anchor" },
          type: "anchor",
          position: {
            evolution: { scalar: 0.1 },
            visibility: { scalar: 0.1 },
          },
        },
        // Center: mid evolution, mid visibility
        {
          id: "service",
          label: { name: "Core Service" },
          type: "component",
          position: {
            evolution: { scalar: 0.5 },
            visibility: { scalar: 0.5 },
          },
        },
        // Bottom-right: high evolution, low visibility
        {
          id: "commodity",
          label: { name: "Commodity" },
          type: "component",
          position: {
            evolution: { scalar: 0.9 },
            visibility: { scalar: 0.9 },
          },
        },
      ],
      relations: [
        { id: "rel-anchor-service", source: "anchor", target: "service" },
        { id: "rel-service-commodity", source: "service", target: "commodity" },
      ],
      renderConfig,
    })
  );
}

// ── Test 1: Default CoordinateSpace → byte-identical SVG ─────────────────────

describe("CoordinateSpace rendering invariant 1 — explicit defaults = no coordinateSpace", () => {
  it("explicit DEFAULT_COORDINATE_SPACE values produce byte-identical SVG to omitting coordinateSpace", () => {
    // Map A: no coordinateSpace specified (uses DEFAULT_COORDINATE_SPACE internally)
    const mapNoCs = makeTestMap({});

    // Map B: explicit coordinateSpace with all default values
    const mapWithDefaultCs = makeTestMap({
      style: { background: { canvas: { default: {
        width: 1600,
        height: 800,
        evolutionRange: [0, 1],
        visibilityRange: [0, 1],
        unit: "canvas-px",
      } } } },
    });

    const svgNoCs = renderToSVG(mapNoCs);
    const svgWithDefaultCs = renderToSVG(mapWithDefaultCs);

    // Byte-identical SVG — the CoordinateSpace container is transparent at default values
    expect(svgWithDefaultCs).toBe(svgNoCs);
  });

  it("explicit default coordinateSpace produces identical RenderContext geometry to no coordinateSpace", () => {
    const mapNoCs = makeTestMap({});
    const mapWithDefaultCs = makeTestMap({
      style: { background: { canvas: { default: {
        width: 1600,
        height: 800,
        evolutionRange: [0, 1],
        visibilityRange: [0, 1],
        unit: "canvas-px",
      } } } },
    });

    const ctxNoCs = buildRenderContext(mapNoCs);
    const ctxWithDefaultCs = buildRenderContext(mapWithDefaultCs);

    // Canvas dimensions match
    expect(ctxWithDefaultCs.canvasWidth).toBe(ctxNoCs.canvasWidth);
    expect(ctxWithDefaultCs.canvasHeight).toBe(ctxNoCs.canvasHeight);

    // Plot area matches
    expect(ctxWithDefaultCs.plot).toEqual(ctxNoCs.plot);

    // All node pixel positions match exactly
    for (const nodeNoCs of ctxNoCs.nodes) {
      const nodeWithCs = ctxWithDefaultCs.nodes.find((n) => n.id === nodeNoCs.id)!;
      expect(nodeWithCs, `node ${nodeNoCs.id} missing`).toBeDefined();
      expect(nodeWithCs.cx).toBe(nodeNoCs.cx);
      expect(nodeWithCs.cy).toBe(nodeNoCs.cy);
    }
  });
});

// ── Test 2: evolutionRange zoom changes x positions ──────────────────────────

describe("CoordinateSpace rendering invariant 2 — evolutionRange affects x positions", () => {
  it("component at evo 0.5 with full range [0,1] maps to center of plot", () => {
    const map = makeTestMap({});
    const ctx = buildRenderContext(map);

    const serviceNode = ctx.nodes.find((n) => n.id === "service")!;
    expect(serviceNode).toBeDefined();

    // evo=0.5 with range [0,1] → exactly center of plot area
    const expectedCx = ctx.plot.left + ctx.plot.width / 2;
    expect(serviceNode.cx).toBeCloseTo(expectedCx, 1);
  });

  it("evolutionRange [0, 0.5] maps evo=0.5 to the right edge of the plot area", () => {
    // Zoom into the left half of the evolution axis: [0, 0.5]
    // Now evo=0.5 maps to plotRight (the boundary of the zoomed range)
    const map = makeTestMap({
      style: { background: { canvas: { default: {
        evolutionRange: [0, 0.5],
        visibilityRange: [0, 1],
      } } } },
    });
    const ctx = buildRenderContext(map);

    const serviceNode = ctx.nodes.find((n) => n.id === "service")!;
    expect(serviceNode).toBeDefined();

    // With range [0, 0.5], evo=0.5 maps to plotLeft + plotWidth = plotRight
    const expectedCx = ctx.plot.left + ctx.plot.width;
    expect(serviceNode.cx).toBeCloseTo(expectedCx, 1);
  });

  it("zoomed-in evolutionRange moves component x further right than full range", () => {
    const mapFull = makeTestMap({ style: { background: { canvas: { default: { evolutionRange: [0, 1] } } } } });
    const mapZoomed = makeTestMap({
      style: { background: { canvas: { default: { evolutionRange: [0, 0.5] } } } },
    });

    const ctxFull = buildRenderContext(mapFull);
    const ctxZoomed = buildRenderContext(mapZoomed);

    // evo=0.5 with full range [0,1] → center
    const serviceFullCx = ctxFull.nodes.find((n) => n.id === "service")!.cx;
    // evo=0.5 with zoomed range [0, 0.5] → right edge (further right)
    const serviceZoomedCx = ctxZoomed.nodes.find((n) => n.id === "service")!.cx;

    expect(serviceZoomedCx).toBeGreaterThan(serviceFullCx);
  });

  it("evolutionRange [0.25, 0.75] — boundary evo values map to exact plot edges", () => {
    // Build a map where we can test the boundary mapping explicitly
    const mapBoundary = sanitizeMap(
      WardleyMapSchema.parse({
        title: "Boundary Test",
        components: [
          {
            id: "left-edge",
            label: { name: "Left" },
            type: "anchor",
            position: { evolution: { scalar: 0.25 }, visibility: { scalar: 0.5 } },
          },
          {
            id: "right-edge",
            label: { name: "Right" },
            type: "component",
            position: { evolution: { scalar: 0.75 }, visibility: { scalar: 0.5 } },
          },
        ],
        relations: [],
        renderConfig: {
          style: { background: { canvas: { default: {
            evolutionRange: [0.25, 0.75],
            visibilityRange: [0, 1],
          } } } },
        },
      })
    );

    const ctx = buildRenderContext(mapBoundary);

    const leftNode = ctx.nodes.find((n) => n.id === "left-edge")!;
    const rightNode = ctx.nodes.find((n) => n.id === "right-edge")!;

    expect(leftNode).toBeDefined();
    expect(rightNode).toBeDefined();

    // evo=0.25 at range start → plotLeft
    expect(leftNode.cx).toBeCloseTo(ctx.plot.left, 1);
    // evo=0.75 at range end → plotRight
    expect(rightNode.cx).toBeCloseTo(ctx.plot.left + ctx.plot.width, 1);
  });
});

// ── Test 3: MapChrome presentational changes don't move nodes ────────────────

describe("CoordinateSpace rendering invariant 3 — MapChrome is presentational only", () => {
  it("hiding evolution X axis does not change component cx pixel positions", () => {
    const mapWithAxes = makeTestMap({});
    const mapNoXAxis = makeTestMap({
      display: { axisEvolution: false },
    });

    const ctxWithAxes = buildRenderContext(mapWithAxes);
    const ctxNoXAxis = buildRenderContext(mapNoXAxis);

    // All node x positions unchanged — axis visibility is chrome-only
    for (const nodeWithAxes of ctxWithAxes.nodes) {
      const nodeNoAxis = ctxNoXAxis.nodes.find((n) => n.id === nodeWithAxes.id)!;
      expect(nodeNoAxis, `node ${nodeWithAxes.id} missing`).toBeDefined();
      expect(nodeNoAxis.cx).toBe(nodeWithAxes.cx);
      expect(nodeNoAxis.cy).toBe(nodeWithAxes.cy);
    }
  });

  it("hiding all chrome (axes, value chain, phase dividers) does not move nodes", () => {
    const mapWithAllChrome = makeTestMap({});
    const mapNoChrome = makeTestMap({
      display: { axisEvolution: false, axisValueChain: false, phases: false },
    });

    const ctxWithChrome = buildRenderContext(mapWithAllChrome);
    const ctxNoChrome = buildRenderContext(mapNoChrome);

    // Plot dimensions stay the same — axes visibility does NOT affect margins
    expect(ctxNoChrome.plot.left).toBe(ctxWithChrome.plot.left);
    expect(ctxNoChrome.plot.top).toBe(ctxWithChrome.plot.top);
    expect(ctxNoChrome.plot.width).toBe(ctxWithChrome.plot.width);
    expect(ctxNoChrome.plot.height).toBe(ctxWithChrome.plot.height);

    // All node pixel positions are identical regardless of chrome visibility
    expect(ctxNoChrome.nodes).toHaveLength(ctxWithChrome.nodes.length);
    for (const nodeWithChrome of ctxWithChrome.nodes) {
      const nodeNoChrome = ctxNoChrome.nodes.find((n) => n.id === nodeWithChrome.id)!;
      expect(nodeNoChrome.cx).toBe(nodeWithChrome.cx);
      expect(nodeNoChrome.cy).toBe(nodeWithChrome.cy);
    }
  });

  it("custom axis labels in MapChrome do not change component positions", () => {
    // Sub-AC 2: axisLabels direction overrides removed from MapChrome — only xAxis/yAxis/phases remain
    const mapDefaultLabels = makeTestMap({});
    const mapCustomLabels = makeTestMap({
      style: { background: {
        axisEvolution: { default: { label: { text: "Custom Evolution Axis" } } },
        axisValueChain: { default: { label: { text: "Custom Value Chain" } } },
        phases: { default: { labels: [
          { text: "Phase A" }, { text: "Phase B" }, { text: "Phase C" }, { text: "Phase D" },
        ] } },
      } },
    });

    const ctxDefault = buildRenderContext(mapDefaultLabels);
    const ctxCustom = buildRenderContext(mapCustomLabels);

    // Label changes are purely presentational — node positions must not differ
    for (const nodeDefault of ctxDefault.nodes) {
      const nodeCustom = ctxCustom.nodes.find((n) => n.id === nodeDefault.id)!;
      expect(nodeCustom.cx).toBe(nodeDefault.cx);
      expect(nodeCustom.cy).toBe(nodeDefault.cy);
    }
  });
});

// ── Test 4: visibilityRange zoom changes y positions ─────────────────────────

describe("CoordinateSpace rendering invariant 4 — visibilityRange affects y positions", () => {
  it("component at vis 0.5 with full range [0,1] maps to center of plot vertically", () => {
    const map = makeTestMap({});
    const ctx = buildRenderContext(map);

    const serviceNode = ctx.nodes.find((n) => n.id === "service")!;
    expect(serviceNode).toBeDefined();

    // vis=0.5 with range [0,1] → exactly vertical center of plot area
    const expectedCy = ctx.plot.top + ctx.plot.height / 2;
    expect(serviceNode.cy).toBeCloseTo(expectedCy, 1);
  });

  it("visibilityRange [0, 0.5] maps vis=0.5 to the bottom edge of the plot area", () => {
    // Zoom into the top half of the visibility axis: [0, 0.5]
    // Now vis=0.5 maps to plot bottom (the boundary of the zoomed range)
    const map = makeTestMap({
      style: { background: { canvas: { default: {
        evolutionRange: [0, 1],
        visibilityRange: [0, 0.5],
      } } } },
    });
    const ctx = buildRenderContext(map);

    const serviceNode = ctx.nodes.find((n) => n.id === "service")!;
    expect(serviceNode).toBeDefined();

    // With range [0, 0.5], vis=0.5 maps to plot.top + plot.height = plotBottom
    const expectedCy = ctx.plot.top + ctx.plot.height;
    expect(serviceNode.cy).toBeCloseTo(expectedCy, 1);
  });

  it("zoomed-in visibilityRange moves component y further down than full range", () => {
    const mapFull = makeTestMap({ style: { background: { canvas: { default: { visibilityRange: [0, 1] } } } } });
    const mapZoomed = makeTestMap({
      style: { background: { canvas: { default: { visibilityRange: [0, 0.5] } } } },
    });

    const ctxFull = buildRenderContext(mapFull);
    const ctxZoomed = buildRenderContext(mapZoomed);

    // vis=0.5 with full range → center
    const serviceFullCy = ctxFull.nodes.find((n) => n.id === "service")!.cy;
    // vis=0.5 with zoomed range [0, 0.5] → bottom edge (further down)
    const serviceZoomedCy = ctxZoomed.nodes.find((n) => n.id === "service")!.cy;

    expect(serviceZoomedCy).toBeGreaterThan(serviceFullCy);
  });
});

// ── Test 5: Non-default canvas + coordinateSpace → same SVG as top-level dims ──

describe("CoordinateSpace rendering invariant 5 — canvas dimensions consistency", () => {
  it("800×400 canvas with matching coordinateSpace produces same SVG as top-level width/height only", () => {
    // Map A: canvas dimensions via top-level fields only
    const mapTopLevel = makeTestMap({ style: { background: { canvas: { default: { width: 800, height: 400 } } } } });

    // Map B: same canvas dimensions declared both at top-level AND in coordinateSpace
    const mapWithCs = makeTestMap({
      style: { background: { canvas: { default: {
        width: 800,
        height: 400,
        evolutionRange: [0, 1],
        visibilityRange: [0, 1],
        unit: "canvas-px",
      } } } },
    });

    const svgTopLevel = renderToSVG(mapTopLevel);
    const svgWithCs = renderToSVG(mapWithCs);

    // CoordinateSpace with matching canvas dimensions is transparent — same SVG
    expect(svgWithCs).toBe(svgTopLevel);
  });

  it("800×400 canvas produces SVG with correct viewBox dimensions", () => {
    const map = makeTestMap({ style: { background: { canvas: { default: { width: 800, height: 400 } } } } });
    const svg = renderToSVG(map);

    // SVG viewBox must reflect the declared canvas dimensions
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="400"');
  });

  it("default 1600×800 canvas produces SVG with correct viewBox dimensions", () => {
    const map = makeTestMap({});
    const svg = renderToSVG(map);

    expect(svg).toContain('width="1600"');
    expect(svg).toContain('height="800"');
  });
});

// ── Test 6: CoordinateSpace structural fields are coordinate-defining, not chrome ──

describe("CoordinateSpace rendering invariant 6 — structural classification", () => {
  it("coordinateSpace evolutionRange affects node positions; background.evolutionXAxis.show does not", () => {
    // Two maps with same coordinateSpace but different axis chrome
    const mapShowAxes = makeTestMap({
      style: { background: { canvas: { default: { evolutionRange: [0.1, 0.9] } } } },
      display: { axisEvolution: true },
    });

    const mapHideAxes = makeTestMap({
      style: { background: { canvas: { default: { evolutionRange: [0.1, 0.9] } } } },
      display: { axisEvolution: false },
    });

    const ctxShow = buildRenderContext(mapShowAxes);
    const ctxHide = buildRenderContext(mapHideAxes);

    // Identical coordinateSpace → identical node positions regardless of chrome
    for (const nodeShow of ctxShow.nodes) {
      const nodeHide = ctxHide.nodes.find((n) => n.id === nodeShow.id)!;
      expect(nodeHide.cx).toBe(nodeShow.cx);
      expect(nodeHide.cy).toBe(nodeShow.cy);
    }
  });

  it("different coordinateSpace configs produce different SVG outputs (not accidentally identical)", () => {
    const mapDefault = makeTestMap({});
    const mapZoomed = makeTestMap({
      style: { background: { canvas: { default: { evolutionRange: [0.2, 0.8] } } } },
    });

    const svgDefault = renderToSVG(mapDefault);
    const svgZoomed = renderToSVG(mapZoomed);

    // Different coordinate spaces must produce different outputs
    // (ensures coordinateSpace is actually being applied, not silently ignored)
    expect(svgZoomed).not.toBe(svgDefault);
  });
});

// ── Sub-AC 4c: outputHint scaling integration tests ──────────────────────────

describe("outputHint — resolution-independence scaling in render pipeline", () => {
  it("outputHint absent → canvas dimensions equal coordinateSpace dimensions (identity)", () => {
    const map = makeTestMap({});
    const ctx = buildRenderContext(sanitizeMap(map));
    expect(ctx.canvasWidth).toBe(1600);
    expect(ctx.canvasHeight).toBe(800);
  });

  it("outputHint.targetWidth=800 → canvasWidth is 800 (half of 1600 default)", () => {
    const map = makeTestMap({
      style: { view: { default: { width: 800, height: 400 } } },
    });
    const ctx = buildRenderContext(sanitizeMap(map));
    expect(ctx.canvasWidth).toBe(800);
    expect(ctx.canvasHeight).toBe(400);
  });

  it("outputHint scaling: nodeRadii._default is scaled by 0.5 when target is half size", () => {
    const map = makeTestMap({
      style: { view: { default: { width: 800, height: 400 } } },
    });
    const ctx = buildRenderContext(sanitizeMap(map));
    // Default nodeRadii._default is 5px; at 0.5x scale → 2.5px
    expect(ctx.resolvedConfig.nodeRadii._default).toBeCloseTo(2.5);
  });

  it("outputHint scaling: strokeWidth is scaled by 0.5 when target is half size", () => {
    const map = makeTestMap({
      style: { view: { default: { width: 800, height: 400 } } },
    });
    const ctx = buildRenderContext(sanitizeMap(map));
    // Default strokeWidth is 1px; at 0.5x scale → 0.5px
    expect(ctx.resolvedConfig.strokeWidth).toBeCloseTo(0.5);
  });

  it("outputHint scaling does NOT affect labelScale (unitless multiplier)", () => {
    const map = makeTestMap({
      style: { view: { default: { width: 400, height: 200 } }, global: { labelScale: 1.5 } },
    });
    const ctx = buildRenderContext(sanitizeMap(map));
    // labelScale is unitless — it must remain 1.5 regardless of 0.25x canvas scale
    expect(ctx.resolvedConfig.typography.labelScale).toBeCloseTo(1.5);
  });

  it("options.width takes priority over outputHint.targetWidth", () => {
    const map = makeTestMap({
      style: { view: { default: { width: 800 } } },
    });
    // Runtime options.width overrides outputHint
    const ctx = buildRenderContext(sanitizeMap(map), { width: 1200 });
    expect(ctx.canvasWidth).toBe(1200);
  });

  it("outputHint identity (target=canvas size) → nodeRadii unchanged", () => {
    const map = makeTestMap({
      style: { view: { default: { width: 1600, height: 800 } } },
    });
    const ctx = buildRenderContext(sanitizeMap(map));
    // 1:1 scale — nodeRadii must remain at default 5px
    expect(ctx.resolvedConfig.nodeRadii._default).toBeCloseTo(5);
    expect(ctx.resolvedConfig.strokeWidth).toBeCloseTo(1);
  });

  it("outputHint 2x scale: nodeRadii doubled, strokeWidth doubled", () => {
    // Canvas is 1600×800, target is 3200×1600 (2x) — used for retina raster export
    const map = makeTestMap({
      style: { view: { default: { width: 3200, height: 1600 } } },
    });
    const ctx = buildRenderContext(sanitizeMap(map));
    expect(ctx.canvasWidth).toBe(3200);
    expect(ctx.canvasHeight).toBe(1600);
    expect(ctx.resolvedConfig.nodeRadii._default).toBeCloseTo(10); // 5 * 2
    expect(ctx.resolvedConfig.strokeWidth).toBeCloseTo(2); // 1 * 2
  });

  it("outputHint scaling applies to all nodeRadii entries (including per-type overrides)", () => {
    const map = makeTestMap({
      style: {
        nodes: {
          default: { override: { symbol: { radius: 5 } } },
          byType: { anchor: { override: { symbol: { radius: 8 } } } },
          bySubtype: { userNeed: { override: { symbol: { radius: 7 } } } },
        },
        view: { default: { width: 800, height: 400 } },
      },
    });
    const ctx = buildRenderContext(sanitizeMap(map));
    // All nodeRadii entries are scaled uniformly by 0.5
    expect(ctx.resolvedConfig.nodeRadii._default).toBeCloseTo(2.5);
    expect(ctx.resolvedConfig.nodeRadii["anchor"]).toBeCloseTo(4);
    expect(ctx.resolvedConfig.nodeRadii["user-need"]).toBeCloseTo(3.5);
  });

  it("no-outputHint render and outputHint=identity render produce same SVG", () => {
    const mapDefault = makeTestMap({});
    const mapIdentity = makeTestMap({
      style: { view: { default: { width: 1600, height: 800 } } },
    });
    const svgDefault = renderToSVG(mapDefault);
    const svgIdentity = renderToSVG(mapIdentity);
    // 1:1 scale must produce byte-identical output
    expect(svgIdentity).toBe(svgDefault);
  });
});
