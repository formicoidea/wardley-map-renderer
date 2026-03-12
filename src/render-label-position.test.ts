/**
 * AC 8: Component labels positioned with optional labelPosition from schema.
 *
 * Verifies that:
 * - Labels default to right-of-node when labelPosition is omitted
 * - Custom labelPosition { dx, dy } offsets labels relative to the component center
 * - Negative dx flips text-anchor to "end" (label appears left of node)
 * - Mixed maps (some with labelPosition, some without) render correctly
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG } from "./render.js";
import { sanitizeMap } from "./schema.js";

// ── Constants matching render.ts internals ──────────────────────────
const AXIS_MARGIN_LEFT = 48;
const AXIS_MARGIN_TOP = 24;
const MARGIN_RIGHT = 20;
const AXIS_MARGIN_BOTTOM = 48;
const W = 1600;
const H = 900;
const PLOT_LEFT = AXIS_MARGIN_LEFT;
const PLOT_TOP = AXIS_MARGIN_TOP;
const PLOT_W = W - MARGIN_RIGHT - PLOT_LEFT;
const PLOT_H = H - AXIS_MARGIN_BOTTOM - PLOT_TOP;
const NODE_RADIUS = 5;

function evoToX(evo: number) {
  return PLOT_LEFT + evo * PLOT_W;
}
function visToY(vis: number) {
  return PLOT_TOP + vis * PLOT_H;
}

// ── Helper to extract all <text> elements with their attributes ─────
function extractTexts(svg: string) {
  const regex = /<text\s+([^>]*)>([^<]*)<\/text>/g;
  const results: { x: number; y: number; anchor: string; content: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(svg)) !== null) {
    const attrs = m[1];
    const content = m[2];
    const xMatch = attrs.match(/x="([^"]+)"/);
    const yMatch = attrs.match(/y="([^"]+)"/);
    const anchorMatch = attrs.match(/text-anchor="([^"]+)"/);
    if (xMatch && yMatch) {
      results.push({
        x: parseFloat(xMatch[1]),
        y: parseFloat(yMatch[1]),
        anchor: anchorMatch ? anchorMatch[1] : "start",
        content,
      });
    }
  }
  return results;
}

function findLabel(texts: ReturnType<typeof extractTexts>, label: string) {
  return texts.find((t) => t.content === label);
}

// ── Test map with NO labelPosition (defaults) ──────────────────────
const MAP_DEFAULT_LABELS = sanitizeMap({
  title: "Default labels",
  components: [
    {
      id: "user",
      label: "User",
      type: "anchor",
      nature: null,
      evolution: 0.5,
      visibility: 0.1,
    },
  ],
  relations: [],
});

// ── Test map WITH explicit labelPosition ────────────────────────────
const MAP_CUSTOM_LABELS = sanitizeMap({
  title: "Custom labels",
  components: [
    {
      id: "db",
      label: "Database",
      type: "capacity",
      nature: "activity",
      evolution: 0.8,
      visibility: 0.6,
      labelPosition: { dx: 10, dy: -12 },
    },
  ],
  relations: [],
});

// ── Test map with negative dx (label to the left) ──────────────────
const MAP_LEFT_LABEL = sanitizeMap({
  title: "Left label",
  components: [
    {
      id: "api",
      label: "API Gateway",
      type: "capacity",
      nature: "activity",
      evolution: 0.9,
      visibility: 0.4,
      labelPosition: { dx: -15, dy: 0 },
    },
  ],
  relations: [],
});

// ── Mixed map: some with labelPosition, some without ────────────────
const MAP_MIXED = sanitizeMap({
  title: "Mixed labels",
  components: [
    {
      id: "user",
      label: "User",
      type: "anchor",
      nature: null,
      evolution: 0.5,
      visibility: 0.1,
      // No labelPosition → defaults
    },
    {
      id: "svc",
      label: "Service",
      type: "capacity",
      nature: "activity",
      evolution: 0.6,
      visibility: 0.5,
      labelPosition: { dx: 20, dy: 5 },
    },
    {
      id: "infra",
      label: "Infrastructure",
      type: "capacity",
      nature: "activity",
      evolution: 0.85,
      visibility: 0.8,
      labelPosition: { dx: -10, dy: -8 },
    },
  ],
  relations: [],
});

describe("Component label positioning (AC 8)", () => {
  describe("default labelPosition (omitted)", () => {
    const svg = renderMapToSVG(MAP_DEFAULT_LABELS);
    const texts = extractTexts(svg);

    it("renders a label for each component", () => {
      expect(findLabel(texts, "User")).toBeDefined();
    });

    it("defaults label to right of node (dx = NODE_RADIUS + 4)", () => {
      const label = findLabel(texts, "User")!;
      const cx = evoToX(0.5);
      const expectedX = cx + NODE_RADIUS + 4; // 5 + 4 = 9px right
      expect(label.x).toBeCloseTo(expectedX, 0);
    });

    it("defaults label dy to 4", () => {
      const label = findLabel(texts, "User")!;
      const cy = visToY(0.1);
      const expectedY = cy + 4;
      expect(label.y).toBeCloseTo(expectedY, 0);
    });

    it("uses text-anchor='start' for default (positive dx)", () => {
      const label = findLabel(texts, "User")!;
      expect(label.anchor).toBe("start");
    });
  });

  describe("explicit labelPosition { dx, dy }", () => {
    const svg = renderMapToSVG(MAP_CUSTOM_LABELS);
    const texts = extractTexts(svg);

    it("applies custom dx offset", () => {
      const label = findLabel(texts, "Database")!;
      const cx = evoToX(0.8);
      const expectedX = cx + 10;
      expect(label.x).toBeCloseTo(expectedX, 0);
    });

    it("applies custom dy offset", () => {
      const label = findLabel(texts, "Database")!;
      const cy = visToY(0.6);
      const expectedY = cy + (-12);
      expect(label.y).toBeCloseTo(expectedY, 0);
    });

    it("uses text-anchor='start' for positive dx", () => {
      const label = findLabel(texts, "Database")!;
      expect(label.anchor).toBe("start");
    });
  });

  describe("negative dx (label left of node)", () => {
    const svg = renderMapToSVG(MAP_LEFT_LABEL);
    const texts = extractTexts(svg);

    it("places label to the left with negative dx", () => {
      const label = findLabel(texts, "API Gateway")!;
      const cx = evoToX(0.9);
      const expectedX = cx + (-15);
      expect(label.x).toBeCloseTo(expectedX, 0);
    });

    it("uses text-anchor='end' for negative dx", () => {
      const label = findLabel(texts, "API Gateway")!;
      expect(label.anchor).toBe("end");
    });
  });

  describe("mixed map (some with/without labelPosition)", () => {
    const svg = renderMapToSVG(MAP_MIXED);
    const texts = extractTexts(svg);

    it("renders all three labels", () => {
      expect(findLabel(texts, "User")).toBeDefined();
      expect(findLabel(texts, "Service")).toBeDefined();
      expect(findLabel(texts, "Infrastructure")).toBeDefined();
    });

    it("User uses default offset (no labelPosition)", () => {
      const label = findLabel(texts, "User")!;
      const cx = evoToX(0.5);
      const expectedX = cx + NODE_RADIUS + 4;
      expect(label.x).toBeCloseTo(expectedX, 0);
    });

    it("Service uses custom offset { dx: 20, dy: 5 }", () => {
      const label = findLabel(texts, "Service")!;
      const cx = evoToX(0.6);
      expect(label.x).toBeCloseTo(cx + 20, 0);
      expect(label.anchor).toBe("start");
    });

    it("Infrastructure uses negative dx and flips anchor", () => {
      const label = findLabel(texts, "Infrastructure")!;
      const cx = evoToX(0.85);
      expect(label.x).toBeCloseTo(cx + (-10), 0);
      expect(label.anchor).toBe("end");
    });
  });

  describe("SVG output contains proper font styling", () => {
    const svg = renderMapToSVG(MAP_DEFAULT_LABELS);

    it("component labels use Inter font family", () => {
      expect(svg).toContain('font-family="Inter, sans-serif"');
    });

    it("component labels use font-size 12", () => {
      expect(svg).toContain('font-size="12"');
    });

    it("component labels use fill #333333", () => {
      expect(svg).toContain('fill="#333333"');
    });
  });
});
