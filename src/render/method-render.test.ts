/**
 * Tests for Method indicator rendering (single aura circle behind component).
 *
 * Verifies:
 *   - Single circle rendered per preconisation position
 *   - Position 0: ring only (stroke, no fill)
 *   - Position 1: semi-filled (40% opacity)
 *   - Position 2: solid fill (100% opacity)
 *   - Circle centered on component (no Y offset — background aura)
 *   - Color applied correctly
 */

import { describe, it, expect } from "vitest";
import {
  renderMethodIndicator,
  METHOD_AURA_R,
  METHOD_DEFAULT_COLOR,
} from "./nodes-layer.js";

describe("renderMethodIndicator", () => {
  const color = "#2563eb";

  it("renders exactly 1 circle for any position", () => {
    for (const pos of [0, 1, 2]) {
      const svg = renderMethodIndicator(100, 200, color, pos);
      const circleCount = (svg.match(/<circle /g) || []).length;
      expect(circleCount).toBe(1);
    }
  });

  it("centers circle on component (cx, cy — no offset)", () => {
    const svg = renderMethodIndicator(100, 200, color, 0);
    expect(svg).toContain('cx="100"');
    expect(svg).toContain('cy="200"');
  });

  it("uses METHOD_AURA_R radius", () => {
    const svg = renderMethodIndicator(100, 200, color, 0);
    expect(svg).toContain(`r="${METHOD_AURA_R}"`);
  });

  it("position 0: ring only (fill=none, stroke=color)", () => {
    const svg = renderMethodIndicator(100, 200, color, 0);
    expect(svg).toContain('fill="none"');
    expect(svg).toContain(`stroke="${color}"`);
  });

  it("position 1: semi-filled (fill-opacity=0.4)", () => {
    const svg = renderMethodIndicator(100, 200, color, 1);
    expect(svg).toContain(`fill="${color}"`);
    expect(svg).toContain('fill-opacity="0.4"');
    expect(svg).toContain(`stroke="${color}"`);
  });

  it("position 2: solid fill (fill-opacity=1)", () => {
    const svg = renderMethodIndicator(100, 200, color, 2);
    expect(svg).toContain(`fill="${color}"`);
    expect(svg).toContain('fill-opacity="1"');
    expect(svg).toContain(`stroke="${color}"`);
  });

  it("does not render any text labels", () => {
    const svg = renderMethodIndicator(100, 200, color, 0);
    expect(svg).not.toContain("<text");
  });

  it("works with any CSS color string", () => {
    const svg = renderMethodIndicator(50, 50, "#f59e0b", 2);
    expect(svg).toContain('stroke="#f59e0b"');
    expect(svg).toContain('fill="#f59e0b"');
  });
});

describe("Method constants", () => {
  it("METHOD_AURA_R is 16 (background aura radius)", () => {
    expect(METHOD_AURA_R).toBe(16);
  });

  it("METHOD_DEFAULT_COLOR is a valid hex color for unknown types", () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    expect(METHOD_DEFAULT_COLOR).toMatch(hexPattern);
  });
});
