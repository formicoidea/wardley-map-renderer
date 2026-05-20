/**
 * i18n-explicit-empty-vs-absent.test.ts
 *
 * Verifies the explicit-empty vs. absent distinction for axisLabel and phaseLabels
 * entries in resolveAxisLabels and resolveTheme.
 *
 * Semantics under test:
 *   - `undefined` (field absent)  → use locale-resolved default (fallback)
 *   - `''` (explicit empty string) → render no label (explicit suppression); does NOT fall back to locale
 *   - `'non-empty string'`         → use as-is, overrides locale preset
 *
 * This rule applies to:
 *   1. Individual string fields: xAxis, yAxis, evolutionStart, evolutionEnd,
 *      visibilityHigh, visibilityLow
 *   2. Per-element entries in the phases array
 *
 * @module i18n-explicit-empty-vs-absent
 */

import { describe, expect, it } from "vitest";
import { resolveAxisLabels } from "./blocks/wardley-map/wardley-map-consts.js";
import { resolveTheme } from "./schema.js";

// ── resolveAxisLabels: individual string fields ───────────────────────────────

describe("resolveAxisLabels — explicit-empty vs absent for string fields", () => {

  // ── Test 1: empty string stays empty (explicit suppression) ──────────────
  it("empty string xAxis stays empty (explicit suppression — does NOT fall back to locale)", () => {
    const result = resolveAxisLabels({ xAxis: "" });
    // '' is an explicit override — must NOT be replaced by the English default "Evolution"
    expect(result.xAxis).toBe("");
  });

  it("empty string yAxis stays empty (explicit suppression)", () => {
    const result = resolveAxisLabels({ yAxis: "" });
    expect(result.yAxis).toBe("");
  });

  it("empty string stays empty even when locale is 'fr'", () => {
    const result = resolveAxisLabels({ locale: "fr", xAxis: "" });
    // '' wins over the French preset "Évolution"
    expect(result.xAxis).toBe("");
    // Other fields not overridden → resolve from fr preset
    expect(result.yAxis).toBe("Chaîne de valeur");
  });

  // ── Test 2: undefined resolves to locale default ─────────────────────────
  it("undefined xAxis resolves to English default when no locale specified", () => {
    const result = resolveAxisLabels({ xAxis: undefined });
    expect(result.xAxis).toBe("Evolution");
  });

  it("undefined xAxis resolves to French default when locale is 'fr'", () => {
    const result = resolveAxisLabels({ locale: "fr", xAxis: undefined });
    expect(result.xAxis).toBe("Évolution");
  });

  it("absent xAxis (field not provided) resolves to locale default", () => {
    // No xAxis key at all — equivalent to undefined
    const result = resolveAxisLabels({ locale: "fr" });
    expect(result.xAxis).toBe("Évolution");
  });

  it("undefined yAxis resolves to French default when locale is 'fr'", () => {
    const result = resolveAxisLabels({ locale: "fr", yAxis: undefined });
    expect(result.yAxis).toBe("Chaîne de valeur");
  });

  // ── Test 3: non-empty string wins over locale ─────────────────────────────
  it("non-empty xAxis string wins over English locale", () => {
    const result = resolveAxisLabels({ locale: "en", xAxis: "Custom Axis" });
    expect(result.xAxis).toBe("Custom Axis");
  });

  it("non-empty xAxis string wins over French locale", () => {
    const result = resolveAxisLabels({ locale: "fr", xAxis: "My X Label" });
    expect(result.xAxis).toBe("My X Label");
    // Other fields remain locale-resolved
    expect(result.yAxis).toBe("Chaîne de valeur");
    expect(result.phases[0]).toBe("Genèse");
  });

  it("non-empty yAxis string wins over French locale", () => {
    const result = resolveAxisLabels({ locale: "fr", yAxis: "Value Network" });
    expect(result.yAxis).toBe("Value Network");
    // xAxis falls back to fr preset
    expect(result.xAxis).toBe("Évolution");
  });
});

// ── resolveAxisLabels: per-element phases array ──────────────────────────────

