/**
 * Tests for StepsLayer — filled circles with white centred numbers.
 *
 * Covers:
 *   - No steps → empty array
 *   - Single step renders circle + number text
 *   - Circle is filled (not hollow)
 *   - Number is white and centred (text-anchor="middle", dominant-baseline="central")
 *   - Default colour (red #cc0000)
 *   - Custom colour override via step.color
 *   - Multiple steps render independently
 *   - Step number appears as text content
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderStepsLayer } from "./steps-layer.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeMap(overrides: Record<string, unknown> = {}): WardleyMap {
  return sanitizeMap(
    WardleyMapSchema.parse({
      title: "Test",
      components: [
        {
          id: "a",
          label: { name: "Svc" },
          type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [],
      ...overrides,
    })
  );
}

function renderSteps(overrides: Record<string, unknown> = {}): string[] {
  const map = makeMap(overrides);
  const ctx = buildRenderContext(map);
  return renderStepsLayer(ctx);
}

function joined(overrides: Record<string, unknown> = {}): string {
  return renderSteps(overrides).join("\n");
}

// ── No steps ─────────────────────────────────────────────────────────

describe("StepsLayer — no steps", () => {
  it("returns empty array when steps is undefined", () => {
    expect(renderSteps()).toEqual([]);
  });

  it("returns empty array when steps is empty array", () => {
    expect(renderSteps({ steps: [] })).toEqual([]);
  });
});

// ── Single step ──────────────────────────────────────────────────────

describe("StepsLayer — single step", () => {
  const steps = [
    {
      number: 1,
      position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.4 } },
    },
  ];

  it("renders a circle element", () => {
    const svg = joined({ steps });
    expect(svg).toContain("<circle");
  });

  it("renders a text element with the step number", () => {
    const svg = joined({ steps });
    expect(svg).toContain(">1</text>");
  });

  it("circle is filled (fill != none, fill != #ffffff)", () => {
    const svg = joined({ steps });
    // Filled circle: fill should be the default red
    expect(svg).toContain('fill="#cc0000"');
  });

  it("circle has stroke=none (no border)", () => {
    const svg = joined({ steps });
    expect(svg).toContain('stroke="none"');
  });

  it("text is white", () => {
    const svg = joined({ steps });
    expect(svg).toContain('fill="#ffffff"');
  });

  it("text is centred horizontally", () => {
    const svg = joined({ steps });
    expect(svg).toContain('text-anchor="middle"');
  });

  it("text is centred vertically", () => {
    const svg = joined({ steps });
    expect(svg).toContain('dominant-baseline="central"');
  });

  it("text is bold", () => {
    const svg = joined({ steps });
    expect(svg).toContain('font-weight="bold"');
  });

  it("renders exactly 2 elements (circle + text)", () => {
    const parts = renderSteps({ steps });
    expect(parts).toHaveLength(2);
  });
});

// ── Custom colour ────────────────────────────────────────────────────

describe("StepsLayer — custom colour", () => {
  it("uses step.color when provided", () => {
    const steps = [
      {
        number: 2,
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        color: "#3366ff",
      },
    ];
    const svg = joined({ steps });
    expect(svg).toContain('fill="#3366ff"');
    // Should NOT contain default red as fill
    expect(svg).not.toContain('fill="#cc0000"');
  });

  it("resolves named colour tokens via resolveColor", () => {
    const steps = [
      {
        number: 3,
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        color: "blue-600",
      },
    ];
    const svg = joined({ steps });
    // resolveColor("blue-600") → "#2563eb" via COLOR_MAP
    expect(svg).toContain('fill="#2563eb"');
  });
});

// ── Multiple steps ───────────────────────────────────────────────────

describe("StepsLayer — multiple steps", () => {
  const steps = [
    {
      number: 1,
      position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.3 } },
    },
    {
      number: 2,
      position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.7 } },
    },
    {
      number: 3,
      position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.9 } },
      color: "#00cc00",
    },
  ];

  it("renders 6 elements (2 per step × 3 steps)", () => {
    const parts = renderSteps({ steps });
    expect(parts).toHaveLength(6);
  });

  it("contains all step numbers", () => {
    const svg = joined({ steps });
    expect(svg).toContain(">1</text>");
    expect(svg).toContain(">2</text>");
    expect(svg).toContain(">3</text>");
  });

  it("step 3 uses custom colour", () => {
    const parts = renderSteps({ steps });
    // Step 3's circle (index 4) should use green
    expect(parts[4]).toContain('fill="#00cc00"');
  });
});

// ── Position mapping ─────────────────────────────────────────────────

describe("StepsLayer — position mapping", () => {
  it("maps evolution and visibility to pixel coordinates", () => {
    const steps = [
      {
        number: 1,
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
      },
    ];
    const map = makeMap({ steps });
    const ctx = buildRenderContext(map);
    const parts = renderStepsLayer(ctx);

    // Circle and text should contain cx/x coordinates computed from evoToX/visToY
    const expectedX = ctx.evoToX(0.5);
    const expectedY = ctx.visToY(0.5);

    expect(parts[0]).toContain(`cx="${expectedX}"`);
    expect(parts[0]).toContain(`cy="${expectedY}"`);
    expect(parts[1]).toContain(`x="${expectedX}"`);
    expect(parts[1]).toContain(`y="${expectedY}"`);
  });
});
