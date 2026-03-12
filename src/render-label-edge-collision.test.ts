/**
 * Sub-AC 2 of AC 9: Label/relation-line collision detection.
 *
 * Tests that label bounding boxes are checked against edge path segments
 * and nudged when they overlap.
 */
import { describe, it, expect } from "vitest";
import {
  segmentIntersectsRect,
  avoidLabelCollisions,
  renderMapToSVG,
  type LabelPlacement,
  type EdgeSegment,
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
// Unit tests for avoidLabelCollisions with edges
// ────────────────────────────────────────────────────────────────────
describe("avoidLabelCollisions with edge segments", () => {
  it("does not move labels when no edges are present", () => {
    const labels: LabelPlacement[] = [
      { x: 100, y: 200, text: "Hello", anchor: "start" },
    ];
    const result = avoidLabelCollisions(labels, []);
    expect(result[0].y).toBe(200);
  });

  it("nudges a label that collides with an edge segment", () => {
    // Place a label at y=200, with a horizontal edge passing right through it
    const labels: LabelPlacement[] = [
      { x: 100, y: 200, text: "Component", anchor: "start" },
    ];
    // Edge passes horizontally through the label's bounding box
    const edges: EdgeSegment[] = [
      { x1: 50, y1: 200, x2: 300, y2: 200 },
    ];
    const result = avoidLabelCollisions(labels, edges);
    // The label should have been nudged away from its original y=200
    expect(result[0].y).not.toBe(200);
  });

  it("does not nudge a label that does not collide with any edge", () => {
    const labels: LabelPlacement[] = [
      { x: 100, y: 200, text: "Safe", anchor: "start" },
    ];
    // Edge is far away from the label
    const edges: EdgeSegment[] = [
      { x1: 500, y1: 500, x2: 600, y2: 600 },
    ];
    const result = avoidLabelCollisions(labels, edges);
    expect(result[0].y).toBe(200);
  });

  it("handles multiple labels, only nudging colliding ones", () => {
    const labels: LabelPlacement[] = [
      { x: 100, y: 200, text: "Collider", anchor: "start" },
      { x: 500, y: 400, text: "Safe", anchor: "start" },
    ];
    const edges: EdgeSegment[] = [
      { x1: 50, y1: 198, x2: 250, y2: 198 },
    ];
    const result = avoidLabelCollisions(labels, edges);
    // The colliding label should be moved
    expect(result[0].y).not.toBe(200);
    // The safe label should stay put
    expect(result[1].y).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────
// Integration test: renderMapToSVG with edge-label collision
// ────────────────────────────────────────────────────────────────────
describe("renderMapToSVG label-edge collision avoidance", () => {
  it("nudges label away from crossing edge in a simple map", () => {
    // Create a map where a label would normally overlap an edge:
    // Component A at (0.3, 0.5) with label to the right
    // Component B at (0.7, 0.5) — same visibility, so edge is horizontal
    // Component C at (0.5, 0.5) — its label sits right on the A→B edge
    const map = sanitizeMap({
      title: "Edge collision test",
      components: [
        { id: "a", label: "A", type: "anchor", nature: null, evolution: 0.3, visibility: 0.5 },
        { id: "b", label: "B", type: "anchor", nature: null, evolution: 0.7, visibility: 0.5 },
        { id: "c", label: "CLabel", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
      ],
      relations: [{ from: "a", to: "b" }],
    });

    const svg = renderMapToSVG(map);
    const texts = extractTexts(svg);
    const cLabel = texts.find((t) => t.content === "CLabel");

    expect(cLabel).toBeDefined();
    // The C label default position (right of node at same y) would sit on
    // the horizontal A→B edge. The collision avoidance should have moved it.
    const defaultY = visToY(0.5) + 4; // default dy=4
    // Allow some tolerance — it should be shifted by at least one lineHeight (~16px)
    expect(Math.abs(cLabel!.y - defaultY)).toBeGreaterThanOrEqual(10);
  });

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
