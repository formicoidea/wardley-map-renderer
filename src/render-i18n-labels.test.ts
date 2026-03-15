/**
 * Tests for i18n axis labels support.
 * Verifies locale-aware labels in the schema and rendering pipeline.
 *
 * @module render-i18n-labels.test
 */

import { describe, it, expect } from "vitest";
import { AxisLabelsSchema, AxesSchema, WardleyMapSchema } from "./schema.js";
import {
  resolveAxisLabels,
  AXIS_LABELS_EN,
  AXIS_LABELS_FR,
  AXIS_LABELS_BY_LOCALE,
} from "./blocks/wardley-map/wardley-map-consts.js";
import { renderMapToSVG } from "./render.js";

// ── Minimal map fixture ─────────────────────────────────────────
const minimalMap = {
  title: "Test Map",
  components: [
    { id: "u", label: "User", type: "anchor", evolution: 0.5, visibility: 0.9 },
    { id: "a", label: "Service", type: "component", evolution: 0.3, visibility: 0.5 },
  ],
  relations: [{ source: "u", target: "a" }],
};

// ── AxisLabelsSchema tests ──────────────────────────────────────

describe("AxisLabelsSchema", () => {
  it("accepts empty object (all fields optional except locale default)", () => {
    const result = AxisLabelsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("en");
    }
  });

  it("accepts locale 'fr'", () => {
    const result = AxisLabelsSchema.safeParse({ locale: "fr" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("fr");
    }
  });

  it("rejects unsupported locale", () => {
    const result = AxisLabelsSchema.safeParse({ locale: "de" });
    expect(result.success).toBe(false);
  });

  it("accepts custom x-axis label override", () => {
    const result = AxisLabelsSchema.safeParse({ xAxis: "Maturité" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.xAxis).toBe("Maturité");
    }
  });

  it("accepts custom y-axis label override", () => {
    const result = AxisLabelsSchema.safeParse({ yAxis: "Valeur" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.yAxis).toBe("Valeur");
    }
  });

  it("accepts custom phase labels (4-tuple)", () => {
    const phases: [string, string, string, string] = [
      "Genèse",
      "Sur mesure",
      "Produit",
      "Commodité",
    ];
    const result = AxisLabelsSchema.safeParse({ phases });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phases).toEqual(phases);
    }
  });

  it("rejects phase labels with wrong count (3 items)", () => {
    const result = AxisLabelsSchema.safeParse({
      phases: ["A", "B", "C"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects phase labels with wrong count (5 items)", () => {
    const result = AxisLabelsSchema.safeParse({
      phases: ["A", "B", "C", "D", "E"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts custom direction indicators", () => {
    const result = AxisLabelsSchema.safeParse({
      evolutionStart: "Inexploré",
      evolutionEnd: "Industrialisé",
      visibilityHigh: "Visible",
      visibilityLow: "Invisible",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evolutionStart).toBe("Inexploré");
      expect(result.data.evolutionEnd).toBe("Industrialisé");
    }
  });

  it("accepts a fully specified labels object", () => {
    const full = {
      locale: "fr" as const,
      xAxis: "Évolution",
      yAxis: "Chaîne de valeur",
      phases: ["Genèse", "Sur mesure", "Produit", "Commodité"] as [string, string, string, string],
      evolutionStart: "Inexploré",
      evolutionEnd: "Industrialisé",
      visibilityHigh: "Visible",
      visibilityLow: "Invisible",
    };
    const result = AxisLabelsSchema.safeParse(full);
    expect(result.success).toBe(true);
  });
});

// ── AxesSchema with labels ──────────────────────────────────────

describe("AxesSchema with labels", () => {
  it("accepts axes without labels (backward compatible)", () => {
    const result = AxesSchema.safeParse({ valueChain: true, evolution: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.labels).toBeUndefined();
    }
  });

  it("accepts axes with labels", () => {
    const result = AxesSchema.safeParse({
      valueChain: true,
      evolution: true,
      labels: { locale: "fr" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.labels?.locale).toBe("fr");
    }
  });
});

// ── resolveAxisLabels tests ─────────────────────────────────────

describe("resolveAxisLabels", () => {
  it("returns English defaults when no labels provided", () => {
    const resolved = resolveAxisLabels();
    expect(resolved).toEqual(AXIS_LABELS_EN);
  });

  it("returns English defaults for empty labels object", () => {
    const resolved = resolveAxisLabels({});
    expect(resolved).toEqual(AXIS_LABELS_EN);
  });

  it("returns French preset for locale 'fr'", () => {
    const resolved = resolveAxisLabels({ locale: "fr" });
    expect(resolved).toEqual(AXIS_LABELS_FR);
  });

  it("falls back to English for unknown locale", () => {
    const resolved = resolveAxisLabels({ locale: "de" });
    expect(resolved).toEqual(AXIS_LABELS_EN);
  });

  it("overrides individual fields on top of locale preset", () => {
    const resolved = resolveAxisLabels({
      locale: "fr",
      xAxis: "Mon axe X",
    });
    expect(resolved.xAxis).toBe("Mon axe X");
    // All other fields should be French
    expect(resolved.yAxis).toBe(AXIS_LABELS_FR.yAxis);
    expect(resolved.phases).toEqual(AXIS_LABELS_FR.phases);
    expect(resolved.evolutionStart).toBe(AXIS_LABELS_FR.evolutionStart);
  });

  it("overrides phases while keeping other French defaults", () => {
    const customPhases: [string, string, string, string] = [
      "Phase I",
      "Phase II",
      "Phase III",
      "Phase IV",
    ];
    const resolved = resolveAxisLabels({
      locale: "fr",
      phases: customPhases,
    });
    expect(resolved.phases).toEqual(customPhases);
    expect(resolved.xAxis).toBe(AXIS_LABELS_FR.xAxis);
  });
});

// ── Locale presets data integrity ───────────────────────────────

describe("Locale presets", () => {
  it("EN preset has 4 phase labels", () => {
    expect(AXIS_LABELS_EN.phases).toHaveLength(4);
  });

  it("FR preset has 4 phase labels", () => {
    expect(AXIS_LABELS_FR.phases).toHaveLength(4);
  });

  it("all locale presets have required fields", () => {
    for (const [locale, preset] of Object.entries(AXIS_LABELS_BY_LOCALE)) {
      expect(preset.xAxis, `${locale}.xAxis`).toBeTruthy();
      expect(preset.yAxis, `${locale}.yAxis`).toBeTruthy();
      expect(preset.phases, `${locale}.phases`).toHaveLength(4);
      expect(preset.evolutionStart, `${locale}.evolutionStart`).toBeTruthy();
      expect(preset.evolutionEnd, `${locale}.evolutionEnd`).toBeTruthy();
      expect(preset.visibilityHigh, `${locale}.visibilityHigh`).toBeTruthy();
      expect(preset.visibilityLow, `${locale}.visibilityLow`).toBeTruthy();
    }
  });
});

// ── WardleyMapSchema backward compatibility ─────────────────────

describe("WardleyMapSchema with i18n labels", () => {
  it("parses a map without labels (backward compatible)", () => {
    const result = WardleyMapSchema.safeParse(minimalMap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.axes.labels).toBeUndefined();
    }
  });

  it("parses a map with axes.labels set to French", () => {
    const mapWithFr = {
      ...minimalMap,
      axes: { valueChain: true, evolution: true, labels: { locale: "fr" } },
    };
    const result = WardleyMapSchema.safeParse(mapWithFr);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.axes.labels?.locale).toBe("fr");
    }
  });

  it("parses a map with custom phase label overrides", () => {
    const mapWithCustom = {
      ...minimalMap,
      axes: {
        valueChain: true,
        evolution: true,
        labels: {
          locale: "en",
          phases: ["I", "II", "III", "IV"],
        },
      },
    };
    const result = WardleyMapSchema.safeParse(mapWithCustom);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.axes.labels?.phases).toEqual(["I", "II", "III", "IV"]);
    }
  });
});

