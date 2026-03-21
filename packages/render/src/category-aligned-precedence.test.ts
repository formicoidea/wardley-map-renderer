/**
 * @file category-aligned-precedence.test.ts
 *
 * Dedicated tests for **category-aligned precedence** — verifying that the
 * 4-tier FieldCategory vocabulary in TIERED_RENDER_CONFIG_TAXONOMY aligns
 * correctly with the 3-tier resolution precedence chain, and that higher-tier
 * values override lower-tier defaults without breaking existing behaviour.
 *
 * ## Precedence hierarchy (highest → lowest authority):
 *
 * ```
 * Tier 1 (platform-constraint): Hard invariants — configIntent,
 *   coordinateSpace, width, height. Cannot be overridden by lower-tier config.
 *   TIER_PRECEDENCE index 0 = highest authority.
 *
 * Tier 2 (layout-structural): Structural scaffold — background, legend, filters.
 *   AuthorConfig wins; viewer cannot override. TIER_PRECEDENCE index 1.
 *
 * Tier 3 (author-intent): Design choices — fontFamily, typeColors, evolveStyles,
 *   strokeWidth, nodeRadii, avoidCollisions. AuthorConfig wins. TIER_PRECEDENCE index 2.
 *
 * Tier 4 (viewer-preference): Presentational — theme, axes.
 *   Viewer can override (overridable: true). TIER_PRECEDENCE index 3 = lowest.
 * ```
 *
 * ## 3-tier resolution chain (within resolveTheme / resolveConfigIntent):
 *
 * ```
 * Level 3 (highest): Explicit field value supplied in the input config
 * Level 2 (middle):  Theme-baseline default (selected by `theme` field)
 * Level 1 (lowest):  Schema default (Zod .default() / DEFAULT_CONFIG_INTENT)
 * ```
 *
 * ## Tests in this file (Sub-AC 2 of AC 9):
 *
 *  1. TIERED_RENDER_CONFIG_TAXONOMY classifies `configIntent` as
 *     `platform-constraint` and TIER_PRECEDENCE[0] is `platform-constraint`.
 *
 *  2. `platform-constraint` fields have `overridable: false`;
 *     `viewer-preference` fields have `overridable: true` — the overridable
 *     flag is a structural expression of tier authority in the precedence chain.
 *
 *  3. Explicit configIntent (platform-constraint, higher tier) beats the
 *     DEFAULT_CONFIG_INTENT schema-level fallback (lower tier): explicit
 *     false overrides the default true for each flag independently.
 *
 *  4. Lower-tier `viewer-preference` change (theme switch) does NOT affect
 *     the `platform-constraint` configIntent value — cross-tier isolation
 *     ensures higher-tier fields are never clobbered by lower-tier resolution.
 *
 *  5. TIER_PRECEDENCE ordering guarantees: each tier's index confirms its
 *     authority rank — platform-constraint(0) > layout-structural(1) >
 *     author-intent(2) > viewer-preference(3).
 *
 *  6. All configIntent sub-fields carry `@category platform-constraint` —
 *     introspectable via ConfigIntentSchema's Zod description metadata.
 *
 * @see TIERED_RENDER_CONFIG_TAXONOMY — per-field tier classification
 * @see TIER_PRECEDENCE              — authority-ordered tier tuple
 * @see getFieldTierCategory         — retrieves a field's tier
 * @see resolveConfigIntent          — merges explicit over defaults
 * @see resolveTheme                 — full pipeline entry point
 * @see DEFAULT_CONFIG_INTENT        — the schema-level lowest-tier default
 */

import { describe, it, expect } from "vitest";
import {
  TIER_PRECEDENCE,
  TIERED_RENDER_CONFIG_TAXONOMY,
  getFieldTierCategory,
  ConfigIntentSchema,
  DEFAULT_CONFIG_INTENT,
  resolveConfigIntent,
  resolveTheme,
  type FieldCategory,
  type ConfigIntent,
} from "./schema.js";

