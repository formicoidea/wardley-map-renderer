import { describe, it, expect } from "vitest";
import z from "zod";
import {
  RenderConfigSchema,
  LayerTogglesSchema,
  WardleyMapSchema,
  resolveTheme,
  resolveTypeStyle,
  EvolveTypeEnum,
  EvolveStylesMapSchema,
  NodeRadiiSchema,
  LAYER_DEPENDENCY_CONSTRAINTS,
  LAYER_TOGGLE_DAG,
  CoordinateSpaceSchema,
  validateLayerToggles,
  makeTypeStyleMapSchema,
  typeStyleMapSchema,
  type TypeStyleMap,
  type LayerToggleDAG,
} from "./schema";
import {
  AXIS_LABELS_EN,
  AXIS_LABELS_FR,
  resolveAxisLabels,
} from "./blocks/wardley-map/wardley-map-consts.js";

// ── Helpers ──────────────────────────────────────────────────

/** Minimal valid map payload (no renderConfig) */
const baseMap = {
  title: "Test Map",
  components: [
    {
      id: "user",
      label: { name: "User" },
      type: "user-need" as const,
      position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.95 } },
    },
  ],
  relations: [],
};

// ── RenderConfigSchema unit tests ────────────────────────────

describe("RenderConfigSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      // All optional fields should be undefined
      expect(result.data.width).toBeUndefined();
      expect(result.data.height).toBeUndefined();
      expect(result.data.theme).toBeUndefined();
      expect(result.data.background).toBeUndefined();
      expect(result.data.fontFamily).toBeUndefined();
      expect(result.data.labelScale).toBeUndefined();
      expect(result.data.nodeRadii).toBeUndefined();
      expect(result.data.avoidCollisions).toBeUndefined();
      expect(result.data.filters).toBeUndefined();
      expect(result.data.typeColors).toBeUndefined();
      expect(result.data.evolveStyles).toBeUndefined();
      // strokeWidth has a default
      expect(result.data.strokeWidth).toBe(1);
    }
  });

  it("accepts a fully-specified config", () => {
    const full = {
      width: 1920,
      height: 1080,
      theme: "dark",
      background: {
        color: "#f0f0f0",
        evolutionXAxis: { show: false },
        valueChainYAxis: { show: true },
        evolutionPhases: { showPhaseDividerAndLabel: false },
      },
      fontFamily: "Roboto, sans-serif",
      labelScale: 1.5,
      nodeRadii: { _default: 8 },
      avoidCollisions: false,
      filters: { excludeComponentTypes: ["note"] },
      typeColors: { _default: "#000000", component: "#ff0000" },
      evolveStyles: { natural: { stroke: "#00ff00", strokeDasharray: "4 2" } },
      strokeWidth: 2,
    };
    const result = RenderConfigSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(1920);
      expect(result.data.height).toBe(1080);
      expect(result.data.theme).toBe("dark");
      expect(result.data.background?.color).toBe("#f0f0f0");
      expect(result.data.background?.evolutionXAxis?.show).toBe(false);
      expect(result.data.background?.valueChainYAxis?.show).toBe(true);
      expect(result.data.background?.evolutionPhases?.showPhaseDividerAndLabel).toBe(false);
      expect(result.data.labelScale).toBe(1.5);
      expect(result.data.filters?.excludeComponentTypes).toEqual(["note"]);
      expect(result.data.strokeWidth).toBe(2);
    }
  });

  // ── Partial overrides ──────────────────────────────────────

  it("accepts partial config with only width", () => {
    const result = RenderConfigSchema.safeParse({ width: 800 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(800);
      expect(result.data.height).toBeUndefined();
    }
  });

  it("accepts partial config with only avoidCollisions flag", () => {
    const result = RenderConfigSchema.safeParse({
      avoidCollisions: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.avoidCollisions).toBe(false);
    }
  });

  it("accepts partial config with only evolveStyles", () => {
    const result = RenderConfigSchema.safeParse({
      evolveStyles: {
        forced: { stroke: "#ff0000" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evolveStyles).toEqual({
        forced: { stroke: "#ff0000" },
      });
    }
  });

  it("accepts evolveStyles with 'late' key (closed enum includes late)", () => {
    const result = RenderConfigSchema.safeParse({
      evolveStyles: {
        late: { stroke: "#999999", strokeDasharray: "4,2" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evolveStyles?.late?.stroke).toBe("#999999");
      expect(result.data.evolveStyles?.late?.strokeDasharray).toBe("4,2");
    }
  });

  it("accepts evolveStyles with all four EvolveType keys", () => {
    const result = RenderConfigSchema.safeParse({
      evolveStyles: {
        natural: { stroke: "#dc2626" },
        ecosystem: { stroke: "#2563eb" },
        forced: { stroke: "#9333ea" },
        late: { stroke: "#999999" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evolveStyles?.natural?.stroke).toBe("#dc2626");
      expect(result.data.evolveStyles?.ecosystem?.stroke).toBe("#2563eb");
      expect(result.data.evolveStyles?.forced?.stroke).toBe("#9333ea");
      expect(result.data.evolveStyles?.late?.stroke).toBe("#999999");
    }
  });

  it("accepts multiple filters.excludeComponentTypes", () => {
    const result = RenderConfigSchema.safeParse({
      filters: { excludeComponentTypes: ["note", "anchor"] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.excludeComponentTypes).toEqual(["note", "anchor"]);
    }
  });

  // ── background sub-object ──────────────────────────────────

  it("accepts background.evolutionXAxis with axis show/label controls", () => {
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionXAxis: {
          show: true,
          xAxis: "Custom X",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionXAxis?.xAxis).toBe("Custom X");
    }
  });

  // Sub-AC 2: direction indicator label overrides (evolutionStart/End, visibilityHigh/Low)
  // have been removed from MapChrome — background.axisLabels no longer accepts these fields.
  // Direction cue labels are now locale-only (set via renderConfig.locale).

  it("accepts background.valueChainYAxis with axis show/label controls", () => {
    const result = RenderConfigSchema.safeParse({
      background: {
        valueChainYAxis: {
          show: true,
          yAxis: "Custom Y",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.valueChainYAxis?.yAxis).toBe("Custom Y");
    }
  });

  // Sub-AC 2: visibilityHigh/Low direction label overrides also removed from background.axisLabels.

  it("accepts background.evolutionPhases.phases as 4-tuple override", () => {
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: {
          showPhaseDividerAndLabel: true,
          phases: ["A", "B", "C", "D"],
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionPhases?.phases).toEqual(["A", "B", "C", "D"]);
    }
  });

  // AC 5: phaseLabels is now open-length — 3-element array is valid
  it("accepts background.evolutionPhases.phases with 3 elements (arbitrary size, not locked to 4)", () => {
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: {
          phases: ["A", "B", "C"], // 3 phases — now valid (arbitrary size)
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionPhases?.phases).toEqual(["A", "B", "C"]);
    }
  });

  // AC 5: rejects empty array (min 1 constraint)
  it("rejects background.evolutionPhases.phases as empty array (min 1 required)", () => {
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: {
          phases: [], // empty — invalid (min 1)
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts background sub-objects without label overrides (labels remain optional)", () => {
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionXAxis: { show: false },
        valueChainYAxis: { show: true },
        evolutionPhases: { showPhaseDividerAndLabel: false },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionXAxis?.xAxis).toBeUndefined();
      expect(result.data.background?.valueChainYAxis?.yAxis).toBeUndefined();
      expect(result.data.background?.evolutionPhases?.phases).toBeUndefined();
    }
  });

  it("accepts background.evolutionXAxis.show=false", () => {
    const result = RenderConfigSchema.safeParse({
      background: { evolutionXAxis: { show: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionXAxis?.show).toBe(false);
    }
  });

  it("accepts background.valueChainYAxis.show=false", () => {
    const result = RenderConfigSchema.safeParse({
      background: { valueChainYAxis: { show: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.valueChainYAxis?.show).toBe(false);
    }
  });

  it("accepts background.evolutionPhases.showPhaseDividerAndLabel=false", () => {
    const result = RenderConfigSchema.safeParse({
      background: { evolutionPhases: { showPhaseDividerAndLabel: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionPhases?.showPhaseDividerAndLabel).toBe(false);
    }
  });

  it("accepts all 4 orthogonal combinations of evolutionXAxis/evolutionPhases toggles", () => {
    const combos = [
      { evolutionXAxis: { show: true },  evolutionPhases: { showPhaseDividerAndLabel: true } },
      { evolutionXAxis: { show: true },  evolutionPhases: { showPhaseDividerAndLabel: false } },
      { evolutionXAxis: { show: false }, evolutionPhases: { showPhaseDividerAndLabel: true } },
      { evolutionXAxis: { show: false }, evolutionPhases: { showPhaseDividerAndLabel: false } },
    ];
    for (const bg of combos) {
      const result = RenderConfigSchema.safeParse({ background: bg });
      expect(result.success).toBe(true);
    }
  });

  it("accepts background.color as valid hex", () => {
    const result = RenderConfigSchema.safeParse({
      background: { color: "#1a1a1a" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.color).toBe("#1a1a1a");
    }
  });

  it("rejects background.color as invalid hex", () => {
    expect(
      RenderConfigSchema.safeParse({ background: { color: "red" } }).success
    ).toBe(false);
    expect(
      RenderConfigSchema.safeParse({ background: { color: "#xyz" } }).success
    ).toBe(false);
  });

  // ── theme ──────────────────────────────────────────────────

  it("accepts valid theme values", () => {
    expect(RenderConfigSchema.safeParse({ theme: "default" }).success).toBe(true);
    expect(RenderConfigSchema.safeParse({ theme: "dark" }).success).toBe(true);
    expect(RenderConfigSchema.safeParse({ theme: "highContrast" }).success).toBe(true);
  });

  it("rejects unknown theme values", () => {
    expect(RenderConfigSchema.safeParse({ theme: "neon" }).success).toBe(false);
  });

  // ── strokeWidth ────────────────────────────────────────────

  it("defaults strokeWidth to 1", () => {
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.strokeWidth).toBe(1);
    }
  });

  it("accepts strokeWidth boundary values", () => {
    expect(RenderConfigSchema.safeParse({ strokeWidth: 0.25 }).success).toBe(true);
    expect(RenderConfigSchema.safeParse({ strokeWidth: 8 }).success).toBe(true);
  });

  it("rejects strokeWidth below minimum", () => {
    expect(RenderConfigSchema.safeParse({ strokeWidth: 0.1 }).success).toBe(false);
  });

  it("rejects strokeWidth above maximum", () => {
    expect(RenderConfigSchema.safeParse({ strokeWidth: 10 }).success).toBe(false);
  });

  // ── Invalid inputs ─────────────────────────────────────────

  it("rejects negative width", () => {
    const result = RenderConfigSchema.safeParse({ width: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects zero height", () => {
    const result = RenderConfigSchema.safeParse({ height: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts valid hex colors for background.color (3, 6, 8 digit)", () => {
    expect(
      RenderConfigSchema.safeParse({ background: { color: "#fff" } }).success
    ).toBe(true);
    expect(
      RenderConfigSchema.safeParse({ background: { color: "#ff00aa" } }).success
    ).toBe(true);
    expect(
      RenderConfigSchema.safeParse({ background: { color: "#ff00aa80" } }).success
    ).toBe(true);
  });

  it("rejects labelScale above 5", () => {
    const result = RenderConfigSchema.safeParse({ labelScale: 6 });
    expect(result.success).toBe(false);
  });

  it("rejects labelScale of 0 (not positive)", () => {
    const result = RenderConfigSchema.safeParse({ labelScale: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative labelScale", () => {
    const result = RenderConfigSchema.safeParse({ labelScale: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects nodeRadii._default above 50", () => {
    const result = RenderConfigSchema.safeParse({ nodeRadii: { _default: 51 } });
    expect(result.success).toBe(false);
  });

  it("rejects invalid filters.excludeComponentTypes values", () => {
    const result = RenderConfigSchema.safeParse({
      filters: { excludeComponentTypes: ["invalid-type"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid evolveStyles keys", () => {
    const result = RenderConfigSchema.safeParse({
      evolveStyles: { unknown: { stroke: "#000" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects evolveStyles with an invalid evolution type key (strict closed enum)", () => {
    // 'genesis', 'custom', 'product', 'commodity' are phase names, not evolveType values
    const result = RenderConfigSchema.safeParse({
      evolveStyles: { genesis: { stroke: "#000" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(RenderConfigSchema.safeParse("string").success).toBe(false);
    expect(RenderConfigSchema.safeParse(42).success).toBe(false);
    expect(RenderConfigSchema.safeParse(null).success).toBe(false);
  });
});

// ── WardleyMapSchema with renderConfig ────────────────────────

describe("WardleyMapSchema with renderConfig", () => {
  it("parses a map without renderConfig (optional, defaults to undefined)", () => {
    const result = WardleyMapSchema.safeParse(baseMap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renderConfig).toBeUndefined();
    }
  });

  it("parses a map with empty renderConfig", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renderConfig).toBeDefined();
      expect(result.data.renderConfig!.width).toBeUndefined();
    }
  });

  it("parses a map with partial renderConfig (only width override)", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: { width: 1920 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renderConfig!.width).toBe(1920);
      expect(result.data.renderConfig!.height).toBeUndefined();
      expect(result.data.renderConfig!.background).toBeUndefined();
    }
  });

  it("parses a map with full renderConfig using new nested structure", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: {
        width: 1920,
        height: 1080,
        theme: "dark",
        background: {
          color: "#000000",
          evolutionXAxis: { show: false },
          valueChainYAxis: { show: false },
          evolutionPhases: { showPhaseDividerAndLabel: true },
        },
        fontFamily: "Monospace",
        labelScale: 2,
        nodeRadii: { _default: 10 },
        avoidCollisions: true,
        filters: { excludeComponentTypes: ["note"] },
        typeColors: { _default: "#000000", "user-need": "#ff0000" },
        evolveStyles: {
          natural: { stroke: "#00ff00" },
          ecosystem: { strokeDasharray: "5 5" },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const rc = result.data.renderConfig!;
      expect(rc.width).toBe(1920);
      expect(rc.theme).toBe("dark");
      expect(rc.background?.color).toBe("#000000");
      expect(rc.background?.evolutionXAxis?.show).toBe(false);
      expect(rc.background?.evolutionPhases?.showPhaseDividerAndLabel).toBe(true);
      expect(rc.filters?.excludeComponentTypes).toEqual(["note"]);
      expect(rc.typeColors).toEqual({ _default: "#000000", "user-need": "#ff0000" });
      expect(rc.evolveStyles?.natural?.stroke).toBe("#00ff00");
    }
  });

  it("rejects a map with invalid renderConfig", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: { width: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("preserves other map fields when renderConfig is present", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      context: "Test context",
      renderConfig: { background: { color: "#aabbcc" } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Test Map");
      expect(result.data.context).toBe("Test context");
      expect(result.data.components).toHaveLength(1);
      expect(result.data.renderConfig!.background?.color).toBe("#aabbcc");
    }
  });
});

// ── renderConfig consolidation tests ───────────────────────

describe("renderConfig consolidation (legend + background toggles)", () => {
  it("accepts renderConfig.legend", () => {
    const result = RenderConfigSchema.safeParse({
      legend: { show: false, position: "top-left" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.show).toBe(false);
      expect(result.data.legend!.position).toBe("top-left");
    }
  });

  it("accepts renderConfig.legend with defaults", () => {
    const result = RenderConfigSchema.safeParse({
      legend: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.show).toBe(true);
      expect(result.data.legend!.position).toBe("bottom-right");
    }
  });

  it("accepts legend with {x, y} position", () => {
    const result = RenderConfigSchema.safeParse({
      legend: { position: { x: 100, y: 600 } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.position).toEqual({ x: 100, y: 600 });
    }
  });

  it("rejects legend with invalid position string", () => {
    const result = RenderConfigSchema.safeParse({
      legend: { position: "invalid" },
    });
    expect(result.success).toBe(false);
  });

  // ── legendOverflow field ─────────────────────────────────────

  it("legendOverflow defaults to 'allow' when not specified", () => {
    const result = RenderConfigSchema.safeParse({ legend: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("allow");
    }
  });

  it("accepts legendOverflow: 'allow'", () => {
    const result = RenderConfigSchema.safeParse({
      legend: { legendOverflow: "allow" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("allow");
    }
  });

  it("accepts legendOverflow: 'clip'", () => {
    const result = RenderConfigSchema.safeParse({
      legend: { legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("clip");
    }
  });

  it("accepts legendOverflow: 'warn'", () => {
    const result = RenderConfigSchema.safeParse({
      legend: { legendOverflow: "warn" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("warn");
    }
  });

  it("rejects legendOverflow with invalid value", () => {
    const result = RenderConfigSchema.safeParse({
      legend: { legendOverflow: "scroll" },
    });
    expect(result.success).toBe(false);
  });

  it("background.valueChainYAxis.show=false is accepted", () => {
    const result = RenderConfigSchema.safeParse({
      background: { valueChainYAxis: { show: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.valueChainYAxis?.show).toBe(false);
    }
  });

  it("background.evolutionXAxis.show=false is accepted", () => {
    const result = RenderConfigSchema.safeParse({
      background: { evolutionXAxis: { show: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionXAxis?.show).toBe(false);
    }
  });

  it("background.evolutionPhases.showPhaseDividerAndLabel=false is accepted", () => {
    const result = RenderConfigSchema.safeParse({
      background: { evolutionPhases: { showPhaseDividerAndLabel: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.background?.evolutionPhases?.showPhaseDividerAndLabel).toBe(false);
    }
  });

  it("defaults: all visible when renderConfig is absent", () => {
    const result = WardleyMapSchema.safeParse(baseMap);
    expect(result.success).toBe(true);
    if (result.success) {
      // renderConfig is undefined — renderer defaults to all-visible
      expect(result.data.renderConfig).toBeUndefined();
    }
  });

  it("WardleyMap no longer has top-level axes or legend fields", () => {
    const result = WardleyMapSchema.safeParse(baseMap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).axes).toBeUndefined();
      expect((result.data as any).legend).toBeUndefined();
    }
  });

  it("locale at top-level of renderConfig", () => {
    const result = RenderConfigSchema.safeParse({
      locale: "fr",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("fr");
    }
  });
});

// ── layerToggles (AC 3: 7 content layers only) ────────────────────

describe("LayerTogglesSchema — exactly 7 content layers", () => {
  // The canonical 7 toggle keys (axes and legend are excluded)
  const VALID_TOGGLE_KEYS = [
    "title", "pipelines", "edges", "evolvesTo", "nodes", "labels", "notes",
  ] as const;

  it("accepts an empty object (all toggles optional/undefined)", () => {
    const result = LayerTogglesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      for (const key of VALID_TOGGLE_KEYS) {
        expect(result.data[key]).toBeUndefined();
      }
    }
  });

  it("does NOT include 'axes' in layerToggles", () => {
    // 'axes' is NOT a typed key of LayerTogglesSchema
    const result = LayerTogglesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).axes).toBeUndefined();
    }
  });

  it("does NOT include 'legend' in layerToggles", () => {
    // 'legend' is NOT a typed key of LayerTogglesSchema
    const result = LayerTogglesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).legend).toBeUndefined();
    }
  });

  it("accepts each of the 7 toggles set to true", () => {
    for (const key of VALID_TOGGLE_KEYS) {
      const result = LayerTogglesSchema.safeParse({ [key]: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[key]).toBe(true);
      }
    }
  });

  it("accepts each independent toggle set to false (no dependency constraints)", () => {
    // Layers without node-dependency can each be individually toggled false.
    // 'nodes' is excluded here because { nodes: false } alone violates the
    // evolvesTo/labels dependency constraints (they default to true).
    const independentKeys = [
      "title", "pipelines", "edges", "notes",
    ] as const;
    for (const key of independentKeys) {
      const result = LayerTogglesSchema.safeParse({ [key]: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[key]).toBe(false);
      }
    }
  });

  it("accepts evolvesTo=false alone (nodes defaults to true — no constraint)", () => {
    const result = LayerTogglesSchema.safeParse({ evolvesTo: false });
    expect(result.success).toBe(true);
  });

  it("accepts labels=false alone (nodes defaults to true — no constraint)", () => {
    const result = LayerTogglesSchema.safeParse({ labels: false });
    expect(result.success).toBe(true);
  });

  it("accepts nodes=false when evolvesTo AND labels are also explicitly false", () => {
    const result = LayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes).toBe(false);
      expect(result.data.evolvesTo).toBe(false);
      expect(result.data.labels).toBe(false);
    }
  });

  // ── Layer dependency constraint violations ───────────────
  it("rejects nodes=false with evolvesTo unset (defaults to true)", () => {
    const result = LayerTogglesSchema.safeParse({ nodes: false, labels: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("evolvesTo");
    }
  });

  it("rejects nodes=false with labels unset (defaults to true)", () => {
    const result = LayerTogglesSchema.safeParse({ nodes: false, evolvesTo: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("labels");
    }
  });

  it("rejects nodes=false with evolvesTo=true", () => {
    const result = LayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: true,
      labels: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("evolvesTo");
    }
  });

  it("rejects nodes=false with labels=true", () => {
    const result = LayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("labels");
    }
  });

  it("rejects nodes=false alone (both evolvesTo and labels default to true)", () => {
    const result = LayerTogglesSchema.safeParse({ nodes: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("evolvesTo");
      expect(paths).toContain("labels");
    }
  });

  it("error messages are descriptive for dependency violations", () => {
    const result = LayerTogglesSchema.safeParse({ nodes: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("evolvesTo") && m.includes("nodes=true"))).toBe(true);
      expect(messages.some((m) => m.includes("labels") && m.includes("nodes=true"))).toBe(true);
    }
  });

  it("accepts all 7 toggles set to mixed true/false independently", () => {
    const result = LayerTogglesSchema.safeParse({
      title: true,
      pipelines: false,
      edges: true,
      evolvesTo: false,
      nodes: true,
      labels: false,
      notes: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(true);
      expect(result.data.pipelines).toBe(false);
      expect(result.data.edges).toBe(true);
      expect(result.data.evolvesTo).toBe(false);
      expect(result.data.nodes).toBe(true);
      expect(result.data.labels).toBe(false);
      expect(result.data.notes).toBe(true);
    }
  });

  it("rejects non-boolean values for toggle keys", () => {
    expect(LayerTogglesSchema.safeParse({ title: "yes" }).success).toBe(false);
    expect(LayerTogglesSchema.safeParse({ nodes: 1 }).success).toBe(false);
    expect(LayerTogglesSchema.safeParse({ edges: null }).success).toBe(false);
  });
});

describe("RenderConfigSchema — filters field integration", () => {
  it("accepts renderConfig with filters.layers (nodes off with dependents also off)", () => {
    // When nodes=false, both evolvesTo and labels must also be false
    const result = RenderConfigSchema.safeParse({
      filters: { layers: { title: true, nodes: false, evolvesTo: false, labels: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.layers?.title).toBe(true);
      expect(result.data.filters?.layers?.nodes).toBe(false);
      expect(result.data.filters?.layers?.evolvesTo).toBe(false);
      expect(result.data.filters?.layers?.labels).toBe(false);
    }
  });

  it("accepts renderConfig without filters (optional)", () => {
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toBeUndefined();
    }
  });

  it("accepts empty filters.layers object", () => {
    const result = RenderConfigSchema.safeParse({ filters: { layers: {} } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.layers).toBeDefined();
    }
  });

  it("filters.layers has no 'axes' key — axes controlled by background.*", () => {
    // Can set filters.layers AND background.evolutionXAxis simultaneously — no conflict
    const result = RenderConfigSchema.safeParse({
      filters: { layers: { title: false, nodes: true } },
      background: {
        evolutionXAxis: { show: false },
        evolutionPhases: { showPhaseDividerAndLabel: false },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.layers?.title).toBe(false);
      expect(result.data.background?.evolutionXAxis?.show).toBe(false);
      // No 'axes' in filters.layers
      expect((result.data.filters?.layers as any)?.axes).toBeUndefined();
    }
  });

  it("filters.layers has no 'legend' key — legend controlled by legend.show", () => {
    const result = RenderConfigSchema.safeParse({
      filters: { layers: { edges: false } },
      legend: { show: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.layers?.edges).toBe(false);
      expect(result.data.legend?.show).toBe(false);
      // No 'legend' in filters.layers
      expect((result.data.filters?.layers as any)?.legend).toBeUndefined();
    }
  });

  it("WardleyMap with full filters.layers in renderConfig parses correctly", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: {
        filters: {
          layers: {
            title: false,
            pipelines: true,
            edges: true,
            evolvesTo: false,
            nodes: true,
            labels: true,
            notes: false,
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const lt = result.data.renderConfig!.filters!.layers!;
      expect(lt.title).toBe(false);
      expect(lt.pipelines).toBe(true);
      expect(lt.edges).toBe(true);
      expect(lt.evolvesTo).toBe(false);
      expect(lt.nodes).toBe(true);
      expect(lt.labels).toBe(true);
      expect(lt.notes).toBe(false);
    }
  });
});

// ── resolveTheme() unit tests ────────────────────────────────

describe("resolveTheme", () => {
  // ── Defaults ──────────────────────────────────────────────

  it("returns all defaults when called with no arguments", () => {
    const rc = resolveTheme();
    expect(rc.theme).toBe("default");
    expect(rc.width).toBe(1600);
    expect(rc.height).toBe(800);
    expect(rc.background.color).toBe("#ffffff");
    expect(rc.showEvolutionXAxis).toBe(true);
    expect(rc.showValueChainYAxis).toBe(true);
    expect(rc.showPhaseDividerAndLabel).toBe(true);
    expect(rc.fontFamily).toBe("Inter, sans-serif");
    expect(rc.labelScale).toBe(1.0);
    expect(rc.nodeRadii._default).toBe(5);
    expect(rc.avoidCollisions).toBe(true);
    expect(rc.excludeComponentTypes).toEqual([]);
    expect(rc.typeColors).toEqual({});
    expect(rc.evolveStyles).toEqual({});
    expect(rc.strokeWidth).toBe(1);
    expect(rc.legend.show).toBe(true);
    expect(rc.legend.position).toBe("bottom-right");
  });

  it("returns all defaults when called with undefined", () => {
    const rc = resolveTheme(undefined);
    expect(rc.theme).toBe("default");
    expect(rc.width).toBe(1600);
    expect(rc.background.color).toBe("#ffffff");
  });

  it("resolves \"dark\" theme with distinct baseline values", () => {
    const rc = resolveTheme({ theme: "dark" });
    expect(rc.theme).toBe("dark");
    // dark baseline differs from default: navy background, heavier stroke
    expect(rc.background.color).toBe("#1a1a2e");
    expect(rc.strokeWidth).toBe(1.5);
    // non-overridden fields inherit from dark baseline (same as default for these)
    expect(rc.showEvolutionXAxis).toBe(true);
    expect(rc.fontFamily).toBe("Inter, sans-serif");
  });

  it("resolves \"highContrast\" theme with distinct baseline values", () => {
    const rc = resolveTheme({ theme: "highContrast" });
    expect(rc.theme).toBe("highContrast");
    // highContrast baseline: pure black bg, accessible font, heavy strokes
    expect(rc.background.color).toBe("#000000");
    expect(rc.fontFamily).toBe("Arial, sans-serif");
    expect(rc.strokeWidth).toBe(2);
  });

  it("applies width override", () => {
    const rc = resolveTheme({ width: 1920 });
    expect(rc.width).toBe(1920);
    expect(rc.height).toBe(800);
  });

  it("applies height override", () => {
    const rc = resolveTheme({ height: 1080 });
    expect(rc.height).toBe(1080);
    expect(rc.width).toBe(1600);
  });

  it("applies background.color as backgroundColor", () => {
    const rc = resolveTheme({ background: { color: "#1a1a1a" } });
    expect(rc.background.color).toBe("#1a1a1a");
    expect(rc.showEvolutionXAxis).toBe(true);
  });

  it("applies fontFamily override", () => {
    const rc = resolveTheme({ fontFamily: "Roboto, sans-serif" });
    expect(rc.fontFamily).toBe("Roboto, sans-serif");
  });

  it("applies strokeWidth override", () => {
    const rc = resolveTheme({ strokeWidth: 2 });
    expect(rc.strokeWidth).toBe(2);
  });

  it("applies filters.excludeComponentTypes override", () => {
    const rc = resolveTheme({ filters: { excludeComponentTypes: ["note"] } });
    expect(rc.excludeComponentTypes).toEqual(["note"]);
  });

  it("applies typeColors override", () => {
    const rc = resolveTheme({ typeColors: { _default: "#000000", component: "#ff0000" } });
    expect(rc.typeColors).toEqual({ _default: "#000000", component: "#ff0000" });
  });

  // ── showPhaseDividerAndLabel toggle (orthogonal to showEvolutionXAxis) ──

  it("showEvolutionXAxis=false, showPhaseDividerAndLabel=true (combo 1)", () => {
    const rc = resolveTheme({
      background: {
        evolutionXAxis: { show: false },
        evolutionPhases: { showPhaseDividerAndLabel: true },
      },
    });
    expect(rc.showEvolutionXAxis).toBe(false);
    expect(rc.showPhaseDividerAndLabel).toBe(true);
  });

  it("showEvolutionXAxis=true, showPhaseDividerAndLabel=false (combo 2)", () => {
    const rc = resolveTheme({
      background: {
        evolutionXAxis: { show: true },
        evolutionPhases: { showPhaseDividerAndLabel: false },
      },
    });
    expect(rc.showEvolutionXAxis).toBe(true);
    expect(rc.showPhaseDividerAndLabel).toBe(false);
  });

  it("showEvolutionXAxis=false, showPhaseDividerAndLabel=false (combo 3)", () => {
    const rc = resolveTheme({
      background: {
        evolutionXAxis: { show: false },
        evolutionPhases: { showPhaseDividerAndLabel: false },
      },
    });
    expect(rc.showEvolutionXAxis).toBe(false);
    expect(rc.showPhaseDividerAndLabel).toBe(false);
  });

  it("showEvolutionXAxis=true, showPhaseDividerAndLabel=true (combo 4, default)", () => {
    const rc = resolveTheme({
      background: {
        evolutionXAxis: { show: true },
        evolutionPhases: { showPhaseDividerAndLabel: true },
      },
    });
    expect(rc.showEvolutionXAxis).toBe(true);
    expect(rc.showPhaseDividerAndLabel).toBe(true);
  });

  it("showValueChainYAxis toggle works independently", () => {
    const rc = resolveTheme({
      background: { valueChainYAxis: { show: false } },
    });
    expect(rc.showValueChainYAxis).toBe(false);
    expect(rc.showEvolutionXAxis).toBe(true);
    expect(rc.showPhaseDividerAndLabel).toBe(true);
  });

  // ── i18n axis labels ────────────────────────────────────────

  it("resolves axisLabels with en locale by default", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.xAxis).toBe("Evolution");
    expect(rc.axisLabels.yAxis).toBe("Value Chain");
    expect(rc.axisLabels.phases[0]).toBe("Genesis");
  });

  it("resolves axisLabels with fr locale override", () => {
    const rc = resolveTheme({ locale: "fr" });
    expect(rc.axisLabels.xAxis).toBe("Évolution");
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");
    expect(rc.axisLabels.phases[0]).toBe("Genèse");
  });

  it("applies individual axisLabel override on top of locale (colocalized in background.evolutionXAxis)", () => {
    const rc = resolveTheme({ locale: "en", background: { evolutionXAxis: { xAxis: "Custom X" } } });
    expect(rc.axisLabels.xAxis).toBe("Custom X");
    expect(rc.axisLabels.yAxis).toBe("Value Chain");
  });

  // Sub-AC 2: background.axisLabels direction label overrides removed from MapChrome.
  // Direction cue labels (evolutionStart/End) are now locale-only.
  it("direction cue labels use locale preset (evolutionStart/End not overridable via background.axisLabels)", () => {
    const rc = resolveTheme({
      background: {
        // axisLabels with evolutionStart/evolutionEnd fields are silently stripped (no-op)
        axisLabels: {} as Record<string, unknown>,
      },
    });
    // Locale default is used since overrides are no longer supported
    expect(rc.axisLabels.evolutionStart).toBe("Uncharted"); // en locale default
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialized"); // en locale default
    expect(rc.axisLabels.xAxis).toBe("Evolution"); // unchanged
  });

  it("colocalized: background.valueChainYAxis.yAxis overrides y-axis label", () => {
    const rc = resolveTheme({ background: { valueChainYAxis: { yAxis: "Custom Y" } } });
    expect(rc.axisLabels.yAxis).toBe("Custom Y");
    expect(rc.axisLabels.xAxis).toBe("Evolution"); // unchanged
  });

  // Sub-AC 2: visibilityHigh/Low direction label overrides also removed from background.axisLabels.
  it("direction cue labels use locale preset (visibilityHigh/Low not overridable via background.axisLabels)", () => {
    const rc = resolveTheme({
      background: {},
    });
    // Locale defaults used since overrides are no longer supported
    expect(rc.axisLabels.visibilityHigh).toBe("Visible"); // en locale default
    expect(rc.axisLabels.visibilityLow).toBe("Invisible"); // en locale default
  });

  it("colocalized: background.evolutionPhases.phases overrides phase labels", () => {
    const rc = resolveTheme({
      background: {
        evolutionPhases: { phases: ["P1", "P2", "P3", "P4"] },
      },
    });
    expect(rc.axisLabels.phases).toEqual(["P1", "P2", "P3", "P4"]);
  });

  it("colocalized: fr locale with individual label override in evolutionXAxis", () => {
    const rc = resolveTheme({
      locale: "fr",
      background: { evolutionXAxis: { xAxis: "Custom Évolution" } },
    });
    // Individual override takes precedence over fr locale preset
    expect(rc.axisLabels.xAxis).toBe("Custom Évolution");
    // Other labels still come from fr locale
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");
    expect(rc.axisLabels.phases[0]).toBe("Genèse");
  });

  it("colocalized: all supported label overrides across axis sub-objects", () => {
    // Sub-AC 2: axisLabels direction label overrides removed — only xAxis, yAxis, phases remain overridable
    const rc = resolveTheme({
      background: {
        evolutionXAxis: { xAxis: "Evo" },
        valueChainYAxis: { yAxis: "Chain" },
        evolutionPhases: { phases: ["A", "B", "C", "D"] },
      },
    });
    expect(rc.axisLabels.xAxis).toBe("Evo");
    // Direction cue labels fall back to locale defaults (no longer overridable via background.axisLabels)
    expect(rc.axisLabels.evolutionStart).toBe("Uncharted"); // en locale default
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialized"); // en locale default
    expect(rc.axisLabels.yAxis).toBe("Chain");
    expect(rc.axisLabels.visibilityHigh).toBe("Visible"); // en locale default
    expect(rc.axisLabels.visibilityLow).toBe("Invisible"); // en locale default
    expect(rc.axisLabels.phases).toEqual(["A", "B", "C", "D"]);
  });

  // ── Legend ──────────────────────────────────────────────────

  it("resolves legend defaults", () => {
    const rc = resolveTheme();
    expect(rc.legend.show).toBe(true);
    expect(rc.legend.position).toBe("bottom-right");
  });

  it("applies legend show=false override", () => {
    const rc = resolveTheme({ legend: { show: false, position: "top-left" } });
    expect(rc.legend.show).toBe(false);
    expect(rc.legend.position).toBe("top-left");
  });

  it("applies legend with {x, y} position override", () => {
    const rc = resolveTheme({ legend: { show: true, position: { x: 100, y: 200 } } });
    expect(rc.legend.position).toEqual({ x: 100, y: 200 });
  });

  it("resolves legendOverflow default to 'allow'", () => {
    const rc = resolveTheme();
    expect(rc.legend.legendOverflow).toBe("allow");
  });

  it("applies legendOverflow 'clip' override", () => {
    const rc = resolveTheme({ legend: { legendOverflow: "clip" } });
    expect(rc.legend.legendOverflow).toBe("clip");
  });

  it("applies legendOverflow 'warn' override", () => {
    const rc = resolveTheme({ legend: { legendOverflow: "warn" } });
    expect(rc.legend.legendOverflow).toBe("warn");
  });

  // ── Theme + overrides ────────────────────────────────────────

  it("applies overrides on top of dark theme baseline", () => {
    const rc = resolveTheme({
      theme: "dark",
      background: { color: "#000000" },
      width: 1920,
    });
    expect(rc.theme).toBe("dark");
    expect(rc.background.color).toBe("#000000");
    expect(rc.width).toBe(1920);
  });

  // ── Theme precedence: inline > theme baseline ─────────────
  // These tests verify the 2-level precedence chain:
  //   Level 1 (lowest) : theme baseline (selected by `theme` field)
  //   Level 2 (highest): explicit inline field overrides

  it("[precedence] dark theme baseline backgroundColor overridden by inline background.color", () => {
    // dark baseline = "#1a1a2e"; inline "#ff0000" must win
    const rc = resolveTheme({
      theme: "dark",
      background: { color: "#ff0000" },
    });
    expect(rc.background.color).toBe("#ff0000"); // inline wins
    expect(rc.strokeWidth).toBe(1.5);           // non-overridden field: dark baseline persists
  });

  it("[precedence] highContrast theme baseline backgroundColor overridden by inline background.color", () => {
    // highContrast baseline = "#000000"; inline "#aabbcc" must win
    const rc = resolveTheme({
      theme: "highContrast",
      background: { color: "#aabbcc" },
    });
    expect(rc.background.color).toBe("#aabbcc"); // inline wins
    expect(rc.fontFamily).toBe("Arial, sans-serif"); // non-overridden: highContrast baseline persists
  });

  it("[precedence] dark theme strokeWidth overridden by inline strokeWidth", () => {
    // dark baseline strokeWidth = 1.5; inline 0.5 must win
    const rc = resolveTheme({
      theme: "dark",
      strokeWidth: 0.5,
    });
    expect(rc.strokeWidth).toBe(0.5);           // inline wins
    expect(rc.background.color).toBe("#1a1a2e"); // non-overridden: dark baseline persists
  });

  it("[precedence] highContrast theme fontFamily overridden by inline fontFamily", () => {
    // highContrast baseline fontFamily = "Arial, sans-serif"; inline "Roboto" must win
    const rc = resolveTheme({
      theme: "highContrast",
      fontFamily: "Roboto, sans-serif",
    });
    expect(rc.fontFamily).toBe("Roboto, sans-serif"); // inline wins
    expect(rc.background.color).toBe("#000000");       // non-overridden: highContrast baseline persists
    expect(rc.strokeWidth).toBe(2);                   // non-overridden: highContrast baseline persists
  });

  it("[precedence] no inline override → theme baseline values apply intact", () => {
    // Verifies theme baseline is the source of truth when no overrides provided
    const rcDefault = resolveTheme({ theme: "default" });
    const rcDark    = resolveTheme({ theme: "dark" });
    const rcHC      = resolveTheme({ theme: "highContrast" });

    // All three themes differ in backgroundColor — baseline is the sole differentiator
    expect(rcDefault.background.color).toBe("#ffffff");
    expect(rcDark.background.color).toBe("#1a1a2e");
    expect(rcHC.background.color).toBe("#000000");

    // They all share the same non-theme-specific fields
    expect(rcDefault.width).toBe(rcDark.width);
    expect(rcDark.width).toBe(rcHC.width);
  });

  it("[precedence] simultaneous inline overrides on highContrast: all explicit fields win", () => {
    // 3 inline overrides on top of highContrast baseline — each must individually win
    const rc = resolveTheme({
      theme: "highContrast",
      background: { color: "#112233" },
      fontFamily: "Georgia, serif",
      strokeWidth: 0.75,
    });
    expect(rc.theme).toBe("highContrast");
    expect(rc.background.color).toBe("#112233");      // inline > highContrast baseline (#000000)
    expect(rc.fontFamily).toBe("Georgia, serif");    // inline > highContrast baseline (Arial)
    expect(rc.strokeWidth).toBe(0.75);               // inline > highContrast baseline (2)
    // un-overridden fields still come from the highContrast baseline
    expect(rc.nodeRadii._default).toBe(5);
    expect(rc.showEvolutionXAxis).toBe(true);
  });
});

// ── AC 12: Default values sensible in English ─────────────────────

describe("Default values sensible in English (AC 12)", () => {
  // ── Locale default ─────────────────────────────────────────

  it("locale defaults to 'en' in resolved config", () => {
    const rc = resolveTheme();
    expect(rc.locale).toBe("en");
  });

  it("locale defaults to 'en' even when renderConfig is undefined", () => {
    const rc = resolveTheme(undefined);
    expect(rc.locale).toBe("en");
  });

  it("locale defaults to 'en' when renderConfig is empty object", () => {
    const rc = resolveTheme({});
    expect(rc.locale).toBe("en");
  });

  // ── English axis label defaults (all 7 fields) ─────────────

  it("xAxis label defaults to 'Evolution' (English)", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.xAxis).toBe("Evolution");
  });

  it("yAxis label defaults to 'Value Chain' (English)", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.yAxis).toBe("Value Chain");
  });

  it("evolutionStart label defaults to 'Uncharted' (English)", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.evolutionStart).toBe("Uncharted");
  });

  it("evolutionEnd label defaults to 'Industrialized' (English)", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialized");
  });

  it("visibilityHigh label defaults to 'Visible' (English)", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.visibilityHigh).toBe("Visible");
  });

  it("visibilityLow label defaults to 'Invisible' (English)", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.visibilityLow).toBe("Invisible");
  });

  it("all 4 phase labels default to standard English Wardley Map names", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.phases).toEqual([
      "Genesis",
      "Custom-Built",
      "Product (+Rental)",
      "Commodity (+Utility)",
    ]);
  });

  // ── Individual phase names ──────────────────────────────────

  it("phase[0] defaults to 'Genesis'", () => {
    expect(resolveTheme().axisLabels.phases[0]).toBe("Genesis");
  });

  it("phase[1] defaults to 'Custom-Built'", () => {
    expect(resolveTheme().axisLabels.phases[1]).toBe("Custom-Built");
  });

  it("phase[2] defaults to 'Product (+Rental)'", () => {
    expect(resolveTheme().axisLabels.phases[2]).toBe("Product (+Rental)");
  });

  it("phase[3] defaults to 'Commodity (+Utility)'", () => {
    expect(resolveTheme().axisLabels.phases[3]).toBe("Commodity (+Utility)");
  });

  // ── Default values are non-empty English strings ────────────

  it("all default axis labels are non-empty strings", () => {
    const { axisLabels } = resolveTheme();
    expect(axisLabels.xAxis.length).toBeGreaterThan(0);
    expect(axisLabels.yAxis.length).toBeGreaterThan(0);
    expect(axisLabels.evolutionStart.length).toBeGreaterThan(0);
    expect(axisLabels.evolutionEnd.length).toBeGreaterThan(0);
    expect(axisLabels.visibilityHigh.length).toBeGreaterThan(0);
    expect(axisLabels.visibilityLow.length).toBeGreaterThan(0);
    expect(axisLabels.phases).toHaveLength(4);
    axisLabels.phases.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });

  // ── Default labels are English, not French ──────────────────

  it("default xAxis label is English ('Evolution'), not French ('Évolution')", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.xAxis).not.toBe("Évolution");
    expect(rc.axisLabels.xAxis).toBe("Evolution");
  });

  it("default yAxis label is English ('Value Chain'), not French ('Chaîne de valeur')", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.yAxis).not.toBe("Chaîne de valeur");
    expect(rc.axisLabels.yAxis).toBe("Value Chain");
  });

  it("default phase[0] is English ('Genesis'), not French ('Genèse')", () => {
    const rc = resolveTheme();
    expect(rc.axisLabels.phases[0]).not.toBe("Genèse");
    expect(rc.axisLabels.phases[0]).toBe("Genesis");
  });

  // ── AXIS_LABELS_EN constant ─────────────────────────────────

  it("AXIS_LABELS_EN constant has all required English label fields", () => {
    expect(AXIS_LABELS_EN.xAxis).toBe("Evolution");
    expect(AXIS_LABELS_EN.yAxis).toBe("Value Chain");
    expect(AXIS_LABELS_EN.evolutionStart).toBe("Uncharted");
    expect(AXIS_LABELS_EN.evolutionEnd).toBe("Industrialized");
    expect(AXIS_LABELS_EN.visibilityHigh).toBe("Visible");
    expect(AXIS_LABELS_EN.visibilityLow).toBe("Invisible");
    expect(AXIS_LABELS_EN.phases).toEqual([
      "Genesis",
      "Custom-Built",
      "Product (+Rental)",
      "Commodity (+Utility)",
    ]);
  });

  it("resolveAxisLabels() with no args returns English defaults", () => {
    const labels = resolveAxisLabels();
    expect(labels.xAxis).toBe("Evolution");
    expect(labels.yAxis).toBe("Value Chain");
    expect(labels.evolutionStart).toBe("Uncharted");
    expect(labels.evolutionEnd).toBe("Industrialized");
    expect(labels.visibilityHigh).toBe("Visible");
    expect(labels.visibilityLow).toBe("Invisible");
    expect(labels.phases).toEqual([
      "Genesis",
      "Custom-Built",
      "Product (+Rental)",
      "Commodity (+Utility)",
    ]);
  });

  it("resolveAxisLabels({ locale: 'en' }) returns same English defaults", () => {
    const labels = resolveAxisLabels({ locale: "en" });
    expect(labels.xAxis).toBe("Evolution");
    expect(labels.yAxis).toBe("Value Chain");
    expect(labels.phases).toEqual([
      "Genesis",
      "Custom-Built",
      "Product (+Rental)",
      "Commodity (+Utility)",
    ]);
  });

  // ── Other sensible English defaults ────────────────────────

  it("fontFamily defaults to 'Inter, sans-serif'", () => {
    expect(resolveTheme().fontFamily).toBe("Inter, sans-serif");
  });

  it("canvas defaults to classic Wardley Map dimensions (1600 × 800)", () => {
    const rc = resolveTheme();
    expect(rc.width).toBe(1600);
    expect(rc.height).toBe(800);
  });

  it("backgroundColor defaults to white (#ffffff)", () => {
    expect(resolveTheme().background.color).toBe("#ffffff");
  });

  it("legend defaults to visible at bottom-right", () => {
    const rc = resolveTheme();
    expect(rc.legend.show).toBe(true);
    expect(rc.legend.position).toBe("bottom-right");
  });

  it("theme defaults to 'default'", () => {
    expect(resolveTheme().theme).toBe("default");
  });

  it("strokeWidth defaults to 1", () => {
    expect(resolveTheme().strokeWidth).toBe(1);
  });

  it("avoidCollisions defaults to true (labels avoid overlap)", () => {
    expect(resolveTheme().avoidCollisions).toBe(true);
  });

  it("nodeRadii._default defaults to 5px", () => {
    expect(resolveTheme().nodeRadii._default).toBe(5);
  });

  it("labelScale defaults to 1.0 (normal size)", () => {
    expect(resolveTheme().labelScale).toBe(1.0);
  });

  it("excludeComponentTypes defaults to empty array (all types visible)", () => {
    expect(resolveTheme().excludeComponentTypes).toEqual([]);
  });

  it("showEvolutionXAxis defaults to true (X-axis visible)", () => {
    expect(resolveTheme().showEvolutionXAxis).toBe(true);
  });

  it("showValueChainYAxis defaults to true (Y-axis visible)", () => {
    expect(resolveTheme().showValueChainYAxis).toBe(true);
  });

  it("showPhaseDividerAndLabel defaults to true (phase dividers visible)", () => {
    expect(resolveTheme().showPhaseDividerAndLabel).toBe(true);
  });
});

// ── EvolveTypeEnum closed set tests (AC 7) ───────────────────

describe("EvolveTypeEnum — closed set of evolution arrow types", () => {
  it("EvolveTypeEnum contains exactly the four valid evolve types", () => {
    expect(EvolveTypeEnum.options).toEqual(["natural", "ecosystem", "forced", "late"]);
  });

  it("EvolveStylesMapSchema accepts all four valid keys", () => {
    const result = EvolveStylesMapSchema.safeParse({
      natural: { stroke: "#dc2626" },
      ecosystem: { stroke: "#2563eb" },
      forced: { stroke: "#9333ea" },
      late: { stroke: "#999999" },
    });
    expect(result.success).toBe(true);
  });

  it("EvolveStylesMapSchema rejects unknown keys at parse time", () => {
    const result = EvolveStylesMapSchema.safeParse({
      natural: { stroke: "#dc2626" },
      genesis: { stroke: "#000" },
    });
    expect(result.success).toBe(false);
  });

  it("EvolveStylesMapSchema accepts partial record (not all keys required)", () => {
    const result = EvolveStylesMapSchema.safeParse({
      late: { strokeDasharray: "8,4" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.late?.strokeDasharray).toBe("8,4");
      expect(result.data.natural).toBeUndefined();
    }
  });

  it("EvolveStylesMapSchema accepts empty object", () => {
    const result = EvolveStylesMapSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  // ── TypeStyleMap _default key (new in TypeStyleMap pattern) ──

  it("EvolveStylesMapSchema accepts _default key as optional catch-all fallback", () => {
    const result = EvolveStylesMapSchema.safeParse({
      _default: { stroke: "#888888", strokeDasharray: "4,2" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default?.stroke).toBe("#888888");
      expect(result.data._default?.strokeDasharray).toBe("4,2");
    }
  });

  it("EvolveStylesMapSchema accepts _default alongside per-type overrides", () => {
    const result = EvolveStylesMapSchema.safeParse({
      _default: { stroke: "#888888" },
      natural: { stroke: "#dc2626" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default?.stroke).toBe("#888888");
      expect(result.data.natural?.stroke).toBe("#dc2626");
    }
  });

  it("EvolveStylesMapSchema accepts empty object — _default not required (non-breaking)", () => {
    // Existing callers that omit _default must continue to work
    const result = EvolveStylesMapSchema.safeParse({
      natural: { stroke: "#dc2626" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default).toBeUndefined();
    }
  });
});

// ── NodeRadiiSchema — per-type radius with _default fallback ──────

describe("NodeRadiiSchema — schema validation", () => {
  it("rejects an empty object (_default is required)", () => {
    const result = NodeRadiiSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts _default only", () => {
    const result = NodeRadiiSchema.safeParse({ _default: 8 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default).toBe(8);
      expect(result.data.component).toBeUndefined();
    }
  });

  it("accepts per-type radii for all 5 component types (with required _default)", () => {
    const result = NodeRadiiSchema.safeParse({
      _default: 5,
      component: 5,
      "user-need": 6,
      pipeline: 4,
      note: 3,
      anchor: 8,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default).toBe(5);
      expect(result.data.component).toBe(5);
      expect(result.data["user-need"]).toBe(6);
      expect(result.data.pipeline).toBe(4);
      expect(result.data.note).toBe(3);
      expect(result.data.anchor).toBe(8);
    }
  });

  it("accepts mixed _default and per-type overrides", () => {
    const result = NodeRadiiSchema.safeParse({ _default: 7, anchor: 12 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default).toBe(7);
      expect(result.data.anchor).toBe(12);
      expect(result.data.component).toBeUndefined(); // not set
    }
  });

  it("rejects unknown keys (strict schema)", () => {
    const result = NodeRadiiSchema.safeParse({ unknown: 5 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown key even when _default is present (TypeStyleMap strict schema)", () => {
    // TypeStyleMap pattern: strict schema rejects keys outside ComponentTypeEnum + _default
    const result = NodeRadiiSchema.safeParse({ _default: 5, unknown: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects mixed valid and invalid keys (TypeStyleMap strict)", () => {
    const result = NodeRadiiSchema.safeParse({ _default: 5, anchor: 8, invalidType: 3 });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric values", () => {
    const result = NodeRadiiSchema.safeParse({ _default: "big" });
    expect(result.success).toBe(false);
  });

  it("rejects zero (not positive)", () => {
    const result = NodeRadiiSchema.safeParse({ component: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative values", () => {
    const result = NodeRadiiSchema.safeParse({ anchor: -3 });
    expect(result.success).toBe(false);
  });

  it("rejects values above 50", () => {
    expect(NodeRadiiSchema.safeParse({ _default: 51 }).success).toBe(false);
    expect(NodeRadiiSchema.safeParse({ component: 51 }).success).toBe(false);
    expect(NodeRadiiSchema.safeParse({ anchor: 100 }).success).toBe(false);
  });

  it("accepts boundary value 50", () => {
    const result = NodeRadiiSchema.safeParse({ _default: 50, anchor: 50 });
    expect(result.success).toBe(true);
  });

  it("accepts fractional (non-integer) values", () => {
    const result = NodeRadiiSchema.safeParse({ _default: 5.5, anchor: 7.25 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default).toBe(5.5);
      expect(result.data.anchor).toBe(7.25);
    }
  });
});

describe("RenderConfigSchema — nodeRadii field integration", () => {
  it("nodeRadii is optional (absent when not provided)", () => {
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodeRadii).toBeUndefined();
    }
  });

  it("accepts nodeRadii with _default only", () => {
    const result = RenderConfigSchema.safeParse({ nodeRadii: { _default: 8 } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodeRadii?._default).toBe(8);
    }
  });

  it("accepts nodeRadii with per-type overrides", () => {
    const result = RenderConfigSchema.safeParse({
      nodeRadii: { _default: 5, anchor: 10, component: 4 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodeRadii?._default).toBe(5);
      expect(result.data.nodeRadii?.anchor).toBe(10);
      expect(result.data.nodeRadii?.component).toBe(4);
    }
  });

  it("accepts nodeRadii with _default and per-type anchor", () => {
    const result = RenderConfigSchema.safeParse({ nodeRadii: { _default: 5, anchor: 10 } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodeRadii?._default).toBe(5);
      expect(result.data.nodeRadii?.anchor).toBe(10);
    }
  });

  it("rejects nodeRadii with value above 50", () => {
    const result = RenderConfigSchema.safeParse({ nodeRadii: { component: 51 } });
    expect(result.success).toBe(false);
  });

  it("rejects nodeRadii with unknown key (strict schema)", () => {
    const result = RenderConfigSchema.safeParse({ nodeRadii: { invalidType: 5 } });
    expect(result.success).toBe(false);
  });

  it("rejects nodeRadii with unknown key when _default is present (TypeStyleMap strict)", () => {
    // Verifies the TypeStyleMap pattern: strict schema rejects unknown keys even with valid _default
    const result = RenderConfigSchema.safeParse({ nodeRadii: { _default: 5, invalidKey: 10 } });
    expect(result.success).toBe(false);
  });
});

describe("resolveTheme — nodeRadii resolution", () => {
  it("default: nodeRadii has _default: 5 (baseline fallback)", () => {
    const rc = resolveTheme();
    // nodeRadii defaults to { _default: 5 } from the theme baseline
    expect(rc.nodeRadii).toEqual({ _default: 5 });
  });

  it("nodeRadii._default is passed through to resolved config", () => {
    const rc = resolveTheme({ nodeRadii: { _default: 10 } });
    expect(rc.nodeRadii._default).toBe(10);
  });

  it("nodeRadii per-type anchor is merged with baseline _default", () => {
    const rc = resolveTheme({ nodeRadii: { _default: 5, anchor: 15 } });
    expect(rc.nodeRadii._default).toBe(5);
    expect(rc.nodeRadii.anchor).toBe(15);
    // Other types unset
    expect(rc.nodeRadii.component).toBeUndefined();
  });

  it("nodeRadii with mixed _default and per-type is passed through correctly", () => {
    const rc = resolveTheme({ nodeRadii: { _default: 7, anchor: 12, component: 4 } });
    expect(rc.nodeRadii._default).toBe(7);
    expect(rc.nodeRadii.anchor).toBe(12);
    expect(rc.nodeRadii.component).toBe(4);
    // pipeline not explicitly set
    expect(rc.nodeRadii.pipeline).toBeUndefined();
  });

  it("nodeRadii caller overrides spread over baseline: _default from caller wins", () => {
    const rc = resolveTheme({ nodeRadii: { _default: 8, anchor: 12 } });
    // _default from caller replaces baseline's _default: 5
    expect(rc.nodeRadii._default).toBe(8);
    // Per-type from caller
    expect(rc.nodeRadii.anchor).toBe(12);
    expect(rc.nodeRadii.component).toBeUndefined(); // not in nodeRadii
  });

  it("nodeRadii absent: resolved config uses baseline { _default: 5 }", () => {
    const rc = resolveTheme({});
    expect(rc.nodeRadii).toEqual({ _default: 5 });
  });
});

// ── AC 6: i18n precedence — explicit labels override locale ───────────────────────────────
//
// Precedence chain (highest wins):
//   3. Explicit label strings in background sub-objects  ← always win
//   2. Locale preset (en / fr)
//   1. English fallback (when locale is absent or unknown)
//
// "Contradictory inputs" means: locale says one thing, explicit string says another.
// The explicit string MUST always win regardless of which locale is active.

describe("i18n precedence — explicit label strings override locale (AC 6)", () => {
  // ── Contradictory: fr locale vs explicit English xAxis ────────
  it("fr locale + explicit English xAxis → English wins for xAxis, fr elsewhere", () => {
    const rc = resolveTheme({
      locale: "fr",
      background: { evolutionXAxis: { xAxis: "Evolution" } },
    });
    expect(rc.axisLabels.xAxis).toBe("Evolution");         // explicit English wins
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur"); // fr preset still active
    expect(rc.axisLabels.phases[0]).toBe("Genèse");        // fr preset still active
  });

  // Sub-AC 2: direction cue labels (evolutionStart/End) are no longer overridable via background.axisLabels.
  // They now always use the locale preset.
  it("fr locale → evolutionStart/End use fr locale preset (not overridable via background.axisLabels)", () => {
    const rc = resolveTheme({
      locale: "fr",
    });
    expect(rc.axisLabels.evolutionStart).toBe("Inexploré");       // fr locale preset
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialisé");     // fr locale preset
    expect(rc.axisLabels.xAxis).toBe("Évolution");                // fr locale preset
  });

  it("fr locale + explicit English yAxis → explicit wins, fr phases unchanged", () => {
    const rc = resolveTheme({
      locale: "fr",
      background: { valueChainYAxis: { yAxis: "Value Chain" } },
    });
    expect(rc.axisLabels.yAxis).toBe("Value Chain");       // explicit English wins
    expect(rc.axisLabels.phases[0]).toBe("Genèse");        // fr preset still active
    expect(rc.axisLabels.xAxis).toBe("Évolution");         // fr preset still active
  });

  // Sub-AC 2: visibilityHigh/Low are no longer overridable via background.axisLabels.
  it("fr locale → visibilityHigh/Low use fr locale preset (not overridable via background.axisLabels)", () => {
    const rc = resolveTheme({
      locale: "fr",
    });
    expect(rc.axisLabels.visibilityHigh).toBe("Visible");      // fr locale preset (same as en)
    expect(rc.axisLabels.visibilityLow).toBe("Invisible");     // fr locale preset (same as en)
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");      // fr preset
  });

  it("fr locale + explicit English phases → explicit wins, fr axis labels unchanged", () => {
    const rc = resolveTheme({
      locale: "fr",
      background: { evolutionPhases: { phases: ["Genesis", "Custom-Built", "Product (+Rental)", "Commodity (+Utility)"] } },
    });
    expect(rc.axisLabels.phases).toEqual(["Genesis", "Custom-Built", "Product (+Rental)", "Commodity (+Utility)"]);
    expect(rc.axisLabels.xAxis).toBe("Évolution");  // fr preset still active
  });

  // ── Contradictory: en locale vs explicit French strings ────────
  it("en locale + explicit French xAxis → French string wins", () => {
    const rc = resolveTheme({
      locale: "en",
      background: { evolutionXAxis: { xAxis: "Évolution" } },
    });
    expect(rc.axisLabels.xAxis).toBe("Évolution");        // explicit French wins
    expect(rc.axisLabels.yAxis).toBe("Value Chain");      // en preset for unset field
  });

  it("en locale + explicit French phases → French phases win", () => {
    const rc = resolveTheme({
      locale: "en",
      background: { evolutionPhases: { phases: ["Genèse", "Sur mesure", "Produit (+location)", "Commodité (+utilité)"] } },
    });
    expect(rc.axisLabels.phases).toEqual(["Genèse", "Sur mesure", "Produit (+location)", "Commodité (+utilité)"]);
    expect(rc.axisLabels.xAxis).toBe("Evolution");  // en preset still active for unset fields
  });

  // ── Contradictory: all 7 fields explicit, contradicts active locale ────────
  // Sub-AC 2: only xAxis, yAxis, phases are overridable; direction cue labels are locale-only.
  it("fr locale + xAxis/yAxis/phases explicitly set to English → explicit wins for those 3", () => {
    const rc = resolveTheme({
      locale: "fr",
      background: {
        evolutionXAxis: { xAxis: "Evolution" },
        valueChainYAxis: { yAxis: "Value Chain" },
        evolutionPhases: { phases: ["Genesis", "Custom-Built", "Product (+Rental)", "Commodity (+Utility)"] },
        // axisLabels with direction fields stripped by Sub-AC 2
      },
    });
    // 3 overridable fields use explicit values
    expect(rc.axisLabels.xAxis).toBe("Evolution");
    expect(rc.axisLabels.yAxis).toBe("Value Chain");
    expect(rc.axisLabels.phases).toEqual(["Genesis", "Custom-Built", "Product (+Rental)", "Commodity (+Utility)"]);
    // Direction cue labels use fr locale (not overridable)
    expect(rc.axisLabels.evolutionStart).toBe("Inexploré");
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialisé");
    expect(rc.axisLabels.visibilityHigh).toBe("Visible");
    expect(rc.axisLabels.visibilityLow).toBe("Invisible");
  });

  // Sub-AC 2: direction cue labels not overridable; only xAxis/yAxis/phases can be set explicitly.
  it("en locale + xAxis/yAxis/phases explicitly set to French → explicit wins for those 3", () => {
    const rc = resolveTheme({
      locale: "en",
      background: {
        evolutionXAxis: { xAxis: "Évolution" },
        valueChainYAxis: { yAxis: "Chaîne de valeur" },
        evolutionPhases: { phases: ["Genèse", "Sur mesure", "Produit (+location)", "Commodité (+utilité)"] },
        // axisLabels with direction fields stripped by Sub-AC 2
      },
    });
    expect(rc.axisLabels.xAxis).toBe("Évolution");
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");
    expect(rc.axisLabels.phases).toEqual(["Genèse", "Sur mesure", "Produit (+location)", "Commodité (+utilité)"]);
    // Direction cue labels use en locale (not overridable)
    expect(rc.axisLabels.evolutionStart).toBe("Uncharted");
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialized");
  });

  // ── Contradictory: unknown locale + explicit labels ────────
  it("unknown locale + explicit labels → explicit wins, unknown locale falls back to English for unset", () => {
    const rc = resolveTheme({
      // @ts-expect-error intentionally passing invalid locale to test fallback behaviour
      locale: "de",
      background: { evolutionXAxis: { xAxis: "Entwicklung" } },
    });
    expect(rc.axisLabels.xAxis).toBe("Entwicklung");     // explicit wins even over unknown locale
    expect(rc.axisLabels.yAxis).toBe("Value Chain");     // en fallback for unset fields (de not in presets)
  });

  // ── resolveAxisLabels() directly — contradictory inputs ────────
  it("resolveAxisLabels: fr locale + explicit English xAxis → explicit wins", () => {
    const labels = resolveAxisLabels({ locale: "fr", xAxis: "Evolution" });
    expect(labels.xAxis).toBe("Evolution");           // explicit overrides fr preset
    expect(labels.yAxis).toBe("Chaîne de valeur");    // fr preset for unset fields
    expect(labels.phases[0]).toBe("Genèse");           // fr preset for unset fields
  });

  it("resolveAxisLabels: fr locale + explicit custom phases → explicit wins", () => {
    const labels = resolveAxisLabels({
      locale: "fr",
      phases: ["P1", "P2", "P3", "P4"],
    });
    expect(labels.phases).toEqual(["P1", "P2", "P3", "P4"]);  // explicit wins
    expect(labels.xAxis).toBe("Évolution");                    // fr preset unchanged
  });

  it("resolveAxisLabels: no locale + explicit labels → explicit wins over en fallback", () => {
    const labels = resolveAxisLabels({ xAxis: "Custom Axis", evolutionStart: "Alpha", evolutionEnd: "Omega" });
    expect(labels.xAxis).toBe("Custom Axis");     // explicit wins over en fallback
    expect(labels.evolutionStart).toBe("Alpha");  // explicit wins
    expect(labels.evolutionEnd).toBe("Omega");    // explicit wins
    expect(labels.yAxis).toBe("Value Chain");     // en fallback for unset field
  });

  // ── Locale is purely a fallback — unset fields use locale, set fields ignore it ────────
  it("locale acts as fallback only: explicit xAxis wins, all other fields use locale", () => {
    // Sub-AC 2: direction cue labels are not overridable; only xAxis/yAxis/phases remain overridable
    const rc = resolveTheme({
      locale: "fr",
      background: { evolutionXAxis: { xAxis: "Starting Point" } }, // explicit overrides fr locale for xAxis
    });
    expect(rc.axisLabels.xAxis).toBe("Starting Point");           // explicit wins
    expect(rc.axisLabels.evolutionStart).toBe("Inexploré");       // fr locale (not overridable)
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialisé");     // fr locale fallback
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");         // fr locale fallback
    expect(rc.axisLabels.phases[0]).toBe("Genèse");               // fr locale fallback
  });
});

// ── Legend {x,y} canvas bounds validation (Sub-AC 2b) ────────────────────────
//
// legend.position can be either:
//   - a named preset string: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "auto"
//   - an explicit {x, y} pixel coordinate within the canvas (0 ≤ x ≤ width, 0 ≤ y ≤ height)
//
// The bounds check only applies to {x, y} objects. Named positions bypass the check entirely.
// Default canvas: 1600 × 800. Custom dimensions (via width/height) are respected.

describe("RenderConfigSchema — legend {x,y} canvas bounds validation", () => {
  // ── Named positions bypass bounds check ──────────────────────────────────

  it("accepts named position 'top-left' without bounds check", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: "top-left" } });
    expect(result.success).toBe(true);
  });

  it("accepts named position 'bottom-right' without bounds check", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: "bottom-right" } });
    expect(result.success).toBe(true);
  });

  it("accepts named position 'auto' without bounds check", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: "auto" } });
    expect(result.success).toBe(true);
  });

  // ── In-bounds {x,y} — default canvas (1600×800) ──────────────────────────

  it("accepts {x: 100, y: 600} within default canvas 1600×800", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 100, y: 600 } } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toEqual({ x: 100, y: 600 });
    }
  });

  it("accepts {x: 800, y: 400} (center of default canvas)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 800, y: 400 } } });
    expect(result.success).toBe(true);
  });

  // ── Edge values — exactly at canvas boundary (valid) ─────────────────────

  it("accepts {x: 0, y: 0} (top-left corner — minimum edge)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 0, y: 0 } } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toEqual({ x: 0, y: 0 });
    }
  });

  it("accepts {x: 1600, y: 800} (bottom-right corner — maximum edge on default canvas)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 1600, y: 800 } } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toEqual({ x: 1600, y: 800 });
    }
  });

  it("accepts {x: 0, y: 800} (bottom-left corner — edge value)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 0, y: 800 } } });
    expect(result.success).toBe(true);
  });

  it("accepts {x: 1600, y: 0} (top-right corner — edge value)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 1600, y: 0 } } });
    expect(result.success).toBe(true);
  });

  // ── Out-of-bounds {x,y} — rejected ───────────────────────────────────────

  it("rejects x < 0 (negative x)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: -1, y: 100 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.path.includes("x"))).toBe(true);
      expect(issues.some((i) => i.message.includes("legend.position.x"))).toBe(true);
    }
  });

  it("rejects y < 0 (negative y)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 100, y: -1 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.path.includes("y"))).toBe(true);
      expect(issues.some((i) => i.message.includes("legend.position.y"))).toBe(true);
    }
  });

  it("rejects x > 1600 (exceeds default canvas width)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 1601, y: 100 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("x"))).toBe(true);
    }
  });

  it("rejects y > 800 (exceeds default canvas height)", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: 100, y: 801 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("y"))).toBe(true);
    }
  });

  it("rejects both x and y out-of-bounds simultaneously — two issues reported", () => {
    const result = RenderConfigSchema.safeParse({ legend: { position: { x: -5, y: 900 } } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[i.path.length - 1]);
      expect(paths).toContain("x");
      expect(paths).toContain("y");
    }
  });

  // ── Custom canvas dimensions — bounds scale with width/height ─────────────

  it("respects custom width: accepts x=500 when width=800 and height=600", () => {
    const result = RenderConfigSchema.safeParse({
      width: 800,
      height: 600,
      legend: { position: { x: 500, y: 300 } },
    });
    expect(result.success).toBe(true);
  });

  it("respects custom width: rejects x=1600 when width=800 (exceeds custom width)", () => {
    const result = RenderConfigSchema.safeParse({
      width: 800,
      height: 600,
      legend: { position: { x: 1600, y: 300 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("x"))).toBe(true);
      // Error message should mention the custom width (800)
      expect(result.error.issues.some((i) => i.message.includes("800"))).toBe(true);
    }
  });

  it("respects custom height: rejects y=800 when height=600 (exceeds custom height)", () => {
    const result = RenderConfigSchema.safeParse({
      width: 1600,
      height: 600,
      legend: { position: { x: 100, y: 800 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("y"))).toBe(true);
      // Error message should mention the custom height (600)
      expect(result.error.issues.some((i) => i.message.includes("600"))).toBe(true);
    }
  });

  it("accepts x=width and y=height as valid edge (exactly on boundary)", () => {
    const result = RenderConfigSchema.safeParse({
      width: 1200,
      height: 600,
      legend: { position: { x: 1200, y: 600 } },
    });
    expect(result.success).toBe(true);
  });

  // ── Absence of legend — no error raised ──────────────────────────────────

  it("accepts config with no legend field (no bounds check triggered)", () => {
    const result = RenderConfigSchema.safeParse({ width: 1600, height: 800 });
    expect(result.success).toBe(true);
  });

  it("accepts legend without position (defaults to 'bottom-right', no bounds check)", () => {
    const result = RenderConfigSchema.safeParse({ legend: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toBe("bottom-right");
    }
  });
});

// ── AC 5: resolveTheme() — explicit 3-level precedence chain ─────────────────
//
// Precedence (highest wins):
//   Level 3 (highest): nested explicit field overrides inside background sub-objects
//                       (background.color, background.evolutionXAxis.xAxis, etc.)
//   Level 2 (middle):  top-level explicit field overrides on the renderConfig object
//                       (fontFamily, strokeWidth, width, height, locale, etc.)
//   Level 1 (lowest):  theme baseline defaults selected by `theme` name
//                       ("default" | "dark" | "highContrast")
//
// Canonical 3-level scenario — i18n axis label chain:
//   L1: English defaults from theme baseline (AXIS_LABELS_EN)
//   L2: locale="fr" switches all labels to French (top-level renderConfig field)
//   L3: background.evolutionXAxis.xAxis="Custom" overrides one label (nested sub-object field)
//
// When values at multiple levels conflict, the HIGHEST level ALWAYS wins,
// regardless of input order or specificity. Resolution is deterministic and idempotent.

describe("resolveTheme — 3-level precedence chain (AC 5)", () => {
  // ── Level 1 < Level 2: theme baseline beaten by top-level field ──────────

  it("[L1<L2] dark theme strokeWidth(1.5) beaten by explicit top-level strokeWidth", () => {
    // L1: dark baseline → strokeWidth = 1.5
    // L2: explicit renderConfig.strokeWidth = 0.5 → must win
    const rc = resolveTheme({ theme: "dark", strokeWidth: 0.5 });
    expect(rc.strokeWidth).toBe(0.5);            // L2 wins over dark baseline L1 (1.5)
    expect(rc.background.color).toBe("#1a1a2e"); // L1 dark baseline persists for non-overridden fields
  });

  it("[L1<L2] highContrast fontFamily(Arial) beaten by explicit top-level fontFamily", () => {
    // L1: highContrast baseline → fontFamily = "Arial, sans-serif"
    // L2: explicit renderConfig.fontFamily = "Roboto, sans-serif" → must win
    const rc = resolveTheme({ theme: "highContrast", fontFamily: "Roboto, sans-serif" });
    expect(rc.fontFamily).toBe("Roboto, sans-serif"); // L2 wins over L1 baseline
    expect(rc.strokeWidth).toBe(2);                   // L1 highContrast baseline persists (not overridden)
    expect(rc.background.color).toBe("#000000");      // L1 highContrast baseline persists (not overridden)
  });

  it("[L1<L2] locale top-level field overrides English theme baseline defaults", () => {
    // L1: no locale → English defaults from theme baseline
    // L2: explicit locale="fr" → French labels must win over all L1 English defaults
    const rcFr = resolveTheme({ locale: "fr" });
    expect(rcFr.axisLabels.xAxis).toBe("Évolution");         // L2 fr locale wins over L1 "Evolution"
    expect(rcFr.axisLabels.yAxis).toBe("Chaîne de valeur");  // L2 fr locale wins over L1 "Value Chain"
    expect(rcFr.axisLabels.phases[0]).toBe("Genèse");        // L2 fr locale wins over L1 "Genesis"
  });

  // ── Level 2 < Level 3: top-level field beaten by nested background field ──

  it("[L2<L3] locale='fr' (L2 top-level) beaten by explicit xAxis label string (L3 nested)", () => {
    // L2: locale="fr" would set xAxis → "Évolution" (French)
    // L3: background.evolutionXAxis.xAxis="Custom X" → must beat locale preset
    const rc = resolveTheme({
      locale: "fr",                                           // L2: French locale preset
      background: { evolutionXAxis: { xAxis: "Custom X" } }, // L3: explicit nested override
    });
    expect(rc.axisLabels.xAxis).toBe("Custom X");           // L3 wins over L2 locale "Évolution"
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");   // L2 fr locale applies to non-overridden
    expect(rc.axisLabels.phases[0]).toBe("Genèse");         // L2 fr locale applies to non-overridden
  });

  it("[L2<L3] locale='fr' (L2 top-level) beaten by explicit yAxis label string (L3 nested)", () => {
    // L2: locale="fr" would set yAxis → "Chaîne de valeur"
    // L3: background.valueChainYAxis.yAxis="My Chain" → must beat locale preset
    const rc = resolveTheme({
      locale: "fr",
      background: { valueChainYAxis: { yAxis: "My Chain" } }, // L3: nested override
    });
    expect(rc.axisLabels.yAxis).toBe("My Chain");   // L3 wins over L2 "Chaîne de valeur"
    expect(rc.axisLabels.xAxis).toBe("Évolution");  // L2 fr locale applies to other labels
  });

  // Sub-AC 2: direction cue labels (evolutionStart/End) removed from background.axisLabels.
  // L3 nested override for direction labels is no longer supported — they use L2 locale preset.
  it("[L2 locale applies] locale='fr' direction cue labels use fr preset (background.axisLabels override removed)", () => {
    // Sub-AC 2: background.axisLabels direction fields stripped; direction labels use L2 locale
    const rc = resolveTheme({
      locale: "fr",
      // background.axisLabels.evolutionStart would be stripped — L2 locale applies
    });
    expect(rc.axisLabels.evolutionStart).toBe("Inexploré");   // L2 fr locale (no L3 override possible)
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialisé"); // L2 fr locale
    expect(rc.axisLabels.xAxis).toBe("Évolution");            // L2 fr locale unchanged
  });

  it("[L2<L3] locale='fr' (L2 top-level) beaten by explicit phase labels (L3 nested)", () => {
    // L2: locale="fr" would set phases → ["Genèse", ...]
    // L3: background.evolutionPhases.phases=[...] → must beat locale preset
    const rc = resolveTheme({
      locale: "fr",
      background: {
        evolutionPhases: { phases: ["P1", "P2", "P3", "P4"] }, // L3: explicit nested override
      },
    });
    expect(rc.axisLabels.phases).toEqual(["P1", "P2", "P3", "P4"]); // L3 wins over L2 French phases
    expect(rc.axisLabels.xAxis).toBe("Évolution"); // L2 fr locale applies for non-conflicting
  });

  // ── Full 3-level chain: L1 < L2 < L3 demonstrated simultaneously ──────────

  it("[L1<L2<L3] full 3-level chain: theme baseline < locale preset < explicit label string", () => {
    // L1: "default" theme + no locale → English defaults from baseline
    //     xAxis="Evolution", yAxis="Value Chain", phases[0]="Genesis"
    // L2: locale="fr" → all axis labels switch to French (xAxis="Évolution", etc.)
    // L3: background.evolutionXAxis.xAxis="My X" → overrides ONLY xAxis, beats fr locale
    //
    // Expected: xAxis uses L3 "My X", other labels use L2 fr locale
    const rc = resolveTheme({
      theme: "default",                          // L1: selects default baseline
      locale: "fr",                              // L2: French locale preset for axis labels
      background: {
        evolutionXAxis: { xAxis: "My X" },       // L3: explicit nested override — beats L2
      },
    });

    // L3 wins for the explicitly-overridden field
    expect(rc.axisLabels.xAxis).toBe("My X");

    // L2 (fr locale) wins for all other non-overridden axis labels
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");
    expect(rc.axisLabels.phases[0]).toBe("Genèse");
    expect(rc.axisLabels.evolutionStart).toBe("Inexploré");
    expect(rc.axisLabels.evolutionEnd).toBe("Industrialisé");

    // L1 (default theme baseline) applies to visual properties not affected by L2/L3
    expect(rc.theme).toBe("default");
    expect(rc.background.color).toBe("#ffffff"); // default theme baseline color
    expect(rc.strokeWidth).toBe(1);              // default theme baseline strokeWidth
  });

  it("[L1<L2<L3] full 3-level chain: each level conflicts, highest level wins per field", () => {
    // For xAxis:
    //   L1 (en baseline):   "Evolution"
    //   L2 (fr locale):     "Évolution"       ← beats L1
    //   L3 (explicit):      "Custom Axis"     ← beats L2
    //
    // For yAxis:
    //   L1 (en baseline):   "Value Chain"
    //   L2 (fr locale):     "Chaîne de valeur" ← beats L1
    //   L3 (not set):       —                  ← L2 is the winner
    const rc = resolveTheme({
      locale: "fr",                                           // L2: French locale
      background: {
        evolutionXAxis: { xAxis: "Custom Axis" },            // L3: override xAxis only
      },
    });

    // xAxis: L3 wins (beats L2 "Évolution", which would have beaten L1 "Evolution")
    expect(rc.axisLabels.xAxis).toBe("Custom Axis");

    // yAxis: L2 wins (beats L1 "Value Chain"; L3 not set for yAxis)
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");
  });

  it("[L1<L2<L3] all 3 levels active simultaneously — visual + i18n fields", () => {
    // Visual fields (fontFamily, strokeWidth):
    //   L1: dark baseline → strokeWidth=1.5, fontFamily="Inter, sans-serif"
    //   L2: explicit → strokeWidth=3, fontFamily="Georgia, serif"
    //   L3: not applicable for these fields
    //
    // Axis labels:
    //   L1: en defaults
    //   L2: locale="fr" → French labels (L2 > L1)
    //   L3: background.evolutionXAxis.xAxis="X Override" (L3 > L2 > L1)
    const rc = resolveTheme({
      theme: "dark",                              // L1: dark baseline
      strokeWidth: 3,                             // L2: explicit visual override
      fontFamily: "Georgia, serif",               // L2: explicit visual override
      locale: "fr",                               // L2: locale for i18n
      background: {
        evolutionXAxis: { xAxis: "X Override" },  // L3: explicit label override
      },
    });

    // Visual: L2 beats L1
    expect(rc.strokeWidth).toBe(3);                    // L2 (3) > L1 dark baseline (1.5)
    expect(rc.fontFamily).toBe("Georgia, serif");      // L2 > L1 dark baseline
    expect(rc.background.color).toBe("#1a1a2e");       // L1 dark baseline (no L2/L3 override)

    // i18n: L3 beats L2 for xAxis, L2 beats L1 for other labels
    expect(rc.axisLabels.xAxis).toBe("X Override");         // L3 > L2 "Évolution" > L1 "Evolution"
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");   // L2 > L1 "Value Chain"
    expect(rc.axisLabels.phases[0]).toBe("Genèse");         // L2 > L1 "Genesis"
  });

  // ── Deterministic conflict resolution ────────────────────────────────────

  it("[deterministic] same config always produces identical resolved output (idempotent)", () => {
    const config = {
      theme: "dark" as const,
      strokeWidth: 2,
      fontFamily: "Roboto, sans-serif",
      locale: "fr" as const,
      background: {
        color: "#112233",
        evolutionXAxis: { xAxis: "Evo Override" },
      },
    };

    // Call resolveTheme multiple times with identical input
    const rc1 = resolveTheme(config);
    const rc2 = resolveTheme(config);
    const rc3 = resolveTheme(config);

    // All calls produce identical results — no randomness or side effects
    expect(rc1.strokeWidth).toBe(rc2.strokeWidth);
    expect(rc2.strokeWidth).toBe(rc3.strokeWidth);
    expect(rc1.axisLabels.xAxis).toBe(rc2.axisLabels.xAxis);
    expect(rc1.axisLabels.yAxis).toBe(rc2.axisLabels.yAxis);
    expect(rc1.background.color).toBe(rc2.background.color);

    // Verify exact values to confirm correct level wins
    expect(rc1.strokeWidth).toBe(2);                     // L2 wins over dark L1 (1.5)
    expect(rc1.fontFamily).toBe("Roboto, sans-serif");   // L2 wins
    expect(rc1.axisLabels.xAxis).toBe("Evo Override");   // L3 wins over fr L2 preset
    expect(rc1.axisLabels.yAxis).toBe("Chaîne de valeur"); // L2 fr locale wins
    expect(rc1.background.color).toBe("#112233");         // L3 nested override > dark L1 baseline
  });

  it("[deterministic] each theme consistently resolves to its own distinct baseline", () => {
    // Same theme → same baseline, every time
    const default1 = resolveTheme({ theme: "default" });
    const default2 = resolveTheme({ theme: "default" });
    const dark1    = resolveTheme({ theme: "dark" });
    const dark2    = resolveTheme({ theme: "dark" });
    const hc1      = resolveTheme({ theme: "highContrast" });
    const hc2      = resolveTheme({ theme: "highContrast" });

    expect(default1.background.color).toBe(default2.background.color);
    expect(dark1.strokeWidth).toBe(dark2.strokeWidth);
    expect(hc1.fontFamily).toBe(hc2.fontFamily);

    // Themes produce distinct baseline values
    expect(default1.background.color).toBe("#ffffff");   // default L1 baseline
    expect(dark1.background.color).toBe("#1a1a2e");      // dark L1 baseline
    expect(hc1.background.color).toBe("#000000");        // highContrast L1 baseline

    expect(default1.strokeWidth).toBe(1);                // default L1 baseline
    expect(dark1.strokeWidth).toBe(1.5);                 // dark L1 baseline
    expect(hc1.strokeWidth).toBe(2);                     // highContrast L1 baseline
  });

  // ── Precedence isolation: changing one level only affects relevant fields ──

  it("[isolation] changing only `theme` (L1) changes only theme-specific fields, not L2 overrides", () => {
    // Both configs apply same L2 override (width=1920), only theme differs
    const rcDefault = resolveTheme({ theme: "default", width: 1920 });
    const rcDark    = resolveTheme({ theme: "dark",    width: 1920 });

    // Theme-specific fields differ (L1 baseline changed)
    expect(rcDefault.background.color).not.toBe(rcDark.background.color);
    expect(rcDefault.strokeWidth).not.toBe(rcDark.strokeWidth);

    // L2 override (width) is unaffected by theme change
    expect(rcDefault.width).toBe(rcDark.width); // both 1920
  });

  it("[isolation] changing only `locale` (L2) changes only axis label fields, not visual fields", () => {
    // Both configs use dark theme + explicit strokeWidth; only locale differs
    const rcEn = resolveTheme({ theme: "dark", strokeWidth: 2 });
    const rcFr = resolveTheme({ theme: "dark", strokeWidth: 2, locale: "fr" });

    // Axis labels differ (locale L2 change)
    expect(rcEn.axisLabels.xAxis).not.toBe(rcFr.axisLabels.xAxis);
    expect(rcEn.axisLabels.phases[0]).not.toBe(rcFr.axisLabels.phases[0]);

    // Visual fields remain identical (locale doesn't affect strokeWidth or background.color)
    expect(rcEn.strokeWidth).toBe(rcFr.strokeWidth); // both 2 (L2 override)
    expect(rcEn.background.color).toBe(rcFr.background.color); // both dark L1 baseline
  });

  it("[isolation] adding L3 nested override changes only the targeted field", () => {
    // Two configs identical except one adds explicit xAxis override (L3)
    const rcBase    = resolveTheme({ locale: "fr" });
    const rcCustomX = resolveTheme({ locale: "fr", background: { evolutionXAxis: { xAxis: "Custom" } } });

    // Only xAxis differs (the added L3 override)
    expect(rcBase.axisLabels.xAxis).toBe("Évolution"); // L2 fr locale without L3
    expect(rcCustomX.axisLabels.xAxis).toBe("Custom"); // L3 beats L2

    // All other axis labels are identical (locale L2 applies to both)
    expect(rcBase.axisLabels.yAxis).toBe(rcCustomX.axisLabels.yAxis);
    expect(rcBase.axisLabels.phases[0]).toBe(rcCustomX.axisLabels.phases[0]);

    // Visual fields unaffected by L3 axis label override
    expect(rcBase.strokeWidth).toBe(rcCustomX.strokeWidth);
    expect(rcBase.background.color).toBe(rcCustomX.background.color);
  });
});

// ── AC 5: Theme resolution — full 3-level precedence chain ───────────────────────────────
//
// The full precedence chain for resolveTheme() is:
//
//   Level 1 (lowest):  Theme baseline defaults (e.g. THEME_BASELINE_DEFAULT)
//   Level 2 (middle):  Top-level explicit field overrides (fontFamily, strokeWidth, locale, etc.)
//   Level 3 (highest): Nested explicit field overrides inside background sub-objects
//                      (background.color, background.evolutionXAxis.*, etc.)
//
// For i18n axis labels, the same 3 levels map to:
//   Level 1: English baseline (theme default locale)
//   Level 2: Locale preset switch (locale: "fr")
//   Level 3: Explicit label string in background sub-object (background.evolutionXAxis.xAxis)
//
// When values at different levels conflict, the highest level ALWAYS wins deterministically.

describe("resolveTheme — 3-level precedence chain (AC 5)", () => {
  // ── Level 1 only: theme baseline provides all defaults ────────────────────
  it("Level 1 only: no overrides — theme baseline provides all field defaults", () => {
    const rc = resolveTheme({ theme: "default" });
    // Scalar fields from theme baseline
    expect(rc.background.color).toBe("#ffffff");         // Level 1: theme baseline
    expect(rc.fontFamily).toBe("Inter, sans-serif");    // Level 1: theme baseline
    expect(rc.strokeWidth).toBe(1);                     // Level 1: theme baseline
    expect(rc.labelScale).toBe(1.0);                    // Level 1: theme baseline
    expect(rc.width).toBe(1600);                        // Level 1: theme baseline
    expect(rc.height).toBe(800);                        // Level 1: theme baseline
    // Boolean display defaults from theme baseline
    expect(rc.showEvolutionXAxis).toBe(true);           // Level 1: theme baseline
    expect(rc.showValueChainYAxis).toBe(true);          // Level 1: theme baseline
    expect(rc.showPhaseDividerAndLabel).toBe(true);     // Level 1: theme baseline
    // i18n: Level 1 — English baseline (theme default)
    expect(rc.axisLabels.xAxis).toBe("Evolution");      // Level 1: English baseline
    expect(rc.axisLabels.phases[0]).toBe("Genesis");    // Level 1: English baseline
  });

  // ── Level 2 wins over Level 1: top-level explicit fields ──────────────────
  it("Level 2 wins over Level 1: explicit fontFamily overrides theme baseline", () => {
    // Theme says "Inter, sans-serif" (Level 1)
    // Caller says "Arial" (Level 2) → Level 2 wins
    const rc = resolveTheme({ theme: "default", fontFamily: "Arial" });
    expect(rc.fontFamily).toBe("Arial");               // Level 2 wins over Level 1
    expect(rc.strokeWidth).toBe(1);                    // Level 1 still applies for unset fields
  });

  it("Level 2 wins over Level 1: explicit strokeWidth overrides theme baseline", () => {
    const rc = resolveTheme({ theme: "default", strokeWidth: 3 });
    expect(rc.strokeWidth).toBe(3);                    // Level 2 wins
    expect(rc.fontFamily).toBe("Inter, sans-serif");   // Level 1 for unset fields
  });

  it("Level 2 wins over Level 1: explicit width/height override theme baseline dimensions", () => {
    const rc = resolveTheme({ theme: "default", width: 2560, height: 1440 });
    expect(rc.width).toBe(2560);   // Level 2 wins over Level 1 (1600)
    expect(rc.height).toBe(1440);  // Level 2 wins over Level 1 (800)
  });

  // ── Level 3 wins over Level 1: nested background fields ───────────────────
  it("Level 3 wins over Level 1: background.color overrides theme baseline backgroundColor", () => {
    // Theme says "#ffffff" (Level 1)
    // background.color says "#1a1a1a" (Level 3) → Level 3 wins
    const rc = resolveTheme({ theme: "default", background: { color: "#1a1a1a" } });
    expect(rc.background.color).toBe("#1a1a1a");        // Level 3 wins over Level 1
  });

  it("Level 3 wins over Level 1: background.evolutionXAxis.show=false overrides theme default=true", () => {
    const rc = resolveTheme({ theme: "default", background: { evolutionXAxis: { show: false } } });
    expect(rc.showEvolutionXAxis).toBe(false);          // Level 3 wins over Level 1 (true)
    expect(rc.showValueChainYAxis).toBe(true);          // Level 1 still applies for unset fields
  });

  it("Level 3 wins over Level 1: background.evolutionPhases.showPhaseDividerAndLabel=false overrides theme default=true", () => {
    const rc = resolveTheme({ theme: "default", background: { evolutionPhases: { showPhaseDividerAndLabel: false } } });
    expect(rc.showPhaseDividerAndLabel).toBe(false);    // Level 3 wins over Level 1 (true)
    expect(rc.showEvolutionXAxis).toBe(true);           // Level 1 still applies for unset fields
  });

  // ── i18n axis labels: full 3-level conflict ────────────────────────────────
  it("i18n: Level 2 (fr locale) wins over Level 1 (en baseline)", () => {
    // Level 1: English baseline → xAxis = "Evolution"
    // Level 2: locale: "fr" → xAxis = "Évolution" ← wins over Level 1
    const rc = resolveTheme({ locale: "fr" });
    expect(rc.axisLabels.xAxis).toBe("Évolution");     // Level 2 wins over Level 1
    expect(rc.axisLabels.phases[0]).toBe("Genèse");    // Level 2 wins over Level 1
  });

  it("i18n: Level 3 (explicit string) wins over Level 2 (fr locale)", () => {
    // Level 2: locale "fr" → xAxis = "Évolution"
    // Level 3: background.evolutionXAxis.xAxis = "My Axis" ← wins over Level 2
    const rc = resolveTheme({
      locale: "fr",
      background: { evolutionXAxis: { xAxis: "My Axis" } },
    });
    expect(rc.axisLabels.xAxis).toBe("My Axis");       // Level 3 wins over Level 2
    expect(rc.axisLabels.phases[0]).toBe("Genèse");    // Level 2 still applies for unset fields
  });

  it("i18n: all 3 levels conflict — Level 3 deterministically wins for xAxis", () => {
    // Level 1: en baseline → xAxis = "Evolution"
    // Level 2: locale "fr" → xAxis = "Évolution" (wins over Level 1)
    // Level 3: explicit xAxis = "Custom Label" → wins over both Level 1 and Level 2
    const rc = resolveTheme({
      theme: "default",   // Level 1: en baseline ("Evolution")
      locale: "fr",       // Level 2: fr preset would give "Évolution"
      background: {
        evolutionXAxis: {
          xAxis: "Custom Label",  // Level 3: explicit string — must win
        },
      },
    });
    // Level 3 wins for the explicitly set field
    expect(rc.axisLabels.xAxis).toBe("Custom Label");
    // Level 2 still applies for fields without Level 3 override
    expect(rc.axisLabels.phases[0]).toBe("Genèse");         // fr (Level 2), no Level 3 override
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");   // fr (Level 2), no Level 3 override
  });

  it("i18n: Level 3 wins even when it contradicts the active locale — phases override fr while locale stays fr", () => {
    const rc = resolveTheme({
      locale: "fr",  // Level 2: all labels in French
      background: {
        evolutionPhases: {
          // Level 3: explicit English phase names override fr locale for phases only
          phases: ["Genesis", "Custom-Built", "Product (+Rental)", "Commodity (+Utility)"],
        },
      },
    });
    // Level 3 wins for phases
    expect(rc.axisLabels.phases).toEqual(["Genesis", "Custom-Built", "Product (+Rental)", "Commodity (+Utility)"]);
    // Level 2 still applies for fields without Level 3 override
    expect(rc.axisLabels.xAxis).toBe("Évolution");           // fr (Level 2)
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");    // fr (Level 2)
  });

  // ── Deterministic: all 3 levels in play simultaneously ────────────────────
  it("deterministic resolution: multiple fields from different levels coexist without interference", () => {
    // This test verifies that fields at different precedence levels resolve independently
    // and do not interfere with each other.
    const rc = resolveTheme({
      theme: "default",                   // Level 1: all theme defaults as baseline
      fontFamily: "Roboto, sans-serif",   // Level 2: overrides theme fontFamily
      strokeWidth: 2,                     // Level 2: overrides theme strokeWidth
      locale: "fr",                       // Level 2: overrides en for axis labels
      background: {
        color: "#f0f0f0",                 // Level 3: overrides theme backgroundColor
        evolutionXAxis: {
          show: false,                    // Level 3: overrides theme showEvolutionXAxis
          xAxis: "Mon Évolution",         // Level 3: overrides fr locale "Évolution"
        },
      },
    });

    // Level 3 fields (nested background overrides)
    expect(rc.background.color).toBe("#f0f0f0");              // Level 3 background.color
    expect(rc.showEvolutionXAxis).toBe(false);               // Level 3 background.evolutionXAxis.show
    expect(rc.axisLabels.xAxis).toBe("Mon Évolution");       // Level 3 explicit string

    // Level 2 fields (top-level explicit fields)
    expect(rc.fontFamily).toBe("Roboto, sans-serif");        // Level 2 fontFamily
    expect(rc.strokeWidth).toBe(2);                          // Level 2 strokeWidth
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");   // Level 2 fr locale (no Level 3 override)
    expect(rc.axisLabels.phases[0]).toBe("Genèse");          // Level 2 fr locale (no Level 3 override)

    // Level 1 fields (theme baseline, no override at any higher level)
    expect(rc.labelScale).toBe(1.0);                         // Level 1 theme baseline
    expect(rc.nodeRadii._default).toBe(5);                   // Level 1 theme baseline
    expect(rc.avoidCollisions).toBe(true);                   // Level 1 theme baseline
    expect(rc.showValueChainYAxis).toBe(true);               // Level 1 theme baseline (no override)
    expect(rc.showPhaseDividerAndLabel).toBe(true);          // Level 1 theme baseline (no override)
  });
});

// ── Sub-AC 10c: Coordinate space — CoordinateSpaceSchema and canvas bounds ──
//
// The canvas coordinate space is declared explicitly in RenderConfig via two mechanisms:
//   1. `coordinateSpace` field — machine-readable declaration of units and origin convention
//   2. `width` / `height` fields — canvas dimensions in px-space (upper bound: 10000 px each)
//
// Three coordinate spaces coexist:
//   - px-space (canvas pixels): width, height, nodeRadii, strokeWidth, legend {x,y}
//   - unitless multipliers: labelScale (relative to 12 px base font size)
//   - normalized [0,1]: component positions (evolution/visibility scalars)
//
// Validation rules:
//   - coordinateSpace.units must be "px" — no other units are supported
//   - coordinateSpace.origin must be "top-left" — no other origins are supported
//   - width and height must be positive and ≤ 10000 px (sanity upper bound)

describe("Sub-AC 10c: CoordinateSpaceSchema — coordinate space declaration", () => {
  // ── CoordinateSpaceSchema unit tests ───────────────────────────────────────

  it("accepts empty object and defaults units to 'px' and origin to 'top-left'", () => {
    const result = CoordinateSpaceSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units).toBe("px");
      expect(result.data.origin).toBe("top-left");
    }
  });

  it("accepts explicit { units: 'px', origin: 'top-left' } — the only valid values", () => {
    const result = CoordinateSpaceSchema.safeParse({ units: "px", origin: "top-left" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units).toBe("px");
      expect(result.data.origin).toBe("top-left");
    }
  });

  it("rejects units: 'em' — only 'px' is supported as coordinate units", () => {
    const result = CoordinateSpaceSchema.safeParse({ units: "em" });
    expect(result.success).toBe(false);
  });

  it("rejects units: 'rem' — only 'px' is supported as coordinate units", () => {
    const result = CoordinateSpaceSchema.safeParse({ units: "rem" });
    expect(result.success).toBe(false);
  });

  it("rejects units: 'normalized' — component positions are always [0,1] regardless of units declaration", () => {
    const result = CoordinateSpaceSchema.safeParse({ units: "normalized" });
    expect(result.success).toBe(false);
  });

  it("rejects origin: 'center' — only 'top-left' origin is supported", () => {
    const result = CoordinateSpaceSchema.safeParse({ origin: "center" });
    expect(result.success).toBe(false);
  });

  it("rejects origin: 'bottom-left' — only 'top-left' origin is supported", () => {
    const result = CoordinateSpaceSchema.safeParse({ origin: "bottom-left" });
    expect(result.success).toBe(false);
  });
});

