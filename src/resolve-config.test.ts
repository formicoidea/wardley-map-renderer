/**
 * @file resolve-config.test.ts
 *
 * Tests for the 4-tier data-driven resolveConfig() function and the
 * TIERED_RENDER_CONFIG_TAXONOMY that drives it.
 *
 * ## 4-Tier Precedence (highest → lowest)
 *
 * ```
 * Tier 1 (highest): platform-constraint — spatial, configIntent
 * Tier 2:           layout-structural   — legend, filters
 * Tier 3:           author-intent       — styling, typography, avoidCollisions, methods
 * Tier 4 (lowest):  viewer-preference  — axes
 * ```
 *
 * @see resolve-conflict.ts — resolveConfig() + field arrays
 * @see schema.ts — TIER_PRECEDENCE, TIERED_RENDER_CONFIG_TAXONOMY, getFieldTierCategory
 */

import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  PLATFORM_CONSTRAINT_FIELDS,
  LAYOUT_STRUCTURAL_FIELDS,
} from "./resolve-conflict.js";
import {
  TIER_PRECEDENCE,
  TIERED_RENDER_CONFIG_TAXONOMY,
  getFieldTierCategory,
  type RenderConfig,
} from "./schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cfg = (viewer: any, author: any, opts?: any) => resolveConfig(viewer, author, opts);

// ── TIER_PRECEDENCE ──────────────────────────────────────────────────────────

describe("TIER_PRECEDENCE", () => {
  it("has exactly 4 entries", () => {
    expect(TIER_PRECEDENCE.length).toBe(4);
  });

  it("starts with platform-constraint (highest authority)", () => {
    expect(TIER_PRECEDENCE[0]).toBe("platform-constraint");
  });

  it("ends with viewer-preference (lowest authority)", () => {
    expect(TIER_PRECEDENCE[3]).toBe("viewer-preference");
  });

  it("contains all four expected tier names", () => {
    expect(TIER_PRECEDENCE).toContain("platform-constraint");
    expect(TIER_PRECEDENCE).toContain("layout-structural");
    expect(TIER_PRECEDENCE).toContain("author-intent");
    expect(TIER_PRECEDENCE).toContain("viewer-preference");
  });

  it("is ordered: platform-constraint > layout-structural > author-intent > viewer-preference", () => {
    const idx = (t: string) => (TIER_PRECEDENCE as ReadonlyArray<string>).indexOf(t);
    expect(idx("platform-constraint")).toBeLessThan(idx("layout-structural"));
    expect(idx("layout-structural")).toBeLessThan(idx("author-intent"));
    expect(idx("author-intent")).toBeLessThan(idx("viewer-preference"));
  });
});

// ── TIERED_RENDER_CONFIG_TAXONOMY shape ──────────────────────────────────────

describe("TIERED_RENDER_CONFIG_TAXONOMY — shape contract", () => {
  it("every entry has category, description, and overridable", () => {
    for (const [key, meta] of Object.entries(TIERED_RENDER_CONFIG_TAXONOMY)) {
      const validCategories = [
        "platform-constraint",
        "layout-structural",
        "author-intent",
        "viewer-preference",
      ];
      expect(
        validCategories.includes(meta.category),
        `${key}.category should be a valid 4-tier FieldCategory`,
      ).toBe(true);
      expect(
        meta.description.length > 0,
        `${key}.description should be non-empty`,
      ).toBe(true);
      expect(
        typeof meta.overridable === "boolean",
        `${key}.overridable should be boolean`,
      ).toBe(true);
    }
  });

  it("overridable is true only for viewer-preference fields", () => {
    for (const [key, meta] of Object.entries(TIERED_RENDER_CONFIG_TAXONOMY)) {
      if (meta.category === "viewer-preference") {
        expect(meta.overridable, `${key} viewer-preference → overridable:true`).toBe(true);
      } else {
        expect(meta.overridable, `${key} ${meta.category} → overridable:false`).toBe(false);
      }
    }
  });
});

