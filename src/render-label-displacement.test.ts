/**
 * Sub-AC 3 of AC 9: Label displacement/repositioning algorithm tests.
 *
 * Verifies that avoidLabelCollisions resolves detected collisions by
 * adjusting label anchor positions (trying alternate placements:
 * right, left, top, bottom of component node).
 */
import { describe, it, expect } from "vitest";
import {
  avoidLabelCollisions,
  type LabelPlacement,
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

// Helper to extract <text> elements from SVG
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

describe("Label displacement/repositioning algorithm (Sub-AC 3 of AC 9)", () => {
  describe("avoidLabelCollisions — alternate placement trials", () => {
    const CHAR_W = 7;
    const LINE_H = 16;
    const cx = 500;
    const cy = 400;

    it("returns labels unchanged when no collision exists", () => {
      const labels: LabelPlacement[] = [
        { x: 100, y: 100, text: "A", anchor: "start", nodeCx: 91, nodeCy: 96 },
        { x: 500, y: 500, text: "B", anchor: "start", nodeCx: 491, nodeCy: 496 },
      ];
      const result = avoidLabelCollisions(labels);
      // Labels far apart — should be essentially unchanged
      expect(result[0].x).toBe(100);
      expect(result[0].y).toBe(100);
      expect(result[1].x).toBe(500);
      expect(result[1].y).toBe(500);
    });

    it("repositions a colliding label to an alternate anchor (left/top/bottom)", () => {
      // Two labels at the same position → collision
      const labels: LabelPlacement[] = [
        { x: cx + 9, y: cy + 4, text: "Alpha", anchor: "start", nodeCx: cx, nodeCy: cy },
        { x: cx + 9, y: cy + 4, text: "Beta", anchor: "start", nodeCx: cx, nodeCy: cy },
      ];
      const result = avoidLabelCollisions(labels);

      // At least one label should have been repositioned (different x or anchor)
      const samePosition =
        result[0].x === result[1].x &&
        result[0].y === result[1].y &&
        result[0].anchor === result[1].anchor;
      expect(samePosition).toBe(false);
    });

    it("tries left placement (anchor=end) when right collides", () => {
      // Label A is at right of node, Label B overlaps it.
      // The algorithm should move B to left, top, or bottom.
      const labels: LabelPlacement[] = [
        { x: cx + 9, y: cy + 4, text: "Fixed", anchor: "start", nodeCx: cx, nodeCy: cy, pinned: true },
        { x: cx + 9, y: cy + 4, text: "Movable", anchor: "start", nodeCx: cx, nodeCy: cy },
      ];
      const result = avoidLabelCollisions(labels);

      // The pinned label should stay put
      expect(result[0].x).toBe(cx + 9);
      expect(result[0].y).toBe(cy + 4);

      // The movable label should have been repositioned
      const moved = result[1];
      const movedToAlternate =
        moved.anchor === "end" || // left
        moved.anchor === "middle"; // top or bottom
      expect(movedToAlternate).toBe(true);
    });

    it("pinned labels are not repositioned to alternate anchors", () => {
      const labels: LabelPlacement[] = [
        { x: cx + 9, y: cy + 4, text: "Pinned", anchor: "start", nodeCx: cx, nodeCy: cy, pinned: true },
        { x: cx + 9, y: cy + 4, text: "Other", anchor: "start", nodeCx: cx + 200, nodeCy: cy },
      ];
      const result = avoidLabelCollisions(labels);
      // Pinned label keeps its original x position
      expect(result[0].x).toBe(cx + 9);
    });

    it("labels without nodeCx/nodeCy skip alternate placement but still push-apart", () => {
      // Labels without node info — should fall through to vertical push-apart
      const labels: LabelPlacement[] = [
        { x: 200, y: 200, text: "NoNode1", anchor: "start" },
        { x: 200, y: 200, text: "NoNode2", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);
      // They should have been pushed apart vertically
      expect(result[0].y).not.toBe(result[1].y);
    });

    it("selects the candidate with the lowest overlap penalty", () => {
      // Three labels on one node: first two pinned, third must find best spot
      const labels: LabelPlacement[] = [
        // Pinned: right of node
        { x: cx + 9, y: cy + 4, text: "RightA", anchor: "start", nodeCx: cx, nodeCy: cy, pinned: true },
        // Pinned: left of node
        { x: cx - 9, y: cy + 4, text: "LeftB", anchor: "end", nodeCx: cx, nodeCy: cy, pinned: true },
        // Movable: starts at right, collides with RightA
        { x: cx + 9, y: cy + 4, text: "Move", anchor: "start", nodeCx: cx, nodeCy: cy },
      ];
      const result = avoidLabelCollisions(labels);
      const moved = result[2];
      // Right and left are taken, so it should go to top or bottom
      expect(moved.anchor).toBe("middle");
    });

    it("empty labels array returns empty", () => {
      expect(avoidLabelCollisions([])).toEqual([]);
    });
  });

  describe("renderMapToSVG integration — overlapping components get displaced labels", () => {
    it("two components at identical position produce non-overlapping labels", () => {
      const map = sanitizeMap({
        title: "Overlap test",
        components: [
          { id: "a", label: "Alpha", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
          { id: "b", label: "Beta", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
        ],
        relations: [],
      });
      const svg = renderMapToSVG(map);
      const texts = extractTexts(svg);
      const alpha = texts.find((t) => t.content === "Alpha")!;
      const beta = texts.find((t) => t.content === "Beta")!;

      expect(alpha).toBeDefined();
      expect(beta).toBeDefined();

      // Labels should not be at the exact same position
      const samePos = alpha.x === beta.x && alpha.y === beta.y;
      expect(samePos).toBe(false);
    });

    it("custom labelPosition marks label as pinned (not repositioned)", () => {
      const map = sanitizeMap({
        title: "Pinned test",
        components: [
          { id: "a", label: "Pinned", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5, labelPosition: { dx: 10, dy: -5 } },
          { id: "b", label: "Free", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
        ],
        relations: [],
      });
      const svg = renderMapToSVG(map);
      const texts = extractTexts(svg);
      const pinned = texts.find((t) => t.content === "Pinned")!;
      const cx = evoToX(0.5);
      const cy = visToY(0.5);

      // Pinned label should be at the exact custom position (possibly y-adjusted by push-apart but x stays)
      expect(pinned.x).toBeCloseTo(cx + 10, 0);
    });

    it("three overlapping components get distinct label positions", () => {
      const map = sanitizeMap({
        title: "Triple overlap",
        components: [
          { id: "a", label: "Service A", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
          { id: "b", label: "Service B", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
          { id: "c", label: "Service C", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
        ],
        relations: [],
      });
      const svg = renderMapToSVG(map);
      const texts = extractTexts(svg);
      const labels = ["Service A", "Service B", "Service C"].map(
        (name) => texts.find((t) => t.content === name)!
      );

      // All three should exist
      for (const l of labels) expect(l).toBeDefined();

      // No two labels should share the exact same (x, y, anchor) triplet
      const positions = labels.map((l) => `${l.x.toFixed(1)},${l.y.toFixed(1)},${l.anchor}`);
      const unique = new Set(positions);
      expect(unique.size).toBe(3);
    });
  });
});