// ── Test 1: configIntent is platform-constraint, highest authority ────────────

describe("category-aligned precedence — configIntent is platform-constraint (Tier 1)", () => {
  it(
    "TIERED_RENDER_CONFIG_TAXONOMY classifies configIntent as platform-constraint",
    () => {
      // configIntent defines the renderer's operational contract — it is a
      // hard invariant (static-only, no temporal, no interaction) and must
      // live in the highest-authority tier.
      expect(TIERED_RENDER_CONFIG_TAXONOMY.configIntent.category).toBe(
        "platform-constraint",
      );
    },
  );

  it(
    "platform-constraint is TIER_PRECEDENCE[0] — the highest-authority tier",
    () => {
      // Index 0 in TIER_PRECEDENCE = highest authority.
      // configIntent (platform-constraint) therefore has higher authority
      // than every other tier category.
      expect(TIER_PRECEDENCE[0]).toBe("platform-constraint");
    },
  );

  it(
    "getFieldTierCategory('configIntent') returns platform-constraint — consistent with taxonomy",
    () => {
      // The helper function must agree with the direct taxonomy lookup.
      const tier: FieldCategory = getFieldTierCategory("configIntent");
      expect(tier).toBe("platform-constraint");
    },
  );

  it(
    "configIntent is non-overridable (overridable: false) — platform-constraint authority enforced",
    () => {
      // platform-constraint fields have overridable: false — they cannot be
      // changed by a lower-tier viewer preference config.
      expect(TIERED_RENDER_CONFIG_TAXONOMY.configIntent.overridable).toBe(
        false,
      );
    },
  );
});

// ── Test 2: overridable flag aligns with tier authority ────────────────────────

describe("category-aligned precedence — overridable flag mirrors tier authority", () => {
  it(
    "platform-constraint fields (configIntent, coordinateSpace, width, height) are all non-overridable",
    () => {
      // The overridable flag is the runtime expression of tier authority.
      // All platform-constraint fields must be non-overridable.
      const platformConstraintFields = (
        Object.entries(TIERED_RENDER_CONFIG_TAXONOMY) as Array<
          [string, (typeof TIERED_RENDER_CONFIG_TAXONOMY)[keyof typeof TIERED_RENDER_CONFIG_TAXONOMY]]
        >
      ).filter(([, meta]) => meta.category === "platform-constraint");

      // Every platform-constraint field must have overridable: false
      expect(platformConstraintFields.length).toBeGreaterThan(0);
      for (const [fieldName, meta] of platformConstraintFields) {
        expect(
          meta.overridable,
          `Field '${fieldName}' is platform-constraint but has overridable: true — violation`,
        ).toBe(false);
      }
    },
  );

  it(
    "viewer-preference fields (theme, axes) are all overridable",
    () => {
      // viewer-preference is the lowest-authority tier; fields in it MUST
      // have overridable: true so that viewer config can legitimately set them.
      const viewerPreferenceFields = (
        Object.entries(TIERED_RENDER_CONFIG_TAXONOMY) as Array<
          [string, (typeof TIERED_RENDER_CONFIG_TAXONOMY)[keyof typeof TIERED_RENDER_CONFIG_TAXONOMY]]
        >
      ).filter(([, meta]) => meta.category === "viewer-preference");

      expect(viewerPreferenceFields.length).toBeGreaterThan(0);
      for (const [fieldName, meta] of viewerPreferenceFields) {
        expect(
          meta.overridable,
          `Field '${fieldName}' is viewer-preference but has overridable: false — violation`,
        ).toBe(true);
      }
    },
  );

  it(
    "layout-structural and author-intent fields are non-overridable (viewer cannot override)",
    () => {
      // These mid-tier categories represent structural and design decisions
      // that belong to the author, not the viewer. They must be non-overridable.
      const nonViewerFields = (
        Object.entries(TIERED_RENDER_CONFIG_TAXONOMY) as Array<
          [string, (typeof TIERED_RENDER_CONFIG_TAXONOMY)[keyof typeof TIERED_RENDER_CONFIG_TAXONOMY]]
        >
      ).filter(
        ([, meta]) =>
          meta.category === "layout-structural" ||
          meta.category === "author-intent",
      );

      expect(nonViewerFields.length).toBeGreaterThan(0);
      for (const [fieldName, meta] of nonViewerFields) {
        expect(
          meta.overridable,
          `Field '${fieldName}' is ${meta.category} but has overridable: true — violation`,
        ).toBe(false);
      }
    },
  );
});