// ── TIERED_RENDER_CONFIG_TAXONOMY tier classifications ───────────────────────

describe("TIERED_RENDER_CONFIG_TAXONOMY — platform-constraint fields", () => {
  const expected = ["spatial", "configIntent"] as const;
  for (const field of expected) {
    it(`${field} is platform-constraint`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("platform-constraint");
    });
  }
});

describe("TIERED_RENDER_CONFIG_TAXONOMY — layout-structural fields", () => {
  const expected = ["legend", "filters"] as const;
  for (const field of expected) {
    it(`${field} is layout-structural`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("layout-structural");
    });
  }
});

describe("TIERED_RENDER_CONFIG_TAXONOMY — author-intent fields", () => {
  const expected = [
    "typography",
    "styling",
    "avoidCollisions",
    "methods",
  ] as const;
  for (const field of expected) {
    it(`${field} is author-intent`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("author-intent");
    });
  }
});

describe("TIERED_RENDER_CONFIG_TAXONOMY — viewer-preference fields", () => {
  const expected = ["axes"] as const;
  for (const field of expected) {
    it(`${field} is viewer-preference`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("viewer-preference");
    });
  }
});

// ── getFieldTierCategory ─────────────────────────────────────────────────────

describe("getFieldTierCategory", () => {
  it("returns platform-constraint for spatial", () => {
    expect(getFieldTierCategory("spatial")).toBe("platform-constraint");
  });

  it("returns platform-constraint for configIntent", () => {
    expect(getFieldTierCategory("configIntent")).toBe("platform-constraint");
  });

  it("returns layout-structural for legend", () => {
    expect(getFieldTierCategory("legend")).toBe("layout-structural");
  });

  it("returns layout-structural for filters", () => {
    expect(getFieldTierCategory("filters")).toBe("layout-structural");
  });

  it("returns author-intent for styling", () => {
    expect(getFieldTierCategory("styling")).toBe("author-intent");
  });

  it("returns author-intent for typography", () => {
    expect(getFieldTierCategory("typography")).toBe("author-intent");
  });

  it("returns viewer-preference for axes", () => {
    expect(getFieldTierCategory("axes")).toBe("viewer-preference");
  });
});

// ── PLATFORM_CONSTRAINT_FIELDS ───────────────────────────────────────────────

describe("PLATFORM_CONSTRAINT_FIELDS", () => {
  it("contains all expected platform-constraint fields", () => {
    expect(PLATFORM_CONSTRAINT_FIELDS).toContain("spatial");
    expect(PLATFORM_CONSTRAINT_FIELDS).toContain("configIntent");
  });

  it("does not contain viewer-preference or author-intent fields", () => {
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("axes");
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("typography");
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("styling");
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("legend");
  });

  it("every entry in the array has category platform-constraint in the taxonomy", () => {
    for (const field of PLATFORM_CONSTRAINT_FIELDS) {
      expect(
        TIERED_RENDER_CONFIG_TAXONOMY[field].category,
        `${field} should be platform-constraint`,
      ).toBe("platform-constraint");
    }
  });
});

// ── LAYOUT_STRUCTURAL_FIELDS ─────────────────────────────────────────────────

describe("LAYOUT_STRUCTURAL_FIELDS", () => {
  it("contains all expected layout-structural fields", () => {
    expect(LAYOUT_STRUCTURAL_FIELDS).toContain("legend");
    expect(LAYOUT_STRUCTURAL_FIELDS).toContain("filters");
  });

  it("does not contain platform-constraint or viewer-preference fields", () => {
    expect(LAYOUT_STRUCTURAL_FIELDS).not.toContain("spatial");
    expect(LAYOUT_STRUCTURAL_FIELDS).not.toContain("axes");
    expect(LAYOUT_STRUCTURAL_FIELDS).not.toContain("styling");
  });

  it("every entry in the array has category layout-structural in the taxonomy", () => {
    for (const field of LAYOUT_STRUCTURAL_FIELDS) {
      expect(
        TIERED_RENDER_CONFIG_TAXONOMY[field].category,
        `${field} should be layout-structural`,
      ).toBe("layout-structural");
    }
  });

  it("platform-constraint and layout-structural fields are disjoint", () => {
    const pcSet = new Set<string>(PLATFORM_CONSTRAINT_FIELDS);
    for (const field of LAYOUT_STRUCTURAL_FIELDS) {
      expect(pcSet.has(field), `${field} should not be in both tiers`).toBe(false);
    }
  });
});

