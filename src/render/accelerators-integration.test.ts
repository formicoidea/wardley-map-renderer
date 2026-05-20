/**
 * Integration tests for renderToSVG with accelerator/deaccelerator DECORATORS.
 *
 * Exercises the full pipeline (buildRenderContext → composeSVG) and validates
 * that the gameplay arrows appear in the final SVG. Accelerator/deaccelerator
 * are now component decorators (boolean flags) — the arrow has no own label
 * (the decorated component carries its own node label).
 *
 * @module render/accelerators-integration.test
 */

import { describe, it, expect } from "vitest";
import { renderToSVG } from "../render-orchestrator.js";
import { makeMap, makeComponent } from "../test-helpers.js";
import type { WardleyMap } from "../schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a map with two components, optionally decorated with gameplay arrows. */
function mapWith(
  decorators: { platform?: "accelerator" | "deaccelerator"; hosting?: "accelerator" | "deaccelerator" } = {}
): WardleyMap {
  return makeMap({
    title: "Accelerator Integration Test",
    components: [
      makeComponent({
        id: "platform", name: "Platform", evolution: 0.6, visibility: 0.3,
        ...(decorators.platform ? { [decorators.platform]: true } : {}),
      }),
      makeComponent({
        id: "hosting", name: "Hosting", evolution: 0.8, visibility: 0.7,
        ...(decorators.hosting ? { [decorators.hosting]: true } : {}),
      }),
    ],
    relations: [{ id: "rel-platform-hosting", source: "platform", target: "hosting", type: "DependsOn" as const }],
  });
}

// ── Full-pipeline integration tests ─────────────────────────────────

describe("renderToSVG with accelerators (integration)", () => {
  it("produces valid SVG containing an accelerator arrow", () => {
    const svg = renderToSVG(mapWith({ platform: "accelerator" }));
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain('data-layer="accelerators"');
    expect(svg).toMatch(/<path[^>]+d="M /);
    expect(svg).toContain('fill="#000000"');
  });

  it("produces valid SVG containing a deaccelerator arrow with rotation", () => {
    const svg = renderToSVG(mapWith({ platform: "deaccelerator" }));
    expect(svg).toContain("rotate(180)");
  });

  it("renders both an accelerator and a deaccelerator in the same map", () => {
    const svg = renderToSVG(mapWith({ platform: "accelerator", hosting: "deaccelerator" }));
    const layerMatch = svg.match(/data-layer="accelerators"[\s\S]*?<\/g>/);
    expect(layerMatch).not.toBeNull();
    const layerContent = layerMatch![0];
    const pathCount = (layerContent.match(/<path /g) || []).length;
    expect(pathCount).toBe(2);
    expect(layerContent).toContain("rotate(180)");
  });

  it("produces SVG without accelerators layer content when none are decorated", () => {
    const svg = renderToSVG(mapWith());
    expect(svg).toContain("<svg");
    const layerMatch = svg.match(/data-layer="accelerators"[\s\S]*?<\/g>/);
    if (layerMatch) {
      expect(layerMatch[0]).not.toContain("<path");
    }
  });

  it("accelerator arrows coexist with other map elements (components, edges)", () => {
    const svg = renderToSVG(mapWith({ platform: "accelerator" }));
    expect(svg).toContain('data-layer="nodes"');
    expect(svg).toContain("Platform");
    expect(svg).toContain("Hosting");
    expect(svg).toContain('data-layer="edges"');
    expect(svg).toContain('data-layer="accelerators"');
    expect(svg).toContain('data-layer="legend"');
  });
});
