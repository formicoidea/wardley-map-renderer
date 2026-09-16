/**
 * Tests for inertia barrier rendering.
 *
 * Inertia is a boolean on EvolvesToSchema. When true, thick vertical lines
 * (strokeWidth=6) are rendered at each phase boundary the evolution arrow crosses.
 *
 * Phase boundaries: 0.175 (Genesis→Custom), 0.4 (Custom→Product), 0.7 (Product→Commodity)
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderEvolvesToLayer } from "./evolvesto-layer.js";
import { EVO_RANGE_OFFSET_Y } from "./svg-primitives.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";

// ── Test fixtures ───────────────────────────────────────────────────

function makeMapWithInertia(overrides: Record<string, unknown> = {}): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Inertia Map",
    components: [
      {
        id: "a",
        label: { name: "Legacy" },
        type: "component",
        position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.5 } },
        evolvesTo: [
          {
            position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.5 } },
            evolveType: "natural",
            inertia: true,
          },
        ],
      },
    ],
    relations: [],
    ...overrides,
  }));
}

function makeMapWithoutInertia(): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "No Inertia Map",
    components: [
      {
        id: "a",
        label: { name: "Service" },
        type: "component",
        position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.5 } },
        evolvesTo: [
          {
            position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.5 } },
            evolveType: "natural",
          },
        ],
      },
    ],
    relations: [],
  }));
}

// ═══════════════════════════════════════════════════════════════════
// Inertia barrier rendering
// ═══════════════════════════════════════════════════════════════════

describe("Inertia barrier rendering", () => {
  it("renders thick vertical lines at crossed phase boundaries when inertia=true", () => {
    // Component at evo=0.3 evolves to evo=0.8 → crosses 0.4 and 0.7 boundaries
    const map = makeMapWithInertia();
    const ctx = buildRenderContext(map);

    // Should have 2 inertia barriers (at 0.4 and 0.7)
    expect(ctx.inertiaBarriers).toHaveLength(2);

    const parts = renderEvolvesToLayer(ctx);
    // Find lines with stroke-width="6" (inertia barriers)
    const inertiaLines = parts.filter((p) => p.includes('stroke-width="6"'));
    expect(inertiaLines).toHaveLength(2);
  });

  it("inertia barriers use strokeWidth=6", () => {
    const map = makeMapWithInertia();
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    const inertiaLines = parts.filter((p) => p.includes('stroke-width="6"'));
    expect(inertiaLines.length).toBeGreaterThan(0);
    for (const line of inertiaLines) {
      expect(line).toContain('stroke-width="6"');
    }
  });

  it("inertia barriers are black vertical lines", () => {
    const map = makeMapWithInertia();
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    const inertiaLines = parts.filter((p) => p.includes('stroke-width="6"'));
    for (const line of inertiaLines) {
      expect(line).toContain('stroke="#000000"');
      // Vertical line: x1 === x2
      const x1Match = line.match(/x1="([^"]+)"/);
      const x2Match = line.match(/x2="([^"]+)"/);
      expect(x1Match).not.toBeNull();
      expect(x2Match).not.toBeNull();
      expect(x1Match![1]).toBe(x2Match![1]);
    }
  });

  it("no inertia barriers when inertia flag is absent", () => {
    const map = makeMapWithoutInertia();
    const ctx = buildRenderContext(map);

    expect(ctx.inertiaBarriers).toHaveLength(0);

    const parts = renderEvolvesToLayer(ctx);
    const inertiaLines = parts.filter((p) => p.includes('stroke-width="6"'));
    expect(inertiaLines).toHaveLength(0);
  });

  it("no inertia barriers when inertia=false", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "No Inertia Map",
      components: [
        {
          id: "a",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
              inertia: false,
            },
          ],
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    expect(ctx.inertiaBarriers).toHaveLength(0);
  });

  it("single boundary crossing produces one inertia barrier", () => {
    // evo 0.3 → 0.5 crosses only the 0.4 boundary
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Single Boundary",
      components: [
        {
          id: "a",
          label: { name: "Component" },
          type: "component",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
              inertia: true,
            },
          ],
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    expect(ctx.inertiaBarriers).toHaveLength(1);
  });

  it("inertia barrier x position matches phase boundary pixel coordinate", () => {
    // evo 0.3 → 0.5 crosses the 0.4 boundary
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Boundary Position",
      components: [
        {
          id: "a",
          label: { name: "Component" },
          type: "component",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
              inertia: true,
            },
          ],
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    expect(ctx.inertiaBarriers).toHaveLength(1);

    // The barrier x should match evoToX(0.4)
    const expectedX = ctx.evoToX(0.4);
    expect(ctx.inertiaBarriers[0].x).toBeCloseTo(expectedX, 1);
  });

  it("evolution arrow without boundary crossing produces no inertia barrier", () => {
    // evo 0.5 → 0.6 stays within Product phase (0.4-0.7), no boundary crossed
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "No Crossing",
      components: [
        {
          id: "a",
          label: { name: "Component" },
          type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
              inertia: true,
            },
          ],
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    expect(ctx.inertiaBarriers).toHaveLength(0);
  });

  it("crosses all three boundaries when evo spans full range", () => {
    // evo 0.1 → 0.9 crosses all three: 0.175, 0.4, 0.7
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "All Boundaries",
      components: [
        {
          id: "a",
          label: { name: "Component" },
          type: "component",
          position: { evolution: { scalar: 0.1 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
              inertia: true,
            },
          ],
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    expect(ctx.inertiaBarriers).toHaveLength(3);
  });

  it("inertia barriers are part of geometry.inertiaBarriers", () => {
    const map = makeMapWithInertia();
    const ctx = buildRenderContext(map);
    expect(ctx.geometry.inertiaBarriers).toBe(ctx.inertiaBarriers);
    expect(ctx.geometry.inertiaBarriers).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Component-level inertia bar + evolution range
// ═══════════════════════════════════════════════════════════════════

function mapWith(comp: Record<string, unknown>): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Decorators",
    components: [{
      id: "a",
      label: { name: "A" },
      type: "component",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
      ...comp,
    }],
    relations: [],
  }));
}

const thick = (parts: string[]) => parts.filter((p) => p.includes('stroke-width="6"'));
const num = (s: string, attr: string) => Number(s.match(new RegExp(`${attr}="([^"]+)"`))![1]);

describe("Component-level inertia bar", () => {
  it("draws one short vertical bar right of the node when inertia=true", () => {
    const ctx = buildRenderContext(mapWith({ inertia: true }));
    const bars = thick(renderEvolvesToLayer(ctx));
    expect(bars).toHaveLength(1);
    const node = ctx.nodes[0];
    expect(num(bars[0], "x1")).toBe(num(bars[0], "x2"));
    expect(num(bars[0], "x1")).toBeGreaterThan(node.cx);
    expect(num(bars[0], "y1")).toBeLessThan(node.cy);
    expect(num(bars[0], "y2")).toBeGreaterThan(node.cy);
  });

  it("draws nothing when inertia is absent or false", () => {
    expect(thick(renderEvolvesToLayer(buildRenderContext(mapWith({}))))).toHaveLength(0);
    expect(thick(renderEvolvesToLayer(buildRenderContext(mapWith({ inertia: false }))))).toHaveLength(0);
  });

  it("points towards a leftward evolvesTo target", () => {
    const ctx = buildRenderContext(mapWith({
      inertia: true,
      evolvesTo: [{ position: { evolution: { scalar: 0.45 }, visibility: { scalar: 0.5 } } }],
    }));
    const bars = thick(renderEvolvesToLayer(ctx));
    expect(bars).toHaveLength(1);
    expect(num(bars[0], "x1")).toBeLessThan(ctx.nodes[0].cx);
  });

  it("is not double-drawn when an inertia evolvesTo arrow already draws barriers", () => {
    const ctx = buildRenderContext(mapWith({
      inertia: true,
      evolvesTo: [{ position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.5 } }, inertia: true }],
    }));
    // only the phase barrier at 0.7
    const bars = thick(renderEvolvesToLayer(ctx));
    expect(bars).toHaveLength(1);
    expect(num(bars[0], "x1")).toBeCloseTo(ctx.evoToX(0.7), 5);
  });
});

describe("Evolution range line", () => {
  it("spans evoToX(min)→evoToX(max) just below the node's y, before arrows", () => {
    const ctx = buildRenderContext(mapWith({
      position: { evolution: { scalar: 0.5, range: [0.3, 0.65] }, visibility: { scalar: 0.4 } },
      evolvesTo: [{ position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.4 } } }],
    }));
    const parts = renderEvolvesToLayer(ctx);
    const idx = parts.findIndex((p) => p.includes('class="evo-range"'));
    expect(idx).toBe(0);
    const main = parts[idx].match(/<line [^>]*\/>/)![0];
    expect(num(main, "x1")).toBeCloseTo(ctx.evoToX(0.3), 5);
    expect(num(main, "x2")).toBeCloseTo(ctx.evoToX(0.65), 5);
    expect(num(main, "y1")).toBeCloseTo(ctx.visToY(0.4) + EVO_RANGE_OFFSET_Y, 5);
    expect(num(main, "y2")).toBeCloseTo(ctx.visToY(0.4) + EVO_RANGE_OFFSET_Y, 5);
    expect(parts[idx]).toContain('stroke-opacity="0.3"');
  });

  it("is absent when no range is set", () => {
    const parts = renderEvolvesToLayer(buildRenderContext(mapWith({})));
    expect(parts.some((p) => p.includes("evo-range"))).toBe(false);
  });
});
