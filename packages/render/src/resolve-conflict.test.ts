/**
 * Tests for resolveConflict() — author/viewer config merge with taxonomy.
 *
 * @see resolve-conflict.ts — implementation and full taxonomy documentation
 */
import { describe, it, expect } from "vitest";
import {
  resolveConflict,
  AUTHOR_INTENT_FIELDS,
  VIEWER_PREFERENCE_FIELDS,
  type AuthorIntentField,
  type ViewerPreferenceField,
} from "./resolve-conflict.js";
import { RENDER_SCOPE, RenderConfigSchema, type RenderConfig } from "./schema.js";

// ── Taxonomy registry tests ───────────────────────────────────────────────────

describe("AUTHOR_INTENT_FIELDS", () => {
  it("is a non-empty readonly array of RenderConfig field names", () => {
    expect(Array.isArray(AUTHOR_INTENT_FIELDS)).toBe(true);
    expect(AUTHOR_INTENT_FIELDS.length).toBeGreaterThan(0);
  });

  it("contains all expected author-intent fields", () => {
    const expected: AuthorIntentField[] = [
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
    ];
    for (const field of expected) {
      expect(AUTHOR_INTENT_FIELDS).toContain(field);
    }
  });

  it("does not contain viewer-preference fields", () => {
    for (const field of VIEWER_PREFERENCE_FIELDS) {
      expect(AUTHOR_INTENT_FIELDS).not.toContain(field);
    }
  });
});

describe("VIEWER_PREFERENCE_FIELDS", () => {
  it("is a non-empty readonly array of RenderConfig field names", () => {
    expect(Array.isArray(VIEWER_PREFERENCE_FIELDS)).toBe(true);
    expect(VIEWER_PREFERENCE_FIELDS.length).toBeGreaterThan(0);
  });

  it("contains all expected viewer-preference fields", () => {
    const expected: ViewerPreferenceField[] = ["theme", "locale", "labelScale"];
    for (const field of expected) {
      expect(VIEWER_PREFERENCE_FIELDS).toContain(field);
    }
  });

  it("does not contain author-intent fields", () => {
    for (const field of AUTHOR_INTENT_FIELDS) {
      expect(VIEWER_PREFERENCE_FIELDS).not.toContain(field);
    }
  });

  it("taxonomies are disjoint — no field appears in both arrays", () => {
    const authorSet = new Set<string>(AUTHOR_INTENT_FIELDS);
    const viewerSet = new Set<string>(VIEWER_PREFERENCE_FIELDS);
    for (const field of authorSet) {
      expect(viewerSet.has(field)).toBe(false);
    }
  });
});

// ── resolveConflict() core behaviour ─────────────────────────────────────────

