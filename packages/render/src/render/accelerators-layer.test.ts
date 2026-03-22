/**
 * Tests for AcceleratorsLayer — directional arrow rendering for accelerator/deaccelerator.
 *
 * @module render/accelerators-layer.test
 */

import { describe, it, expect } from "vitest";
import { renderAcceleratorsLayer, buildArrowPath } from "./accelerators-layer.js";
import { buildRenderContext } from "./build-context.js";
import type { WardleyMap } from "../schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Minimal valid WardleyMap for testing */
function baseMap(overrides: Partial<WardleyMap> = {}): WardleyMap {
  return {
    title: "Test",
    components: [],
    relations: [],
    ...overrides,
  } as WardleyMap;
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
    // Should have negative x values (left side of arrow)
    expect(d).toMatch(/M -\d/);
    // Should have positive x values (right side / tip)
    expect(d).toMatch(/L \d+(\.\d+)? 0/); // tip at y=0
  });
});

// ── renderAcceleratorsLayer ──────────────────────────────────────────

describe("renderAcceleratorsLayer", () => {
  it("returns empty array when no accelerators field", () => {
    const ctx = buildRenderContext(baseMap());
    const result = renderAcceleratorsLayer(ctx);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty accelerators array", () => {
    const ctx = buildRenderContext(baseMap({ accelerators: [] }));
    const result = renderAcceleratorsLayer(ctx);
    expect(result).toEqual([]);
  });

  it("renders an accelerator arrow (no rotation)", () => {
    const map = baseMap({
      accelerators: [
        {
          id: "acc-1",
          label: "Open Source",
          type: "accelerator",
          position: {
            evolution: { scalar: 0.5 },
            visibility: { scalar: 0.5 },
          },
        },
      ],
    });
    const ctx = buildRenderContext(map);
    const result = renderAcceleratorsLayer(ctx);

    // Primitives return combined path+text per accelerator
    expect(result).toHaveLength(1);

    // Arrow path — no rotate for accelerator
    const fragment = result[0];
    expect(fragment).toContain("<path");
    expect(fragment).toContain("translate(");
    expect(fragment).not.toContain("rotate(");

    // Label text
    expect(fragment).toContain("<text");
    expect(fragment).toContain("Open Source");
    expect(fragment).toContain('text-anchor="start"');
  });

  it("renders a deaccelerator arrow with rotate(180)", () => {
    const map = baseMap({
      accelerators: [
        {
          id: "deacc-1",
          label: "Legacy Lock-in",
          type: "deaccelerator",
          position: {
            evolution: { scalar: 0.3 },
            visibility: { scalar: 0.4 },
          },
        },
      ],
    });
    const ctx = buildRenderContext(map);
    const result = renderAcceleratorsLayer(ctx);

    // Primitives return combined path+text per accelerator
    expect(result).toHaveLength(1);

    // Arrow path — rotate(180) for deaccelerator
    const fragment = result[0];
    expect(fragment).toContain("<path");
    expect(fragment).toContain("rotate(180)");

    // Label text — anchor end (left of arrow for deaccelerator)
    expect(fragment).toContain("<text");
    expect(fragment).toContain("Legacy Lock-in");
    expect(fragment).toContain('text-anchor="end"');
  });

  it("renders mixed accelerators and deaccelerators", () => {
    const map = baseMap({
      accelerators: [
        {
          id: "acc-1",
          label: "Open Source",
          type: "accelerator",
          position: {
            evolution: { scalar: 0.5 },
            visibility: { scalar: 0.5 },
          },
        },
        {
          id: "deacc-1",
          label: "Regulation",
          type: "deaccelerator",
          position: {
            evolution: { scalar: 0.7 },
            visibility: { scalar: 0.3 },
          },
        },
      ],
    });
    const ctx = buildRenderContext(map);
    const result = renderAcceleratorsLayer(ctx);

    // 2 items × 1 combined fragment = 2
    expect(result).toHaveLength(2);

    // First accelerator: no rotation
    expect(result[0]).not.toContain("rotate(");
    // Second deaccelerator: rotate(180)
    expect(result[1]).toContain("rotate(180)");
  });

  it("positions arrows using evoToX/visToY coordinate conversion", () => {
    const map = baseMap({
      accelerators: [
        {
          id: "acc-pos",
          label: "Test",
          type: "accelerator",
          position: {
            evolution: { scalar: 0.75 },
            visibility: { scalar: 0.25 },
          },
        },
      ],
    });
    const ctx = buildRenderContext(map);
    const result = renderAcceleratorsLayer(ctx);

    const expectedX = ctx.evoToX(0.75);
    const expectedY = ctx.visToY(0.25);

    // The path transform should contain these coordinates
    expect(result[0]).toContain(`translate(${expectedX}, ${expectedY})`);
  });

  it("arrow path has fill and stroke attributes", () => {
    const map = baseMap({
      accelerators: [
        {
          id: "acc-style",
          label: "Test",
          type: "accelerator",
          position: {
            evolution: { scalar: 0.5 },
            visibility: { scalar: 0.5 },
          },
        },
      ],
    });
    const ctx = buildRenderContext(map);
    const result = renderAcceleratorsLayer(ctx);

    expect(result[0]).toContain('fill="#000000"');
    expect(result[0]).toContain('stroke="#000000"');
    expect(result[0]).toContain('stroke-width="1"');
  });
});
