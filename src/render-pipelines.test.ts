/**
 * Tests for pipeline SVG rendering.
 *
 * Verifies that pipeline components are rendered as:
 * - Rounded rectangles (background visual) with correct geometry
 * - Labels positioned at handleEvolution, above the rectangle
 * - Pipelines appear before (behind) edges and component nodes
 * - Sub-components inside pipelines are rendered as normal circles
 * - Pipeline components are NOT rendered as circles
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG } from "./render.js";
import type { WardleyMap } from "./schema.js";

// ── Test fixtures ──────────────────────────────────────────────────

/** Map with a single pipeline containing 2 sub-components */
const MAP_WITH_PIPELINE: WardleyMap = {
  title: "Pipeline Rendering Test",
  components: [
    {
      id: "user",
      label: "User",
      type: "anchor",
      evolution: 0.5,
      visibility: 0.9,
    },
    {
      id: "pipe1",
      label: "App Interface",
      type: "pipeline",
      evolution: 0.2,
      visibility: 0.7,
      pipelineGeometry: {
        evoStart: 0.2,
        evoEnd: 0.7,
        visStart: 0.5,
        visEnd: 0.7,
        handleEvolution: 0.3,
      },
    },
    {
      id: "saas",
      label: "SaaS UI",
      type: "component",
      evolution: 0.65,
      visibility: 0.6,
    },
    {
      id: "custom-ui",
      label: "Custom UI",
      type: "component",
      evolution: 0.25,
      visibility: 0.6,
    },
  ],
  relations: [
    { source: "user", target: "pipe1", type: "DependsOn" },
  ],
  gridSize: { width: 1600, height: 800 },
  axes: { valueChain: true, evolution: true },
};

/** Map without any pipelines (baseline) */
const MAP_NO_PIPELINE: WardleyMap = {
  title: "No Pipeline Test",
  components: [
    {
      id: "c1",
      label: "Component A",
      type: "component",
      evolution: 0.5,
      visibility: 0.5,
    },
  ],
  relations: [],
  gridSize: { width: 1600, height: 800 },
  axes: { valueChain: true, evolution: true },
};

/** Map with multiple pipelines */
const MAP_MULTI_PIPELINE: WardleyMap = {
  title: "Multi Pipeline Test",
  components: [
    {
      id: "pipe-a",
      label: "Pipeline A",
      type: "pipeline",
      evolution: 0.2,
      visibility: 0.4,
      pipelineGeometry: {
        evoStart: 0.2,
        evoEnd: 0.5,
        visStart: 0.3,
        visEnd: 0.4,
      },
    },
    {
      id: "pipe-b",
      label: "Pipeline B",
      type: "pipeline",
      evolution: 0.6,
      visibility: 0.8,
      pipelineGeometry: {
        evoStart: 0.6,
        evoEnd: 0.9,
        visStart: 0.7,
        visEnd: 0.8,
        handleEvolution: 0.75,
      },
    },
    {
      id: "inside-a",
      label: "Inside A",
      type: "component",
      evolution: 0.35,
      visibility: 0.35,
    },
    {
      id: "inside-b",
      label: "Inside B",
      type: "component",
      evolution: 0.75,
      visibility: 0.75,
    },
  ],
  relations: [],
  gridSize: { width: 1600, height: 800 },
  axes: { valueChain: true, evolution: true },
};

// ── Tests ──────────────────────────────────────────────────────────

describe("Pipeline SVG rendering", () => {
  const svg = renderMapToSVG(MAP_WITH_PIPELINE);

  it("renders a pipeline as a rect element", () => {
    // Should contain at least one rect beyond the background and plot area
    const rects = svg.match(/<rect /g);
    expect(rects).not.toBeNull();
    // Background rect + plot area rect + pipeline rect = at least 3
    expect(rects!.length).toBeGreaterThanOrEqual(3);
  });

  it("pipeline rect has rounded corners (rx/ry)", () => {
    // Find rects with rx attribute (pipeline rects have rx="4")
    const roundedRects = svg.match(/<rect[^>]+rx="4"/g);
    expect(roundedRects).not.toBeNull();
    expect(roundedRects!.length).toBeGreaterThanOrEqual(1);
  });

  it("pipeline rect has correct fill and stroke", () => {
    // Pipeline should have semi-transparent fill and gray stroke
    expect(svg).toContain('fill="rgba(230, 230, 230, 0.35)"');
    expect(svg).toContain('stroke="#999999"');
  });

  it("renders pipeline label text", () => {
    expect(svg).toContain("App Interface");
  });

  it("pipeline label uses smaller font size than component labels", () => {
    // Pipeline label font-size should be 11px
    const pipelineLabelMatch = svg.match(
      /App Interface[\s\S]*?font-size="11"|font-size="11"[\s\S]*?App Interface/
    );
    expect(pipelineLabelMatch).not.toBeNull();
  });

  it("does NOT render a circle for the pipeline component", () => {
    // Should have circles for: user, saas, custom-ui (3 components, not 4)
    const circles = svg.match(/<circle /g);
    expect(circles).not.toBeNull();
    expect(circles!.length).toBe(3);
  });

  it("renders sub-components inside pipeline as circles", () => {
    // Both "SaaS UI" and "Custom UI" labels should appear
    expect(svg).toContain("SaaS UI");
    expect(svg).toContain("Custom UI");
  });

  it("pipeline rect appears before component circles in SVG (visual layering)", () => {
    // Pipeline rect should come before the first circle
    const pipelineRectIdx = svg.indexOf('rx="4"');
    const firstCircleIdx = svg.indexOf("<circle");
    expect(pipelineRectIdx).toBeGreaterThan(-1);
    expect(firstCircleIdx).toBeGreaterThan(-1);
    expect(pipelineRectIdx).toBeLessThan(firstCircleIdx);
  });
});

