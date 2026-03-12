/**
 * AC 7: Relations rendered as solid grey lines without arrowheads.
 *
 * Verifies that each relation in the WardleyMap is rendered as a solid
 * SVG <line> with grey stroke (#999999), no stroke-dasharray, and no
 * marker-end (arrowhead).
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG } from "./render.js";
import { sanitizeMap } from "./schema.js";

const MAP_WITH_RELATIONS = sanitizeMap({
  title: "Relations test",
  components: [
    {
      id: "user",
      label: "User",
      type: "anchor",
      nature: null,
      evolution: 0.5,
      visibility: 0.1,
    },
    {
      id: "web-app",
      label: "Web App",
      type: "capacity",
      nature: "activity",
      evolution: 0.65,
      visibility: 0.3,
    },
    {
      id: "database",
      label: "Database",
      type: "capacity",
      nature: "activity",
      evolution: 0.85,
      visibility: 0.7,
    },
  ],
  relations: [
    { from: "user", to: "web-app", type: "dependency" },
    { from: "web-app", to: "database", type: "dependency" },
  ],
});

/** Extract only the relation <line> elements (those with EDGE_COLOR #999999) */
function extractEdgeLines(svg: string): string[] {
  const allLines = svg.match(/<line[^>]+>/g) ?? [];
  return allLines.filter((l) => l.includes('stroke="#999999"'));
}

describe("Relation rendering (AC 7)", () => {
  const svg = renderMapToSVG(MAP_WITH_RELATIONS);
  const edgeLines = extractEdgeLines(svg);

  it("renders one line per relation", () => {
    expect(edgeLines.length).toBe(2);
  });

  it("each edge line uses grey stroke (#999999)", () => {
    for (const line of edgeLines) {
      expect(line).toContain('stroke="#999999"');
    }
  });

  it("each edge line is solid (no stroke-dasharray)", () => {
    for (const line of edgeLines) {
      expect(line).not.toContain("stroke-dasharray");
    }
  });

  it("no arrowhead markers defined in the SVG", () => {
    // No <marker> elements should exist
    expect(svg).not.toContain("<marker");
    expect(svg).not.toContain("marker-end");
    expect(svg).not.toContain("marker-start");
  });

  it("edge lines have correct stroke-width", () => {
    for (const line of edgeLines) {
      expect(line).toContain('stroke-width="1.5"');
    }
  });

  it("edge lines connect correct component positions", () => {
    // Each edge line should have x1, y1, x2, y2 attributes
    for (const line of edgeLines) {
      expect(line).toMatch(/x1="\d+\.?\d*"/);
      expect(line).toMatch(/y1="\d+\.?\d*"/);
      expect(line).toMatch(/x2="\d+\.?\d*"/);
      expect(line).toMatch(/y2="\d+\.?\d*"/);
    }
  });

  it("relations with missing component IDs are skipped silently", () => {
    const mapBadRef = sanitizeMap({
      title: "Bad ref test",
      components: [
        {
          id: "a",
          label: "A",
          type: "anchor",
          nature: null,
          evolution: 0.5,
          visibility: 0.5,
        },
      ],
      relations: [
        { from: "a", to: "missing", type: "dependency" },
      ],
    });
    const svgBad = renderMapToSVG(mapBadRef);
    const badEdges = extractEdgeLines(svgBad);
    expect(badEdges.length).toBe(0);
  });

  it("map with no relations renders no edge lines", () => {
    const mapNoRel = sanitizeMap({
      title: "No relations",
      components: [
        {
          id: "a",
          label: "A",
          type: "anchor",
          nature: null,
          evolution: 0.5,
          visibility: 0.5,
        },
      ],
      relations: [],
    });
    const svgNoRel = renderMapToSVG(mapNoRel);
    const noEdges = extractEdgeLines(svgNoRel);
    expect(noEdges.length).toBe(0);
  });

  it("edges are rendered before components (so nodes appear on top)", () => {
    // Find the position of the first edge line and first circle
    const firstEdgeIdx = svg.indexOf('stroke="#999999"');
    const firstCircleIdx = svg.indexOf("<circle");
    expect(firstEdgeIdx).toBeGreaterThan(-1);
    expect(firstCircleIdx).toBeGreaterThan(-1);
    expect(firstEdgeIdx).toBeLessThan(firstCircleIdx);
  });
});