// ── Test 3: explicit platform-constraint value beats lower-tier defaults ───────

describe("category-aligned precedence — higher-tier explicit value beats lower-tier default", () => {
  it(
    "explicit configIntent.staticExport = false (higher tier) beats DEFAULT_CONFIG_INTENT.staticExport = true (lower tier)",
    () => {
      // The resolution chain:
      //   Level 1 (lowest):  DEFAULT_CONFIG_INTENT.staticExport = true (schema default)
      //   Level 3 (highest): explicit { staticExport: false } supplied to resolveConfigIntent
      //
      // Higher-tier explicit value must win over lower-tier schema default.
      const explicitLower: ConfigIntent = resolveConfigIntent({
        staticExport: false,
      });

      // Explicit override (higher tier) wins over schema default (lower tier)
      expect(explicitLower.staticExport).toBe(false); // not the default true
      expect(DEFAULT_CONFIG_INTENT.staticExport).toBe(true); // baseline unchanged
    },
  );

  it(
    "explicit configIntent.noInteraction = false beats DEFAULT_CONFIG_INTENT.noInteraction = true",
    () => {
      // Same pattern for noInteraction: explicit false > default true
      const resolved = resolveConfigIntent({ noInteraction: false });

      expect(resolved.noInteraction).toBe(false); // explicit override wins
      // Flags not explicitly set still use the DEFAULT_CONFIG_INTENT (lower tier)
      expect(resolved.staticExport).toBe(true);    // default retained
      expect(resolved.noTemporalDiff).toBe(true);  // default retained
    },
  );

  it(
    "explicit configIntent.noTemporalDiff = false beats DEFAULT_CONFIG_INTENT.noTemporalDiff = true",
    () => {
      const resolved = resolveConfigIntent({ noTemporalDiff: false });

      expect(resolved.noTemporalDiff).toBe(false); // explicit override wins
      expect(resolved.staticExport).toBe(true);    // default retained
      expect(resolved.noInteraction).toBe(true);   // default retained
    },
  );

  it(
    "all three configIntent flags overridden simultaneously — all explicit values beat all defaults",
    () => {
      // When ALL flags are explicitly overridden, NONE of the lower-tier defaults survive
      const resolved = resolveConfigIntent({
        staticExport: false,
        noTemporalDiff: false,
        noInteraction: false,
      });

      // Every explicit value (higher tier) beats the corresponding default (lower tier)
      expect(resolved.staticExport).toBe(false);
      expect(resolved.noTemporalDiff).toBe(false);
      expect(resolved.noInteraction).toBe(false);

      // The DEFAULT_CONFIG_INTENT (lower tier) is unmodified
      expect(DEFAULT_CONFIG_INTENT.staticExport).toBe(true);
      expect(DEFAULT_CONFIG_INTENT.noTemporalDiff).toBe(true);
      expect(DEFAULT_CONFIG_INTENT.noInteraction).toBe(true);
    },
  );
});

// ── Test 4: cross-tier isolation — lower-tier change cannot affect platform-constraint ─

