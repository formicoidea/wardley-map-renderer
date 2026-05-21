/**
 * Tests for AcceleratorsLayer — directional arrow rendering for the
 * accelerator / deaccelerator COMPONENT DECORATORS.
 *
 * @module render/accelerators-layer.test
 */

import { describe, it, expect } from "vitest";
import { renderAcceleratorsLayer, buildArrowPath } from "./accelerators-layer.js";
import { buildRenderContext } from "./build-context.js";
import { WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

interface AccelSpec {
  kind?: "accelerator" | "deaccelerator";
  evolution: number;
  visibility: number;
  name?: string;
}

/** Build a map whose components carry accelerator/deaccelerator decorators. */
function mapWithAccels(specs: AccelSpec[] = []): WardleyMap {
  return WardleyMapSchema.parse({
    title: "Test",
    components: specs.map((s, i) => ({
      id: `a${i}`,
      label: { name: s.name ?? `A${i}` },
      type: "component",
      position: { evolution: { scalar: s.evolution }, visibility: { scalar: s.visibility } },
      ...(s.kind === "deaccelerator" ? { deaccelerator: true } : s.kind === "accelerator" ? { accelerator: true } : {}),
    })),
    relations: [],
  });
}

// ── buildArrowPath ──────────────────────────────────────────────────

describe("buildArrowPath", () => {
  it("returns a valid SVG path string", () => {
    const d = buildArrowPath();
    expect(d).toContain("M ");
    expect(d).toContain("L ");
    expect(d).toContain("Z");
  });

  it("is a closed path (ends with Z)", () => {
    const d = buildArrowPath();
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("is centred around origin (has negative and positive coordinates)", () => {
    const d = buildArrowPath();
    expect(d).toMatch(/M -\d/);
    expect(d).toMatch(/L \d+(\.\d+)? 0/);
  });
});

// ── renderAcceleratorsLayer ──────────────────────────────────────────

describe("renderAcceleratorsLayer", () => {
  it("returns empty array when no component carries a gameplay decorator", () => {
    const ctx = buildRenderContext(mapWithAccels([{ evolution: 0.5, visibility: 0.5 }]));
    expect(renderAcceleratorsLayer(ctx)).toEqual([]);
  });

  it("returns empty array for a map with no components", () => {
    const ctx = buildRenderContext(mapWithAccels([]));
    expect(renderAcceleratorsLayer(ctx)).toEqual([]);
  });

  it("renders an accelerator arrow (no rotation)", () => {
    const ctx = buildRenderContext(mapWithAccels([{ kind: "accelerator", evolution: 0.5, visibility: 0.5 }]));
    const result = renderAcceleratorsLayer(ctx);
    expect(result).toHaveLength(1);
    const fragment = result[0];
    expect(fragment).toContain("<path");
    expect(fragment).toContain("translate(");
    expect(fragment).not.toContain("rotate(");
  });

  it("renders a deaccelerator arrow with rotate(180)", () => {
    const ctx = buildRenderContext(mapWithAccels([{ kind: "deaccelerator", evolution: 0.3, visibility: 0.4 }]));
    const result = renderAcceleratorsLayer(ctx);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<path");
    expect(result[0]).toContain("rotate(180)");
  });

  it("renders mixed accelerators and deaccelerators in component order", () => {
    const ctx = buildRenderContext(mapWithAccels([
      { kind: "accelerator", evolution: 0.5, visibility: 0.5 },
      { kind: "deaccelerator", evolution: 0.7, visibility: 0.3 },
    ]));
    const result = renderAcceleratorsLayer(ctx);
    expect(result).toHaveLength(2);
    expect(result[0]).not.toContain("rotate(");
    expect(result[1]).toContain("rotate(180)");
  });

  it("positions the accelerator to the right of the node (y unchanged)", () => {
    const ctx = buildRenderContext(mapWithAccels([{ kind: "accelerator", evolution: 0.75, visibility: 0.25 }]));
    const result = renderAcceleratorsLayer(ctx);
    const expectedX = ctx.evoToX(0.75);
    const expectedY = ctx.visToY(0.25);
    const m = result[0].match(/translate\(([-\d.]+), ([-\d.]+)\)/);
    expect(m).not.toBeNull();
    const [, txStr, tyStr] = m!;
    // The arrow sits beside the node at the same height
    expect(Number(tyStr)).toBeCloseTo(expectedY, 6);
    // Accelerator is offset to the right of the node center
    expect(Number(txStr)).toBeGreaterThan(expectedX);
  });

  it("positions the deaccelerator to the left of the node (y unchanged)", () => {
    const ctx = buildRenderContext(mapWithAccels([{ kind: "deaccelerator", evolution: 0.75, visibility: 0.25 }]));
    const result = renderAcceleratorsLayer(ctx);
    const expectedX = ctx.evoToX(0.75);
    const expectedY = ctx.visToY(0.25);
    const m = result[0].match(/translate\(([-\d.]+), ([-\d.]+)\)/);
    expect(m).not.toBeNull();
    const [, txStr, tyStr] = m!;
    expect(Number(tyStr)).toBeCloseTo(expectedY, 6);
    // Deaccelerator is offset to the left of the node center
    expect(Number(txStr)).toBeLessThan(expectedX);
  });

  it("arrow path has fill and stroke attributes", () => {
    const ctx = buildRenderContext(mapWithAccels([{ kind: "accelerator", evolution: 0.5, visibility: 0.5 }]));
    const result = renderAcceleratorsLayer(ctx);
    expect(result[0]).toContain('fill="#000000"');
    expect(result[0]).toContain('stroke="#000000"');
    expect(result[0]).toContain('stroke-width="1"');
  });
});
