/**
 * Tests for segmentIntersectsRect (Liang-Barsky) and label positioning.
 */
import { describe, it, expect } from "vitest";
import {
  segmentIntersectsRect,
  renderMapToSVG,
} from "./render.js";
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

// ── Helper to extract <text> elements ───────────────────────────────
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

// ────────────────────────────────────────────────────────────────────
// Unit tests for segmentIntersectsRect
// ────────────────────────────────────────────────────────────────────
describe("segmentIntersectsRect", () => {
  const rect = { left: 100, top: 100, right: 200, bottom: 150 };

  it("returns true when segment passes through the rectangle", () => {
    // Diagonal line crossing the rect
    expect(segmentIntersectsRect(50, 50, 250, 200, rect.left, rect.top, rect.right, rect.bottom)).toBe(true);
  });

  it("returns true when segment is entirely inside the rectangle", () => {
    expect(segmentIntersectsRect(120, 110, 180, 140, rect.left, rect.top, rect.right, rect.bottom)).toBe(true);
  });

  it("returns false when segment is entirely above the rectangle", () => {
    expect(segmentIntersectsRect(100, 50, 200, 80, rect.left, rect.top, rect.right, rect.bottom)).toBe(false);
  });

  it("returns false when segment is entirely below the rectangle", () => {
    expect(segmentIntersectsRect(100, 160, 200, 200, rect.left, rect.top, rect.right, rect.bottom)).toBe(false);
  });

  it("returns false when segment is entirely to the left", () => {
    expect(segmentIntersectsRect(10, 100, 90, 150, rect.left, rect.top, rect.right, rect.bottom)).toBe(false);
  });

  it("returns false when segment is entirely to the right", () => {
    expect(segmentIntersectsRect(210, 100, 300, 150, rect.left, rect.top, rect.right, rect.bottom)).toBe(false);
  });

  it("returns true for a horizontal line crossing through", () => {
    expect(segmentIntersectsRect(50, 125, 250, 125, rect.left, rect.top, rect.right, rect.bottom)).toBe(true);
  });

  it("returns true for a vertical line crossing through", () => {
    expect(segmentIntersectsRect(150, 50, 150, 200, rect.left, rect.top, rect.right, rect.bottom)).toBe(true);
  });

  it("returns false for a vertical line outside the rect", () => {
    expect(segmentIntersectsRect(50, 50, 50, 200, rect.left, rect.top, rect.right, rect.bottom)).toBe(false);
  });

  it("returns true when segment touches the rectangle edge", () => {
    // Segment ending exactly at left edge
    expect(segmentIntersectsRect(50, 125, 100, 125, rect.left, rect.top, rect.right, rect.bottom)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Integration test: renderMapToSVG label positioning
// ────────────────────────────────────────────────────────────────────
describe("renderMapToSVG label positioning", () => {
  it("does not nudge labels when no edges cross them", () => {
    // Two components far apart with no edge between them
    const map = sanitizeMap({
      title: "No collision test",
      components: [
        { id: "x", label: "TopNode", type: "anchor", nature: null, evolution: 0.2, visibility: 0.1 },
        { id: "y", label: "BottomNode", type: "anchor", nature: null, evolution: 0.8, visibility: 0.9 },
      ],
      relations: [],
    });

    const svg = renderMapToSVG(map);
    const texts = extractTexts(svg);
    const topLabel = texts.find((t) => t.content === "TopNode");

    expect(topLabel).toBeDefined();
    // With no edges and no label-label collision, position should be default
    const expectedX = evoToX(0.2) + NODE_RADIUS + 4;
    const expectedY = visToY(0.1) + 4;
    expect(topLabel!.x).toBeCloseTo(expectedX, 0);
    expect(topLabel!.y).toBeCloseTo(expectedY, 0);
  });
});
