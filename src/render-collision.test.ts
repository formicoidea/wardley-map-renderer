/**
 * Sub-AC 1 of AC 9: Label/label collision detection using AABB overlap checks.
 *
 * Verifies that:
 * - Overlapping labels are pushed apart vertically
 * - Non-overlapping labels remain unchanged
 * - Different anchor modes (start, end, middle) compute correct bounding boxes
 * - Labels are clamped inside the plot area after adjustment
 * - Multiple overlapping labels are all resolved
 * - The function is idempotent on already-separated labels
 */
import { describe, it, expect } from "vitest";
import { avoidLabelCollisions, type LabelPlacement } from "./render.js";
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
const PLOT_BOTTOM = H - AXIS_MARGIN_BOTTOM;
const NODE_RADIUS = 5;

const CHAR_WIDTH = 7; // default in avoidLabelCollisions
const LINE_HEIGHT = 16; // default in avoidLabelCollisions

/** Helper: compute AABB for a label (mirrors render.ts logic) */
function computeBox(l: LabelPlacement) {
  const textW = l.text.length * CHAR_WIDTH;
  let left: number, right: number;
  if (l.anchor === "start") {
    left = l.x;
    right = l.x + textW;
  } else if (l.anchor === "end") {
    left = l.x - textW;
    right = l.x;
  } else {
    left = l.x - textW / 2;
    right = l.x + textW / 2;
  }
  return {
    left,
    right,
    top: l.y - LINE_HEIGHT * 0.7,
    bottom: l.y + LINE_HEIGHT * 0.3,
  };
}