describe("resolveAxisLabels — per-element phases array merging", () => {

  it("undefined entry in phases resolves to locale-preset label for that index (en)", () => {
    // phases[1] is undefined → should resolve to "Custom-Built" (English preset index 1)
    const result = resolveAxisLabels({ phases: ["Genesis", undefined, "Product", "Commodity"] });
    expect(result.phases[1]).toBe("Custom-Built");
  });

  it("undefined entry in phases resolves to locale-preset label for that index (fr)", () => {
    // phases[0] is undefined → should resolve to "Genèse" (French preset index 0)
    const result = resolveAxisLabels({
      locale: "fr",
      phases: [undefined, "Custom-Built"],
    });
    expect(result.phases[0]).toBe("Genèse");
    // Non-undefined entry wins
    expect(result.phases[1]).toBe("Custom-Built");
  });

  it("empty string entry in phases stays empty (explicit suppression)", () => {
    // phases[2] = '' → render no label for the third phase column
    const result = resolveAxisLabels({
      phases: ["Genesis", "Custom-Built", "", "Commodity"],
    });
    expect(result.phases[2]).toBe("");
    // Other entries unaffected
    expect(result.phases[0]).toBe("Genesis");
    expect(result.phases[3]).toBe("Commodity");
  });

  it("empty string phase stays empty even when locale is 'fr'", () => {
    // '' wins over the French preset "Produit (+location)" at index 2
    const result = resolveAxisLabels({
      locale: "fr",
      phases: [undefined, undefined, "", undefined],
    });
    expect(result.phases[2]).toBe(""); // explicit suppression preserved
    expect(result.phases[0]).toBe("Genèse"); // undefined → fr preset
    expect(result.phases[3]).toBe("Commodité (+utilité)"); // undefined → fr preset
  });

  it("non-empty phase string wins over locale preset for that index", () => {
    const result = resolveAxisLabels({
      locale: "fr",
      phases: [undefined, undefined, "My Phase 3", undefined],
    });
    expect(result.phases[2]).toBe("My Phase 3"); // explicit override wins
    expect(result.phases[0]).toBe("Genèse");      // undefined → fr preset
    expect(result.phases[1]).toBe("Sur mesure");  // undefined → fr preset
    expect(result.phases[3]).toBe("Commodité (+utilité)"); // undefined → fr preset
  });

  it("all phases undefined resolves all to locale preset", () => {
    const result = resolveAxisLabels({
      locale: "fr",
      phases: [undefined, undefined, undefined, undefined],
    });
    expect(result.phases).toEqual([
      "Genèse",
      "Sur mesure",
      "Produit (+location)",
      "Commodité (+utilité)",
    ]);
  });

  it("absent phases field uses the full locale preset array", () => {
    // No phases key at all
    const result = resolveAxisLabels({ locale: "fr" });
    expect(result.phases).toEqual([
      "Genèse",
      "Sur mesure",
      "Produit (+location)",
      "Commodité (+utilité)",
    ]);
  });

  it("all phases explicit strings win over fr locale", () => {
    const result = resolveAxisLabels({
      locale: "fr",
      phases: ["A", "B", "C", "D"],
    });
    expect(result.phases).toEqual(["A", "B", "C", "D"]);
  });

  it("out-of-range undefined index resolves to empty string (no preset for that index)", () => {
    // The preset only has 4 phases; phases[4] is undefined → preset.phases[4] is undefined → ''
    const result = resolveAxisLabels({
      phases: ["Genesis", "Custom-Built", "Product", "Commodity", undefined],
    });
    expect(result.phases[4]).toBe(""); // no preset for index 4 → '' fallback
  });
});

// ── resolveTheme: integration tests (via full RenderConfig pipeline) ──────────

describe("resolveTheme — explicit-empty vs absent propagated through full pipeline", () => {

  it("empty string xAxis via background.evolutionXAxis.xAxis stays empty in resolved axisLabels", () => {
    const rc = resolveTheme({
      style: { background: {
        axisEvolution: { default: { label: { text: "" } } },
      } },
    });
    // '' must survive the resolveTheme pipeline without being replaced by the locale default
    expect(rc.axisLabels.xAxis).toBe("");
    // Other fields unaffected
    expect(rc.axisLabels.yAxis).toBe("Value Chain");
  });

  it("absent xAxis resolves to locale default via resolveTheme (en)", () => {
    const rc = resolveTheme({ rendering: { locale: "en" } });
    expect(rc.axisLabels.xAxis).toBe("Evolution");
  });

  it("absent xAxis resolves to fr locale default when locale is 'fr'", () => {
    const rc = resolveTheme({ rendering: { locale: "fr" } });
    expect(rc.axisLabels.xAxis).toBe("Évolution");
  });

  it("non-empty xAxis wins over fr locale via resolveTheme", () => {
    const rc = resolveTheme({
      rendering: { locale: "fr" },
      style: { background: {
        axisEvolution: { default: { label: { text: "Axe personnalisé" } } },
      } },
    });
    expect(rc.axisLabels.xAxis).toBe("Axe personnalisé");
    // yAxis still uses fr preset
    expect(rc.axisLabels.yAxis).toBe("Chaîne de valeur");
  });

  it("empty string phases[1] via background.evolutionPhases.phases stays empty in resolved axisLabels", () => {
    const rc = resolveTheme({
      style: { background: {
        phases: { default: { labels: [
          { text: "Genesis" }, { text: "" }, { text: "Product" }, { text: "Commodity" },
        ] } },
      } },
    });
    expect(rc.axisLabels.phases[1]).toBe("");
    expect(rc.axisLabels.phases[0]).toBe("Genesis");
    expect(rc.axisLabels.phases[2]).toBe("Product");
  });

  it("undefined phases[0] via background.evolutionPhases.phases resolves to fr locale default", () => {
    const rc = resolveTheme({
      rendering: { locale: "fr" },
      style: { background: {
        phases: { default: { labels: [{}, { text: "Custom" }] } },
      } },
    });
    expect(rc.axisLabels.phases[0]).toBe("Genèse"); // undefined → fr preset
    expect(rc.axisLabels.phases[1]).toBe("Custom");  // explicit string wins
  });

  it("non-empty phases string wins over locale preset via resolveTheme", () => {
    const rc = resolveTheme({
      rendering: { locale: "fr" },
      style: { background: {
        phases: { default: { labels: [{}, {}, { text: "Ma Phase" }, {}] } },
      } },
    });
    expect(rc.axisLabels.phases[2]).toBe("Ma Phase");
    expect(rc.axisLabels.phases[0]).toBe("Genèse");
    expect(rc.axisLabels.phases[3]).toBe("Commodité (+utilité)");
  });
});
