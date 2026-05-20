import { describe, it, expect } from "vitest";
import {
  RenderConfigV3Schema,
  renderConfigV3ToLegacy,
  type RenderConfigV3Input,
} from "./render-config-v3.js";
import { resolveTheme, WardleyMapSchema } from "./schema.js";
import { renderToSVG } from "./render-orchestrator.js";
import { makeComponent, makeMap } from "./test-helpers.js";

function v3(input: RenderConfigV3Input) {
  return RenderConfigV3Schema.parse(input);
}

describe("RenderConfigV3Schema", () => {
  it("accepts an empty config", () => {
    expect(RenderConfigV3Schema.parse({})).toEqual({});
  });

  it("accepts the three top-level axes", () => {
    const parsed = v3({
      display: { legend: false, anchor: false },
      rendering: { locale: "fr", avoidCollisions: false },
      style: { global: { strokeWidth: 2 } },
    });
    expect(parsed.display?.legend).toBe(false);
    expect(parsed.rendering?.locale).toBe("fr");
    expect(parsed.style?.global?.strokeWidth).toBe(2);
  });

  it("rejects unknown top-level keys (strict)", () => {
    expect(() => RenderConfigV3Schema.parse({ spatial: {} } as never)).toThrow();
  });
});

describe("renderConfigV3ToLegacy — field mapping", () => {
  it("maps canvas dims + ranges + fill", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      style: { background: { canvas: { default: { width: 800, height: 400, fill: "#fafafa" }, override: { evolutionRange: [0.1, 0.9] } } } },
    })) as any;
    expect(legacy.spatial.width).toBe(800);
    expect(legacy.spatial.height).toBe(400);
    expect(legacy.spatial.coordinateSpace.width).toBe(800);
    expect(legacy.spatial.coordinateSpace.evolutionRange).toEqual([0.1, 0.9]);
    expect(legacy.styling.background.color).toBe("#fafafa");
  });

  it("maps view → coordinateSpace.outputHint", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      style: { view: { default: { width: 800, height: 400, dpi: 192 } } },
    })) as any;
    expect(legacy.spatial.coordinateSpace.outputHint).toEqual({ targetWidth: 800, targetHeight: 400, dpi: 192 });
  });

  it("maps global font/scale/stroke", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      style: { global: { fontFamily: "Roboto", labelScale: 1.5, strokeWidth: 2 } },
    })) as any;
    expect(legacy.typography.fontFamily).toBe("Roboto");
    expect(legacy.typography.labelScale).toBe(1.5);
    expect(legacy.spatial.strokeWidth).toBe(2);
  });

  it("maps node cascade → nodeRadii + palette by renderable type", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      style: {
        nodes: {
          default: { default: { symbol: { radius: 6, stroke: "#111111" } } },
          bySubtype: { market: { override: { symbol: { radius: 9, fill: "#0066cc" } } } },
        },
      },
    })) as any;
    expect(legacy.spatial.nodeRadii._default).toBe(6);
    expect(legacy.spatial.nodeRadii.market).toBe(9);
    // nodes.default.symbol.stroke drives palette._default
    expect(legacy.styling.palette._default).toBe("#111111");
    expect(legacy.styling.palette.market).toBe("#0066cc");
  });

  it("maps movement → evolveStyles", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      style: { movement: { forced: { default: { line: { color: "#dc2626", dash: "4,2" } } } } },
    })) as any;
    expect(legacy.styling.evolveStyles.forced).toEqual({ stroke: "#dc2626", strokeDasharray: "4,2" });
  });

  it("maps axis/phase label text → axes.axisLabels", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      style: {
        background: {
          axisEvolution: { default: { label: { text: "Évolution" } } },
          phases: { default: { labels: [{ text: "Genèse" }, { text: "Commodité" }] } },
        },
      },
    })) as any;
    expect(legacy.axes.axisLabels.xAxis).toBe("Évolution");
    expect(legacy.axes.axisLabels.phases).toEqual(["Genèse", "Commodité"]);
  });

  it("maps display toggles → filters.layers + excludeComponentTypes", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      display: { labels: false, evolveArrows: false, anchor: false },
    })) as any;
    expect(legacy.filters.layers.labels).toBe(false);
    expect(legacy.filters.layers.evolvesTo).toBe(false);
    expect(legacy.filters.excludeComponentTypes).toContain("anchor");
  });

  it("maps legend show + position", () => {
    const legacy = renderConfigV3ToLegacy(v3({
      display: { legend: false },
      style: { legend: { default: { box: { position: "top-left" } } } },
    })) as any;
    expect(legacy.legend.show).toBe(false);
    expect(legacy.legend.position).toBe("top-left");
  });
});

describe("renderConfigV3ToLegacy — end-to-end via resolveTheme + render", () => {
  it("resolveTheme accepts a v3 config DIRECTLY (internal bridge)", () => {
    const resolved = resolveTheme({
      rendering: { locale: "fr", theme: "dark" },
      style: { background: { canvas: { default: { width: 640 } } } },
    } as any);
    expect(resolved.width).toBe(640);
    expect(resolved.coordinateSpace.width).toBe(640);
    expect(resolved.locale).toBe("fr");
    expect(resolved.theme).toBe("dark");
  });

  it("resolves through the existing pipeline to the flat ResolvedRenderConfig", () => {
    const resolved = resolveTheme(renderConfigV3ToLegacy(v3({
      rendering: { locale: "fr" },
      style: { background: { canvas: { default: { width: 800, height: 400 } } } },
    })));
    expect(resolved.width).toBe(800);
    expect(resolved.coordinateSpace.width).toBe(800);
    expect(resolved.locale).toBe("fr");
  });

  it("WardleyMapSchema accepts a v3 renderConfig natively (preprocess → legacy)", () => {
    const map = WardleyMapSchema.parse({
      title: "Native v3",
      components: [],
      relations: [],
      renderConfig: {
        rendering: { locale: "fr" },
        style: { background: { canvas: { default: { width: 800, height: 400 } } } },
      },
    });
    // Stored as the nested legacy shape after the preprocess transform.
    expect((map.renderConfig as any)?.spatial?.width).toBe(800);
    expect((map.renderConfig as any)?.axes?.locale).toBe("fr");
  });

  it("WardleyMapSchema still accepts the legacy renderConfig shape", () => {
    const map = WardleyMapSchema.parse({
      title: "Legacy",
      components: [],
      relations: [],
      renderConfig: { spatial: { width: 1200 }, axes: { locale: "en" } },
    });
    expect((map.renderConfig as any)?.spatial?.width).toBe(1200);
  });

  it("renders a valid SVG honoring a v3 palette override", () => {
    const renderConfig = renderConfigV3ToLegacy(v3({
      style: { nodes: { byType: { component: { override: { symbol: { stroke: "#0066cc" } } } } } },
    }));
    const map = makeMap({
      title: "V3",
      components: [makeComponent({ id: "a", name: "Svc", type: "component" })],
      relations: [],
      renderConfig,
    });
    const svg = renderToSVG(map);
    expect(svg).toContain("<svg");
    expect(svg).toContain('stroke="#0066cc"');
  });
});
