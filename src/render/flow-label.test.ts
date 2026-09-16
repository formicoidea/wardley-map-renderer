/**
 * Tests for flow labels drawn on relation edges (relation.flow.label).
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderEdgesLayer } from "./edges-layer.js";
import { renderFlowLabel, FLOW_LABEL_BASE_FONT_SIZE } from "./svg-primitives.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";

function makeMap(flow?: { label: string; style?: string }, evoA = 0.2, evoB = 0.8): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Flow Map",
    components: [
      { id: "a", label: { name: "A" }, type: "component",
        position: { evolution: { scalar: evoA }, visibility: { scalar: 0.3 } } },
      { id: "b", label: { name: "B" }, type: "component",
        position: { evolution: { scalar: evoB }, visibility: { scalar: 0.7 } } },
    ],
    relations: [{ id: "r1", consumer: "a", supplier: "b", type: "Flow", ...(flow ? { flow } : {}) }],
  }));
}

const LABEL = { text: "x", fontSize: 9, fontFamily: "Arial", haloColor: "#fff" };

function rotation(svg: string): number {
  const m = /rotate\((-?[\d.]+) /.exec(svg);
  return m ? Number(m[1]) : 0;
}

describe("flow labels on edges", () => {
  it("draws the escaped label with a background halo", () => {
    const parts = renderEdgesLayer(buildRenderContext(makeMap({ label: "<money & \"data\">" })));
    const svg = parts.join("");
    expect(svg).toContain('class="flow-label"');
    expect(svg).toContain("&lt;money &amp; &quot;data&quot;&gt;</text>");
    expect(svg).not.toContain("<money");
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('fill="#1d4ed8"');
    expect(svg).toContain(`font-size="${FLOW_LABEL_BASE_FONT_SIZE}"`);
  });

  it("draws no label without a flow", () => {
    const svg = renderEdgesLayer(buildRenderContext(makeMap())).join("");
    expect(svg).toContain("<line");
    expect(svg).not.toContain("<text");
  });

  it("scales with textScale", () => {
    const map = makeMap({ label: "data" });
    map.renderConfig = { ...(map.renderConfig ?? {}), typography: { textScale: 2 } } as WardleyMap["renderConfig"];
    const svg = renderEdgesLayer(buildRenderContext(map)).join("");
    expect(svg).toContain(`font-size="${FLOW_LABEL_BASE_FONT_SIZE * 2}"`);
  });

  it("is never upside down, whichever way the edge points", () => {
    for (const [x1, y1, x2, y2] of [
      [0, 0, 100, 50], [100, 50, 0, 0], [100, 0, 0, 50], [0, 50, 100, 0],
      [0, 0, -100, 0], [0, 0, 0, 100], [0, 100, 0, 0],
    ]) {
      const angle = rotation(renderFlowLabel(x1, y1, x2, y2, "Flow", LABEL));
      expect(angle).toBeGreaterThanOrEqual(-90);
      expect(angle).toBeLessThanOrEqual(90);
    }
    // Right-to-left edge gets the same orientation as its left-to-right twin
    expect(renderFlowLabel(100, 50, 0, 0, "Flow", LABEL)).toBe(renderFlowLabel(0, 0, 100, 50, "Flow", LABEL));
  });

  it("sits beside the line, not on it", () => {
    const svg = renderFlowLabel(0, 0, 100, 0, "Flow", LABEL);
    expect(svg).toContain('x="50"');
    expect(svg).toMatch(/y="-\d/);
    expect(svg).not.toContain("rotate(");
  });

  it("interactive mode: label lives inside the relation group with the hit area", () => {
    const svg = renderEdgesLayer(buildRenderContext(makeMap({ label: "data" }), { interactive: true })).join("");
    const m = /<g data-id="r1" data-kind="relation">(.*?)<\/g>/.exec(svg);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('class="hit-area"');
    expect(m![1]).toContain('class="flow-label"');
    expect(m![1]).toContain(">data</text>");
  });
});