// ── resolveConfig — empty inputs ─────────────────────────────────────────────

describe("resolveConfig — empty inputs", () => {
  it("accepts two empty objects and returns a valid RenderConfig", () => {
    const { config: result } = cfg({}, {});
    // spatial is not set when both configs are empty — optional at top level
    expect(result.spatial).toBeUndefined();
  });
});

// ── resolveConfig — tier 1 (platform-constraint) ─────────────────────────────

describe("resolveConfig — tier 1 (platform-constraint): authorConfig wins", () => {
  it("spatial.width from authorConfig wins over viewer attempt", () => {
    const { config: result } = cfg(
      { spatial: { width: 800 } },  // platform-constraint → ignored from viewer
      { spatial: { width: 1920 } },
    );
    expect(result.spatial?.width).toBe(1920);
  });

  it("spatial.height from authorConfig wins over viewer attempt", () => {
    const { config: result } = cfg(
      { spatial: { height: 400 } },
      { spatial: { height: 1080 } },
    );
    expect(result.spatial?.height).toBe(1080);
  });

  it("spatial.coordinateSpace from authorConfig is applied", () => {
    const { config: result } = cfg({}, {
      spatial: { coordinateSpace: { width: 2400, height: 1200 } as any },
    });
    expect(result.spatial?.coordinateSpace?.width).toBe(2400);
    expect(result.spatial?.coordinateSpace?.height).toBe(1200);
  });
});

// ── resolveConfig — tier 2 (layout-structural) ───────────────────────────────

describe("resolveConfig — tier 2 (layout-structural): authorConfig wins", () => {
  it("styling.background from authorConfig wins", () => {
    const { config: result } = cfg(
      { styling: { background: { color: "#000000" } } },
      { styling: { background: { color: "#ffffff" } } },
    );
    expect(result.styling?.background?.color).toBe("#ffffff");
  });

  it("legend from authorConfig wins", () => {
    const { config: result } = cfg(
      { legend: { show: false, position: "top-left", legendOverflow: "clip" } },
      { legend: { show: true, position: "bottom-right", legendOverflow: "allow" } },
    );
    expect(result.legend?.show).toBe(true);
    expect(result.legend?.position).toBe("bottom-right");
  });

  it("filters from authorConfig wins", () => {
    const { config: result } = cfg(
      { filters: { excludeComponentTypes: ["anchor" as const] } },
      { filters: { excludeComponentTypes: ["pipeline" as const] } },
    );
    expect(result.filters?.excludeComponentTypes).toEqual(["pipeline"]);
  });
});

// ── resolveConfig — tier 3 (author-intent) ───────────────────────────────────

describe("resolveConfig — tier 3 (author-intent): authorConfig wins", () => {
  it("typography.fontFamily from authorConfig wins", () => {
    const { config: result } = cfg(
      { typography: { fontFamily: "Arial", labelScale: 1.0 } },
      { typography: { fontFamily: "Roboto, sans-serif", labelScale: 1.0 } },
    );
    expect(result.typography?.fontFamily).toBe("Roboto, sans-serif");
  });

  it("spatial.strokeWidth from authorConfig wins", () => {
    const { config: result } = cfg(
      { spatial: { strokeWidth: 0.5 } },
      { spatial: { strokeWidth: 2 } },
    );
    expect(result.spatial?.strokeWidth).toBe(2);
  });

  it("styling.palette from authorConfig wins", () => {
    const { config: result } = cfg(
      { styling: { palette: { _default: "#ff0000" } } },
      { styling: { palette: { _default: "#334155", "user-need": "#0ea5e9" } } },
    );
    expect(result.styling?.palette?._default).toBe("#334155");
  });

  it("styling.evolveStyles from authorConfig wins", () => {
    const { config: result } = cfg(
      { styling: { evolveStyles: { natural: { stroke: "#ff0000" } } } },
      { styling: { evolveStyles: { natural: { stroke: "#00ff00" } } } },
    );
    expect(result.styling?.evolveStyles?.natural?.stroke).toBe("#00ff00");
  });
});