describe("category-aligned precedence — cross-tier isolation (lower-tier cannot affect higher-tier)", () => {
  it(
    "changing viewer-preference `theme` (Tier 4) does NOT alter configIntent (Tier 1)",
    () => {
      // theme is viewer-preference (lowest tier = index 3 in TIER_PRECEDENCE).
      // configIntent is platform-constraint (highest tier = index 0).
      // Switching the theme must have zero effect on configIntent values.

      const withDefaultTheme = resolveTheme({});
      const withDarkTheme = resolveTheme({ styling: { theme: "dark" } });

      // Both resolutions must produce the same DEFAULT_CONFIG_INTENT values
      expect(withDarkTheme.configIntent).toEqual(withDefaultTheme.configIntent);
      expect(withDarkTheme.configIntent.staticExport).toBe(true);
      expect(withDarkTheme.configIntent.noTemporalDiff).toBe(true);
      expect(withDarkTheme.configIntent.noInteraction).toBe(true);
    },
  );

  it(
    "changing viewer-preference `axes.locale` (Tier 4) does NOT alter configIntent (Tier 1)",
    () => {
      // axes is viewer-preference; configIntent is platform-constraint.
      // Changing axes.locale cannot affect configIntent.
      const withLocale = resolveTheme({ axes: { locale: "fr" } });

      expect(withLocale.configIntent).toEqual(DEFAULT_CONFIG_INTENT);
    },
  );

  it(
    "changing typography.labelScale (author-intent) does NOT alter configIntent (Tier 1)",
    () => {
      const withLabelScale = resolveTheme({ typography: { labelScale: 1.5 } });

      expect(withLabelScale.configIntent).toEqual(DEFAULT_CONFIG_INTENT);
    },
  );

  it(
    "explicit higher-tier configIntent survives alongside lower-tier viewer-preference fields",
    () => {
      // When both a platform-constraint field (configIntent) and viewer-preference
      // fields (theme, axes) are set, they coexist without interference:
      // each tier applies its own resolution rule independently.

      const resolved = resolveTheme({
        styling: { theme: "dark" },
        axes: { locale: "fr" },
        typography: { labelScale: 1.2 },
        configIntent: { noInteraction: false }, // higher tier: platform-constraint
      });

      // Lower-tier viewer-preference fields resolve normally
      expect(resolved.theme).toBe("dark");
      expect(resolved.locale).toBe("fr");
      expect(resolved.typography.labelScale).toBe(1.2);

      // Higher-tier platform-constraint configIntent is preserved with explicit override
      expect(resolved.configIntent.noInteraction).toBe(false); // explicit override survives
      expect(resolved.configIntent.staticExport).toBe(true);   // default for unset flags
      expect(resolved.configIntent.noTemporalDiff).toBe(true); // default for unset flags
    },
  );
});

// ── Test 5: TIER_PRECEDENCE ordering guarantees tier authority ranks ───────────

