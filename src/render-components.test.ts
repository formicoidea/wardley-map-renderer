/**
 * AC 6: Components rendered as 5px circles with black border and white fill.
 *
 * Verifies that each component in the WardleyMap is rendered as an SVG circle
 * with radius 5, fill #ffffff (white), and stroke #000000 (black).
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG } from "./render.js";
import { sanitizeMap } from "./schema.js";

const MAP_WITH_COMPONENTS = sanitizeMap({
  title: "Component rendering test",
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

describe("Component rendering (AC 6)", () => {
  const svg = renderMapToSVG(MAP_WITH_COMPONENTS);

  it("renders one circle per component", () => {
    const circles = svg.match(/<circle /g);
    expect(circles).not.toBeNull();
    expect(circles!.length).toBe(3);
  });

  it("each circle has radius 5 (r=\"5\")", () => {
    const r5 = svg.match(/r="5"/g);
    expect(r5).not.toBeNull();
    expect(r5!.length).toBe(3);
  });

  it("each circle has white fill (#ffffff)", () => {
    // All circles should have fill="#ffffff"
    const circleBlocks = svg.match(/<circle[^>]+>/g)!;
    for (const circle of circleBlocks) {
      expect(circle).toContain('fill="#ffffff"');
    }
  });

  it("each circle has black stroke (#000000)", () => {
    const circleBlocks = svg.match(/<circle[^>]+>/g)!;
    for (const circle of circleBlocks) {
      expect(circle).toContain('stroke="#000000"');
    }
  });

  it("circles are positioned inside the plot area", () => {
    const circleBlocks = svg.match(/<circle[^>]+>/g)!;
    for (const circle of circleBlocks) {
      const cxMatch = circle.match(/cx="(\d+\.?\d*)"/);
      const cyMatch = circle.match(/cy="(\d+\.?\d*)"/);
      expect(cxMatch).not.toBeNull();
      expect(cyMatch).not.toBeNull();
      const cx = parseFloat(cxMatch![1]);
      const cy = parseFloat(cyMatch![1]);
      // Should be within canvas bounds (0-1600, 0-900)
      expect(cx).toBeGreaterThan(0);
      expect(cx).toBeLessThan(1600);
      expect(cy).toBeGreaterThan(0);
      expect(cy).toBeLessThan(900);
    }
  });

  it("renders component labels alongside circles", () => {
    expect(svg).toContain("User");
    expect(svg).toContain("Web App");
    expect(svg).toContain("Database");
  });

  it("renders edges between related components", () => {
    // 2 relations → 2 lines (plus grid lines and dividers)
    const lines = svg.match(/<line /g);
    expect(lines).not.toBeNull();
    // At least 2 edge lines (there are also grid + divider lines)
    expect(lines!.length).toBeGreaterThanOrEqual(2);
  });
});
