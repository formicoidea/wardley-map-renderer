/**
 * Tests for axis labels customization via renderConfig.
 * Verifies that renderConfig.axisLabels overrides map.axes.labels,
 * and that the merge priority is: locale preset → axes.labels → renderConfig.axisLabels.
 *
 * @module render-config-axis-labels.test
 */

import { describe, it, expect } from "vitest";
import { WardleyMapSchema, RenderConfigSchema, AxisLabelsSchema } from "./schema.js";
import { resolveAxisLabels, AXIS_LABELS_EN, AXIS_LABELS_FR } from "./consts.js";
import { renderAxesLayer } from "./axes-layer.js";
import type { RenderContext, PlotArea, Margins, RenderGeometry, RenderOptions } from "./types.js";
import type { WardleyMap } from "./schema.js";

// ── Minimal map fixture ─────────────────────────────────────────
const minimalMap = {
  title: "Test Map",
  components: [
    { id: "u", label: "User", type: "anchor", evolution: 0.5, visibility: 0.9 },
    { id: "a", label: "Service", type: "component", evolution: 0.3, visibility: 0.5 },
  ],
  relations: [{ source: "u", target: "a" }],
};

// ── Helper: build a minimal RenderContext from a WardleyMap ──────
function buildContext(map: WardleyMap): RenderContext {
  const margins: Margins = { top: 60, right: 20, bottom: 60, left: 60 };
  const canvasWidth = map.gridSize.width;
  const canvasHeight = map.gridSize.height;
  const plot: PlotArea = {
    left: margins.left,
    top: margins.top,
    right: canvasWidth - margins.right,
    bottom: canvasHeight - margins.bottom,
    width: canvasWidth - margins.left - margins.right,
    height: canvasHeight - margins.top - margins.bottom,
  };
  const geometry: RenderGeometry = {
    nodes: [],
    edges: [],
    evolves: [],
    pipelines: [],
    axesZones: [],
    boundingBoxes: [],
  };
  const options: RenderOptions = {};
  return {
    map,
    canvasWidth,
    canvasHeight,
    margins,
    plot,
    geometry,
    nodes: [],
    edges: [],
    evolves: [],
    pipelines: [],
    componentById: new Map(),
    evoToX: (evo: number) => plot.left + evo * plot.width,
    visToY: (vis: number) => plot.top + vis * plot.height,
    options,
  };
}

// ── Schema validation tests ──────────────────────────────────────

