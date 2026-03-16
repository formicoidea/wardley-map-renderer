/**
 * Label collision avoidance algorithm.
 *
 * Extracted from the monolithic render.ts for use in the modular
 * render pipeline's labels-layer.
 *
 * Three-phase algorithm:
 *   Phase 1: Alternate placement (4 candidates: right, left, top, bottom)
 *   Phase 2: Vertical push-apart for remaining overlaps
 *   Phase 3: Label-edge collision avoidance (Liang-Barsky)
 *   Final: Clamp inside plot area
 *
 * @module label-placement
 */

// ── Default layout constants ─────────────────────────────────────────
const DEFAULT_PLOT_TOP = 24;
const DEFAULT_PLOT_BOTTOM = 852; // 900 - 48
const NODE_RADIUS = 5;

// ── Types ────────────────────────────────────────────────────────────

export interface LabelPlacement {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  /** Component node center — used for alternate placement trials */
  nodeCx?: number;
  nodeCy?: number;
  /** Whether this label has a user-specified labelPosition (skip repositioning) */
  pinned?: boolean;
}

/** A line segment representing a relation edge in pixel coordinates */
export interface EdgeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Plot area bounds for label clamping */
export interface PlotBounds {
  top: number;
  bottom: number;
}

// ── Internal types ───────────────────────────────────────────────────

interface LabelBox {
  label: LabelPlacement;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function labelToBox(l: LabelPlacement, charWidth: number, lineHeight: number): LabelBox {
  const textW = l.text.length * charWidth;
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
    label: l,
    left,
    right,
    top: l.y - lineHeight * 0.7,
    bottom: l.y + lineHeight * 0.3,
  };
}

export function segmentIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  left: number, top: number, right: number, bottom: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - left, right - x1, y1 - top, bottom - y1];
  let tMin = 0;
  let tMax = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-10) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        tMin = Math.max(tMin, t);
      } else {
        tMax = Math.min(tMax, t);
      }
      if (tMin > tMax) return false;
    }
  }
  return true;
}

const LABEL_CANDIDATES: { dx: number; dy: number; anchor: "start" | "end" | "middle" }[] = [
  { dx: NODE_RADIUS + 4, dy: 4, anchor: "start" },
  { dx: -(NODE_RADIUS + 4), dy: 4, anchor: "end" },
  { dx: 0, dy: -(NODE_RADIUS + 6), anchor: "middle" },
  { dx: 0, dy: NODE_RADIUS + 14, anchor: "middle" },
];

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function placementPenalty(box: LabelBox, others: LabelBox[], selfIndex: number, edges: EdgeSegment[]): number {
  let penalty = 0;
  for (let k = 0; k < others.length; k++) {
    if (k === selfIndex) continue;
    const other = others[k];
    if (boxesOverlap(box, other)) {
      const ox = Math.min(box.right, other.right) - Math.max(box.left, other.left);
      const oy = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
      penalty += ox * oy * 1000;
    }
  }
  for (const e of edges) {
    if (segmentIntersectsRect(e.x1, e.y1, e.x2, e.y2, box.left, box.top, box.right, box.bottom)) {
      penalty += 1;
    }
  }
  return penalty;
}

// ── Main algorithm ───────────────────────────────────────────────────

export function avoidLabelCollisions(
  labels: LabelPlacement[],
  edges: EdgeSegment[] = [],
  charWidth = 7,
  lineHeight = 16,
  plotBounds?: PlotBounds
): LabelPlacement[] {
  const clampTop = plotBounds?.top ?? DEFAULT_PLOT_TOP;
  const clampBottom = plotBounds?.bottom ?? DEFAULT_PLOT_BOTTOM;
  const boxes: LabelBox[] = labels.map((l) => labelToBox(l, charWidth, lineHeight));

  // Phase 1: Alternate-placement repositioning
  for (let i = 0; i < boxes.length; i++) {
    const lbl = boxes[i].label;
    if (lbl.pinned) continue;
    if (lbl.nodeCx == null || lbl.nodeCy == null) continue;

    const currentPenalty = placementPenalty(boxes[i], boxes, i, edges);
    let bestPenalty = currentPenalty;
    let bestCandidate: LabelPlacement | null = null;

    for (const cand of LABEL_CANDIDATES) {
      const trial: LabelPlacement = {
        ...lbl,
        x: lbl.nodeCx + cand.dx,
        y: lbl.nodeCy + cand.dy,
        anchor: cand.anchor,
      };
      const trialBox = labelToBox(trial, charWidth, lineHeight);
      const saved = boxes[i];
      boxes[i] = trialBox;
      const penalty = placementPenalty(trialBox, boxes, i, edges);
      boxes[i] = saved;

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestCandidate = trial;
        if (penalty === 0) break;
      }
    }

    if (bestCandidate) {
      boxes[i] = labelToBox(bestCandidate, charWidth, lineHeight);
    }
  }

  // Phase 2: Vertical push-apart for remaining overlaps
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (boxesOverlap(a, b)) {
          const overlapY = Math.min(a.bottom - b.top, b.bottom - a.top);
          const shift = overlapY / 2 + 2;
          if (a.label.y <= b.label.y) {
            a.label.y -= shift; a.top -= shift; a.bottom -= shift;
            b.label.y += shift; b.top += shift; b.bottom += shift;
          } else {
            b.label.y -= shift; b.top -= shift; b.bottom -= shift;
            a.label.y += shift; a.top += shift; a.bottom += shift;
          }
        }
      }
    }
  }

  // Clamp labels inside plot area
  for (const b of boxes) {
    if (b.label.y < clampTop + lineHeight) b.label.y = clampTop + lineHeight;
    if (b.label.y > clampBottom) b.label.y = clampBottom;
  }

  return boxes.map((b) => b.label);
}
