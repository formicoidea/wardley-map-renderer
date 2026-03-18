/**
 * @file resolve-config.test.ts
 *
 * Tests for the 4-tier data-driven resolveConfig() function and the
 * TIERED_RENDER_CONFIG_TAXONOMY that drives it.
 *
 * ## 4-Tier Precedence (highest → lowest)
 *
 * ```
 * Tier 1 (highest): platform-constraint — width, height, coordinateSpace, _scope, configIntent
 * Tier 2:           layout-structural   — background, legend, filters
 * Tier 3:           author-intent       — fontFamily, nodeRadii, avoidCollisions, typeColors, evolveStyles, strokeWidth
 * Tier 4 (lowest):  viewer-preference  — theme, locale, labelScale
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
  RENDER_SCOPE,
  type RenderConfig,
} from "./schema.js";

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
  const expected = ["width", "height", "coordinateSpace", "_scope", "configIntent"] as const;
  for (const field of expected) {
    it(`${field} is platform-constraint`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("platform-constraint");
    });
  }
});

describe("TIERED_RENDER_CONFIG_TAXONOMY — layout-structural fields", () => {
  const expected = ["background", "legend", "filters"] as const;
  for (const field of expected) {
    it(`${field} is layout-structural`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("layout-structural");
    });
  }
});

describe("TIERED_RENDER_CONFIG_TAXONOMY — author-intent fields", () => {
  const expected = [
    "fontFamily",
    "nodeRadii",
    "avoidCollisions",
    "typeColors",
    "evolveStyles",
    "strokeWidth",
  ] as const;
  for (const field of expected) {
    it(`${field} is author-intent`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("author-intent");
    });
  }
});

describe("TIERED_RENDER_CONFIG_TAXONOMY — viewer-preference fields", () => {
  const expected = ["theme", "locale", "labelScale"] as const;
  for (const field of expected) {
    it(`${field} is viewer-preference`, () => {
      expect(TIERED_RENDER_CONFIG_TAXONOMY[field].category).toBe("viewer-preference");
    });
  }
});

// ── getFieldTierCategory ─────────────────────────────────────────────────────

describe("getFieldTierCategory", () => {
  it("returns platform-constraint for width", () => {
    expect(getFieldTierCategory("width")).toBe("platform-constraint");
  });

  it("returns platform-constraint for coordinateSpace", () => {
    expect(getFieldTierCategory("coordinateSpace")).toBe("platform-constraint");
  });

  it("returns platform-constraint for _scope", () => {
    expect(getFieldTierCategory("_scope")).toBe("platform-constraint");
  });

  it("returns layout-structural for background", () => {
    expect(getFieldTierCategory("background")).toBe("layout-structural");
  });

  it("returns layout-structural for legend", () => {
    expect(getFieldTierCategory("legend")).toBe("layout-structural");
  });

  it("returns author-intent for typeColors", () => {
    expect(getFieldTierCategory("typeColors")).toBe("author-intent");
  });

  it("returns author-intent for strokeWidth", () => {
    expect(getFieldTierCategory("strokeWidth")).toBe("author-intent");
  });

  it("returns viewer-preference for theme", () => {
    expect(getFieldTierCategory("theme")).toBe("viewer-preference");
  });

  it("returns viewer-preference for locale", () => {
    expect(getFieldTierCategory("locale")).toBe("viewer-preference");
  });
});

// ── PLATFORM_CONSTRAINT_FIELDS ───────────────────────────────────────────────

describe("PLATFORM_CONSTRAINT_FIELDS", () => {
  it("contains all expected platform-constraint fields", () => {
    expect(PLATFORM_CONSTRAINT_FIELDS).toContain("width");
    expect(PLATFORM_CONSTRAINT_FIELDS).toContain("height");
    expect(PLATFORM_CONSTRAINT_FIELDS).toContain("coordinateSpace");
    expect(PLATFORM_CONSTRAINT_FIELDS).toContain("_scope");
    expect(PLATFORM_CONSTRAINT_FIELDS).toContain("configIntent");
  });

  it("does not contain viewer-preference or author-intent fields", () => {
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("theme");
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("locale");
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("fontFamily");
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("strokeWidth");
    expect(PLATFORM_CONSTRAINT_FIELDS).not.toContain("background");
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
    expect(LAYOUT_STRUCTURAL_FIELDS).toContain("background");
    expect(LAYOUT_STRUCTURAL_FIELDS).toContain("legend");
    expect(LAYOUT_STRUCTURAL_FIELDS).toContain("filters");
  });

  it("does not contain platform-constraint or viewer-preference fields", () => {
    expect(LAYOUT_STRUCTURAL_FIELDS).not.toContain("width");
    expect(LAYOUT_STRUCTURAL_FIELDS).not.toContain("theme");
    expect(LAYOUT_STRUCTURAL_FIELDS).not.toContain("strokeWidth");
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
    const pcSet = new Set(PLATFORM_CONSTRAINT_FIELDS);
    for (const field of LAYOUT_STRUCTURAL_FIELDS) {
      expect(pcSet.has(field as string), `${field} should not be in both tiers`).toBe(false);
    }
  });
});

// ── resolveConfig — empty inputs ─────────────────────────────────────────────

describe("resolveConfig — empty inputs", () => {
  it("accepts two empty objects and returns a valid RenderConfig", () => {
    const { config: result } = resolveConfig({}, {});
    expect(result.strokeWidth).toBe(1); // Zod default
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("always injects RENDER_SCOPE into _scope", () => {
    const { config: result } = resolveConfig({}, {});
    expect(result._scope).toEqual(RENDER_SCOPE);
    expect(result._scope!.mode).toBe("static-export");
    expect(result._scope!.temporal).toBe(false);
    expect(result._scope!.interactive).toBe(false);
  });
});

// ── resolveConfig — tier 1 (platform-constraint) ─────────────────────────────

describe("resolveConfig — tier 1 (platform-constraint): authorConfig wins", () => {
  it("width from authorConfig wins over viewer attempt", () => {
    const { config: result } = resolveConfig(
      { width: 800 } as Partial<RenderConfig>,  // platform-constraint → ignored from viewer
      { width: 1920 },
    );
    expect(result.width).toBe(1920);
  });

  it("height from authorConfig wins over viewer attempt", () => {
    const { config: result } = resolveConfig(
      { height: 400 } as Partial<RenderConfig>,
      { height: 1080 },
    );
    expect(result.height).toBe(1080);
  });

  it("coordinateSpace from authorConfig is applied", () => {
    const { config: result } = resolveConfig({}, {
      coordinateSpace: { width: 2400, height: 1200 } as RenderConfig["coordinateSpace"],
    });
    expect(result.coordinateSpace?.width).toBe(2400);
    expect(result.coordinateSpace?.height).toBe(1200);
  });
});

// ── resolveConfig — tier 2 (layout-structural) ───────────────────────────────

describe("resolveConfig — tier 2 (layout-structural): authorConfig wins", () => {
  it("background from authorConfig wins", () => {
    const { config: result } = resolveConfig(
      { background: { color: "#000000" } } as Partial<RenderConfig>,
      { background: { color: "#ffffff" } },
    );
    expect(result.background?.color).toBe("#ffffff");
  });

  it("legend from authorConfig wins", () => {
    const { config: result } = resolveConfig(
      { legend: { show: false, position: "top-left", legendOverflow: "clip" } },
      { legend: { show: true, position: "bottom-right", legendOverflow: "allow" } },
    );
    expect(result.legend?.show).toBe(true);
    expect(result.legend?.position).toBe("bottom-right");
  });

  it("filters from authorConfig wins", () => {
    const { config: result } = resolveConfig(
      { filters: { excludeComponentTypes: ["anchor" as const] } } as Partial<RenderConfig>,
      { filters: { excludeComponentTypes: ["note" as const] } },
    );
    expect(result.filters?.excludeComponentTypes).toEqual(["note"]);
  });
});

// ── resolveConfig — tier 3 (author-intent) ───────────────────────────────────

describe("resolveConfig — tier 3 (author-intent): authorConfig wins", () => {
  it("fontFamily from authorConfig wins", () => {
    const { config: result } = resolveConfig(
      { fontFamily: "Arial" } as Partial<RenderConfig>,
      { fontFamily: "Roboto, sans-serif" },
    );
    expect(result.fontFamily).toBe("Roboto, sans-serif");
  });

  it("strokeWidth from authorConfig wins", () => {
    const { config: result } = resolveConfig(
      { strokeWidth: 0.5 } as Partial<RenderConfig>,
      { strokeWidth: 2 },
    );
    expect(result.strokeWidth).toBe(2);
  });

  it("typeColors from authorConfig wins", () => {
    const { config: result } = resolveConfig(
      { typeColors: { _default: "#ff0000" } } as Partial<RenderConfig>,
      { typeColors: { _default: "#334155", "user-need": "#0ea5e9" } },
    );
    expect(result.typeColors?._default).toBe("#334155");
  });

  it("evolveStyles from authorConfig wins", () => {
    const { config: result } = resolveConfig(
      { evolveStyles: { natural: { stroke: "#ff0000" } } } as Partial<RenderConfig>,
      { evolveStyles: { natural: { stroke: "#00ff00" } } },
    );
    expect(result.evolveStyles?.natural?.stroke).toBe("#00ff00");
  });
});

// ── resolveConfig — tier 4 (viewer-preference) ───────────────────────────────

describe("resolveConfig — tier 4 (viewer-preference): viewerConfig wins", () => {
  it("theme from viewerConfig wins over author value", () => {
    const { config: result } = resolveConfig(
      { theme: "dark" },
      { theme: "default" } as Partial<RenderConfig>,
    );
    expect(result.theme).toBe("dark");
  });

  it("locale from viewerConfig wins over author value", () => {
    const { config: result } = resolveConfig(
      { locale: "fr" },
      { locale: "en" } as Partial<RenderConfig>,
    );
    expect(result.locale).toBe("fr");
  });

  it("labelScale from viewerConfig wins over author value", () => {
    const { config: result } = resolveConfig(
      { labelScale: 1.5 },
      { labelScale: 0.8 } as Partial<RenderConfig>,
    );
    expect(result.labelScale).toBe(1.5);
  });
});

// ── resolveConfig — system metadata ──────────────────────────────────────────

describe("resolveConfig — _scope always RENDER_SCOPE", () => {
  it("_scope is always RENDER_SCOPE for empty inputs", () => {
    const { config: result } = resolveConfig({}, {});
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("_scope is always RENDER_SCOPE regardless of what configs supply", () => {
    const { config: result } = resolveConfig({ theme: "dark" }, { width: 1920, strokeWidth: 2 });
    expect(result._scope).toEqual(RENDER_SCOPE);
  });
});

// ── resolveConfig — realistic scenario ───────────────────────────────────────

describe("resolveConfig — realistic scenario", () => {
  it("author brand config + viewer dark mode + French locale", () => {
    const authorConfig: Partial<RenderConfig> = {
      width: 1920,
      height: 1080,
      background: { color: "#f8fafc" },
      typeColors: { _default: "#334155", "user-need": "#0ea5e9" },
      strokeWidth: 1.5,
      fontFamily: "Inter, sans-serif",
      legend: { show: true, position: "bottom-right", legendOverflow: "allow" },
      theme: "default",  // author sets — but viewer wins for this field
      locale: "en",      // author sets — but viewer wins for this field
    };

    const viewerConfig: Partial<RenderConfig> = {
      theme: "dark",
      locale: "fr",
      labelScale: 1.2,
      width: 800 as unknown as number, // viewer attempts platform-constraint — ignored
    };

    const { config: result } = resolveConfig(viewerConfig, authorConfig);

    // Tier 1 (platform-constraint): authorConfig wins
    expect(result.width).toBe(1920);   // author wins over viewer's 800
    expect(result.height).toBe(1080);

    // Tier 2 (layout-structural): authorConfig wins
    expect(result.background?.color).toBe("#f8fafc");
    expect(result.legend?.show).toBe(true);
    expect(result.legend?.position).toBe("bottom-right");

    // Tier 3 (author-intent): authorConfig wins
    expect(result.typeColors?._default).toBe("#334155");
    expect(result.strokeWidth).toBe(1.5);
    expect(result.fontFamily).toBe("Inter, sans-serif");

    // Tier 4 (viewer-preference): viewerConfig wins
    expect(result.theme).toBe("dark");   // viewer wins over author's "default"
    expect(result.locale).toBe("fr");    // viewer wins over author's "en"
    expect(result.labelScale).toBe(1.2);

    // System metadata always RENDER_SCOPE
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("viewer-only (no author) returns viewer preferences + defaults", () => {
    const { config: result } = resolveConfig({ theme: "highContrast", locale: "fr" }, {});
    expect(result.theme).toBe("highContrast");
    expect(result.locale).toBe("fr");
    expect(result.strokeWidth).toBe(1); // Zod default
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("author-only (no viewer) returns author fields + defaults", () => {
    const { config: result } = resolveConfig({}, { width: 3200, height: 1800, strokeWidth: 2 });
    expect(result.width).toBe(3200);
    expect(result.height).toBe(1800);
    expect(result.strokeWidth).toBe(2);
    // Viewer-preference fields absent → undefined (no viewer supplied them)
    expect(result.theme).toBeUndefined();
    expect(result.locale).toBeUndefined();
  });
});
