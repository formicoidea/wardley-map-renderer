/**
 * Tests for the Ecosystem SVG symbol — 3 concentric circles rendering.
 *
 * Verifies:
 *   - Ecosystem components render 3 concentric circles (r=30, r=25, r=10)
 *   - Outer circle has grey fill (#cccccc)
 *   - Middle circle has hatched pattern fill (url(#eco-hatch-...))
 *   - Inner circle has white fill (#ffffff)
 *   - A <defs> block with <pattern> is emitted for the hatch
 *   - Legend includes "Ecosystem" entry when ecosystem type is present
 */

import { describe, it, expect } from "vitest";
import { renderToSVG } from "../render-orchestrator.js";
import type { WardleyMap, Legend, RenderConfig } from "../schema.js";
import { sanitizeMap } from "../schema.js";

/** Minimal valid map with a single ecosystem component */
function makeEcosystemMap(overrides?: Partial<WardleyMap>): WardleyMap {
  return sanitizeMap({
    title: "Ecosystem Test",
    components: [
      {
        id: "eco1",
        label: { name: "Platform Ecosystem" },
        type: "ecosystem",
        position: {
          evolution: { scalar: 0.5 },
          visibility: { scalar: 0.3 },
        },
      },
    ],
    relations: [],
    ...overrides,
  });
}

describe("EcosystemSymbol SVG rendering", () => {
  it("renders 3 concentric circles for ecosystem type", () => {
    const map = makeEcosystemMap();
    const svg = renderToSVG(map);

    // Should have exactly 3 circle elements inside the nodes layer for the ecosystem
    const nodesLayerMatch = svg.match(
      /<g data-layer="nodes">([\s\S]*?)<\/g>/
    );
    expect(nodesLayerMatch).not.toBeNull();

    const nodesContent = nodesLayerMatch![1];

    // Count circles in the nodes layer (ecosystem renders 3)
    const circleMatches = nodesContent.match(/<circle /g);
    expect(circleMatches).not.toBeNull();
    expect(circleMatches!.length).toBe(3);
  });

  it("outer circle has r=30 and grey fill", () => {
    const map = makeEcosystemMap();
    const svg = renderToSVG(map);

    // Outer circle: r="30", fill="#cccccc"
    expect(svg).toContain('r="30"');
    expect(svg).toContain('fill="#cccccc"');
  });

  it("middle circle has r=25 and hatched pattern fill", () => {
    const map = makeEcosystemMap();
    const svg = renderToSVG(map);

    // Middle circle: r="25", fill="url(#eco-hatch-eco1)"
    expect(svg).toContain('r="25"');
    expect(svg).toContain('fill="url(#eco-hatch-eco1)"');
  });

  it("inner circle has r=10 and white fill", () => {
    const map = makeEcosystemMap();
    const svg = renderToSVG(map);

    // Inner circle: r="10", fill="#ffffff"
    expect(svg).toContain('r="10"');
    // White fill exists (also used by background, so just check presence)
    expect(svg).toContain('fill="#ffffff"');
  });

  it("emits a <defs> block with hatch pattern", () => {
    const map = makeEcosystemMap();
    const svg = renderToSVG(map);

    // Should have a <defs> with a <pattern> for the hatch
    expect(svg).toContain("<defs>");
    expect(svg).toContain('id="eco-hatch-eco1"');
    expect(svg).toContain("<pattern ");
    expect(svg).toContain('patternTransform="rotate(45)"');
    expect(svg).toContain("</pattern>");
    expect(svg).toContain("</defs>");
  });

  it("uses unique pattern ids for multiple ecosystem nodes", () => {
    const map = sanitizeMap({
      title: "Multi Ecosystem",
      components: [
        {
          id: "eco-a",
          label: { name: "Eco A" },
          type: "ecosystem",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } },
        },
        {
          id: "eco-b",
          label: { name: "Eco B" },
          type: "ecosystem",
          position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [],
    });
    const svg = renderToSVG(map);

    expect(svg).toContain('id="eco-hatch-eco-a"');
    expect(svg).toContain('id="eco-hatch-eco-b"');
    expect(svg).toContain('fill="url(#eco-hatch-eco-a)"');
    expect(svg).toContain('fill="url(#eco-hatch-eco-b)"');
  });

  it("respects custom color from component.color", () => {
    const map = sanitizeMap({
      title: "Ecosystem Color",
      components: [
        {
          id: "eco-c",
          label: { name: "Custom Eco" },
          type: "ecosystem",
          color: "#ff0000",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.3 } },
        },
      ],
      relations: [],
    });
    const svg = renderToSVG(map);

    // The stroke of the concentric circles should use the custom color
    expect(svg).toContain('stroke="#ff0000"');
  });

  it("legend includes Ecosystem entry when ecosystem is present", () => {
    const map = sanitizeMap({
      title: "Ecosystem Legend",
      components: [
        {
          id: "eco-leg",
          label: { name: "Eco" },
          type: "ecosystem",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.3 } },
        },
      ],
      relations: [],
      renderConfig: { legend: { show: true } as Legend } as RenderConfig,
    });
    const svg = renderToSVG(map);

    // Legend should contain the "Ecosystem" label
    expect(svg).toContain("Ecosystem");

    // Legend swatch should contain 3 concentric circles (scaled down)
    const legendMatch = svg.match(
      /<g data-layer="legend">([\s\S]*?)<\/g>/
    );
    expect(legendMatch).not.toBeNull();
    const legendContent = legendMatch![1];

    // Ecosystem swatch has 3 circles with different radii
    expect(legendContent).toContain('r="8"');
    expect(legendContent).toContain('r="6"');
    expect(legendContent).toContain('r="3"');
  });
});