// ── SVG rendering with i18n labels ──────────────────────────────

describe("SVG rendering with i18n labels", () => {
  it("renders English labels by default", () => {
    const map = WardleyMapSchema.parse(minimalMap);
    const svg = renderMapToSVG(map);
    expect(svg).toContain("Evolution");
    expect(svg).toContain("Value Chain");
    expect(svg).toContain("Genesis");
    // Legacy renderer uses visibility direction labels (not evolution direction)
    expect(svg).toContain("Visible");
    expect(svg).toContain("Invisible");
  });

  it("renders French labels when locale is 'fr'", () => {
    const mapWithFr = {
      ...minimalMap,
      axes: { valueChain: true, evolution: true, labels: { locale: "fr" } },
    };
    const map = WardleyMapSchema.parse(mapWithFr);
    const svg = renderMapToSVG(map);
    expect(svg).toContain("Évolution");
    expect(svg).toContain("Chaîne de valeur");
    expect(svg).toContain("Genèse");
    expect(svg).toContain("Sur mesure");
    expect(svg).toContain("Produit (+location)");
    expect(svg).toContain("Commodité (+utilité)");
  });

  it("renders custom label overrides on top of locale", () => {
    const mapWithCustom = {
      ...minimalMap,
      axes: {
        valueChain: true,
        evolution: true,
        labels: {
          locale: "en",
          xAxis: "Maturity",
          phases: ["Phase I", "Phase II", "Phase III", "Phase IV"],
        },
      },
    };
    const map = WardleyMapSchema.parse(mapWithCustom);
    const svg = renderMapToSVG(map);
    expect(svg).toContain("Maturity");
    expect(svg).toContain("Phase I");
    expect(svg).toContain("Phase II");
    expect(svg).toContain("Phase III");
    expect(svg).toContain("Phase IV");
    // Should NOT contain default "Evolution" since it was overridden
    expect(svg).not.toContain(">Evolution<");
  });

  it("renders custom visibility labels", () => {
    const mapWithCustomVis = {
      ...minimalMap,
      axes: {
        valueChain: true,
        evolution: true,
        labels: {
          visibilityHigh: "Utilisateur",
          visibilityLow: "Infrastructure",
        },
      },
    };
    const map = WardleyMapSchema.parse(mapWithCustomVis);
    const svg = renderMapToSVG(map);
    expect(svg).toContain("Utilisateur");
    expect(svg).toContain("Infrastructure");
  });
});
