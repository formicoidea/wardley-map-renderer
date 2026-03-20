/**
 * Integration tests for renderToSVG with accelerators.
 *
 * Unlike the unit tests in accelerators-layer.test.ts (which test the layer
 * function in isolation), these tests exercise the full rendering pipeline:
 *   sanitizeMap → buildRenderContext → composeSVG (all 11 layers)
 *
 * Validates that accelerator/deaccelerator arrows and labels appear correctly
 * in the final SVG document produced by renderToSVG().
 *
 * @module render/accelerators-integration.test
 */

import { describe, it, expect } from "vitest";
import { renderToSVG } from "../render-orchestrator.js";
import { makeMap, makeComponent } from "../test-helpers.js";
import type { WardleyMap } from "../schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a map with components and accelerators for integration testing */
function mapWithAccelerators(
  accelerators: WardleyMap["accelerators"]
): WardleyMap {
  return makeMap({
    title: "Accelerator Integration Test",
    components: [
      makeComponent({ id: "platform", name: "Platform", evolution: 0.6, visibility: 0.3 }),
      makeComponent({ id: "hosting", name: "Hosting", evolution: 0.8, visibility: 0.7, type: "component" }),
    ],
    relations: [{ source: "platform", target: "hosting", type: "DependsOn" as const }],
    accelerators,
  });
}

// ── Full-pipeline integration tests ─────────────────────────────────

describe("renderToSVG with accelerators (integration)", () => {
  it("produces valid SVG containing accelerator arrow and label", () => {
    const map = mapWithAccelerators([
      {
        id: "acc-oss",
        label: "Open Source",
        type: "accelerator",
        position: {
          evolution: { scalar: 0.65 },
          visibility: { scalar: 0.5 },
        },
      },
    ]);

    const svg = renderToSVG(map);

    // Valid SVG document
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");

    // Accelerators layer group present
    expect(svg).toContain('data-layer="accelerators"');

    // Arrow path rendered (no rotation for accelerator)
    expect(svg).toMatch(/<path[^>]+d="M /);
    expect(svg).toContain('fill="#000000"');

    // Label text rendered
    expect(svg).toContain("Open Source");
  });

  it("produces valid SVG containing deaccelerator arrow with rotation", () => {
    const map = mapWithAccelerators([
      {
        id: "deacc-legacy",
        label: "Legacy Lock-in",
        type: "deaccelerator",
        position: {
          evolution: { scalar: 0.3 },
          visibility: { scalar: 0.4 },
        },
      },
    ]);

    const svg = renderToSVG(map);

    // Deaccelerator has rotate(180)
    expect(svg).toContain("rotate(180)");

    // Label with end anchor (deaccelerator label goes left)
    expect(svg).toContain("Legacy Lock-in");
    expect(svg).toContain('text-anchor="end"');
  });

  it("renders both accelerator and deaccelerator in the same map", () => {
    const map = mapWithAccelerators([
      {
        id: "acc-cloud",
        label: "Cloud Adoption",
        type: "accelerator",
        position: {
          evolution: { scalar: 0.7 },
          visibility: { scalar: 0.5 },
        },
      },
      {
        id: "deacc-reg",
        label: "Regulation",
        type: "deaccelerator",
        position: {
          evolution: { scalar: 0.4 },
          visibility: { scalar: 0.6 },
        },
      },
    ]);

    const svg = renderToSVG(map);

    // Both labels present
    expect(svg).toContain("Cloud Adoption");
    expect(svg).toContain("Regulation");

    // Both arrows rendered (2 <path elements within accelerators layer)
    const acceleratorsLayerMatch = svg.match(
      /data-layer="accelerators"[\s\S]*?<\/g>/
    );
    expect(acceleratorsLayerMatch).not.toBeNull();
    const layerContent = acceleratorsLayerMatch![0];

    // Count path elements — one per accelerator
    const pathCount = (layerContent.match(/<path /g) || []).length;
    expect(pathCount).toBe(2);

    // Count text elements — one label per accelerator
    const textCount = (layerContent.match(/<text /g) || []).length;
    expect(textCount).toBe(2);

    // One has rotation (deaccelerator), one does not
    expect(layerContent).toContain("rotate(180)");
  });

  it("produces SVG without accelerators layer content when no accelerators", () => {
    const map = makeMap({
      title: "No Accelerators",
      components: [
        makeComponent({ id: "comp-1", name: "Service", evolution: 0.5, visibility: 0.5 }),
      ],
      relations: [],
    });

    const svg = renderToSVG(map);

    // SVG is valid
    expect(svg).toContain("<svg");

    // Accelerators layer group should be empty (no path/text inside)
    const acceleratorsLayerMatch = svg.match(
      /data-layer="accelerators"[\s\S]*?<\/g>/
    );
    if (acceleratorsLayerMatch) {
      const layerContent = acceleratorsLayerMatch[0];
      expect(layerContent).not.toContain("<path");
      expect(layerContent).not.toContain("<text");
    }
  });

  it("accelerator arrows coexist with other map elements (components, edges)", () => {
    const map = mapWithAccelerators([
      {
        id: "acc-api",
        label: "API Standards",
        type: "accelerator",
        position: {
          evolution: { scalar: 0.55 },
          visibility: { scalar: 0.45 },
        },
      },
    ]);

    const svg = renderToSVG(map);

    // Components rendered in nodes layer
    expect(svg).toContain('data-layer="nodes"');
    expect(svg).toContain("Platform");
    expect(svg).toContain("Hosting");

    // Edges rendered
    expect(svg).toContain('data-layer="edges"');

    // Accelerators rendered
    expect(svg).toContain('data-layer="accelerators"');
    expect(svg).toContain("API Standards");

    // Legend rendered
    expect(svg).toContain('data-layer="legend"');
  });
});