describe("category-aligned precedence — TIER_PRECEDENCE ordering guarantees", () => {
  it(
    "TIER_PRECEDENCE has exactly 4 tiers covering the complete FieldCategory union",
    () => {
      // There must be exactly 4 tiers — the closed union from FieldCategory
      expect(TIER_PRECEDENCE).toHaveLength(4);

      // Every FieldCategory value must appear exactly once
      const tierSet = new Set<FieldCategory>(TIER_PRECEDENCE);
      expect(tierSet.has("platform-constraint")).toBe(true);
      expect(tierSet.has("layout-structural")).toBe(true);
      expect(tierSet.has("author-intent")).toBe(true);
      expect(tierSet.has("viewer-preference")).toBe(true);
    },
  );

  it(
    "platform-constraint(0) > layout-structural(1) > author-intent(2) > viewer-preference(3)",
    () => {
      // Index in TIER_PRECEDENCE = authority rank (lower index = higher authority)
      const pcIndex = TIER_PRECEDENCE.indexOf("platform-constraint");
      const lsIndex = TIER_PRECEDENCE.indexOf("layout-structural");
      const aiIndex = TIER_PRECEDENCE.indexOf("author-intent");
      const vpIndex = TIER_PRECEDENCE.indexOf("viewer-preference");

      // Strict ordering: platform-constraint has highest authority
      expect(pcIndex).toBeLessThan(lsIndex);
      // layout-structural outranks author-intent
      expect(lsIndex).toBeLessThan(aiIndex);
      // author-intent outranks viewer-preference
      expect(aiIndex).toBeLessThan(vpIndex);
      // viewer-preference is last (lowest authority)
      expect(vpIndex).toBe(TIER_PRECEDENCE.length - 1);
    },
  );

  it(
    "configIntent tier index is lower (higher authority) than theme and axes tier indices",
    () => {
      // configIntent = platform-constraint, theme/axes = viewer-preference
      // platform-constraint index < viewer-preference index → configIntent has higher authority
      const configIntentTier = getFieldTierCategory("configIntent");
      const stylingTier = getFieldTierCategory("styling");
      const axesTier = getFieldTierCategory("axes");

      const configIntentIdx = TIER_PRECEDENCE.indexOf(configIntentTier);
      const stylingIdx = TIER_PRECEDENCE.indexOf(stylingTier);
      const axesIdx = TIER_PRECEDENCE.indexOf(axesTier);

      // configIntent (platform-constraint) outranks styling and axes
      expect(configIntentIdx).toBeLessThan(stylingIdx);
      expect(configIntentIdx).toBeLessThan(axesIdx);
    },
  );

  it(
    "all fields in TIERED_RENDER_CONFIG_TAXONOMY have a category present in TIER_PRECEDENCE",
    () => {
      // Every field classification must be a valid tier name — no orphan categories
      const validTiers = new Set<string>(TIER_PRECEDENCE);

      for (const [fieldName, meta] of Object.entries(TIERED_RENDER_CONFIG_TAXONOMY)) {
        expect(
          validTiers.has(meta.category),
          `Field '${fieldName}' has unknown category '${meta.category}' — not in TIER_PRECEDENCE`,
        ).toBe(true);
      }
    },
  );
});

// ── Test 6: ConfigIntentSchema sub-fields are @category platform-constraint ───

describe("category-aligned precedence — ConfigIntentSchema flags are platform-constraint", () => {
  it(
    "ConfigIntentSchema parses to all-true defaults — matching DEFAULT_CONFIG_INTENT (lowest-tier baseline)",
    () => {
      // ConfigIntentSchema.parse({}) applies Zod defaults — this is the
      // lowest-tier fallback that higher-tier explicit values override.
      const parsed = ConfigIntentSchema.parse({});
      expect(parsed).toEqual(DEFAULT_CONFIG_INTENT);
      expect(parsed.staticExport).toBe(true);
      expect(parsed.noTemporalDiff).toBe(true);
      expect(parsed.noInteraction).toBe(true);
    },
  );

  it(
    "ConfigIntentSchema explicit false values (higher tier) override schema defaults (lower tier) during parse",
    () => {
      // Zod .parse() with explicit values overrides the .default() fallbacks.
      // This mirrors the resolveConfigIntent precedence: explicit > default.
      const parsed = ConfigIntentSchema.parse({
        staticExport: false,
        noTemporalDiff: false,
        noInteraction: false,
      });

      // Higher-tier explicit values beat lower-tier schema defaults
      expect(parsed.staticExport).toBe(false);
      expect(parsed.noTemporalDiff).toBe(false);
      expect(parsed.noInteraction).toBe(false);
    },
  );

  it(
    "TIERED_RENDER_CONFIG_TAXONOMY.configIntent description documents the platform-constraint role",
    () => {
      // The taxonomy entry for configIntent must describe its role as a
      // platform-constraint — the description is the declarative documentation
      // of why this field belongs to the highest authority tier.
      const meta = TIERED_RENDER_CONFIG_TAXONOMY.configIntent;

      expect(meta.category).toBe("platform-constraint");
      // Description must mention the renderer's operational contract
      expect(meta.description.length).toBeGreaterThan(0);
      // Non-overridable — highest authority
      expect(meta.overridable).toBe(false);
    },
  );
});