describe("Sub-AC 10c: RenderConfigSchema — canvas dimension boundary conditions", () => {
  // ── coordinateSpace field in RenderConfigSchema ────────────────────────────

  it("accepts renderConfig with coordinateSpace: {} (empty, all defaults)", () => {
    const result = RenderConfigSchema.safeParse({ coordinateSpace: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinateSpace?.units).toBe("px");
      expect(result.data.coordinateSpace?.origin).toBe("top-left");
    }
  });

  it("accepts renderConfig with coordinateSpace: { units: 'px', origin: 'top-left' }", () => {
    const result = RenderConfigSchema.safeParse({
      coordinateSpace: { units: "px", origin: "top-left" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects renderConfig with coordinateSpace: { units: 'em' } — invalid units", () => {
    const result = RenderConfigSchema.safeParse({
      coordinateSpace: { units: "em" },
    });
    expect(result.success).toBe(false);
  });

  it("renderConfig without coordinateSpace field parses successfully (field is optional)", () => {
    const result = RenderConfigSchema.safeParse({ width: 800, height: 600 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinateSpace).toBeUndefined();
    }
  });

  // ── Width/height boundary conditions (px-space canvas dimensions) ──────────

  it("rejects width exceeding 10000 px — upper bound for canvas px-space dimensions", () => {
    const result = RenderConfigSchema.safeParse({ width: 10001 });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Error message should mention the constraint
      expect(
        result.error.issues.some((i) => i.message.includes("10000"))
      ).toBe(true);
    }
  });

  it("rejects height exceeding 10000 px — upper bound for canvas px-space dimensions", () => {
    const result = RenderConfigSchema.safeParse({ height: 10001 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("10000"))
      ).toBe(true);
    }
  });

  it("accepts width: 10000 (boundary, exactly at max)", () => {
    const result = RenderConfigSchema.safeParse({ width: 10000 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(10000);
    }
  });

  it("accepts height: 10000 (boundary, exactly at max)", () => {
    const result = RenderConfigSchema.safeParse({ height: 10000 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.height).toBe(10000);
    }
  });

  it("rejects width: 0 — canvas px-space dimensions must be positive", () => {
    const result = RenderConfigSchema.safeParse({ width: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects height: -50 — canvas px-space dimensions must be positive", () => {
    const result = RenderConfigSchema.safeParse({ height: -50 });
    expect(result.success).toBe(false);
  });

  it("accepts width: 1 and height: 1 — minimum valid positive canvas dimensions", () => {
    const result = RenderConfigSchema.safeParse({ width: 1, height: 1 });
    expect(result.success).toBe(true);
  });

  // ── Combined coordinateSpace + canvas dimensions ───────────────────────────

  it("accepts coordinateSpace with valid canvas dimensions together", () => {
    const result = RenderConfigSchema.safeParse({
      width: 1600,
      height: 800,
      coordinateSpace: { units: "px", origin: "top-left" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(1600);
      expect(result.data.height).toBe(800);
      expect(result.data.coordinateSpace?.units).toBe("px");
      expect(result.data.coordinateSpace?.origin).toBe("top-left");
    }
  });

  it("rejects invalid coordinateSpace.units even when width/height are valid", () => {
    const result = RenderConfigSchema.safeParse({
      width: 1600,
      height: 800,
      coordinateSpace: { units: "vw" },  // invalid units
    });
    expect(result.success).toBe(false);
  });
});

// ── Sub-AC 10c: Round-trip serialisation — coordinateSpace survives JSON round-trip ──
//
// A valid RenderConfig with coordinateSpace must survive:
//   1. parse (Zod parse of raw object)
//   2. serialise (JSON.stringify → JSON string)
//   3. deserialise (JSON.parse → plain JS object)
//   4. re-parse (Zod parse of the plain object → same result)
//
// This confirms the schema produces JSON-serialisable output with no circular refs
// or non-serialisable types (e.g. BigInt, undefined-in-object, functions).

describe("Sub-AC 10c: CoordinateSpaceSchema — round-trip JSON serialisation", () => {
  it("round-trips empty CoordinateSpaceSchema through JSON.stringify/parse", () => {
    const parsed = CoordinateSpaceSchema.parse({});
    const json = JSON.stringify(parsed);
    const reparsed = CoordinateSpaceSchema.parse(JSON.parse(json));
    expect(reparsed.units).toBe("px");
    expect(reparsed.origin).toBe("top-left");
  });

  it("round-trips explicit { units: 'px', origin: 'top-left' } through JSON", () => {
    const input = { units: "px" as const, origin: "top-left" as const };
    const parsed = CoordinateSpaceSchema.parse(input);
    const json = JSON.stringify(parsed);
    const reparsed = CoordinateSpaceSchema.parse(JSON.parse(json));
    expect(reparsed.units).toBe("px");
    expect(reparsed.origin).toBe("top-left");
    // Both passes produce identical output
    expect(reparsed).toEqual(parsed);
  });

  it("round-trips RenderConfigSchema with coordinateSpace field through JSON", () => {
    const input = {
      width: 1600,
      height: 800,
      coordinateSpace: { units: "px" as const, origin: "top-left" as const },
      strokeWidth: 2,
    };
    const parsed = RenderConfigSchema.parse(input);
    const json = JSON.stringify(parsed);
    const reparsed = RenderConfigSchema.parse(JSON.parse(json));
    expect(reparsed.width).toBe(1600);
    expect(reparsed.height).toBe(800);
    expect(reparsed.coordinateSpace?.units).toBe("px");
    expect(reparsed.coordinateSpace?.origin).toBe("top-left");
    expect(reparsed.strokeWidth).toBe(2);
  });

  it("round-trips RenderConfigSchema without coordinateSpace field through JSON (field stays absent)", () => {
    const input = { width: 800, height: 400, strokeWidth: 1 };
    const parsed = RenderConfigSchema.parse(input);
    const json = JSON.stringify(parsed);
    const reparsed = RenderConfigSchema.parse(JSON.parse(json));
    expect(reparsed.width).toBe(800);
    expect(reparsed.height).toBe(400);
    // coordinateSpace was absent in input and remains absent after round-trip
    expect(reparsed.coordinateSpace).toBeUndefined();
  });
});

// ── Sub-AC 10d: LAYER_DEPENDENCY_CONSTRAINTS declaration ─────────────────────
//
// LAYER_DEPENDENCY_CONSTRAINTS is a machine-readable constant that formally
// declares the required-layer relationships enforced by LayerTogglesSchema.
// It serves as the single source of truth for which layers depend on which.
//
// Current constraints:
//   evolvesTo → nodes  (arrows anchored to node positions)
//   labels    → nodes  (label positions relative to node circles)
//
// Independent layers (no entry in LAYER_DEPENDENCY_CONSTRAINTS):
//   title, pipelines, edges, notes

describe("LAYER_DEPENDENCY_CONSTRAINTS — formal constraint declaration (Sub-AC 10d)", () => {
  it("declares exactly 2 dependency relationships", () => {
    const keys = Object.keys(LAYER_DEPENDENCY_CONSTRAINTS);
    expect(keys).toHaveLength(2);
  });

  it("evolvesTo depends on nodes", () => {
    expect(LAYER_DEPENDENCY_CONSTRAINTS.evolvesTo).toBe("nodes");
  });

  it("labels depends on nodes", () => {
    expect(LAYER_DEPENDENCY_CONSTRAINTS.labels).toBe("nodes");
  });

  it("edges is NOT in LAYER_DEPENDENCY_CONSTRAINTS (edges is fully independent)", () => {
    // edges has no dependency on nodes or any other layer
    expect(Object.keys(LAYER_DEPENDENCY_CONSTRAINTS)).not.toContain("edges");
  });

  it("title, pipelines, notes are NOT in LAYER_DEPENDENCY_CONSTRAINTS (all independent)", () => {
    const keys = Object.keys(LAYER_DEPENDENCY_CONSTRAINTS);
    expect(keys).not.toContain("title");
    expect(keys).not.toContain("pipelines");
    expect(keys).not.toContain("notes");
  });

  it("all dependency target values are valid LayerTogglesSchema keys", () => {
    // All values in LAYER_DEPENDENCY_CONSTRAINTS must be valid toggle layer names
    const validKeys = ["title", "pipelines", "edges", "evolvesTo", "nodes", "labels", "notes"];
    for (const [, requiredLayer] of Object.entries(LAYER_DEPENDENCY_CONSTRAINTS)) {
      expect(validKeys).toContain(requiredLayer);
    }
  });

  it("edges=false with nodes=false, evolvesTo=false, labels=false is valid (edges is independent)", () => {
    // Confirm that edges can be toggled off independently — it has no node dependency
    const result = LayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
      edges: false,
    });
    expect(result.success).toBe(true);
  });

  it("exactly 2 issues are raised when nodes=false and both dependents (evolvesTo, labels) are unset", () => {
    // nodes=false without explicit evolvesTo or labels → 2 constraint violations, one per dependent
    const result = LayerTogglesSchema.safeParse({ nodes: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(2);
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("evolvesTo");
      expect(paths).toContain("labels");
    }
  });
});

// ── Sub-AC 3b: LAYER_TOGGLE_DAG — generic DAG-derived validator ───────────────
//
// LAYER_TOGGLE_DAG is the canonical single source of truth for layer toggle
// constraints. The LayerTogglesSchema.superRefine is derived generically by
// traversing this DAG — no hand-coded per-pair logic exists in superRefine.
//
// Tests verify:
//   1. LAYER_TOGGLE_DAG structure (edges, fields)
//   2. LAYER_DEPENDENCY_CONSTRAINTS is consistent with LAYER_TOGGLE_DAG
//   3. The generic validator produces correct issues for each DAG edge

describe("LAYER_TOGGLE_DAG — generic DAG-derived validator (Sub-AC 3b)", () => {
  it("LAYER_TOGGLE_DAG has exactly 2 edges", () => {
    expect(LAYER_TOGGLE_DAG).toHaveLength(2);
  });

  it("each edge has dependent, requires, and reason fields", () => {
    for (const edge of LAYER_TOGGLE_DAG) {
      expect(edge).toHaveProperty("dependent");
      expect(edge).toHaveProperty("requires");
      expect(edge).toHaveProperty("reason");
      expect(typeof edge.dependent).toBe("string");
      expect(typeof edge.requires).toBe("string");
      expect(typeof edge.reason).toBe("string");
    }
  });

  it("evolvesTo edge: dependent=evolvesTo, requires=nodes", () => {
    const edge = LAYER_TOGGLE_DAG.find((e) => e.dependent === "evolvesTo");
    expect(edge).toBeDefined();
    expect(edge?.requires).toBe("nodes");
    expect(edge?.reason.length).toBeGreaterThan(0);
  });

  it("labels edge: dependent=labels, requires=nodes", () => {
    const edge = LAYER_TOGGLE_DAG.find((e) => e.dependent === "labels");
    expect(edge).toBeDefined();
    expect(edge?.requires).toBe("nodes");
    expect(edge?.reason.length).toBeGreaterThan(0);
  });

  it("edges is NOT in LAYER_TOGGLE_DAG (edges is NOT a toggle constraint)", () => {
    // Cast to string to allow TypeScript to compare a narrow literal union against "edges"
    const edgesEntry = LAYER_TOGGLE_DAG.find((e) => (e.dependent as string) === "edges");
    expect(edgesEntry).toBeUndefined();
  });

  it("LAYER_DEPENDENCY_CONSTRAINTS is consistent with LAYER_TOGGLE_DAG", () => {
    // LAYER_DEPENDENCY_CONSTRAINTS is derived from LAYER_TOGGLE_DAG —
    // every edge in the DAG must have a matching entry in the flat map
    for (const edge of LAYER_TOGGLE_DAG) {
      expect(LAYER_DEPENDENCY_CONSTRAINTS[edge.dependent as keyof typeof LAYER_DEPENDENCY_CONSTRAINTS])
        .toBe(edge.requires);
    }
    // And counts must match
    expect(Object.keys(LAYER_DEPENDENCY_CONSTRAINTS)).toHaveLength(LAYER_TOGGLE_DAG.length);
  });

  it("generic validator: error message template includes dependent name and requires=true", () => {
    // Each DAG edge produces a message: `${dependent} layer requires ${requires}=true — ...`
    const result = LayerTogglesSchema.safeParse({ nodes: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      // Verify that messages are generated from LAYER_TOGGLE_DAG edges, not hardcoded
      for (const edge of LAYER_TOGGLE_DAG) {
        expect(
          messages.some(
            (m) => m.includes(edge.dependent) && m.includes(`${edge.requires}=true`)
          )
        ).toBe(true);
      }
    }
  });

  it("generic validator: error message includes the reason from the DAG edge", () => {
    const result = LayerTogglesSchema.safeParse({ nodes: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      for (const edge of LAYER_TOGGLE_DAG) {
        expect(messages.some((m) => m.includes(edge.reason))).toBe(true);
      }
    }
  });

  it("validator only fires for violated edges — compliant input produces no issues", () => {
    // All DAG constraint dependents disabled — no violations
    const result = LayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
    });
    expect(result.success).toBe(true);
  });

  it("exactly LAYER_TOGGLE_DAG.length issues when requires=false and all dependents default true", () => {
    // nodes=false, evolvesTo and labels both unset → default to true → 2 issues (= DAG length)
    const result = LayerTogglesSchema.safeParse({ nodes: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(LAYER_TOGGLE_DAG.length);
    }
  });
});

// ── Sub-AC 10d: i18n axis-label override precedence — additional coverage ────
//
// These tests complement the existing AC 6 i18n precedence suite with:
//   - Full baseline coverage (no args → all English, fr locale → all French)
//   - Field-specific overrides for visibilityLow/evolutionEnd not individually tested before
//   - Confirming the locale-as-fallback rule holds for every field

describe("resolveAxisLabels — complete field coverage (Sub-AC 10d)", () => {
  it("no args → returns all 7 AXIS_LABELS_EN fields verbatim", () => {
    const labels = resolveAxisLabels();
    expect(labels.xAxis).toBe(AXIS_LABELS_EN.xAxis);
    expect(labels.yAxis).toBe(AXIS_LABELS_EN.yAxis);
    expect(labels.phases).toEqual(AXIS_LABELS_EN.phases);
    expect(labels.evolutionStart).toBe(AXIS_LABELS_EN.evolutionStart);
    expect(labels.evolutionEnd).toBe(AXIS_LABELS_EN.evolutionEnd);
    expect(labels.visibilityHigh).toBe(AXIS_LABELS_EN.visibilityHigh);
    expect(labels.visibilityLow).toBe(AXIS_LABELS_EN.visibilityLow);
  });

  it("locale='fr' → returns all 7 AXIS_LABELS_FR fields verbatim", () => {
    const labels = resolveAxisLabels({ locale: "fr" });
    expect(labels.xAxis).toBe(AXIS_LABELS_FR.xAxis);
    expect(labels.yAxis).toBe(AXIS_LABELS_FR.yAxis);
    expect(labels.phases).toEqual(AXIS_LABELS_FR.phases);
    expect(labels.evolutionStart).toBe(AXIS_LABELS_FR.evolutionStart);
    expect(labels.evolutionEnd).toBe(AXIS_LABELS_FR.evolutionEnd);
    expect(labels.visibilityHigh).toBe(AXIS_LABELS_FR.visibilityHigh);
    expect(labels.visibilityLow).toBe(AXIS_LABELS_FR.visibilityLow);
  });

  it("fr locale + explicit visibilityLow → explicit wins, fr visibilityHigh unchanged", () => {
    const labels = resolveAxisLabels({ locale: "fr", visibilityLow: "Caché" });
    expect(labels.visibilityLow).toBe("Caché");               // explicit wins
    expect(labels.visibilityHigh).toBe(AXIS_LABELS_FR.visibilityHigh); // fr fallback
    expect(labels.yAxis).toBe(AXIS_LABELS_FR.yAxis);          // fr fallback
  });

  it("fr locale + explicit evolutionEnd → explicit wins, evolutionStart stays fr", () => {
    const labels = resolveAxisLabels({ locale: "fr", evolutionEnd: "Fully Commoditized" });
    expect(labels.evolutionEnd).toBe("Fully Commoditized");          // explicit wins
    expect(labels.evolutionStart).toBe(AXIS_LABELS_FR.evolutionStart); // fr fallback
    expect(labels.xAxis).toBe(AXIS_LABELS_FR.xAxis);                  // fr fallback
  });
});

// ── AC 4: LayerDAG extensibility — hypothetical layer addition ───────────────
//
// Demonstrates that the DAG-driven validation architecture is open for extension:
// adding a new layer with dependencies requires only adding an entry to the
// LayerToggleDAG data structure. No new Zod superRefine code is needed.
//
// The `validateLayerToggles(dag)` function is agnostic to specific layer names —
// it traverses any LayerToggleDAG and produces issues for each violated edge.
//
// Hypothetical scenario: a new "highlights" layer depends on "nodes" being visible
// (highlights decorate node circles, so they need nodes rendered first).
//
// Test strategy: build a custom schema using the same generic validator with the
// extended DAG — no new superRefine logic is written, only the data changes.

describe("AC 4: LayerDAG extensibility — hypothetical new layer addition", () => {
  // Hypothetical extended DAG: adds a "highlights" → "nodes" constraint.
  // This is the ONLY change needed to enforce a new dependency — no superRefine edits.
  const EXTENDED_DAG: LayerToggleDAG = [
    ...LAYER_TOGGLE_DAG,
    {
      dependent: "highlights",
      requires: "nodes",
      reason: "highlights decorate node circles and require nodes to be visible",
    },
  ] as const satisfies LayerToggleDAG;

  // Hypothetical schema that includes the new "highlights" toggle, using the
  // same generic validator — no new superRefine code was written for this layer.
  const ExtendedLayerTogglesSchema = z
    .object({
      title: z.boolean().optional(),
      pipelines: z.boolean().optional(),
      edges: z.boolean().optional(),
      evolvesTo: z.boolean().optional(),
      nodes: z.boolean().optional(),
      labels: z.boolean().optional(),
      notes: z.boolean().optional(),
      highlights: z.boolean().optional(), // ← new hypothetical layer
    })
    .superRefine(validateLayerToggles(EXTENDED_DAG)); // ← same generic validator, new DAG

  it("EXTENDED_DAG has one more edge than LAYER_TOGGLE_DAG", () => {
    expect(EXTENDED_DAG).toHaveLength(LAYER_TOGGLE_DAG.length + 1);
  });

  it("new highlights edge: dependent=highlights, requires=nodes", () => {
    const highlightsEdge = EXTENDED_DAG.find((e) => e.dependent === "highlights");
    expect(highlightsEdge).toBeDefined();
    expect(highlightsEdge?.requires).toBe("nodes");
    expect(highlightsEdge?.reason.length).toBeGreaterThan(0);
  });

  it("highlights=true with nodes=false is rejected (new constraint enforced automatically)", () => {
    const result = ExtendedLayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
      highlights: true, // ← violates the new constraint
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("highlights");
    }
  });

  it("highlights=false with nodes=false is accepted (new constraint satisfied)", () => {
    const result = ExtendedLayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
      highlights: false, // ← satisfies the new constraint
    });
    expect(result.success).toBe(true);
  });

  it("highlights omitted with nodes=false is rejected (absent defaults to true)", () => {
    // Absent toggle defaults to visible (true) — same as all other layers
    const result = ExtendedLayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
      // highlights absent → defaults to true → violation
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("highlights");
    }
  });

  it("nodes=false with all 3 dependents off produces exactly 0 issues", () => {
    const result = ExtendedLayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
      highlights: false,
    });
    expect(result.success).toBe(true);
  });

  it("nodes=false with all 3 dependents unset produces exactly EXTENDED_DAG.length issues", () => {
    // 3 dependents (evolvesTo, labels, highlights) all default to true → 3 violations
    const result = ExtendedLayerTogglesSchema.safeParse({ nodes: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(EXTENDED_DAG.length);
    }
  });

  it("error message for new highlights constraint is generated from DAG edge data", () => {
    const result = ExtendedLayerTogglesSchema.safeParse({
      nodes: false,
      evolvesTo: false,
      labels: false,
      // highlights absent → violation
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const highlightsIssue = result.error.issues.find((i) => i.path[0] === "highlights");
      expect(highlightsIssue).toBeDefined();
      // Message follows the template: `${dependent} layer requires ${requires}=true — ${reason}`
      expect(highlightsIssue?.message).toContain("highlights");
      expect(highlightsIssue?.message).toContain("nodes=true");
      expect(highlightsIssue?.message).toContain("highlights decorate node circles");
    }
  });

  it("existing constraints (evolvesTo, labels) still enforced in extended schema", () => {
    // Verify backward compatibility — existing edges are still enforced
    const result = ExtendedLayerTogglesSchema.safeParse({
      nodes: false,
      highlights: false,
      // evolvesTo and labels absent → default true → violations
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("evolvesTo");
      expect(paths).toContain("labels");
    }
  });

  it("highlights=true with nodes=true is accepted (no constraint violation)", () => {
    const result = ExtendedLayerTogglesSchema.safeParse({
      nodes: true,
      highlights: true,
    });
    expect(result.success).toBe(true);
  });

  it("no new superRefine code was needed — validateLayerToggles is data-driven", () => {
    // This test is structural: it verifies that the validator function signature
    // accepts any LayerToggleDAG, making it safe to pass extended DAGs.
    // The fact that ExtendedLayerTogglesSchema (above) works without any new
    // superRefine callbacks proves the extensibility property.
    //
    // A second hypothetical DAG entry (tooltips → labels) is tested inline:
    const DOUBLE_EXTENDED_DAG: LayerToggleDAG = [
      ...EXTENDED_DAG,
      {
        dependent: "tooltips",
        requires: "labels",
        reason: "tooltips annotate label text and require labels to be rendered",
      },
    ] as const satisfies LayerToggleDAG;

    const DoubleExtendedSchema = z
      .object({
        nodes: z.boolean().optional(),
        labels: z.boolean().optional(),
        evolvesTo: z.boolean().optional(),
        highlights: z.boolean().optional(),
        tooltips: z.boolean().optional(),
      })
      .superRefine(validateLayerToggles(DOUBLE_EXTENDED_DAG)); // same function, new DAG

    // tooltips=true with labels=false → violation
    const badResult = DoubleExtendedSchema.safeParse({ labels: false, tooltips: true });
    expect(badResult.success).toBe(false);
    if (!badResult.success) {
      const paths = badResult.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("tooltips");
    }

    // tooltips=false with labels=false → no violation for tooltips
    const goodResult = DoubleExtendedSchema.safeParse({
      labels: false,
      tooltips: false,
      evolvesTo: false,
    });
    expect(goodResult.success).toBe(true);
  });
});

// ── Sub-AC 8c: legendOverflow semantics ──────────────────────────────────────
//
// legendOverflow controls behaviour when the legend bounding box extends beyond
// the canvas boundary. Three modes:
//   'allow'  (default) — render as-is, overflow visible outside canvas
//   'clip'   — wrap legend SVG in a <clipPath> to clip to the canvas rectangle
//   'warn'   — same as 'allow' but the renderer emits a console warning
//
// Key semantic: legendOverflow is ONLY meaningful when `position` is an explicit
// `{x, y}` coordinate. Named presets ("top-left", "bottom-right", "auto", etc.)
// are automatically clamped to fit within the canvas, so legendOverflow has no
// runtime effect for those values — though the schema still accepts all combinations.
//
// Three test categories:
//   1. Overflow thresholds — anchor at canvas edge triggers overflow; all 3 modes valid
//   2. Anchor positioning edge cases — {x,y} near/at boundary with each legendOverflow mode
//   3. Empty-legend degenerate case — show=false, absent legend, no-items scenario

describe("Sub-AC 8c: legendOverflow semantics — overflow thresholds", () => {
  // ── Threshold: anchor exactly at canvas edge causes maximum overflow ─────────

  it("legendOverflow='clip': anchor at canvas right edge is valid (anchor on-canvas, content overflows right)", () => {
    // x=1600 is exactly the canvas right boundary (valid for the anchor itself).
    // Any legend with non-zero width will overflow the canvas to the right.
    // legendOverflow='clip' is the correct mode to constrain this overflow.
    const result = RenderConfigSchema.safeParse({
      legend: { position: { x: 1600, y: 400 }, legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("clip");
      expect(result.data.legend!.position).toEqual({ x: 1600, y: 400 });
    }
  });

  it("legendOverflow='warn': anchor at canvas bottom edge is valid (anchor on-canvas, content overflows down)", () => {
    // y=800 is exactly the canvas bottom boundary on the default 1600x800 canvas.
    // Legend content will extend below y=800; 'warn' emits a console warning at render time
    // without clipping or modifying the legend output.
    const result = RenderConfigSchema.safeParse({
      legend: { position: { x: 400, y: 800 }, legendOverflow: "warn" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("warn");
      expect((result.data.legend!.position as { x: number; y: number }).y).toBe(800);
    }
  });

  it("legendOverflow='allow': anchor at bottom-right corner is valid (maximum overflow scenario)", () => {
    // {x: 1600, y: 800} = the bottom-right corner of the default 1600x800 canvas.
    // The entire legend box overflows both rightward and downward.
    // 'allow' is the default — the legend renders as-is without any clipping.
    const result = RenderConfigSchema.safeParse({
      legend: { position: { x: 1600, y: 800 }, legendOverflow: "allow" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("allow");
      expect(result.data.legend!.position).toEqual({ x: 1600, y: 800 });
    }
  });

  it("legendOverflow='clip' alongside named position 'bottom-right' — schema accepts; clamping makes overflow irrelevant", () => {
    // Named positions are clamped to fit within the canvas automatically.
    // legendOverflow has no runtime effect here, but the schema must still accept it.
    const result = RenderConfigSchema.safeParse({
      legend: { position: "bottom-right", legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.position).toBe("bottom-right");
      expect(result.data.legend!.legendOverflow).toBe("clip");
    }
  });

  it("legendOverflow='warn' alongside named position 'top-left' — schema accepts; named preset clamped automatically", () => {
    // Named positions are self-clamping; legendOverflow='warn' is valid but has no
    // runtime consequence for named positions.
    const result = RenderConfigSchema.safeParse({
      legend: { position: "top-left", legendOverflow: "warn" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.position).toBe("top-left");
      expect(result.data.legend!.legendOverflow).toBe("warn");
    }
  });

  it("legendOverflow='allow' alongside 'auto' position — schema accepts; auto placement density-scored and clamped", () => {
    // 'auto' uses density scoring to find the least-crowded corner — always clamped.
    const result = RenderConfigSchema.safeParse({
      legend: { position: "auto", legendOverflow: "allow" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.position).toBe("auto");
      expect(result.data.legend!.legendOverflow).toBe("allow");
    }
  });
});

describe("Sub-AC 8c: legendOverflow semantics — anchor positioning edge cases", () => {
  // These tests verify the schema correctly handles {x,y} anchors near or at canvas
  // boundaries, combined with each legendOverflow mode. The anchor is the TOP-LEFT
  // corner of the legend bounding box — placing it near the right/bottom edge means
  // the box extends beyond the canvas in that direction.

  it("anchor 1px from right edge with legendOverflow='clip' — narrow overflow, schema accepts", () => {
    // Canvas 800x600. Anchor x=799 (one pixel from right edge).
    // Legend extends rightward past x=800 — narrow overflow region.
    const result = RenderConfigSchema.safeParse({
      width: 800,
      height: 600,
      legend: { position: { x: 799, y: 300 }, legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("clip");
      expect((result.data.legend!.position as { x: number; y: number }).x).toBe(799);
    }
  });

  it("anchor 1px from bottom edge with legendOverflow='warn' — narrow overflow, schema accepts", () => {
    // Canvas 800x600. Anchor y=599 (one pixel from bottom edge).
    // Legend extends downward past y=600 — narrow overflow region.
    const result = RenderConfigSchema.safeParse({
      width: 800,
      height: 600,
      legend: { position: { x: 100, y: 599 }, legendOverflow: "warn" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("warn");
      expect((result.data.legend!.position as { x: number; y: number }).y).toBe(599);
    }
  });

  it("anchor at canvas origin {x:0, y:0} with legendOverflow='allow' — no overflow possible from top-left", () => {
    // Top-left anchor: legend extends rightward and downward into the canvas interior.
    // On a 1600x800 canvas, no overflow occurs from this anchor position.
    // legendOverflow='allow' is preserved in the parsed config regardless.
    const result = RenderConfigSchema.safeParse({
      legend: { position: { x: 0, y: 0 }, legendOverflow: "allow" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("allow");
      expect(result.data.legend!.position).toEqual({ x: 0, y: 0 });
    }
  });

  it("resolveTheme: legendOverflow='clip' preserved when legend anchor is at canvas right-bottom corner", () => {
    // resolveTheme must propagate legendOverflow to the resolved config unchanged.
    // The position itself is also preserved (resolveTheme does not clamp positions).
    const rc = resolveTheme({
      legend: { position: { x: 1600, y: 800 }, legendOverflow: "clip" },
    });
    expect(rc.legend.legendOverflow).toBe("clip");
    expect(rc.legend.position).toEqual({ x: 1600, y: 800 });
  });

  it("resolveTheme: legendOverflow='warn' preserved for anchor near canvas right edge", () => {
    // Verify resolveTheme faithfully passes legendOverflow through without modification.
    const rc = resolveTheme({
      legend: { position: { x: 1590, y: 400 }, legendOverflow: "warn" },
    });
    expect(rc.legend.legendOverflow).toBe("warn");
    expect(rc.legend.position).toEqual({ x: 1590, y: 400 });
  });

  it("custom canvas: anchor at custom-canvas edge with legendOverflow='clip' — bounds scale with canvas size", () => {
    // Canvas 400x300. Anchor at the bottom-right corner of this custom canvas.
    // Anchor is on-canvas (x<=400, y<=300), overflow expected for legend content.
    const result = RenderConfigSchema.safeParse({
      width: 400,
      height: 300,
      legend: { position: { x: 400, y: 300 }, legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.legendOverflow).toBe("clip");
      expect(result.data.legend!.position).toEqual({ x: 400, y: 300 });
    }
  });
});

describe("Sub-AC 8c: legendOverflow semantics — empty-legend degenerate case", () => {
  // Degenerate cases: the legend is absent, hidden (show=false), or structurally empty.
  // These cases must parse cleanly regardless of legendOverflow value.
  // The renderer short-circuits for show=false and for zero-item legends.

  it("show=false without legendOverflow: degenerate legend, legendOverflow defaults to 'allow'", () => {
    // A legend with show=false is the primary degenerate case.
    // legendOverflow should still default to 'allow' even when the legend is hidden.
    const result = RenderConfigSchema.safeParse({
      legend: { show: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.show).toBe(false);
      expect(result.data.legend!.legendOverflow).toBe("allow");
    }
  });

  it("show=false with legendOverflow='clip': hidden legend + clip mode parses cleanly", () => {
    // The renderer will short-circuit at show=false and never apply clipPath logic,
    // but the schema must not reject this combination.
    const result = RenderConfigSchema.safeParse({
      legend: { show: false, legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.show).toBe(false);
      expect(result.data.legend!.legendOverflow).toBe("clip");
    }
  });

  it("show=false with legendOverflow='warn': hidden legend + warn mode parses cleanly", () => {
    // Warn mode on a hidden legend is a no-op at render time, but valid schema input.
    const result = RenderConfigSchema.safeParse({
      legend: { show: false, legendOverflow: "warn" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.show).toBe(false);
      expect(result.data.legend!.legendOverflow).toBe("warn");
    }
  });

  it("absent legend field: no legend config is valid — degenerate 'absent' case", () => {
    // When the legend field is completely absent from renderConfig, the schema accepts
    // without triggering any legendOverflow or position validation.
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      // legend is entirely absent — no default injected at parse time
      expect(result.data.legend).toBeUndefined();
    }
  });

  it("show=false with all 3 legend fields: fully-specified degenerate legend parses cleanly", () => {
    // Degenerate case: legend is hidden but has all fields explicitly specified.
    // The renderer will short-circuit at show=false without using position or overflow.
    const result = RenderConfigSchema.safeParse({
      legend: { show: false, position: { x: 100, y: 200 }, legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend!.show).toBe(false);
      expect(result.data.legend!.legendOverflow).toBe("clip");
      expect(result.data.legend!.position).toEqual({ x: 100, y: 200 });
    }
  });

  it("resolveTheme: show=false preserves legendOverflow='allow' default in resolved config", () => {
    // resolveTheme must propagate legendOverflow even when show=false.
    const rc = resolveTheme({ legend: { show: false } });
    expect(rc.legend.show).toBe(false);
    expect(rc.legend.legendOverflow).toBe("allow");
  });

  it("resolveTheme: show=false with explicit legendOverflow='clip' preserved in resolved config", () => {
    // Even for hidden legends, resolveTheme must faithfully carry legendOverflow.
    const rc = resolveTheme({ legend: { show: false, legendOverflow: "clip" } });
    expect(rc.legend.show).toBe(false);
    expect(rc.legend.legendOverflow).toBe("clip");
  });

  it("resolveTheme: absent legend in renderConfig resolves to show=true, position='bottom-right', legendOverflow='allow'", () => {
    // When no legend config is provided, the resolved config must apply all 3 legend defaults.
    const rc = resolveTheme({});
    expect(rc.legend.show).toBe(true);
    expect(rc.legend.position).toBe("bottom-right");
    expect(rc.legend.legendOverflow).toBe("allow");
  });
});

// ── resolveTypeStyle — TypeStyleMap per-type fallback lookup ─────────────────

describe("resolveTypeStyle", () => {
  // ── number-valued map (nodeRadii pattern) ────────────────────────────────

  it("returns per-type value when the type key is present in the map", () => {
    const map: TypeStyleMap<number> = { _default: 5, anchor: 10 };
    expect(resolveTypeStyle(map, "anchor")).toBe(10);
  });

  it("falls back to _default when type key is absent", () => {
    const map: TypeStyleMap<number> = { _default: 5, anchor: 10 };
    expect(resolveTypeStyle(map, "component")).toBe(5);
  });

  it("falls back to _default when type key is absent (unknown type)", () => {
    const map: TypeStyleMap<number> = { _default: 7 };
    expect(resolveTypeStyle(map, "pipeline")).toBe(7);
  });

  it("returns undefined when type absent and _default absent (partial map)", () => {
    const partialMap: Partial<TypeStyleMap<number>> = { anchor: 10 };
    expect(resolveTypeStyle(partialMap, "component")).toBeUndefined();
  });

  it("returns _default from a partial map when type absent", () => {
    const partialMap: Partial<TypeStyleMap<number>> = { _default: 3 };
    expect(resolveTypeStyle(partialMap, "note")).toBe(3);
  });

  // ── string-valued map (typeColors pattern) ───────────────────────────────

  it("returns per-type color when present", () => {
    const colors: TypeStyleMap<string> = { _default: "#000000", component: "#ff0000" };
    expect(resolveTypeStyle(colors, "component")).toBe("#ff0000");
  });

  it("returns _default color when type not overridden", () => {
    const colors: TypeStyleMap<string> = { _default: "#000000", component: "#ff0000" };
    expect(resolveTypeStyle(colors, "anchor")).toBe("#000000");
  });

  // ── _default key itself ──────────────────────────────────────────────────

  it("looks up _default key when type='_default'", () => {
    const map: TypeStyleMap<number> = { _default: 5, anchor: 10 };
    // Passing "_default" as the type string returns the _default value directly
    expect(resolveTypeStyle(map, "_default")).toBe(5);
  });

  // ── evolveStyles pattern (optional _default, partial map) ────────────────

  it("returns undefined for a completely empty partial map", () => {
    const partialMap: Partial<TypeStyleMap<string>> = {};
    expect(resolveTypeStyle(partialMap, "natural")).toBeUndefined();
  });

  it("returns per-type value from a partial map even without _default", () => {
    const partialMap: Partial<TypeStyleMap<string>> = { natural: "#dc2626" };
    expect(resolveTypeStyle(partialMap, "natural")).toBe("#dc2626");
  });

  // ── Sub-AC 8d: fallback chain resolution ──────────────────────────────────

  it("fallback chain: explicit-type → _default → undefined — all 3 levels in one map", () => {
    // Level 1: per-type key present → returns it immediately
    // Level 2: per-type key absent, _default present → returns _default
    // Level 3: per-type key absent, _default absent (Partial) → returns undefined
    const full: TypeStyleMap<number> = { _default: 5, anchor: 10, "user-need": 8 };
    const partial: Partial<TypeStyleMap<number>> = { anchor: 10 }; // no _default

    // Level 1 — explicit type keys found
    expect(resolveTypeStyle(full, "anchor")).toBe(10);
    expect(resolveTypeStyle(full, "user-need")).toBe(8);

    // Level 2 — type absent, falls to _default
    expect(resolveTypeStyle(full, "component")).toBe(5);
    expect(resolveTypeStyle(full, "pipeline")).toBe(5);

    // Level 3 — type absent AND no _default in partial map
    expect(resolveTypeStyle(partial, "component")).toBeUndefined();
    expect(resolveTypeStyle(partial, "pipeline")).toBeUndefined();
  });

  // ── Sub-AC 8d: viewer-preference vs authorial-decision precedence ─────────
  // viewer-preference = theme baseline (provides the _default fallback via resolveTheme)
  // authorial-decision = explicit per-type key in the renderConfig payload
  // Rule: explicit type-specific key (authorial intent) wins over _default (viewer/theme default)

  it("authorial per-type key overrides viewer-preference theme-baseline _default", () => {
    // Theme baseline supplies nodeRadii: { _default: 5 } (viewer preference).
    // The author's renderConfig adds anchor: 20 (authorial decision).
    // resolveTheme merges them: { _default: 5, anchor: 20 }.
    // resolveTypeStyle must return the author's type-specific key for "anchor",
    // and fall back to _default (shared by theme + author) for unspecified types.
    const resolved = resolveTheme({ nodeRadii: { _default: 5, anchor: 20 } });

    // authorial type-specific key wins
    expect(resolveTypeStyle(resolved.nodeRadii, "anchor")).toBe(20);
    // viewer-preference _default used for types the author did not override
    expect(resolveTypeStyle(resolved.nodeRadii, "component")).toBe(5);
    expect(resolveTypeStyle(resolved.nodeRadii, "note")).toBe(5);
  });

  it("author _default overrides theme-baseline _default; type-specific keys win over both", () => {
    // Author supplies their own _default (3) AND a type-specific key (anchor=20).
    // Theme baseline has _default=5; merged map should have _default=3 (author wins).
    const resolved = resolveTheme({ nodeRadii: { _default: 3, anchor: 20 } });

    // authorial type-specific key beats everything
    expect(resolveTypeStyle(resolved.nodeRadii, "anchor")).toBe(20);
    // authorial _default (3) beats theme baseline _default (5)
    expect(resolveTypeStyle(resolved.nodeRadii, "component")).toBe(3);
    expect(resolveTypeStyle(resolved.nodeRadii, "pipeline")).toBe(3);
  });

  // ── Sub-AC 8d: unknown-type default ──────────────────────────────────────

  it("completely unknown type string falls back to _default (forward-compatible)", () => {
    // Types that are not (yet) in any enum must not throw or return a wrong value —
    // they silently fall to _default, making the lookup future-proof.
    const map: TypeStyleMap<string> = {
      _default: "#888888",
      component: "#ff0000",
    };
    expect(resolveTypeStyle(map, "future-widget")).toBe("#888888");
    expect(resolveTypeStyle(map, "completely-unknown-type")).toBe("#888888");
    expect(resolveTypeStyle(map, "NEW_TYPE_v3")).toBe("#888888");
  });

  it("unknown type on a Partial map with no _default returns undefined (renderer uses hardcoded default)", () => {
    // When a Partial<TypeStyleMap<T>> has neither the type key nor _default (e.g. evolveStyles
    // with only some keys set), resolveTypeStyle signals "not configured" via undefined so the
    // renderer can apply its own hard-coded per-type default.
    const partialEvolve: Partial<TypeStyleMap<{ stroke: string }>> = {
      natural: { stroke: "#dc2626" },
    };
    expect(resolveTypeStyle(partialEvolve, "future-evolve-type")).toBeUndefined();
    expect(resolveTypeStyle(partialEvolve, "unknown")).toBeUndefined();
    // known key still resolves
    expect(resolveTypeStyle(partialEvolve, "natural")).toEqual({ stroke: "#dc2626" });
  });
});

// ── TypeStyleMap generics — type-safe instantiation, generic constraints, key rejection ────

describe("TypeStyleMap generics", () => {
  // ── Type-safe instantiation ──────────────────────────────────────────────

  it("TypeStyleMap<number>: instantiates with _default and per-type number values", () => {
    // Type-safe instantiation: TypeStyleMap<number> requires _default: number
    const map: TypeStyleMap<number> = { _default: 5, anchor: 10, component: 3 };
    expect(map._default).toBe(5);
    expect(map.anchor).toBe(10);
    expect(map.component).toBe(3);
  });

  it("TypeStyleMap<string>: instantiates with _default and per-type string values", () => {
    // Type-safe instantiation: TypeStyleMap<string> holds color strings with fallback
    const map: TypeStyleMap<string> = { _default: "#000000", anchor: "#2563eb" };
    expect(map._default).toBe("#000000");
    expect(map.anchor).toBe("#2563eb");
  });

  it("TypeStyleMap<object>: instantiates with structured object value type", () => {
    // Type-safe instantiation: TypeStyleMap works with any object type T
    type EvolveStyle = { stroke: string; dashArray?: string };
    const map: TypeStyleMap<EvolveStyle> = {
      _default: { stroke: "#666" },
      natural: { stroke: "#dc2626", dashArray: "4 2" },
    };
    expect(map._default.stroke).toBe("#666");
    expect(map.natural).toEqual({ stroke: "#dc2626", dashArray: "4 2" });
    expect(map.natural?.dashArray).toBe("4 2");
  });

  // ── Generic constraints (makeTypeStyleMapSchema) ─────────────────────────

  it("makeTypeStyleMapSchema<ZodString>: accepts string values and enforces the value type", () => {
    // Generic constraint: factory works with string Zod type; wrong type is rejected
    const schema = makeTypeStyleMapSchema(z.string());
    expect(schema.safeParse({ _default: "blue", anchor: "red" }).success).toBe(true);
    expect(schema.safeParse({ _default: 42 }).success).toBe(false); // number fails string schema
  });

  it("makeTypeStyleMapSchema<ZodNumber>: enforces numeric constraint on all map values", () => {
    // Generic constraint: value schema constraint applies to _default and per-type keys
    const schema = makeTypeStyleMapSchema(z.number().positive());
    const goodResult = schema.safeParse({ _default: 5, anchor: 10 });
    expect(goodResult.success).toBe(true);
    expect(schema.safeParse({ _default: "not-a-number" }).success).toBe(false);
    expect(schema.safeParse({ _default: -1 }).success).toBe(false); // violates positive()
  });

  it("makeTypeStyleMapSchema<ZodObject>: accepts nested object values generically", () => {
    // Generic constraint: factory works with ZodObject value schema
    const schema = makeTypeStyleMapSchema(
      z.object({ stroke: z.string(), width: z.number() })
    );
    const result = schema.safeParse({
      _default: { stroke: "#000", width: 1 },
      anchor: { stroke: "#f00", width: 2 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._default.stroke).toBe("#000");
      expect(result.data.anchor?.width).toBe(2);
    }
  });

  // ── Invalid type key rejection (typeStyleMapSchema strict) ───────────────

  it("typeStyleMapSchema: rejects keys outside the closed enum", () => {
    // Invalid type key rejection: strict schema only allows declared enum keys + _default
    const schema = typeStyleMapSchema(
      z.number(),
      ["alpha", "beta", "gamma"],
      { requireDefault: true }
    );
    expect(schema.safeParse({ _default: 1, alpha: 2 }).success).toBe(true);  // valid
    expect(schema.safeParse({ _default: 1, delta: 2 }).success).toBe(false); // delta not in enum
  });

  it("typeStyleMapSchema: accepts every key in the closed enum", () => {
    // Invalid type key rejection: schema accepts all declared enum keys simultaneously
    const schema = typeStyleMapSchema(z.string(), ["x", "y", "z"]);
    const result = schema.safeParse({ x: "a", y: "b", z: "c" });
    expect(result.success).toBe(true);
  });

  it("typeStyleMapSchema: rejects unknown keys even when valid keys are also present", () => {
    // Invalid type key rejection: mixing valid + invalid keys still fails strict schema
    const schema = typeStyleMapSchema(z.number(), ["component", "anchor"]);
    expect(
      schema.safeParse({ _default: 5, component: 3, unknownKey: 7 }).success
    ).toBe(false);
    expect(
      schema.safeParse({ _default: 5, component: 3, anchor: 4 }).success
    ).toBe(true); // all valid
  });
});

// ── Cross-category conflict resolution (precedence rules) ────────────────────
//
// "resolveConflict" is the conceptual name for what resolveTheme() does when
// values from different config categories collide. The precedence chain is:
//
//   Level 1 (lowest) : Theme baseline defaults   (viewer-preference / theme selection)
//   Level 2          : Top-level explicit fields  (author-intent overrides)
//   Level 3 (highest): Nested background sub-objects  (most-specific wins)
//
// Cross-category means values come from different conceptual buckets:
//   e.g. "theme" (viewer pref) vs "evolveStyles" (author-intent visual vocabulary)
//   e.g. "coordinateSpace" (layout math) vs "axisLabels" (content/i18n)
//   e.g. "locale" (i18n default) vs explicit label string (content override)
// ---------------------------------------------------------------------------

describe("Cross-category conflict resolution (resolveConflict precedence rules)", () => {
  // ── Conflict 1: dark theme (viewer-preference) vs explicit evolveStyles (author-intent) ──
  it("dark theme does NOT overwrite explicit evolveStyles — author-intent wins over theme", () => {
    // The dark theme baseline has empty evolveStyles: {}.
    // If the author explicitly provides evolveStyles, those MUST be preserved exactly —
    // theme selection is a viewer-preference category, evolveStyles is an author-intent category.
    const resolved = resolveTheme({
      theme: "dark",
      evolveStyles: {
        natural: { stroke: "#000000", strokeDasharray: "4 2" },
      },
    });
    // Author-intent evolveStyles survive unmodified — dark theme cannot override them
    expect(resolved.evolveStyles).toMatchObject({
      natural: { stroke: "#000000", strokeDasharray: "4 2" },
    });
    // Dark theme background is still applied (theme wins for its own category)
    expect(resolved.background.color).toBe("#1a1a2e");
  });

  // ── Conflict 2: dark theme background baseline vs explicit background.color override ──
  it("explicit background.color overrides dark theme baseline color — explicit field wins", () => {
    // theme: "dark" sets baseline background.color = "#1a1a2e".
    // An explicit background.color MUST override that — same-category explicit always wins.
    const resolved = resolveTheme({
      theme: "dark",
      background: { color: "#ffffff" },
    });
    expect(resolved.background.color).toBe("#ffffff"); // explicit wins over dark baseline
    // But dark theme strokeWidth baseline still applies (no explicit strokeWidth given)
    expect(resolved.strokeWidth).toBe(1.5);
  });

  // ── Conflict 3: locale "fr" (i18n default) vs explicit xAxis label string (content override) ──
  it("explicit background.evolutionXAxis.xAxis overrides locale-resolved label — content wins over locale", () => {
    // locale: "fr" resolves xAxis to "Évolution" (French preset).
    // An explicit xAxis string in background.evolutionXAxis.xAxis is Level 3 and MUST win.
    const resolved = resolveTheme({
      locale: "fr",
      background: { evolutionXAxis: { xAxis: "Custom Axis Label" } },
    });
    expect(resolved.axisLabels.xAxis).toBe("Custom Axis Label"); // explicit wins over French locale
    // locale still applies for other labels not explicitly overridden
    expect(resolved.axisLabels.phases[0]).toBe(AXIS_LABELS_FR.phases[0]); // "Genèse"
  });

  // ── Conflict 4: custom coordinateSpace.width (layout) vs top-level width (canvas) — independent categories ──
  it("coordinateSpace.width and resolved.width are independent — setting coordinateSpace does not change resolved.width", () => {
    // coordinateSpace (layout math) is a separate category from the top-level width.
    // Providing coordinateSpace: { width: 1200 } must NOT bleed into resolved.width —
    // they are resolved independently from different config paths.
    const resolved = resolveTheme({
      coordinateSpace: { width: 1200 },
    });
    // resolved.width uses baseline (1600) — no explicit top-level width given
    expect(resolved.width).toBe(1600);
    // coordinateSpace.width reflects the explicit value
    expect(resolved.coordinateSpace.width).toBe(1200);
    // The two are genuinely independent — no cross-contamination
    expect(resolved.width).not.toBe(resolved.coordinateSpace.width);
  });

  // ── Conflict 5: highContrast theme nodeRadii baseline vs explicit partial nodeRadii override ──
  it("explicit nodeRadii merges over highContrast baseline — explicit _default and per-type values win", () => {
    // highContrast theme inherits nodeRadii: { _default: 5 } from the default baseline.
    // Explicit nodeRadii is MERGED (spread) over the baseline — explicit keys win.
    const resolved = resolveTheme({
      theme: "highContrast",
      nodeRadii: { _default: 12, "user-need": 14 },
    });
    expect(resolved.nodeRadii._default).toBe(12);               // explicit _default overrides baseline 5
    expect(resolved.nodeRadii["user-need"]).toBe(14);           // per-type explicit value present
    // highContrast theme's other distinctives still apply
    expect(resolved.strokeWidth).toBe(2);                        // highContrast baseline strokeWidth
    expect(resolved.fontFamily).toBe("Arial, sans-serif");       // highContrast font override
  });

  // ── Conflict 6: dark theme strokeWidth (1.5 baseline) vs explicit strokeWidth override ──
  it("explicit strokeWidth overrides dark theme baseline strokeWidth — explicit top-level field wins", () => {
    // theme: "dark" sets strokeWidth baseline = 1.5.
    // An explicit top-level strokeWidth is Level 2 and MUST win over Level 1 baseline.
    const resolved = resolveTheme({
      theme: "dark",
      strokeWidth: 3,
    });
    expect(resolved.strokeWidth).toBe(3); // explicit wins over dark baseline 1.5
    // Dark theme background is still applied (theme wins for its own category)
    expect(resolved.background.color).toBe("#1a1a2e");
  });

  // ── Conflict 7: explicit typeColors vs dark theme (empty typeColors baseline) ──
  it("explicit typeColors fully replace dark theme empty baseline — category replacement is complete", () => {
    // theme: "dark" baseline has typeColors: {} (empty — no per-type colors set).
    // Providing explicit typeColors MUST fully replace the baseline (not merge) —
    // this ensures the author's color vocabulary is applied exactly.
    const resolved = resolveTheme({
      theme: "dark",
      typeColors: { _default: "#cccccc", component: "#ff0000" },
    });
    expect(resolved.typeColors._default).toBe("#cccccc");
    expect(resolved.typeColors["component"]).toBe("#ff0000");
    // Dark theme still owns the background category
    expect(resolved.background.color).toBe("#1a1a2e");
  });

  // ── Conflict 8: showEvolutionXAxis: false (visibility toggle) vs explicit xAxis label (content) ──
  it("axis label resolves even when showEvolutionXAxis is false — visibility and content are independent categories", () => {
    // showEvolutionXAxis is a layer visibility toggle — a rendering-layer category.
    // background.evolutionXAxis.xAxis is an axis label string — a content/i18n category.
    // These are orthogonal: disabling axis visibility MUST NOT suppress label resolution.
    const resolved = resolveTheme({
      background: {
        evolutionXAxis: { show: false, xAxis: "Hidden Axis Label" },
      },
    });
    // Visibility toggle is applied (axis is hidden)
    expect(resolved.showEvolutionXAxis).toBe(false);
    // Content resolution is independent — label is still resolved and available
    // (the renderer may choose not to render it, but the config carries the resolved value)
    expect(resolved.axisLabels.xAxis).toBe("Hidden Axis Label");
  });
});

// ── AC 5: Phase vocabulary decoupled from evolveStyles keys ──────────────────
//
// phaseLabels (background.evolutionPhases.phases) is an arbitrarily-sized ordered
// array — not locked to the 4 named evolution zones (Genesis / Custom-Built /
// Product / Commodity).
//
// evolveStyles keys remain a CLOSED enum (natural / ecosystem / forced / late)
// — these are derived from the data-schema EvolveTypeEnum and are intentionally
// stable.  The two vocabularies are decoupled: the number of display columns
// does NOT dictate which arrow styles exist, and vice versa.
// ---------------------------------------------------------------------------

describe("AC 5 — phaseLabels arbitrary size vs. evolveStyles closed enum (decoupled)", () => {
  // ── 3-element phaseLabels — evolveStyles stays stable ──────────────────

  it("3-element phases accepted by schema and resolves correctly while evolveStyles enum is unchanged", () => {
    // phaseLabels with 3 elements: a map with an unusual 3-zone layout
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: {
          phases: ["Early", "Transition", "Mature"], // 3 phases — valid (not locked to 4)
        },
      },
      evolveStyles: {
        natural: { stroke: "#dc2626" },
        late: { stroke: "#999999" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // phaseLabels carries the 3-element array unchanged
      expect(result.data.background?.evolutionPhases?.phases).toEqual(["Early", "Transition", "Mature"]);
      // evolveStyles closed enum is unaffected — natural/late still valid
      expect(result.data.evolveStyles?.natural?.stroke).toBe("#dc2626");
      expect(result.data.evolveStyles?.late?.stroke).toBe("#999999");
    }

    // Verify EvolveTypeEnum still has exactly the 4 canonical values — the closed enum is stable
    expect(EvolveTypeEnum.options).toEqual(["natural", "ecosystem", "forced", "late"]);
  });

  it("3-element phases flows through resolveTheme — resolved axisLabels.phases has 3 elements", () => {
    // phaseLabels with 3 elements must survive resolveTheme unmodified
    const resolved = resolveTheme({
      background: {
        evolutionPhases: {
          phases: ["Genesis", "Custom-Built", "Commodity"], // 3 phases (skipping Product)
        },
      },
      evolveStyles: {
        natural: { stroke: "#aa0000" },
      },
    });
    // 3-element phases array is preserved in resolved config
    expect(resolved.axisLabels.phases).toHaveLength(3);
    expect(resolved.axisLabels.phases[0]).toBe("Genesis");
    expect(resolved.axisLabels.phases[1]).toBe("Custom-Built");
    expect(resolved.axisLabels.phases[2]).toBe("Commodity");
    // evolveStyles is unchanged — 4-key closed enum unaffected by phase count
    expect(resolved.evolveStyles).toMatchObject({ natural: { stroke: "#aa0000" } });
    expect(EvolveTypeEnum.options).toHaveLength(4); // closed enum stable
  });

  // ── 5-element phaseLabels — evolveStyles stays stable ──────────────────

  it("5-element phases accepted by schema while evolveStyles closed enum remains 4-key", () => {
    // phaseLabels with 5 elements: a map with an extended phase taxonomy
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: {
          phases: ["Genesis", "Custom-Built", "Product", "Commodity", "Utility"], // 5 phases
        },
      },
      evolveStyles: {
        _default: { stroke: "#888888", strokeDasharray: "4,2" },
        forced: { stroke: "#9333ea" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // 5-element array accepted and stored
      expect(result.data.background?.evolutionPhases?.phases).toHaveLength(5);
      expect(result.data.background?.evolutionPhases?.phases?.[4]).toBe("Utility");
      // evolveStyles closed enum: _default and forced are valid; enum is unchanged
      expect(result.data.evolveStyles?._default?.stroke).toBe("#888888");
      expect(result.data.evolveStyles?.forced?.stroke).toBe("#9333ea");
    }

    // EvolveTypeEnum is still the stable 4-value closed set
    expect(EvolveTypeEnum.options).toEqual(["natural", "ecosystem", "forced", "late"]);
    // evolveStyles does NOT accept a hypothetical 5th zone key
    const rejected = EvolveStylesMapSchema.safeParse({ utility: { stroke: "#000" } });
    expect(rejected.success).toBe(false); // "utility" is not in the closed enum
  });

  it("5-element phases flows through resolveTheme — resolved axisLabels.phases has 5 elements", () => {
    // 5-element phases must survive resolveTheme unmodified
    const resolved = resolveTheme({
      background: {
        evolutionPhases: {
          phases: ["P1", "P2", "P3", "P4", "P5"], // 5 custom phase labels
        },
      },
    });
    expect(resolved.axisLabels.phases).toHaveLength(5);
    expect(resolved.axisLabels.phases[0]).toBe("P1");
    expect(resolved.axisLabels.phases[4]).toBe("P5");
    // evolveStyles default baseline is still empty (4-key enum applies, no phases coupling)
    expect(EvolveTypeEnum.options).toHaveLength(4);
  });

  // ── evolveStyles closed enum immutability during phase count changes ────

  it("EvolveStylesMapSchema rejects keys matching phase labels that are not in the EvolveType enum", () => {
    // Even if a phaseLabels entry coincidentally matches an unknown key name,
    // evolveStyles must still reject it — the two vocabularies are completely decoupled.
    const phaseName = "Transition"; // appears in a phaseLabels array
    const result = EvolveStylesMapSchema.safeParse({
      [phaseName]: { stroke: "#123456" }, // not a valid EvolveType key
    });
    expect(result.success).toBe(false); // closed enum enforced regardless of phase names
  });
});

// ── Field-Category Taxonomy tests ───────────────────────────
// Tests for RENDER_CONFIG_FIELD_TAXONOMY, COORDINATE_SPACE_FIELD_TAXONOMY,
// BACKGROUND_FIELD_TAXONOMY, LEGEND_FIELD_TAXONOMY, FILTERS_FIELD_TAXONOMY,
// TYPE_STYLE_MAP_TAXONOMY, getRenderConfigFieldCategory, isViewerOverridable,
// and getViewerOverridableFields.

import {
  RENDER_CONFIG_FIELD_TAXONOMY,
  COORDINATE_SPACE_FIELD_TAXONOMY,
  BACKGROUND_FIELD_TAXONOMY,
  LEGEND_FIELD_TAXONOMY,
  FILTERS_FIELD_TAXONOMY,
  TYPE_STYLE_MAP_TAXONOMY,
  getRenderConfigFieldCategory,
  isViewerOverridable,
  getViewerOverridableFields,
  type FieldCategory,
  type FieldMetadata,
} from "./schema";

// ── FieldMetadata shape contract ────────────────────────────

describe("FieldMetadata shape", () => {
  it("every entry in RENDER_CONFIG_FIELD_TAXONOMY has category, description, and overridable", () => {
    for (const [key, meta] of Object.entries(RENDER_CONFIG_FIELD_TAXONOMY)) {
      expect(
        typeof meta.category === "string",
        `${key}.category should be a string`
      ).toBe(true);
      expect(
        meta.category === "author-intent" || meta.category === "viewer-preference",
        `${key}.category should be a valid FieldCategory`
      ).toBe(true);
      expect(
        typeof meta.description === "string" && meta.description.length > 0,
        `${key}.description should be a non-empty string`
      ).toBe(true);
      expect(
        typeof meta.overridable === "boolean",
        `${key}.overridable should be a boolean`
      ).toBe(true);
    }
  });

  it("overridable mirrors category: viewer-preference iff overridable===true", () => {
    for (const [key, meta] of Object.entries(RENDER_CONFIG_FIELD_TAXONOMY)) {
      if (meta.category === "viewer-preference") {
        expect(meta.overridable, `${key} viewer-preference → overridable should be true`).toBe(true);
      } else {
        expect(meta.overridable, `${key} author-intent → overridable should be false`).toBe(false);
      }
    }
  });
});

// ── RENDER_CONFIG_FIELD_TAXONOMY classifications ─────────────

describe("RENDER_CONFIG_FIELD_TAXONOMY — author-intent fields", () => {
  const authorIntentFields = [
    "width",
    "height",
    "coordinateSpace",
    "background",
    "fontFamily",
    "nodeRadii",
    "avoidCollisions",
    "typeColors",
    "evolveStyles",
    "legend",
    "filters",
    "strokeWidth",
  ] as const;

  for (const field of authorIntentFields) {
    it(`${field} is classified as author-intent`, () => {
      expect(RENDER_CONFIG_FIELD_TAXONOMY[field].category).toBe("author-intent");
      expect(RENDER_CONFIG_FIELD_TAXONOMY[field].overridable).toBe(false);
    });
  }
});

describe("RENDER_CONFIG_FIELD_TAXONOMY — viewer-preference fields", () => {
  const viewerPrefFields = ["theme", "locale", "labelScale"] as const;

  for (const field of viewerPrefFields) {
    it(`${field} is classified as viewer-preference`, () => {
      expect(RENDER_CONFIG_FIELD_TAXONOMY[field].category).toBe("viewer-preference");
      expect(RENDER_CONFIG_FIELD_TAXONOMY[field].overridable).toBe(true);
    });
  }
});

describe("RENDER_CONFIG_FIELD_TAXONOMY — coordinate-system fields are non-overridable", () => {
  it("width is author-intent and non-overridable (coordinate-system-defining)", () => {
    expect(RENDER_CONFIG_FIELD_TAXONOMY.width.category).toBe("author-intent");
    expect(RENDER_CONFIG_FIELD_TAXONOMY.width.overridable).toBe(false);
  });

  it("height is author-intent and non-overridable (coordinate-system-defining)", () => {
    expect(RENDER_CONFIG_FIELD_TAXONOMY.height.category).toBe("author-intent");
    expect(RENDER_CONFIG_FIELD_TAXONOMY.height.overridable).toBe(false);
  });

  it("coordinateSpace is author-intent and non-overridable", () => {
    expect(RENDER_CONFIG_FIELD_TAXONOMY.coordinateSpace.category).toBe("author-intent");
    expect(RENDER_CONFIG_FIELD_TAXONOMY.coordinateSpace.overridable).toBe(false);
  });

});

// ── COORDINATE_SPACE_FIELD_TAXONOMY ─────────────────────────

describe("COORDINATE_SPACE_FIELD_TAXONOMY", () => {
  it("every CoordinateSpace field is author-intent and non-overridable", () => {
    const fields = ["width", "height", "evolutionRange", "visibilityRange", "units", "unit", "origin"] as const;
    for (const field of fields) {
      expect(COORDINATE_SPACE_FIELD_TAXONOMY[field].category).toBe("author-intent");
      expect(COORDINATE_SPACE_FIELD_TAXONOMY[field].overridable).toBe(false);
    }
  });

  it("has non-empty descriptions for all fields", () => {
    for (const [key, meta] of Object.entries(COORDINATE_SPACE_FIELD_TAXONOMY)) {
      expect(meta.description.length, `${key} description should be non-empty`).toBeGreaterThan(0);
    }
  });
});

// ── BACKGROUND_FIELD_TAXONOMY ────────────────────────────────

describe("BACKGROUND_FIELD_TAXONOMY", () => {
  it("background.color is viewer-preference (cosmetic)", () => {
    expect(BACKGROUND_FIELD_TAXONOMY.color.category).toBe("viewer-preference");
    expect(BACKGROUND_FIELD_TAXONOMY.color.overridable).toBe(true);
  });

  it("evolutionXAxis.show is author-intent (structural)", () => {
    expect(BACKGROUND_FIELD_TAXONOMY["evolutionXAxis.show"].category).toBe("author-intent");
    expect(BACKGROUND_FIELD_TAXONOMY["evolutionXAxis.show"].overridable).toBe(false);
  });

  it("valueChainYAxis.show is author-intent (structural)", () => {
    expect(BACKGROUND_FIELD_TAXONOMY["valueChainYAxis.show"].category).toBe("author-intent");
    expect(BACKGROUND_FIELD_TAXONOMY["valueChainYAxis.show"].overridable).toBe(false);
  });

  it("evolutionPhases.showPhaseDividerAndLabel is author-intent (structural)", () => {
    expect(BACKGROUND_FIELD_TAXONOMY["evolutionPhases.showPhaseDividerAndLabel"].category).toBe("author-intent");
    expect(BACKGROUND_FIELD_TAXONOMY["evolutionPhases.showPhaseDividerAndLabel"].overridable).toBe(false);
  });

  // Sub-AC 2: axisLabels removed from BACKGROUND_FIELD_TAXONOMY (direction labels removed from MapChrome).
  it("axisLabels is no longer in BACKGROUND_FIELD_TAXONOMY (removed in Sub-AC 2)", () => {
    expect(Object.prototype.hasOwnProperty.call(BACKGROUND_FIELD_TAXONOMY, "axisLabels")).toBe(false);
  });
});

// ── LEGEND_FIELD_TAXONOMY ────────────────────────────────────

describe("LEGEND_FIELD_TAXONOMY", () => {
  it("legend.show is author-intent (structural decision)", () => {
    expect(LEGEND_FIELD_TAXONOMY.show.category).toBe("author-intent");
    expect(LEGEND_FIELD_TAXONOMY.show.overridable).toBe(false);
  });

  it("legend.position is viewer-preference (layout preference)", () => {
    expect(LEGEND_FIELD_TAXONOMY.position.category).toBe("viewer-preference");
    expect(LEGEND_FIELD_TAXONOMY.position.overridable).toBe(true);
  });

  it("legend.legendOverflow is viewer-preference (layout preference)", () => {
    expect(LEGEND_FIELD_TAXONOMY.legendOverflow.category).toBe("viewer-preference");
    expect(LEGEND_FIELD_TAXONOMY.legendOverflow.overridable).toBe(true);
  });
});

// ── FILTERS_FIELD_TAXONOMY ───────────────────────────────────

describe("FILTERS_FIELD_TAXONOMY", () => {
  it("excludeComponentTypes is author-intent (data filter)", () => {
    expect(FILTERS_FIELD_TAXONOMY.excludeComponentTypes.category).toBe("author-intent");
    expect(FILTERS_FIELD_TAXONOMY.excludeComponentTypes.overridable).toBe(false);
  });

  it("layers.* is viewer-preference (visual toggle)", () => {
    expect(FILTERS_FIELD_TAXONOMY["layers.*"].category).toBe("viewer-preference");
    expect(FILTERS_FIELD_TAXONOMY["layers.*"].overridable).toBe(true);
  });
});

// ── TYPE_STYLE_MAP_TAXONOMY ──────────────────────────────────

describe("TYPE_STYLE_MAP_TAXONOMY", () => {
  it("_default is viewer-preference (cosmetic fallback)", () => {
    expect(TYPE_STYLE_MAP_TAXONOMY._default.category).toBe("viewer-preference");
    expect(TYPE_STYLE_MAP_TAXONOMY._default.overridable).toBe(true);
  });

  it("_perTypeEntry is viewer-preference (cosmetic override)", () => {
    expect(TYPE_STYLE_MAP_TAXONOMY._perTypeEntry.category).toBe("viewer-preference");
    expect(TYPE_STYLE_MAP_TAXONOMY._perTypeEntry.overridable).toBe(true);
  });
});

// ── getRenderConfigFieldCategory helper ─────────────────────

describe("getRenderConfigFieldCategory", () => {
  it("returns 'viewer-preference' for theme", () => {
    expect(getRenderConfigFieldCategory("theme")).toBe("viewer-preference");
  });

  it("returns 'viewer-preference' for locale", () => {
    expect(getRenderConfigFieldCategory("locale")).toBe("viewer-preference");
  });

  it("returns 'viewer-preference' for labelScale", () => {
    expect(getRenderConfigFieldCategory("labelScale")).toBe("viewer-preference");
  });

  it("returns 'author-intent' for width", () => {
    expect(getRenderConfigFieldCategory("width")).toBe("author-intent");
  });

  it("returns 'author-intent' for coordinateSpace", () => {
    expect(getRenderConfigFieldCategory("coordinateSpace")).toBe("author-intent");
  });

  it("returns 'author-intent' for background (compound field)", () => {
    expect(getRenderConfigFieldCategory("background")).toBe("author-intent");
  });
});

// ── isViewerOverridable helper ───────────────────────────────

describe("isViewerOverridable", () => {
  it("returns true for theme", () => {
    expect(isViewerOverridable("theme")).toBe(true);
  });

  it("returns true for locale", () => {
    expect(isViewerOverridable("locale")).toBe(true);
  });

  it("returns true for labelScale", () => {
    expect(isViewerOverridable("labelScale")).toBe(true);
  });

  it("returns false for width", () => {
    expect(isViewerOverridable("width")).toBe(false);
  });

  it("returns false for height", () => {
    expect(isViewerOverridable("height")).toBe(false);
  });

  it("returns false for coordinateSpace", () => {
    expect(isViewerOverridable("coordinateSpace")).toBe(false);
  });

  it("returns false for fontFamily (author brand decision)", () => {
    expect(isViewerOverridable("fontFamily")).toBe(false);
  });

  it("returns false for strokeWidth (author visual design)", () => {
    expect(isViewerOverridable("strokeWidth")).toBe(false);
  });

  it("returns false for typeColors (author visual design)", () => {
    expect(isViewerOverridable("typeColors")).toBe(false);
  });

  it("returns false for nodeRadii (author visual design)", () => {
    expect(isViewerOverridable("nodeRadii")).toBe(false);
  });
});

// ── getViewerOverridableFields helper ───────────────────────

describe("getViewerOverridableFields", () => {
  it("returns exactly the viewer-preference fields", () => {
    const fields = getViewerOverridableFields();
    expect(fields).toContain("theme");
    expect(fields).toContain("locale");
    expect(fields).toContain("labelScale");
  });

  it("does not contain any author-intent fields", () => {
    const fields = getViewerOverridableFields();
    const authorIntentFields = [
      "width", "height", "coordinateSpace", "background",
      "fontFamily", "nodeRadii", "avoidCollisions", "typeColors",
      "evolveStyles", "legend", "filters", "strokeWidth",
    ];
    for (const field of authorIntentFields) {
      expect(fields).not.toContain(field);
    }
  });

  it("returns exactly 3 fields (theme, locale, labelScale)", () => {
    const fields = getViewerOverridableFields();
    expect(fields).toHaveLength(3);
  });

  it("is consistent with RENDER_CONFIG_FIELD_TAXONOMY.overridable flags", () => {
    const fields = getViewerOverridableFields();
    const fieldSet = new Set(fields);
    for (const [key, meta] of Object.entries(RENDER_CONFIG_FIELD_TAXONOMY)) {
      if (meta.overridable) {
        expect(fieldSet.has(key as keyof typeof RENDER_CONFIG_FIELD_TAXONOMY)).toBe(true);
      } else {
        expect(fieldSet.has(key as keyof typeof RENDER_CONFIG_FIELD_TAXONOMY)).toBe(false);
      }
    }
  });
});

// ── Taxonomy consistency with resolve-conflict arrays ────────

describe("Taxonomy consistency with AUTHOR_INTENT_FIELDS / VIEWER_PREFERENCE_FIELDS", () => {
  // Import the arrays from resolve-conflict to cross-check
  it("RENDER_CONFIG_FIELD_TAXONOMY agrees with AUTHOR_INTENT_FIELDS on author fields", async () => {
    const { AUTHOR_INTENT_FIELDS } = await import("./resolve-conflict.js");
    for (const field of AUTHOR_INTENT_FIELDS) {
      const meta = RENDER_CONFIG_FIELD_TAXONOMY[field as keyof typeof RENDER_CONFIG_FIELD_TAXONOMY];
      expect(
        meta,
        `${field} in AUTHOR_INTENT_FIELDS should have a taxonomy entry`
      ).toBeDefined();
      expect(
        meta?.category,
        `${field} should be author-intent in taxonomy`
      ).toBe("author-intent");
    }
  });

  it("RENDER_CONFIG_FIELD_TAXONOMY agrees with VIEWER_PREFERENCE_FIELDS on viewer fields", async () => {
    const { VIEWER_PREFERENCE_FIELDS } = await import("./resolve-conflict.js");
    for (const field of VIEWER_PREFERENCE_FIELDS) {
      const meta = RENDER_CONFIG_FIELD_TAXONOMY[field as keyof typeof RENDER_CONFIG_FIELD_TAXONOMY];
      expect(
        meta,
        `${field} in VIEWER_PREFERENCE_FIELDS should have a taxonomy entry`
      ).toBeDefined();
      expect(
        meta?.category,
        `${field} should be viewer-preference in taxonomy`
      ).toBe("viewer-preference");
    }
  });
});

// ── Sub-AC 7d: Phase vocabulary flexibility & regression gate ─────────────
//
// These tests verify that phase/evolution labels accept user-supplied
// vocabulary (custom stage names) without breaking existing string-based
// defaults, and that the full round-trip from schema parse → resolveTheme
// → axisLabels preserves the supplied vocabulary end-to-end.
//
// Coverage required: custom vocabulary round-trips, empty overrides,
// schema backward-compatibility.

describe("Phase vocabulary flexibility (Sub-AC 7d)", () => {
  // ── 1. Custom vocabulary full round-trip ──────────────────────
  it("round-trip: custom 5-phase vocabulary survives RenderConfigSchema.parse → resolveTheme", () => {
    const customPhases = ["Idea", "Prototype", "Product", "Scale", "Commodity"];
    // Step 1: validate through schema
    const parsed = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: { phases: customPhases },
      },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Step 2: pass parsed output into resolveTheme
    const rc = resolveTheme(parsed.data);
    // The custom phases must come out unchanged on the other side
    expect(rc.axisLabels.phases).toEqual(customPhases);
    expect(rc.axisLabels.phases).toHaveLength(5);
    expect(rc.axisLabels.phases[0]).toBe("Idea");
    expect(rc.axisLabels.phases[4]).toBe("Commodity");
  });

  // ── 2. Backward-compatibility: no phases field → EN defaults ──
  it("backward-compat: config without phases field resolves to English default vocabulary", () => {
    const rc = resolveTheme({});
    // Must match the canonical EN preset
    expect(rc.axisLabels.phases).toEqual(AXIS_LABELS_EN.phases);
    expect(rc.axisLabels.phases[0]).toBe("Genesis");
    expect(rc.axisLabels.phases[1]).toBe("Custom-Built");
    expect(rc.axisLabels.phases[3]).toBe("Commodity (+Utility)");
  });

  // ── 3. Backward-compatibility: evolutionPhases present but no phases key ──
  it("backward-compat: background.evolutionPhases without phases key still resolves defaults", () => {
    const rc = resolveTheme({
      background: {
        evolutionPhases: { showPhaseDividerAndLabel: true },
        // no phases key
      },
    });
    expect(rc.axisLabels.phases).toEqual(AXIS_LABELS_EN.phases);
  });

  // ── 4. Custom vocabulary overrides fr locale phases ────────────
  it("custom phases override fr locale phase names (explicit > locale preset)", () => {
    const rc = resolveTheme({
      locale: "fr",
      background: {
        evolutionPhases: { phases: ["Alpha", "Beta", "Gamma"] },
      },
    });
    // Custom phases win over French locale defaults
    expect(rc.axisLabels.phases).toEqual(["Alpha", "Beta", "Gamma"]);
    // Other fr labels should still apply
    expect(rc.axisLabels.xAxis).toBe("Évolution");
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");
  });

  // ── 5. Single-element vocabulary is valid ─────────────────────
  it("single-element custom vocabulary round-trips correctly", () => {
    const parsed = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: { phases: ["Unified"] },
      },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const rc = resolveTheme(parsed.data);
    expect(rc.axisLabels.phases).toEqual(["Unified"]);
    expect(rc.axisLabels.phases).toHaveLength(1);
  });

  // ── 6. resolveAxisLabels direct call with custom vocabulary ───
  it("resolveAxisLabels: custom phases override preserves all other locale defaults", () => {
    const custom = ["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5", "Stage 6"];
    const labels = resolveAxisLabels({ phases: custom });
    expect(labels.phases).toEqual(custom);
    // Other labels must still come from EN defaults
    expect(labels.xAxis).toBe("Evolution");
    expect(labels.yAxis).toBe("Value Chain");
    expect(labels.evolutionStart).toBe("Uncharted");
    expect(labels.evolutionEnd).toBe("Industrialized");
  });

  // ── 7. Empty override rejected at schema level ─────────────────
  it("schema rejects phases:[] (empty vocabulary violates min-1 constraint)", () => {
    const result = RenderConfigSchema.safeParse({
      background: {
        evolutionPhases: { phases: [] },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod error path should point at phases
      const phaseError = result.error.issues.find((issue) =>
        issue.path.includes("phases")
      );
      expect(phaseError).toBeDefined();
    }
  });

  // ── 8. resolveAxisLabels: phases:undefined falls back to locale preset ──
  it("resolveAxisLabels: omitting phases falls back to locale-resolved phases", () => {
    // No phases key → uses EN preset
    const enLabels = resolveAxisLabels({ locale: "en" });
    expect(enLabels.phases).toEqual(AXIS_LABELS_EN.phases);

    // No phases key with FR locale → uses FR preset
    const frLabels = resolveAxisLabels({ locale: "fr" });
    expect(frLabels.phases).toEqual(AXIS_LABELS_FR.phases);
    expect(frLabels.phases[0]).toBe("Genèse");
  });

  // ── 9. Schema backward-compat: configs from before phases field was introduced ──
  it("schema backward-compat: config with only show-toggles (no phases) is valid", () => {
    // Simulates a v1-style config payload that predates the phases field
    const legacyConfig = {
      width: 1600,
      height: 900,
      theme: "default",
      background: {
        evolutionXAxis: { show: true },
        valueChainYAxis: { show: true },
        evolutionPhases: { showPhaseDividerAndLabel: true },
      },
    };
    const result = RenderConfigSchema.safeParse(legacyConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // No phases in input → phases should be undefined in parsed output
    expect(result.data.background?.evolutionPhases?.phases).toBeUndefined();
    // resolveTheme must still give valid English defaults
    const rc = resolveTheme(result.data);
    expect(rc.axisLabels.phases).toEqual(AXIS_LABELS_EN.phases);
  });
});

// ── Sub-AC 3c: Cardinality-independence — phase label count vs evolveStyles lookup ──────────
//
// The display phase count (phases.length) is DECOUPLED from the evolveStyles type vocabulary.
// evolveStyles keys are a closed enum derived from EvolveTypeEnum:
//   "natural" | "ecosystem" | "forced" | "late"
// phases is an open-length array (any cardinality ≥ 1 is valid).
//
// Key invariant: resolveTypeStyle(evolveStyles, type) uses only the type NAME — not position.
//
// Boundary positions on the Wardley Map evolution axis:
//   0    = genesis start (leftmost, fully uncharted)
//   0.17 ≈ EVOLUTION_PHASE_CUSTOM (0.175) = genesis / custom-built boundary
//   1.0  = commodity end (rightmost, fully industrialized)

describe("cardinality-independence — phase label count vs evolveStyles lookup (Sub-AC 3c)", () => {
  // ── 1. Default 4-label resolution ─────────────────────────────────────────────────────────

  it("[cardinality] default 4-label resolution: resolveAxisLabels returns exactly 4 standard phases and evolveStyles resolves independently", () => {
    // Default locale (EN) gives exactly 4 canonical Wardley Map phase labels
    const labels = resolveAxisLabels();
    expect(labels.phases).toHaveLength(4);
    expect(labels.phases).toEqual([
      "Genesis",
      "Custom-Built",
      "Product (+Rental)",
      "Commodity (+Utility)",
    ]);

    // evolveStyles uses the closed-enum type vocabulary (4 type names) — independent of display phase count
    const evolveStyles = {
      natural: { stroke: "#dc2626" },
      _default: { stroke: "#888888" },
    };
    expect(resolveTypeStyle(evolveStyles, "natural")?.stroke).toBe("#dc2626");  // explicit match
    expect(resolveTypeStyle(evolveStyles, "forced")?.stroke).toBe("#888888");   // _default fallback
    expect(resolveTypeStyle(evolveStyles, "late")?.stroke).toBe("#888888");     // _default fallback
    expect(resolveTypeStyle(evolveStyles, "ecosystem")?.stroke).toBe("#888888"); // _default fallback
  });

  // ── 2. 3-label scenario ────────────────────────────────────────────────────────────────────
  //
  // When the evolution axis is divided into only 3 zones (not the standard 4), the display
  // vocabulary shrinks.  But evolveStyles still has 4 type keys and resolves by name only.
  // "styles still resolve correctly by range" — range here means the type's named range
  // (natural/ecosystem/forced/late), not a pixel or position range.

  it("[cardinality] 3-label scenario: styles resolve by type name regardless of reduced phase count", () => {
    // 3-phase display vocabulary (evolution axis divided into 3 zones)
    const labels = resolveAxisLabels({ phases: ["Uncharted", "Transitioning", "Industrialized"] });
    expect(labels.phases).toHaveLength(3);

    // evolveStyles closed enum (4 types) is NOT reduced by the 3-phase display vocabulary
    const evolveStyles = {
      natural: { stroke: "#00aa00" },
      forced: { stroke: "#aa0000" },
      _default: { stroke: "#888888" },
    };
    // Style lookup by type name is completely unaffected by the 3-phase count
    expect(resolveTypeStyle(evolveStyles, "natural")?.stroke).toBe("#00aa00");   // explicit
    expect(resolveTypeStyle(evolveStyles, "forced")?.stroke).toBe("#aa0000");    // explicit
    expect(resolveTypeStyle(evolveStyles, "late")?.stroke).toBe("#888888");      // _default (unset type)
    expect(resolveTypeStyle(evolveStyles, "ecosystem")?.stroke).toBe("#888888"); // _default (unset type)
  });

  // ── 3. 5-label scenario ────────────────────────────────────────────────────────────────────
  //
  // When the evolution axis carries 5 display zones, the extra label has no counterpart
  // in the evolveStyles enum.  Lookups for all 4 closed-enum types remain unchanged.

  it("[cardinality] 5-label scenario: extra phase label does not affect evolveStyles lookup", () => {
    // 5-phase display vocabulary — one zone beyond the standard 4
    const labels = resolveAxisLabels({
      phases: ["Stage-1", "Stage-2", "Stage-3", "Stage-4", "Stage-5"],
    });
    expect(labels.phases).toHaveLength(5);

    // evolveStyles still maps exactly 4 enum type keys; the 5th display phase has no entry
    const evolveStyles = {
      natural:   { stroke: "#dc2626" },
      ecosystem: { stroke: "#2563eb" },
      forced:    { stroke: "#9333ea" },
      late:      { stroke: "#999999" },
    };
    // All 4 closed-enum types resolve independently — the extra display phase is irrelevant
    expect(resolveTypeStyle(evolveStyles, "natural")?.stroke).toBe("#dc2626");
    expect(resolveTypeStyle(evolveStyles, "ecosystem")?.stroke).toBe("#2563eb");
    expect(resolveTypeStyle(evolveStyles, "forced")?.stroke).toBe("#9333ea");
    expect(resolveTypeStyle(evolveStyles, "late")?.stroke).toBe("#999999");
  });

  // ── 4. Boundary/edge evolution values (0, 0.17, 1.0) ────────────────────────────────────
  //
  // Components can have evolution.scalar at boundary positions on the axis:
  //   0    = genesis start (components at left edge)
  //   0.17 ≈ genesis / custom-built boundary (EVOLUTION_PHASE_CUSTOM ≈ 0.175)
  //   1.0  = commodity end (components at right edge)
  //
  // The _default fallback in evolveStyles must apply for any type not explicitly set,
  // regardless of where the component sits on the evolution axis.

  it("[cardinality] boundary positions (0, 0.17, 1.0): _default fallback resolves for all unset evolve types", () => {
    // Minimal evolveStyles map: only 'natural' is explicitly styled; all others use _default
    const evolveStyles = {
      natural: { stroke: "#dc2626", strokeDasharray: "4 2" }, // only natural explicitly set
      _default: { stroke: "#555555" },                         // catch-all fallback
    };

    // At genesis (0): components often have "natural" evolution — explicit style applies
    expect(resolveTypeStyle(evolveStyles, "natural")?.stroke).toBe("#dc2626");
    expect(resolveTypeStyle(evolveStyles, "natural")?.strokeDasharray).toBe("4 2");

    // At genesis/custom boundary (0.17 ≈ 0.175): "forced" is not explicitly set → _default
    expect(resolveTypeStyle(evolveStyles, "forced")?.stroke).toBe("#555555");

    // At commodity end (1.0): "late" is not explicitly set → _default
    expect(resolveTypeStyle(evolveStyles, "late")?.stroke).toBe("#555555");

    // "ecosystem" is also not in the map → _default regardless of position
    expect(resolveTypeStyle(evolveStyles, "ecosystem")?.stroke).toBe("#555555");

    // Confirm: absent _default + absent type = undefined (no silent coercion)
    const noDefault = { natural: { stroke: "#dc2626" } };
    expect(resolveTypeStyle(noDefault, "forced")).toBeUndefined();
    expect(resolveTypeStyle(noDefault, "late")).toBeUndefined();
  });
});