/** Check if two AABBs overlap */
function boxesOverlap(
  a: ReturnType<typeof computeBox>,
  b: ReturnType<typeof computeBox>
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe("Label collision detection — AABB overlap (Sub-AC 1 of AC 9)", () => {
  describe("non-overlapping labels remain unchanged", () => {
    it("leaves well-separated labels at their original positions", () => {
      const labels: LabelPlacement[] = [
        { x: 100, y: 100, text: "Alpha", anchor: "start" },
        { x: 100, y: 200, text: "Beta", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);
      expect(result[0].y).toBe(100);
      expect(result[1].y).toBe(200);
    });

    it("leaves horizontally separated labels unchanged even at same y", () => {
      // "Foo" at x=100 (start) spans [100, 121], "Bar" at x=500 spans [500, 521]
      const labels: LabelPlacement[] = [
        { x: 100, y: 200, text: "Foo", anchor: "start" },
        { x: 500, y: 200, text: "Bar", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);
      expect(result[0].y).toBe(200);
      expect(result[1].y).toBe(200);
    });
  });

  describe("overlapping labels are pushed apart", () => {
    it("separates two labels at the same position", () => {
      const labels: LabelPlacement[] = [
        { x: 300, y: 300, text: "CompA", anchor: "start" },
        { x: 300, y: 300, text: "CompB", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);

      // After collision resolution, labels should be separated
      const boxA = computeBox(result[0]);
      const boxB = computeBox(result[1]);
      expect(boxesOverlap(boxA, boxB)).toBe(false);
    });

    it("separates two labels that barely overlap vertically", () => {
      // lineHeight=16, box height spans from y-11.2 to y+4.8
      // If labels are 10px apart vertically, they overlap
      const labels: LabelPlacement[] = [
        { x: 300, y: 300, text: "Alpha", anchor: "start" },
        { x: 300, y: 310, text: "Beta", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);
      const boxA = computeBox(result[0]);
      const boxB = computeBox(result[1]);
      expect(boxesOverlap(boxA, boxB)).toBe(false);
    });

    it("pushes the upper label up and the lower label down", () => {
      const labels: LabelPlacement[] = [
        { x: 300, y: 300, text: "Top", anchor: "start" },
        { x: 300, y: 305, text: "Bottom", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);
      // First label should move up (smaller y), second should move down (larger y)
      expect(result[0].y).toBeLessThan(300);
      expect(result[1].y).toBeGreaterThan(305);
    });
  });

  describe("anchor modes affect bounding box correctly", () => {
    it("detects overlap for 'end' anchor labels", () => {
      // Two labels with anchor=end at same position
      const labels: LabelPlacement[] = [
        { x: 500, y: 400, text: "Left1", anchor: "end" },
        { x: 500, y: 404, text: "Left2", anchor: "end" },
      ];
      const result = avoidLabelCollisions(labels);
      const boxA = computeBox(result[0]);
      const boxB = computeBox(result[1]);
      expect(boxesOverlap(boxA, boxB)).toBe(false);
    });

    it("detects overlap for 'middle' anchor labels", () => {
      const labels: LabelPlacement[] = [
        { x: 500, y: 400, text: "Center1", anchor: "middle" },
        { x: 500, y: 404, text: "Center2", anchor: "middle" },
      ];
      const result = avoidLabelCollisions(labels);
      const boxA = computeBox(result[0]);
      const boxB = computeBox(result[1]);
      expect(boxesOverlap(boxA, boxB)).toBe(false);
    });

    it("does not detect overlap between 'start' and 'end' labels on opposite sides", () => {
      // "start" label at x=100 spans [100, 135], "end" label at x=100 spans [65, 100]
      // They share only the single point x=100 which is boundary, not overlap
      // Actually a.left < b.right => 100 < 100 is false, so no overlap
      const labels: LabelPlacement[] = [
        { x: 100, y: 300, text: "Right", anchor: "start" },
        { x: 100, y: 300, text: "Left!", anchor: "end" },
      ];
      const result = avoidLabelCollisions(labels);
      // They should NOT overlap since "start" starts at x=100 and "end" ends at x=100
      expect(result[0].y).toBe(300);
      expect(result[1].y).toBe(300);
    });
  });

  describe("multiple overlapping labels are all resolved", () => {
    it("separates three stacked labels", () => {
      const labels: LabelPlacement[] = [
        { x: 400, y: 400, text: "AAA", anchor: "start" },
        { x: 400, y: 403, text: "BBB", anchor: "start" },
        { x: 400, y: 406, text: "CCC", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);

      // No pair should overlap after resolution
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const boxI = computeBox(result[i]);
          const boxJ = computeBox(result[j]);
          expect(boxesOverlap(boxI, boxJ)).toBe(false);
        }
      }
    });

    it("separates five closely packed labels", () => {
      const labels: LabelPlacement[] = [];
      for (let i = 0; i < 5; i++) {
        labels.push({ x: 500, y: 400 + i * 3, text: `Label${i}`, anchor: "start" });
      }
      const result = avoidLabelCollisions(labels);

      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const boxI = computeBox(result[i]);
          const boxJ = computeBox(result[j]);
          expect(boxesOverlap(boxI, boxJ)).toBe(false);
        }
      }
    });
  });

  describe("labels clamped inside plot area", () => {
    it("clamps label near top of plot area", () => {
      // Place label very close to top — after collision push, it shouldn't go above PLOT_TOP + lineHeight
      const labels: LabelPlacement[] = [
        { x: 300, y: PLOT_TOP + 5, text: "Near Top A", anchor: "start" },
        { x: 300, y: PLOT_TOP + 8, text: "Near Top B", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);
      // Both labels should have y >= PLOT_TOP + LINE_HEIGHT (clamped)
      for (const l of result) {
        expect(l.y).toBeGreaterThanOrEqual(PLOT_TOP + LINE_HEIGHT);
      }
    });

    it("clamps label near bottom of plot area", () => {
      const labels: LabelPlacement[] = [
        { x: 300, y: PLOT_BOTTOM - 3, text: "Near Bot A", anchor: "start" },
        { x: 300, y: PLOT_BOTTOM - 1, text: "Near Bot B", anchor: "start" },
      ];
      const result = avoidLabelCollisions(labels);
      for (const l of result) {
        expect(l.y).toBeLessThanOrEqual(PLOT_BOTTOM);
      }
    });
  });

  describe("idempotency", () => {
    it("running collision avoidance twice produces same result", () => {
      const labels: LabelPlacement[] = [
        { x: 300, y: 300, text: "CompA", anchor: "start" },
        { x: 300, y: 305, text: "CompB", anchor: "start" },
      ];
      const pass1 = avoidLabelCollisions(labels);
      // Make deep copies for second pass
      const pass1Copy = pass1.map((l) => ({ ...l }));
      const pass2 = avoidLabelCollisions(pass1Copy);
      expect(pass2[0].y).toBeCloseTo(pass1[0].y, 5);
      expect(pass2[1].y).toBeCloseTo(pass1[1].y, 5);
    });
  });

  describe("integration: collision avoidance in full SVG render", () => {
    it("renders overlapping components with non-overlapping labels", () => {
      const map = sanitizeMap({
        title: "Collision Test",
        components: [
          { id: "a", label: "Component Alpha", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
          { id: "b", label: "Component Beta", type: "capacity", nature: "activity", evolution: 0.5, visibility: 0.5 },
          { id: "c", label: "Component Gamma", type: "capacity", nature: "activity", evolution: 0.51, visibility: 0.51 },
        ],
        relations: [],
      });

      const svg = renderMapToSVG(map);

      // Extract label positions from SVG
      const textRegex = /<text\s+([^>]*)>([^<]*)<\/text>/g;
      const labelTexts: { x: number; y: number; anchor: string; content: string }[] = [];
      let m: RegExpExecArray | null;
      while ((m = textRegex.exec(svg)) !== null) {
        const content = m[2];
        if (content.startsWith("Component ")) {
          const attrs = m[1];
          const xMatch = attrs.match(/x="([^"]+)"/);
          const yMatch = attrs.match(/y="([^"]+)"/);
          const anchorMatch = attrs.match(/text-anchor="([^"]+)"/);
          if (xMatch && yMatch) {
            labelTexts.push({
              x: parseFloat(xMatch[1]),
              y: parseFloat(yMatch[1]),
              anchor: anchorMatch ? anchorMatch[1] : "start",
              content,
            });
          }
        }
      }

      expect(labelTexts).toHaveLength(3);

      // Verify no two labels overlap using AABB checks
      for (let i = 0; i < labelTexts.length; i++) {
        for (let j = i + 1; j < labelTexts.length; j++) {
          const a = labelTexts[i];
          const b = labelTexts[j];
          const boxA = computeBox({
            x: a.x,
            y: a.y,
            text: a.content,
            anchor: a.anchor as "start" | "end" | "middle",
          });
          const boxB = computeBox({
            x: b.x,
            y: b.y,
            text: b.content,
            anchor: b.anchor as "start" | "end" | "middle",
          });
          expect(boxesOverlap(boxA, boxB)).toBe(false);
        }
      }
    });
  });
});