describe("No pipeline map", () => {
  const svg = renderMapToSVG(MAP_NO_PIPELINE);

  it("has no pipeline rects (only background + plot area)", () => {
    const roundedRects = svg.match(/<rect[^>]+rx="4"/g);
    expect(roundedRects).toBeNull();
  });

  it("still renders component circle", () => {
    const circles = svg.match(/<circle /g);
    expect(circles).not.toBeNull();
    expect(circles!.length).toBe(1);
  });
});

describe("Multiple pipelines", () => {
  const svg = renderMapToSVG(MAP_MULTI_PIPELINE);

  it("renders 2 pipeline rectangles", () => {
    const roundedRects = svg.match(/<rect[^>]+rx="4"/g);
    expect(roundedRects).not.toBeNull();
    expect(roundedRects!.length).toBe(2);
  });

  it("renders both pipeline labels", () => {
    expect(svg).toContain("Pipeline A");
    expect(svg).toContain("Pipeline B");
  });

  it("renders 2 component circles (not 4 — pipelines excluded)", () => {
    const circles = svg.match(/<circle /g);
    expect(circles).not.toBeNull();
    expect(circles!.length).toBe(2);
  });

  it("renders sub-component labels", () => {
    expect(svg).toContain("Inside A");
    expect(svg).toContain("Inside B");
  });
});

describe("Pipeline geometry to SVG coordinates", () => {
  const svg = renderMapToSVG(MAP_WITH_PIPELINE);

  it("pipeline rect x position derived from evoStart", () => {
    // evoStart=0.2, PLOT_LEFT=48, PLOT_W=1600-48-20=1532
    // x = 48 + 0.2 * 1532 - 4(padding) = 48 + 306.4 - 4 = 350.4
    const rectMatch = svg.match(/<rect[^>]+rx="4"[^>]+>/);
    expect(rectMatch).not.toBeNull();
    const xMatch = rectMatch![0].match(/x="([\d.]+)"/);
    expect(xMatch).not.toBeNull();
    const x = parseFloat(xMatch![1]);
    // Should be approximately 350.4 (48 + 0.2 * 1532 - 4)
    expect(x).toBeCloseTo(350.4, 0);
  });

  it("pipeline rect width derived from evoEnd - evoStart", () => {
    const rectMatch = svg.match(/<rect[^>]+rx="4"[^>]+>/);
    expect(rectMatch).not.toBeNull();
    const wMatch = rectMatch![0].match(/width="([\d.]+)"/);
    expect(wMatch).not.toBeNull();
    const w = parseFloat(wMatch![1]);
    // width = (0.7 - 0.2) * 1532 + 8(padding) = 766 + 8 = 774
    expect(w).toBeCloseTo(774, 0);
  });
});

describe("Pipeline label position", () => {
  it("pipeline label is positioned at handleEvolution x coordinate", () => {
    const svg = renderMapToSVG(MAP_WITH_PIPELINE);
    // handleEvolution=0.3, labelX = 48 + 0.3 * 1532 = 48 + 459.6 = 507.6
    const labelMatch = svg.match(
      /<text[^>]+>App Interface<\/text>/
    );
    expect(labelMatch).not.toBeNull();
    // Extract x from the text element
    const fullMatch = svg.match(/<text[^>]*x="([\d.]+)"[^>]*>App Interface<\/text>/);
    expect(fullMatch).not.toBeNull();
    const x = parseFloat(fullMatch![1]);
    expect(x).toBeCloseTo(507.6, 0);
  });

  it("pipeline without explicit handleEvolution uses midpoint", () => {
    const svg = renderMapToSVG(MAP_MULTI_PIPELINE);
    // Pipeline A has no handleEvolution → midpoint of 0.2-0.5 = 0.35
    // labelX = 48 + 0.35 * 1532 = 48 + 536.2 = 584.2
    const fullMatch = svg.match(/<text[^>]*x="([\d.]+)"[^>]*>Pipeline A<\/text>/);
    expect(fullMatch).not.toBeNull();
    const x = parseFloat(fullMatch![1]);
    expect(x).toBeCloseTo(584.2, 0);
  });
});
