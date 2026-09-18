/**
 * Tests for label collision avoidance algorithm.
 *
 * Covers the three phases:
 *   Phase 1: Alternate placement (skips pinned)
 *   Phase 2: Vertical push-apart (respects pinned)
 *   Phase 3: Clamp inside plot area (skips pinned)
 */

import { describe, it, expect } from "vitest";
import { avoidLabelCollisions, type LabelPlacement } from "./label-placement.js";

describe("avoidLabelCollisions — pinned label support", () => {
  const charWidth = 7;
  const lineHeight = 16;

  it("pinned label is not moved by Phase 2 push-apart", () => {
    // Two overlapping labels at the same position, one pinned
    const labels: LabelPlacement[] = [
      { x: 100, y: 200, text: "Pinned", anchor: "start", pinned: true },
      { x: 100, y: 200, text: "Movable", anchor: "start", pinned: false },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight);

    // Pinned label should stay at its original y
    expect(result[0].y).toBe(200);
    // Movable label should have been pushed away
    expect(result[1].y).not.toBe(200);
  });

  it("pinned label is not clamped by Phase 3", () => {
    const plotBounds = { top: 24, bottom: 852 };
    // Pinned label outside the clamp zone
    const labels: LabelPlacement[] = [
      { x: 100, y: 10, text: "OutOfBounds", anchor: "start", pinned: true },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight, plotBounds);

    // Should remain at original position (not clamped to clampTop + lineHeight = 40)
    expect(result[0].y).toBe(10);
  });

  it("non-pinned label IS clamped by Phase 3", () => {
    const plotBounds = { top: 24, bottom: 852 };
    const labels: LabelPlacement[] = [
      { x: 100, y: 10, text: "OutOfBounds", anchor: "start", pinned: false },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight, plotBounds);

    // Should be clamped to clampTop + lineHeight = 40
    expect(result[0].y).toBe(24 + lineHeight);
  });

  it("when pinned and non-pinned overlap, only non-pinned moves", () => {
    const labels: LabelPlacement[] = [
      { x: 100, y: 300, text: "Fixed", anchor: "start", pinned: true },
      { x: 100, y: 302, text: "Flexible", anchor: "start", pinned: false },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight);

    // Pinned stays at 300
    expect(result[0].y).toBe(300);
    // Non-pinned moves away
    expect(result[1].y).not.toBe(302);
  });

  it("two pinned labels that overlap are both left in place", () => {
    const labels: LabelPlacement[] = [
      { x: 100, y: 200, text: "A", anchor: "start", pinned: true },
      { x: 100, y: 200, text: "B", anchor: "start", pinned: true },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight);

    expect(result[0].y).toBe(200);
    expect(result[1].y).toBe(200);
  });

  it("Phase 1 still skips pinned labels", () => {
    const labels: LabelPlacement[] = [
      {
        x: 100, y: 200, text: "Pinned",
        anchor: "start", pinned: true,
        nodeCx: 95, nodeCy: 196,
      },
      {
        x: 100, y: 200, text: "Movable",
        anchor: "start", pinned: false,
        nodeCx: 95, nodeCy: 196,
      },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight);

    // Pinned label should keep its original x (Phase 1 skip)
    expect(result[0].x).toBe(100);
    expect(result[0].anchor).toBe("start");
  });
});

describe("avoidLabelCollisions — multi-line labels", () => {
  const charWidth = 7;
  const lineHeight = 16;

  it("box width uses the longest line, height the line count", () => {
    // "Short" (5 chars) overlaps the second line of the two-line label only if
    // the box is two lines tall (y + lineHeight).
    const labels: LabelPlacement[] = [
      { x: 100, y: 200, text: "A very long first line\nb", anchor: "start", pinned: true },
      { x: 100, y: 200 + lineHeight, text: "Short", anchor: "start", pinned: false },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight);

    // Second label pushed away → the two-line box was measured as two lines
    expect(result[1].y).not.toBe(200 + lineHeight);
  });

  it("clamp leaves room for the lines below the first baseline", () => {
    const plotBounds = { top: 24, bottom: 852 };
    const labels: LabelPlacement[] = [
      { x: 100, y: 900, text: "one\ntwo\nthree", anchor: "start", pinned: false },
    ];

    const result = avoidLabelCollisions(labels, [], charWidth, lineHeight, plotBounds);

    // Last baseline (y + 2 × lineHeight) must land on the bottom bound
    expect(result[0].y).toBe(852 - 2 * lineHeight);
  });
});