describe("RenderConfigSchema.axisLabels", () => {
  it("accepts renderConfig without axisLabels (backward compatible)", () => {
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.axisLabels).toBeUndefined();
    }
  });

  it("accepts renderConfig with axisLabels locale only", () => {
    const result = RenderConfigSchema.safeParse({
      axisLabels: { locale: "fr" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.axisLabels?.locale).toBe("fr");
    }
  });

  it("accepts renderConfig with custom phase labels", () => {
    const result = RenderConfigSchema.safeParse({
      axisLabels: {
        phases: ["I", "II", "III", "IV"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.axisLabels?.phases).toEqual(["I", "II", "III", "IV"]);
    }
  });

  it("accepts renderConfig with individual label overrides", () => {
    const result = RenderConfigSchema.safeParse({
      axisLabels: {
        xAxis: "Maturity",
        yAxis: "Dependency",
        visibilityHigh: "External",
        visibilityLow: "Internal",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.axisLabels?.xAxis).toBe("Maturity");
      expect(result.data.axisLabels?.yAxis).toBe("Dependency");
    }
  });

  it("rejects invalid locale in renderConfig.axisLabels", () => {
    const result = RenderConfigSchema.safeParse({
      axisLabels: { locale: "de" },
    });
    expect(result.success).toBe(false);
  });

  it("WardleyMapSchema accepts renderConfig.axisLabels", () => {
    const result = WardleyMapSchema.safeParse({
      ...minimalMap,
      renderConfig: {
        axisLabels: {
          locale: "fr",
          xAxis: "Maturité",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renderConfig?.axisLabels?.locale).toBe("fr");
      expect(result.data.renderConfig?.axisLabels?.xAxis).toBe("Maturité");
    }
  });
});

// ── Merge priority tests ─────────────────────────────────────────

describe("renderConfig.axisLabels merge priority", () => {
  it("renders default English labels when no overrides", () => {
    const parsed = WardleyMapSchema.parse(minimalMap);
    const ctx = buildContext(parsed);
    const svg = renderAxesLayer(ctx).join("\n");

    expect(svg).toContain("Genesis");
    expect(svg).toContain("Custom-Built");
    expect(svg).toContain("Evolution");
    expect(svg).toContain("Value Chain");
  });

  it("renderConfig.axisLabels overrides default labels", () => {
    const parsed = WardleyMapSchema.parse({
      ...minimalMap,
      renderConfig: {
        axisLabels: {
          phases: ["Phase I", "Phase II", "Phase III", "Phase IV"],
          xAxis: "Maturity",
        },
      },
    });
    const ctx = buildContext(parsed);
    const svg = renderAxesLayer(ctx).join("\n");

    expect(svg).toContain("Phase I");
    expect(svg).toContain("Phase II");
    expect(svg).toContain("Phase III");
    expect(svg).toContain("Phase IV");
    expect(svg).toContain("Maturity");
    // Y-axis should still be default English
    expect(svg).toContain("Value Chain");
    // Default phases should NOT appear
    expect(svg).not.toContain("Genesis");
  });

  it("renderConfig.axisLabels takes priority over axes.labels", () => {
    const parsed = WardleyMapSchema.parse({
      ...minimalMap,
      axes: {
        valueChain: true,
        evolution: true,
        labels: {
          locale: "fr",
          xAxis: "Évolution",
        },
      },
      renderConfig: {
        axisLabels: {
          xAxis: "Maturité", // overrides both French preset and axes.labels
        },
      },
    });
    const ctx = buildContext(parsed);
    const svg = renderAxesLayer(ctx).join("\n");

    // renderConfig.axisLabels.xAxis wins over axes.labels.xAxis
    expect(svg).toContain("Maturité");
    expect(svg).not.toContain("Évolution");
    // French locale from axes.labels still applies to non-overridden fields
    expect(svg).toContain("Genèse");
    expect(svg).toContain("Chaîne de valeur");
  });

  it("renderConfig.axisLabels locale overrides axes.labels locale", () => {
    const parsed = WardleyMapSchema.parse({
      ...minimalMap,
      axes: {
        valueChain: true,
        evolution: true,
        labels: { locale: "en" },
      },
      renderConfig: {
        axisLabels: { locale: "fr" },
      },
    });
    const ctx = buildContext(parsed);
    const svg = renderAxesLayer(ctx).join("\n");

    // French labels because renderConfig locale wins
    expect(svg).toContain("Genèse");
    expect(svg).toContain("Chaîne de valeur");
    expect(svg).toContain("Inexploré");
  });

  it("renderConfig.axisLabels direction indicators override defaults", () => {
    const parsed = WardleyMapSchema.parse({
      ...minimalMap,
      renderConfig: {
        axisLabels: {
          evolutionStart: "Novel",
          evolutionEnd: "Established",
          visibilityHigh: "Customer-facing",
          visibilityLow: "Back-office",
        },
      },
    });
    const ctx = buildContext(parsed);
    const svg = renderAxesLayer(ctx).join("\n");

    expect(svg).toContain("Novel");
    expect(svg).toContain("Established");
    expect(svg).toContain("Customer-facing");
    expect(svg).toContain("Back-office");
    // Defaults should not appear
    expect(svg).not.toContain("Uncharted");
    expect(svg).not.toContain("Industrialized");
  });

  it("axes.labels fields used when renderConfig.axisLabels doesn't override them", () => {
    const parsed = WardleyMapSchema.parse({
      ...minimalMap,
      axes: {
        valueChain: true,
        evolution: true,
        labels: {
          yAxis: "Dependency Chain",
          visibilityHigh: "Public",
          visibilityLow: "Private",
        },
      },
      renderConfig: {
        axisLabels: {
          xAxis: "Maturity",
          // yAxis not overridden — should fall through to axes.labels
        },
      },
    });
    const ctx = buildContext(parsed);
    const svg = renderAxesLayer(ctx).join("\n");

    // renderConfig override
    expect(svg).toContain("Maturity");
    // axes.labels values preserved where renderConfig doesn't override
    expect(svg).toContain("Dependency Chain");
    expect(svg).toContain("Public");
    expect(svg).toContain("Private");
  });
});
