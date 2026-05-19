/**
 * AC 26 — SVG and PNG formats remain clean without interactive elements.
 *
 * Verifies that renderToSVG() (default, no interactive flag) produces SVG
 * without any data-component-id, data-edge-id, data-evolves-from,
 * data-pipeline-id, data-plot-area, data-handle attributes, or hit-area rects.
 *
 * These interactive elements must only appear when interactive=true (text/html).
 */

import { describe, it, expect } from "vitest";
import { renderToSVG } from "../render-orchestrator.js";
import { WardleyMapSchema, type WardleyMap } from "../schema.js";

// ── Fixture: map with nodes, edges, pipeline, and evolvesTo ──────────

const FULL_MAP: WardleyMap = WardleyMapSchema.parse({
  title: "Clean SVG Test",
  components: [
    {
      id: "user",
      label: { name: "User" },
      type: "anchor",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } },
    },
    {
      id: "platform",
      label: { name: "Platform" },
      type: "component",
      position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.5 } },
      evolvesTo: [
        {
          position: {
            evolution: { scalar: 0.7 },
            visibility: { scalar: 0.5 },
          },
        },
      ],
    },
    {
      id: "pipe",
      label: { name: "Pipeline" },
      type: "pipeline",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.8 } },
      pipelineGeometry: { evoStart: 0.3, evoEnd: 0.7, visStart: 0.75, visEnd: 0.85 },
    },
    {
      id: "infra",
      label: { name: "Infra" },
      type: "component",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.8 } },
    },
  ],
  relations: [
    { id: "rel-1", source: "user", target: "platform" },
    { id: "rel-2", source: "platform", target: "infra" },
  ],
});

// All interactive data-* attributes that should never appear in clean SVG
const INTERACTIVE_MARKERS = [
  "data-component-id",
  "data-edge-id",
  "data-evolves-from",
  "data-pipeline-id",
  "data-plot-area",
  "data-handle",
  "data-step-number",
  "data-label-for",
];

// ── Tests ─────────────────────────────────────────────────────────────

describe("SVG format is clean (no interactive elements)", () => {
  it("renderToSVG() without options has no interactive attributes", () => {
    const svg = renderToSVG(FULL_MAP);
    for (const marker of INTERACTIVE_MARKERS) {
      expect(svg).not.toContain(marker);
    }
  });

  it("renderToSVG() with explicit interactive=false has no interactive attributes", () => {
    const svg = renderToSVG(FULL_MAP, { interactive: false });
    for (const marker of INTERACTIVE_MARKERS) {
      expect(svg).not.toContain(marker);
    }
  });

  it("renderToSVG() with interactive=true DOES have interactive attributes", () => {
    const svg = renderToSVG(FULL_MAP, { interactive: true });
    // At minimum these should be present for a map with components, edges, pipelines, evolvesTo
    expect(svg).toContain("data-component-id");
    expect(svg).toContain("data-edge-id");
    expect(svg).toContain("data-pipeline-id");
    expect(svg).toContain("data-evolves-from");
    expect(svg).toContain("data-plot-area");
    expect(svg).toContain("data-handle");
  });

  it("clean SVG still contains actual visual elements (not stripped)", () => {
    const svg = renderToSVG(FULL_MAP);
    // Must contain the actual component labels, lines, rects — just not interactive wrappers
    expect(svg).toContain("User");
    expect(svg).toContain("Platform");
    expect(svg).toContain("<circle");
    expect(svg).toContain("<line");
    expect(svg).toContain("<rect");
    expect(svg).toContain("<svg");
  });

  it("clean SVG has no hit-area transparent rects for edges", () => {
    const svg = renderToSVG(FULL_MAP);
    // Hit areas use stroke-opacity="0" or very thick transparent strokes
    expect(svg).not.toContain('stroke-opacity="0"');
  });

  it("clean SVG has no resize handle rects", () => {
    const svg = renderToSVG(FULL_MAP);
    // Resize handles have cursor:ew-resize or cursor:ns-resize styles
    expect(svg).not.toContain("ew-resize");
    expect(svg).not.toContain("ns-resize");
  });
});
