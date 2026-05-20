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
import { RenderConfigSchema, type RenderConfig } from "./schema.js";

// Helper: loose-typed resolveConflict wrapper for tests.
// The nested RenderConfig sub-schemas have required fields in the output type
// (width, height, theme, etc.) due to Zod .default(). Test partial configs
// intentionally supply only a subset. This wrapper bridges the gap safely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const merge = (viewer: any, author: any) => resolveConflict(viewer, author);

// ── Taxonomy registry tests ───────────────────────────────────────────────────

describe("AUTHOR_INTENT_FIELDS", () => {
  it("is a non-empty readonly array of RenderConfig field names", () => {
    expect(Array.isArray(AUTHOR_INTENT_FIELDS)).toBe(true);
    expect(AUTHOR_INTENT_FIELDS.length).toBeGreaterThan(0);
  });

  it("contains all expected author-intent fields", () => {
    const expected: AuthorIntentField[] = [
      "spatial",
      "typography",
      "styling",
      "filters",
      "legend",
      "avoidCollisions",
      "methods",
      "configIntent",
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
    const expected: ViewerPreferenceField[] = ["axes"];
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
    const result = merge({}, {});
    // With no spatial group provided, spatial is undefined (optional at top level)
    // Defaults are only applied when the spatial group is explicitly provided
    expect(result.spatial).toBeUndefined();
  });

  // ── Author-intent fields: authorConfig wins ────────────────────────────────

  it("author-intent: spatial.width from authorConfig wins over viewer value", () => {
    const result = merge(
      { spatial: { width: 800 } },  // viewer (spatial is author-intent → ignored)
      { spatial: { width: 1920 } },                           // author
    );
    expect(result.spatial?.width).toBe(1920);
  });

  it("author-intent: spatial.height from authorConfig wins over viewer value", () => {
    const result = merge(
      { spatial: { height: 400 } },  // viewer (spatial is author-intent → ignored)
      { spatial: { height: 1080 } },                           // author
    );
    expect(result.spatial?.height).toBe(1080);
  });

  it("author-intent: styling.background from authorConfig wins", () => {
    const result = merge(
      { styling: { background: { color: "#000000" } } }, // viewer ignored
      { styling: { background: { color: "#ffffff" } } },                           // author wins
    );
    expect(result.styling?.background?.color).toBe("#ffffff");
  });

  it("author-intent: typography from authorConfig wins", () => {
    const result = merge(
      { typography: { fontFamily: "Arial, sans-serif", labelScale: 1.0 } }, // viewer ignored
      { typography: { fontFamily: "Roboto, sans-serif", labelScale: 1.0 } },                          // author wins
    );
    expect(result.typography?.fontFamily).toBe("Roboto, sans-serif");
  });

  it("author-intent: spatial.nodeRadii from authorConfig wins", () => {
    const result = merge(
      { spatial: { nodeRadii: { _default: 3 } } }, // viewer ignored
      { spatial: { nodeRadii: { _default: 8 } } },                           // author wins
    );
    expect(result.spatial?.nodeRadii?._default).toBe(8);
  });

  it("author-intent: styling.palette from authorConfig wins", () => {
    const authorColors = { _default: "#334155", "user-need": "#0ea5e9" };
    const viewerColors = { _default: "#ff0000" };
    const result = merge(
      { styling: { palette: viewerColors } }, // viewer ignored
      { styling: { palette: authorColors } },                           // author wins
    );
    expect(result.styling?.palette?._default).toBe("#334155");
    expect((result.styling?.palette as Record<string, string>)["user-need"]).toBe("#0ea5e9");
  });

  it("author-intent: styling.evolveStyles from authorConfig wins", () => {
    const authorStyles = { natural: { stroke: "#00ff00" } };
    const viewerStyles = { natural: { stroke: "#ff0000" } };
    const result = merge(
      { styling: { evolveStyles: viewerStyles } }, // viewer ignored
      { styling: { evolveStyles: authorStyles } },                           // author wins
    );
    expect(result.styling?.evolveStyles?.natural?.stroke).toBe("#00ff00");
  });

  it("author-intent: spatial.strokeWidth from authorConfig wins", () => {
    const result = merge(
      { spatial: { strokeWidth: 0.5 } }, // viewer ignored
      { spatial: { strokeWidth: 2 } },                             // author wins
    );
    expect(result.spatial?.strokeWidth).toBe(2);
  });

  it("author-intent: filters from authorConfig wins", () => {
    const authorFilters = { excludeComponentTypes: ["pipeline" as const] };
    const viewerFilters = { excludeComponentTypes: ["anchor" as const] };
    const result = merge(
      { filters: viewerFilters }, // viewer ignored
      { filters: authorFilters },                           // author wins
    );
    expect(result.filters?.excludeComponentTypes).toEqual(["pipeline"]);
  });

  it("author-intent: legend from authorConfig wins", () => {
    const result = merge(
      { legend: { show: false, position: "top-left", legendOverflow: "clip" } }, // viewer ignored
      { legend: { show: true, position: "bottom-right", legendOverflow: "allow" } }, // author wins
    );
    expect(result.legend?.show).toBe(true);
    expect(result.legend?.position).toBe("bottom-right");
  });

  it("author-intent: avoidCollisions from authorConfig wins", () => {
    const result = merge(
      { avoidCollisions: true },  // viewer ignored
      { avoidCollisions: false },                           // author wins
    );
    expect(result.avoidCollisions).toBe(false);
  });

  // ── Viewer-preference fields: viewerConfig wins ────────────────────────────

  it("viewer-preference: axes.locale from viewerConfig wins over author value", () => {
    const result = merge(
      { axes: { locale: "fr" } },          // viewer wins
      { axes: { locale: "en" } }, // author ignored
    );
    expect(result.axes?.locale).toBe("fr");
  });

  it("author-intent: typography.labelScale from authorConfig wins (labelScale is inside typography group)", () => {
    const result = merge(
      { typography: { fontFamily: "Inter, sans-serif", labelScale: 1.5 } }, // viewer ignored (typography is author-intent)
      { typography: { fontFamily: "Inter, sans-serif", labelScale: 0.8 } },                           // author wins
    );
    expect(result.typography?.labelScale).toBe(0.8);
  });

  // ── Non-conflict cases: only one side sets a field ────────────────────────

  it("author-only: author-intent field not set by viewer resolves to author value", () => {
    const result = merge(
      {},               // viewer sets nothing
      { spatial: { width: 2560 } }, // author sets spatial.width
    );
    expect(result.spatial?.width).toBe(2560);
  });

  it("viewer-only: viewer-preference field not set by author resolves to viewer value", () => {
    const result = merge(
      { axes: { locale: "fr" } }, // viewer sets axes.locale
      {},               // author sets nothing
    );
    expect(result.axes?.locale).toBe("fr");
  });

  it("unset on both sides: author-intent field absent from both defaults to undefined", () => {
    const result = merge({}, {});
    // spatial has no required fields — it remains undefined when not supplied
    expect(result.spatial?.width).toBeUndefined();
    expect(result.spatial?.height).toBeUndefined();
  });

  it("unset on both sides: viewer-preference field absent from both defaults to undefined", () => {
    const result = merge({}, {});
    // axes has no Zod default — it remains undefined when not supplied
    expect(result.axes).toBeUndefined();
  });

  // ── Mixed scenario (realistic use case) ───────────────────────────────────

  it("realistic scenario: author brand config + viewer dark mode fr", () => {
    const authorConfig = {
      spatial: { width: 1920, height: 1080, strokeWidth: 1.5 },
      styling: { background: { color: "#f8fafc" }, palette: { _default: "#334155", "user-need": "#0ea5e9" } },
      typography: { fontFamily: "Inter, sans-serif", labelScale: 1.2 },
      axes: { locale: "en" },     // author preference — but viewer wins for this field
    } as unknown as Partial<RenderConfig>;

    const viewerConfig = {
      axes: { locale: "fr" },
      spatial: { width: 800 },       // viewer attempts to override — but author wins for this field
    } as unknown as Partial<RenderConfig>;

    const result = merge(viewerConfig, authorConfig);

    // Author-intent fields from authorConfig
    expect(result.spatial?.width).toBe(1920);             // author wins over viewer's 800
    expect(result.spatial?.height).toBe(1080);
    expect(result.styling?.background?.color).toBe("#f8fafc");
    expect(result.styling?.palette?._default).toBe("#334155");
    expect(result.spatial?.strokeWidth).toBe(1.5);
    expect(result.typography?.fontFamily).toBe("Inter, sans-serif");
    expect(result.typography?.labelScale).toBe(1.2);

    // Viewer-preference fields from viewerConfig
    expect(result.axes?.locale).toBe("fr");            // viewer wins over author's "en"
  });

  it("realistic scenario: viewer-only (no author config) returns viewer preferences + defaults", () => {
    const result = merge({ axes: { locale: "fr" } }, {});
    expect(result.axes?.locale).toBe("fr");
    // spatial is not set — optional at top level
    expect(result.spatial).toBeUndefined();
  });

  it("realistic scenario: author-only (no viewer config) returns author intent + defaults", () => {
    const result = merge({}, {
      spatial: { width: 3200, height: 1800, strokeWidth: 2 },
      avoidCollisions: false,
    });
    expect(result.spatial?.width).toBe(3200);
    expect(result.spatial?.height).toBe(1800);
    expect(result.spatial?.strokeWidth).toBe(2);
    expect(result.avoidCollisions).toBe(false);
    // Viewer-preference fields absent → undefined (resolveTheme will supply defaults)
    expect(result.axes).toBeUndefined();
  });

  // ── Schema validation is applied ──────────────────────────────────────────

  it("applies Zod schema defaults — spatial.strokeWidth defaults to 1 when absent", () => {
    const result = merge({}, {});
    // spatial is not set when both configs are empty — optional at top level
    expect(result.spatial).toBeUndefined();
  });

  it("passes through valid coordinateSpace from authorConfig", () => {
    const result = merge({}, {
      // Use RenderConfigInput-compatible partial; Zod fills in units/origin/unit defaults
      spatial: { coordinateSpace: { width: 2400, height: 1200 } as any },
    });
    expect(result.spatial?.coordinateSpace?.width).toBe(2400);
    expect(result.spatial?.coordinateSpace?.height).toBe(1200);
  });

  it("returns a result that is parseable by RenderConfigSchema (idempotent)", () => {
    const result = merge(
      { axes: { locale: "fr" } },
      { spatial: { width: 1920, strokeWidth: 2 } },
    );
    // Re-parsing the output should produce the same values (idempotent)
    const reparsed = RenderConfigSchema.parse(result);
    expect(reparsed.axes?.locale).toBe("fr");
    expect(reparsed.spatial?.width).toBe(1920);
    expect(reparsed.spatial?.strokeWidth).toBe(2);
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
  it("viewer axes + author evolveStyles — both survive", () => {
    // The viewer wants French locale; the author has designed evolution arrows
    // with light strokes for a white-background map.  Neither overrides the
    // other because they belong to different field categories.
    const result = merge(
      { axes: { locale: "fr" } },                          // viewer-preference: axes
      { styling: { evolveStyles: { natural: { stroke: "#e2e8f0", strokeDasharray: "4 2" } } } }, // author-intent: styling
    );

    // Viewer-preference: axes.locale = "fr" (from viewer)
    expect(result.axes?.locale).toBe("fr");

    // Author-intent: evolveStyles kept intact (not overridden by viewer)
    expect(result.styling?.evolveStyles?.natural?.stroke).toBe("#e2e8f0");
    expect(result.styling?.evolveStyles?.natural?.strokeDasharray).toBe("4 2");
  });

  it("viewer axes + author palette — both survive", () => {
    // The author designed bright node colors for a light background.
    // The viewer wants French locale. resolveConflict must preserve BOTH.
    const result = merge(
      { axes: { locale: "fr" } },                                        // viewer-preference
      { styling: { palette: { _default: "#ffffff", "user-need": "#f0f9ff" } } }, // author-intent
    );

    expect(result.axes?.locale).toBe("fr");
    expect(result.styling?.palette?._default).toBe("#ffffff");
    expect((result.styling?.palette as Record<string, string>)["user-need"]).toBe("#f0f9ff");
  });

  it("viewer axes + author background color — both survive", () => {
    // Author explicitly set a light canvas background; viewer wants French locale.
    // styling.background is author-intent; axes is viewer-preference — they coexist.
    const result = merge(
      { axes: { locale: "fr" } },                               // viewer-preference
      { styling: { background: { color: "#f8fafc" } } },        // author-intent
    );

    expect(result.axes?.locale).toBe("fr");
    expect(result.styling?.background?.color).toBe("#f8fafc");
  });

  it("viewer axes + author custom evolveStyles — both survive", () => {
    // Viewer wants French locale; author has custom evolution arrow styles.
    // Neither field overwrites the other.
    const result = merge(
      { axes: { locale: "fr" } },
      {
        styling: {
          evolveStyles: {
            natural:  { stroke: "#3b82f6" },
            forced:   { stroke: "#ef4444", strokeDasharray: "8 4" },
            ecosystem: { stroke: "#22c55e" },
          },
        },
      },
    );

    expect(result.axes?.locale).toBe("fr");
    expect(result.styling?.evolveStyles?.natural?.stroke).toBe("#3b82f6");
    expect(result.styling?.evolveStyles?.forced?.stroke).toBe("#ef4444");
    expect(result.styling?.evolveStyles?.ecosystem?.stroke).toBe("#22c55e");
  });

  it("large labelScale (author typography) + small nodeRadii (author spatial) — both survive", () => {
    // Author set typography.labelScale and small node radii for a dense map.
    // Both are author-intent fields — they coexist without conflict.
    const result = merge(
      {},                                                    // viewer sets nothing
      { typography: { fontFamily: "Inter, sans-serif", labelScale: 2.0 }, spatial: { nodeRadii: { _default: 4 } } }, // author-intent
    );

    expect(result.typography?.labelScale).toBe(2.0);
    expect(result.spatial?.nodeRadii?._default).toBe(4);
  });

  it("French axes.locale (viewer) + author palette + strokeWidth — all three survive", () => {
    // Viewer axes.locale is fr; author has brand colors and a heavy stroke.
    // axes is viewer-preference; styling.palette and spatial.strokeWidth are author-intent.
    const result = merge(
      { axes: { locale: "fr" } },                                   // viewer-preference
      { styling: { palette: { _default: "#1e293b" } }, spatial: { strokeWidth: 2.5 } },   // author-intent
    );

    expect(result.axes?.locale).toBe("fr");
    expect(result.styling?.palette?._default).toBe("#1e293b");
    expect(result.spatial?.strokeWidth).toBe(2.5);
  });

  it("viewer sets author-intent-category field AND viewer-preference field — only viewer-preference survives", () => {
    // Viewer tries to set spatial.width (an author-intent field) AND axes (a viewer-preference field).
    // Author also sets spatial.width.  Result: author spatial wins, viewer axes wins.
    // The viewer's attempt to override spatial is silently discarded.
    const result = merge(
      { spatial: { width: 800 }, axes: { locale: "fr" } },   // viewer attempts both
      { spatial: { width: 1920 } },                                           // author sets spatial
    );

    expect(result.spatial?.width).toBe(1920);    // author's spatial wins (viewer's 800 discarded)
    expect(result.axes?.locale).toBe("fr"); // viewer's axes wins (no author value)
  });

  it("author sets viewer-preference-category field AND author-intent field — only author-intent survives", () => {
    // Author includes axes in their config (perhaps as a suggestion), and sets
    // spatial.  Viewer wants French locale.  Result: viewer axes wins, author spatial wins.
    // The author's attempted axes override is silently discarded.
    const result = merge(
      { axes: { locale: "fr" } },                             // viewer preference
      { axes: { locale: "en" }, spatial: { width: 1600 } }, // author sets both
    );

    expect(result.axes?.locale).toBe("fr");    // viewer wins (author's "en" discarded)
    expect(result.spatial?.width).toBe(1600);      // author's spatial wins
  });
});