// ── resolveConfig — tier 4 (viewer-preference) ───────────────────────────────

describe("resolveConfig — tier 4 (viewer-preference): viewerConfig wins", () => {
  it("axes.locale from viewerConfig wins over author value", () => {
    const { config: result } = cfg(
      { axes: { locale: "fr" } },
      { axes: { locale: "en" } },
    );
    expect(result.axes?.locale).toBe("fr");
  });

  it("typography.labelScale from authorConfig wins (typography is author-intent)", () => {
    const { config: result } = cfg(
      { typography: { fontFamily: "Inter, sans-serif", labelScale: 1.5 } },
      { typography: { fontFamily: "Inter, sans-serif", labelScale: 0.8 } },
    );
    expect(result.typography?.labelScale).toBe(0.8);
  });
});

// ── resolveConfig — realistic scenario ───────────────────────────────────────

describe("resolveConfig — realistic scenario", () => {
  it("author brand config + viewer dark mode + French locale", () => {
    const authorConfig = {
      spatial: { width: 1920, height: 1080, strokeWidth: 1.5 },
      styling: {
        background: { color: "#f8fafc" },
        palette: { _default: "#334155", "user-need": "#0ea5e9" },
      },
      typography: { fontFamily: "Inter, sans-serif", labelScale: 1.2 },
      legend: { show: true, position: "bottom-right", legendOverflow: "allow" },
      axes: { locale: "en" },      // author sets — but viewer wins for this field
    } as unknown as Partial<RenderConfig>;

    const viewerConfig: Partial<RenderConfig> = {
      axes: { locale: "fr" },
      spatial: { width: 800 },       // viewer attempts platform-constraint — ignored
    } as Partial<RenderConfig>;

    const { config: result } = cfg(viewerConfig, authorConfig);

    // Tier 1 (platform-constraint): authorConfig wins
    expect(result.spatial?.width).toBe(1920);   // author wins over viewer's 800
    expect(result.spatial?.height).toBe(1080);

    // Tier 2 (layout-structural): authorConfig wins
    expect(result.legend?.show).toBe(true);
    expect(result.legend?.position).toBe("bottom-right");

    // Tier 3 (author-intent): authorConfig wins
    expect(result.styling?.palette?._default).toBe("#334155");
    expect(result.spatial?.strokeWidth).toBe(1.5);
    expect(result.typography?.fontFamily).toBe("Inter, sans-serif");
    expect(result.typography?.labelScale).toBe(1.2);

    // Tier 4 (viewer-preference): viewerConfig wins
    expect(result.axes?.locale).toBe("fr");    // viewer wins over author's "en"
  });

  it("viewer-only (no author) returns viewer preferences + defaults", () => {
    const { config: result } = cfg({ axes: { locale: "fr" } }, {});
    expect(result.axes?.locale).toBe("fr");
    // spatial is not set — optional at top level
    expect(result.spatial).toBeUndefined();
  });

  it("author-only (no viewer) returns author fields + defaults", () => {
    const { config: result } = cfg({}, { spatial: { width: 3200, height: 1800, strokeWidth: 2 } });
    expect(result.spatial?.width).toBe(3200);
    expect(result.spatial?.height).toBe(1800);
    expect(result.spatial?.strokeWidth).toBe(2);
    // Viewer-preference fields absent → undefined (no viewer supplied them)
    expect(result.axes).toBeUndefined();
  });
});