describe("resolveConflict", () => {
  // ── Empty inputs ───────────────────────────────────────────────────────────

  it("accepts two empty objects and returns a valid RenderConfig", () => {
    const result = resolveConflict({}, {});
    // Zod applies defaults — strokeWidth must be 1
    expect(result.strokeWidth).toBe(1);
    // _scope always injected
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("always injects RENDER_SCOPE into _scope regardless of inputs", () => {
    const result1 = resolveConflict({}, {});
    expect(result1._scope).toEqual(RENDER_SCOPE);
    // Non-null asserted: resolveConflict always injects _scope
    expect(result1._scope!.mode).toBe("static-export");
    expect(result1._scope!.temporal).toBe(false);
    expect(result1._scope!.interactive).toBe(false);

    const result2 = resolveConflict(
      { theme: "dark" },
      { width: 1920, height: 1080 },
    );
    expect(result2._scope).toEqual(RENDER_SCOPE);
  });

  // ── Author-intent fields: authorConfig wins ────────────────────────────────

  it("author-intent: width from authorConfig wins over viewer value", () => {
    const result = resolveConflict(
      { width: 800 } as Partial<RenderConfig>,  // viewer (width is author-intent → ignored)
      { width: 1920 },                           // author
    );
    expect(result.width).toBe(1920);
  });

  it("author-intent: height from authorConfig wins over viewer value", () => {
    const result = resolveConflict(
      { height: 400 } as Partial<RenderConfig>,  // viewer (height is author-intent → ignored)
      { height: 1080 },                           // author
    );
    expect(result.height).toBe(1080);
  });

  it("author-intent: background from authorConfig wins", () => {
    const result = resolveConflict(
      { background: { color: "#000000" } } as Partial<RenderConfig>, // viewer ignored
      { background: { color: "#ffffff" } },                           // author wins
    );
    expect(result.background?.color).toBe("#ffffff");
  });

  it("author-intent: fontFamily from authorConfig wins", () => {
    const result = resolveConflict(
      { fontFamily: "Arial, sans-serif" } as Partial<RenderConfig>, // viewer ignored
      { fontFamily: "Roboto, sans-serif" },                          // author wins
    );
    expect(result.fontFamily).toBe("Roboto, sans-serif");
  });

  it("author-intent: nodeRadii from authorConfig wins", () => {
    const result = resolveConflict(
      { nodeRadii: { _default: 3 } } as Partial<RenderConfig>, // viewer ignored
      { nodeRadii: { _default: 8 } },                           // author wins
    );
    expect(result.nodeRadii?._default).toBe(8);
  });

  it("author-intent: typeColors from authorConfig wins", () => {
    const authorColors = { _default: "#334155", "user-need": "#0ea5e9" };
    const viewerColors = { _default: "#ff0000" };
    const result = resolveConflict(
      { typeColors: viewerColors } as Partial<RenderConfig>, // viewer ignored
      { typeColors: authorColors },                           // author wins
    );
    expect(result.typeColors?._default).toBe("#334155");
    expect((result.typeColors as Record<string, string>)["user-need"]).toBe("#0ea5e9");
  });

  it("author-intent: evolveStyles from authorConfig wins", () => {
    const authorStyles = { natural: { stroke: "#00ff00" } };
    const viewerStyles = { natural: { stroke: "#ff0000" } };
    const result = resolveConflict(
      { evolveStyles: viewerStyles } as Partial<RenderConfig>, // viewer ignored
      { evolveStyles: authorStyles },                           // author wins
    );
    expect(result.evolveStyles?.natural?.stroke).toBe("#00ff00");
  });

  it("author-intent: strokeWidth from authorConfig wins", () => {
    const result = resolveConflict(
      { strokeWidth: 0.5 } as Partial<RenderConfig>, // viewer ignored
      { strokeWidth: 2 },                             // author wins
    );
    expect(result.strokeWidth).toBe(2);
  });

  it("author-intent: filters from authorConfig wins", () => {
    const authorFilters = { excludeComponentTypes: ["note" as const] };
    const viewerFilters = { excludeComponentTypes: ["anchor" as const] };
    const result = resolveConflict(
      { filters: viewerFilters } as Partial<RenderConfig>, // viewer ignored
      { filters: authorFilters },                           // author wins
    );
    expect(result.filters?.excludeComponentTypes).toEqual(["note"]);
  });

  it("author-intent: legend from authorConfig wins", () => {
    const result = resolveConflict(
      { legend: { show: false, position: "top-left", legendOverflow: "clip" } }, // viewer ignored
      { legend: { show: true, position: "bottom-right", legendOverflow: "allow" } }, // author wins
    );
    expect(result.legend?.show).toBe(true);
    expect(result.legend?.position).toBe("bottom-right");
  });

  it("author-intent: avoidCollisions from authorConfig wins", () => {
    const result = resolveConflict(
      { avoidCollisions: true } as Partial<RenderConfig>,  // viewer ignored
      { avoidCollisions: false },                           // author wins
    );
    expect(result.avoidCollisions).toBe(false);
  });

  // ── Viewer-preference fields: viewerConfig wins ────────────────────────────

  it("viewer-preference: theme from viewerConfig wins over author value", () => {
    const result = resolveConflict(
      { theme: "dark" },        // viewer wins
      { theme: "default" } as Partial<RenderConfig>, // author ignored
    );
    expect(result.theme).toBe("dark");
  });

  it("viewer-preference: locale from viewerConfig wins over author value", () => {
    const result = resolveConflict(
      { locale: "fr" },          // viewer wins
      { locale: "en" } as Partial<RenderConfig>, // author ignored
    );
    expect(result.locale).toBe("fr");
  });

  it("viewer-preference: labelScale from viewerConfig wins over author value", () => {
    const result = resolveConflict(
      { labelScale: 1.5 },        // viewer wins
      { labelScale: 0.8 } as Partial<RenderConfig>, // author ignored
    );
    expect(result.labelScale).toBe(1.5);
  });

  // ── Non-conflict cases: only one side sets a field ────────────────────────

  it("author-only: author-intent field not set by viewer resolves to author value", () => {
    const result = resolveConflict(
      {},               // viewer sets nothing
      { width: 2560 }, // author sets width
    );
    expect(result.width).toBe(2560);
  });

  it("viewer-only: viewer-preference field not set by author resolves to viewer value", () => {
    const result = resolveConflict(
      { locale: "fr" }, // viewer sets locale
      {},               // author sets nothing
    );
    expect(result.locale).toBe("fr");
  });

  it("unset on both sides: author-intent field absent from both defaults to undefined", () => {
    const result = resolveConflict({}, {});
    // width has no Zod default — it remains undefined when not supplied
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
  });

  it("unset on both sides: viewer-preference field absent from both defaults to undefined", () => {
    const result = resolveConflict({}, {});
    // theme has no Zod default — it remains undefined when not supplied
    expect(result.theme).toBeUndefined();
    expect(result.locale).toBeUndefined();
  });

  // ── Mixed scenario (realistic use case) ───────────────────────────────────

  it("realistic scenario: author brand config + viewer dark mode fr", () => {
    const authorConfig: Partial<RenderConfig> = {
      width: 1920,
      height: 1080,
      background: { color: "#f8fafc" },
      typeColors: { _default: "#334155", "user-need": "#0ea5e9" },
      strokeWidth: 1.5,
      fontFamily: "Inter, sans-serif",
      theme: "default", // author preference — but viewer wins for this field
      locale: "en",     // author preference — but viewer wins for this field
    };

    const viewerConfig: Partial<RenderConfig> = {
      theme: "dark",
      locale: "fr",
      labelScale: 1.2,
      width: 800,       // viewer attempts to override — but author wins for this field
    };

    const result = resolveConflict(viewerConfig, authorConfig);

    // Author-intent fields from authorConfig
    expect(result.width).toBe(1920);             // author wins over viewer's 800
    expect(result.height).toBe(1080);
    expect(result.background?.color).toBe("#f8fafc");
    expect(result.typeColors?._default).toBe("#334155");
    expect(result.strokeWidth).toBe(1.5);
    expect(result.fontFamily).toBe("Inter, sans-serif");

    // Viewer-preference fields from viewerConfig
    expect(result.theme).toBe("dark");           // viewer wins over author's "default"
    expect(result.locale).toBe("fr");            // viewer wins over author's "en"
    expect(result.labelScale).toBe(1.2);

    // System metadata always RENDER_SCOPE
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("realistic scenario: viewer-only (no author config) returns viewer preferences + defaults", () => {
    const result = resolveConflict({ theme: "highContrast", locale: "fr" }, {});
    expect(result.theme).toBe("highContrast");
    expect(result.locale).toBe("fr");
    expect(result.strokeWidth).toBe(1); // Zod default
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("realistic scenario: author-only (no viewer config) returns author intent + defaults", () => {
    const result = resolveConflict({}, {
      width: 3200,
      height: 1800,
      strokeWidth: 2,
      avoidCollisions: false,
    });
    expect(result.width).toBe(3200);
    expect(result.height).toBe(1800);
    expect(result.strokeWidth).toBe(2);
    expect(result.avoidCollisions).toBe(false);
    // Viewer-preference fields absent → undefined (resolveTheme will supply defaults)
    expect(result.theme).toBeUndefined();
    expect(result.locale).toBeUndefined();
  });

  // ── Schema validation is applied ──────────────────────────────────────────

  it("applies Zod schema defaults — strokeWidth defaults to 1 when absent", () => {
    const result = resolveConflict({}, {});
    // strokeWidth uses .default(1) in the schema
    expect(result.strokeWidth).toBe(1);
  });

  it("passes through valid coordinateSpace from authorConfig", () => {
    const result = resolveConflict({}, {
      // Use RenderConfigInput-compatible partial; Zod fills in units/origin/unit defaults
      coordinateSpace: { width: 2400, height: 1200 } as RenderConfig["coordinateSpace"],
    });
    expect(result.coordinateSpace?.width).toBe(2400);
    expect(result.coordinateSpace?.height).toBe(1200);
  });

  it("returns a result that is parseable by RenderConfigSchema (idempotent)", () => {
    const result = resolveConflict(
      { theme: "dark", locale: "fr" },
      { width: 1920, strokeWidth: 2 },
    );
    // Re-parsing the output should produce the same values (idempotent)
    const reparsed = RenderConfigSchema.parse(result);
    expect(reparsed.theme).toBe("dark");
    expect(reparsed.locale).toBe("fr");
    expect(reparsed.width).toBe(1920);
    expect(reparsed.strokeWidth).toBe(2);
  });
});

// ── Cross-category conflict tests ─────────────────────────────────────────────
//
// These tests verify that viewer-preference fields and author-intent fields
// do NOT bleed into each other's categories.  Each test sets a value in one
// category on the viewer side AND a conflicting value in a different category
// on the author side — both values must survive in the output because they
// belong to different categories and are therefore not in conflict.
//
// This is the key semantic of the taxonomy: "conflict" means two parties
// fighting over the SAME field, not two parties setting DIFFERENT fields that
// happen to look visually inconsistent.

describe("resolveConflict — cross-category conflicts", () => {
  it("dark theme (viewer) + light-stroke evolveStyles (author) — both survive", () => {
    // The viewer wants dark mode; the author has designed evolution arrows
    // with light strokes for a white-background map.  Neither overrides the
    // other because they belong to different field categories.
    const result = resolveConflict(
      { theme: "dark" },                          // viewer-preference: theme
      { evolveStyles: { natural: { stroke: "#e2e8f0", strokeDasharray: "4 2" } } }, // author-intent: evolveStyles
    );

    // Viewer-preference: theme = "dark" (from viewer)
    expect(result.theme).toBe("dark");

    // Author-intent: evolveStyles kept intact (not overridden by viewer's dark theme)
    expect(result.evolveStyles?.natural?.stroke).toBe("#e2e8f0");
    expect(result.evolveStyles?.natural?.strokeDasharray).toBe("4 2");

    // System metadata always present
    expect(result._scope).toEqual(RENDER_SCOPE);
  });

  it("dark theme (viewer) + white typeColors (author) — both survive", () => {
    // The author designed bright node colors for a light background.
    // The viewer switched to dark mode.  resolveConflict must preserve BOTH
    // settings — it has no authority to rewrite author typeColors.
    const result = resolveConflict(
      { theme: "dark" },                                        // viewer-preference
      { typeColors: { _default: "#ffffff", "user-need": "#f0f9ff" } }, // author-intent
    );

    expect(result.theme).toBe("dark");
    expect(result.typeColors?._default).toBe("#ffffff");
    expect((result.typeColors as Record<string, string>)["user-need"]).toBe("#f0f9ff");
  });

  it("dark theme (viewer) + light background color (author) — both survive", () => {
    // Author explicitly set a light canvas background; viewer wants dark mode.
    // background is author-intent; theme is viewer-preference — they coexist.
    const result = resolveConflict(
      { theme: "dark" },                               // viewer-preference
      { background: { color: "#f8fafc" } },            // author-intent
    );

    expect(result.theme).toBe("dark");
    expect(result.background?.color).toBe("#f8fafc");
  });

  it("highContrast theme (viewer) + custom evolveStyles (author) — both survive", () => {
    // Viewer requires high-contrast mode for accessibility; author has custom
    // evolution arrow styles.  Neither field overwrites the other.
    const result = resolveConflict(
      { theme: "highContrast" },
      {
        evolveStyles: {
          natural:  { stroke: "#3b82f6" },
          forced:   { stroke: "#ef4444", strokeDasharray: "8 4" },
          ecosystem: { stroke: "#22c55e" },
        },
      },
    );

    expect(result.theme).toBe("highContrast");
    expect(result.evolveStyles?.natural?.stroke).toBe("#3b82f6");
    expect(result.evolveStyles?.forced?.stroke).toBe("#ef4444");
    expect(result.evolveStyles?.ecosystem?.stroke).toBe("#22c55e");
  });

  it("large labelScale (viewer) + small nodeRadii (author) — both survive", () => {
    // Viewer bumped labelScale for readability (viewer-preference).
    // Author set small node radii for a dense map (author-intent).
    // Neither field is in conflict with the other — they're in different categories.
    const result = resolveConflict(
      { labelScale: 2.0 },               // viewer-preference
      { nodeRadii: { _default: 4 } },    // author-intent
    );

    expect(result.labelScale).toBe(2.0);
    expect(result.nodeRadii?._default).toBe(4);
  });

  it("French locale (viewer) + author typeColors + strokeWidth — all three survive", () => {
    // Viewer locale is fr; author has brand colors and a heavy stroke.
    // locale is viewer-preference; typeColors and strokeWidth are author-intent.
    const result = resolveConflict(
      { locale: "fr" },                                             // viewer-preference
      { typeColors: { _default: "#1e293b" }, strokeWidth: 2.5 },   // author-intent
    );

    expect(result.locale).toBe("fr");
    expect(result.typeColors?._default).toBe("#1e293b");
    expect(result.strokeWidth).toBe(2.5);
  });

  it("viewer sets author-intent-category field AND viewer-preference field — only viewer-preference survives", () => {
    // Viewer tries to set width (an author-intent field) AND theme (a viewer-preference field).
    // Author also sets width.  Result: author width wins, viewer theme wins.
    // The viewer's attempt to override width is silently discarded.
    const result = resolveConflict(
      { width: 800, theme: "dark" } as Partial<RenderConfig>,   // viewer attempts both
      { width: 1920 },                                           // author sets width
    );

    expect(result.width).toBe(1920);    // author's width wins (viewer's 800 discarded)
    expect(result.theme).toBe("dark"); // viewer's theme wins (no author value)
  });

  it("author sets viewer-preference-category field AND author-intent field — only author-intent survives", () => {
    // Author includes theme in their config (perhaps as a suggestion), and sets
    // width.  Viewer wants dark theme.  Result: viewer theme wins, author width wins.
    // The author's attempted theme override is silently discarded.
    const result = resolveConflict(
      { theme: "dark" },                             // viewer preference
      { theme: "default", width: 1600 } as Partial<RenderConfig>, // author sets both
    );

    expect(result.theme).toBe("dark");    // viewer wins (author's "default" discarded)
    expect(result.width).toBe(1600);      // author's width wins
  });
});
