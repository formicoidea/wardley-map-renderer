/**
 * Text scale options: style.global.textScale × style.<element>.label.scale
 * must multiply the font-size emitted by each layer.
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderTitleLayer } from "./title-layer.js";
import { renderAxesLayer } from "./axes-layer.js";
import { renderLegendLayer } from "./legend-layer.js";
import { renderLabelsLayer } from "./labels-layer.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";

function ctxWith(style: Record<string, unknown> = {}) {
  return buildRenderContext(sanitizeMap(WardleyMapSchema.parse({
    title: "Scaled",
    components: [
      { id: "a", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
      { id: "b", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
    ],
    relations: [{ id: "r", consumer: "a", supplier: "b" }],
    renderConfig: { style },
  })));
}

/** font-size of the <text> element whose content is `text` */
function fontSizeOf(parts: string[], text: string): number {
  const m = parts.join("").match(new RegExp(`<text[^>]*font-size="([\\d.]+)"[^>]*>${text}</text>`));
  if (!m) throw new Error(`no <text> for ${text}`);
  return Number(m[1]);
}

describe("title-layer text scale", () => {
  it("defaults to 16px", () => {
    expect(fontSizeOf(renderTitleLayer(ctxWith()), "Scaled")).toBe(16);
  });
  it("applies base × textScale × title label.scale", () => {
    const ctx = ctxWith({ global: { textScale: 1.5 }, title: { default: { label: { scale: 2 } } } });
    expect(fontSizeOf(renderTitleLayer(ctx), "Scaled")).toBe(48);
  });
});

describe("axes-layer text scale", () => {
  const style = {
    global: { textScale: 2 },
    background: {
      axisEvolution: { default: { label: { text: "EVO", scale: 1.5 } } },
      axisValueChain: { default: { label: { text: "VC", scale: 0.5 } } },
      phases: { default: { labels: [{ text: "P1", scale: 2 }, { text: "P2" }, { text: "P3" }, { text: "P4" }] } },
    },
  };

  it("defaults are unchanged (13px axis, 12px phase)", () => {
    const parts = renderAxesLayer(ctxWith({
      background: {
        axisEvolution: { default: { label: { text: "EVO" } } },
        phases: { default: { labels: [{ text: "P1" }, { text: "P2" }, { text: "P3" }, { text: "P4" }] } },
      },
    }));
    expect(fontSizeOf(parts, "EVO")).toBe(13);
    expect(fontSizeOf(parts, "P1")).toBe(12);
  });

  it("evolution axis label = 13 × textScale × axisEvolution scale", () => {
    expect(fontSizeOf(renderAxesLayer(ctxWith(style)), "EVO")).toBe(39);
  });

  it("value chain axis label = 13 × textScale × axisValueChain scale", () => {
    expect(fontSizeOf(renderAxesLayer(ctxWith(style)), "VC")).toBe(13);
  });

  it("phase labels use their own scale, times textScale", () => {
    const parts = renderAxesLayer(ctxWith(style));
    expect(fontSizeOf(parts, "P1")).toBe(48);
    expect(fontSizeOf(parts, "P2")).toBe(24);
  });
});

describe("legend-layer text scale", () => {
  const legendWidth = (parts: string[]) =>
    Number(parts.join("").match(/<rect[^>]*width="([\d.]+)"[^>]*fill="#f5f5f5"/)![1]);

  it("font-size = 12 × textScale × legend label.scale", () => {
    const parts = renderLegendLayer(ctxWith({ global: { textScale: 1.5 }, legend: { default: { label: { scale: 2 } } } }));
    expect(fontSizeOf(parts, "Legend")).toBe(36);
    expect(fontSizeOf(parts, "Component")).toBe(36);
  });

  it("box width grows with the scale", () => {
    const base = legendWidth(renderLegendLayer(ctxWith()));
    const scaled = legendWidth(renderLegendLayer(ctxWith({ legend: { default: { label: { scale: 2 } } } })));
    expect(scaled).toBeGreaterThan(base);
  });
});

describe("labels-layer text scale", () => {
  it("component label = 12 × textScale × labelScale × node label.scale", () => {
    const ctx = ctxWith({
      global: { textScale: 1.5, labelScale: 2 },
      nodes: { byType: { anchor: { default: { label: { scale: 0.5 } } } } },
    });
    const parts = renderLabelsLayer(ctx);
    expect(fontSizeOf(parts, "Service")).toBe(36);
    expect(fontSizeOf(parts, "User")).toBe(18);
  });
});

describe("style override path", () => {
  it("phases.override.labels scales are honoured", () => {
    const ctx = ctxWith({
      background: { phases: { override: { labels: [{ text: "P1", scale: 2 }, { text: "P2" }, { text: "P3" }, { text: "P4" }] } } },
    });
    expect(fontSizeOf(renderAxesLayer(ctx), "P1")).toBe(24);
  });
});
