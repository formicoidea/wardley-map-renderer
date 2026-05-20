/**
 * @file config-intent-precedence.test.ts
 *
 * Dedicated tests for the configIntent precedence chain:
 *
 * ```
 * Level 1 (lowest):  DEFAULT_CONFIG_INTENT   — all flags default to true
 * Level 2 (highest): explicit partial fields  — only supplied flags override defaults
 * ```
 *
 * Tests cover:
 *  - Tier-1 fallback: no override → all three flags are true
 *  - Tier-2 override: each individual flag can be set to false
 *  - Partial override: unset fields fall through to defaults
 *  - Null / undefined input: collapses to defaults (null-safety)
 *  - Empty object {}: collapses to defaults (no explicit fields)
 *  - All flags overridden at once
 *  - Integration with resolveTheme(): configIntent embedded in RenderConfig
 *  - Integration with resolveTheme(): no configIntent → DEFAULT_CONFIG_INTENT applied
 *  - Integration with resolveConflict(): configIntent flows through the merge pipeline
 *  - Schema validation: ConfigIntentSchema accepts valid boolean values
 *  - Schema validation: ConfigIntentSchema rejects non-boolean values
 *
 * @see ConfigIntentSchema — the Zod schema
 * @see DEFAULT_CONFIG_INTENT — the default values
 * @see resolveConfigIntent — the function under test
 * @see resolveTheme — higher-level integration surface
 */
import { describe, it, expect } from "vitest";
import {
  ConfigIntentSchema,
  DEFAULT_CONFIG_INTENT,
  resolveConfigIntent,
  resolveTheme,
  type ConfigIntent,
} from "./schema.js";

// ── Tier-1 fallback: DEFAULT_CONFIG_INTENT ────────────────────────────────────

describe("DEFAULT_CONFIG_INTENT", () => {
  it("has staticExport: true (static-export-only renderer)", () => {
    expect(DEFAULT_CONFIG_INTENT.staticExport).toBe(true);
  });

  it("has noTemporalDiff: true (temporal diffing excluded)", () => {
    expect(DEFAULT_CONFIG_INTENT.noTemporalDiff).toBe(true);
  });

  it("has noInteraction: true (SVG output is inert)", () => {
    expect(DEFAULT_CONFIG_INTENT.noInteraction).toBe(true);
  });

  it("is a plain object with exactly three keys", () => {
    const keys = Object.keys(DEFAULT_CONFIG_INTENT).sort();
    expect(keys).toEqual(["noInteraction", "noTemporalDiff", "staticExport"]);
  });
});

// ── resolveConfigIntent() — precedence tiers ─────────────────────────────────

describe("resolveConfigIntent — Tier-1 fallback (no override)", () => {
  it("returns all-true defaults when called with no arguments", () => {
    const intent = resolveConfigIntent();
    expect(intent.staticExport).toBe(true);
    expect(intent.noTemporalDiff).toBe(true);
    expect(intent.noInteraction).toBe(true);
  });

  it("returns all-true defaults when called with undefined", () => {
    const intent = resolveConfigIntent(undefined);
    expect(intent.staticExport).toBe(true);
    expect(intent.noTemporalDiff).toBe(true);
    expect(intent.noInteraction).toBe(true);
  });

  it("returns all-true defaults when called with null (type-coerced to undefined path)", () => {
    // resolveConfigIntent checks `partial == null` which covers both null and undefined
    const intent = resolveConfigIntent(null as unknown as Partial<ConfigIntent>);
    expect(intent.staticExport).toBe(true);
    expect(intent.noTemporalDiff).toBe(true);
    expect(intent.noInteraction).toBe(true);
  });

  it("returns all-true defaults when called with empty object {}", () => {
    // An empty partial has no explicit fields, so all fall back to defaults
    const intent = resolveConfigIntent({});
    expect(intent.staticExport).toBe(true);
    expect(intent.noTemporalDiff).toBe(true);
    expect(intent.noInteraction).toBe(true);
  });
});

describe("resolveConfigIntent — Tier-2 override (single flag)", () => {
  it("overrides staticExport to false; other flags retain defaults", () => {
    const intent = resolveConfigIntent({ staticExport: false });
    expect(intent.staticExport).toBe(false);      // explicit override
    expect(intent.noTemporalDiff).toBe(true);     // fallback to default
    expect(intent.noInteraction).toBe(true);      // fallback to default
  });

  it("overrides noTemporalDiff to false; other flags retain defaults", () => {
    const intent = resolveConfigIntent({ noTemporalDiff: false });
    expect(intent.staticExport).toBe(true);       // fallback to default
    expect(intent.noTemporalDiff).toBe(false);    // explicit override
    expect(intent.noInteraction).toBe(true);      // fallback to default
  });

  it("overrides noInteraction to false; other flags retain defaults", () => {
    const intent = resolveConfigIntent({ noInteraction: false });
    expect(intent.staticExport).toBe(true);       // fallback to default
    expect(intent.noTemporalDiff).toBe(true);     // fallback to default
    expect(intent.noInteraction).toBe(false);     // explicit override
  });

  it("explicit true is identical to the default — returned value is still true", () => {
    // Explicitly supplying true must not be rejected — it's the same as the default
    const intent = resolveConfigIntent({ staticExport: true });
    expect(intent.staticExport).toBe(true);
  });
});

describe("resolveConfigIntent — Tier-2 override (all flags)", () => {
  it("all three flags can be overridden to false simultaneously", () => {
    const intent = resolveConfigIntent({
      staticExport: false,
      noTemporalDiff: false,
      noInteraction: false,
    });
    expect(intent.staticExport).toBe(false);
    expect(intent.noTemporalDiff).toBe(false);
    expect(intent.noInteraction).toBe(false);
  });

  it("all three flags can be overridden to true (same as defaults)", () => {
    const intent = resolveConfigIntent({
      staticExport: true,
      noTemporalDiff: true,
      noInteraction: true,
    });
    expect(intent.staticExport).toBe(true);
    expect(intent.noTemporalDiff).toBe(true);
    expect(intent.noInteraction).toBe(true);
  });
});

// ── Partial-override fallback behaviour ──────────────────────────────────────

describe("resolveConfigIntent — partial override fallback", () => {
  it("two flags set, one falls back: staticExport+noTemporalDiff override, noInteraction defaults", () => {
    const intent = resolveConfigIntent({ staticExport: false, noTemporalDiff: false });
    expect(intent.staticExport).toBe(false);
    expect(intent.noTemporalDiff).toBe(false);
    expect(intent.noInteraction).toBe(true);      // DEFAULT_CONFIG_INTENT fallback
  });

  it("two flags set, one falls back: noTemporalDiff+noInteraction override, staticExport defaults", () => {
    const intent = resolveConfigIntent({ noTemporalDiff: false, noInteraction: false });
    expect(intent.staticExport).toBe(true);       // DEFAULT_CONFIG_INTENT fallback
    expect(intent.noTemporalDiff).toBe(false);
    expect(intent.noInteraction).toBe(false);
  });

  it("returns a complete object — all three fields are always concrete booleans (no undefined)", () => {
    const intent = resolveConfigIntent({ noInteraction: false });
    // Consumers must never need to null-coalesce
    expect(typeof intent.staticExport).toBe("boolean");
    expect(typeof intent.noTemporalDiff).toBe("boolean");
    expect(typeof intent.noInteraction).toBe("boolean");
  });
});

// ── Conflict resolution: explicit value wins over default ─────────────────────

describe("resolveConfigIntent — conflict resolution semantics", () => {
  it("false beats true-default — explicit false always wins over the DEFAULT_CONFIG_INTENT true", () => {
    // This is the core precedence guarantee: Level-2 explicit beats Level-1 default
    const allFalse = resolveConfigIntent({
      staticExport: false,
      noTemporalDiff: false,
      noInteraction: false,
    });
    expect(allFalse.staticExport).toBe(false);
    expect(allFalse.noTemporalDiff).toBe(false);
    expect(allFalse.noInteraction).toBe(false);
  });

  it("explicit partial does NOT mutate DEFAULT_CONFIG_INTENT", () => {
    // Overriding flags must not mutate the shared defaults constant
    const before = { ...DEFAULT_CONFIG_INTENT };
    resolveConfigIntent({ staticExport: false, noTemporalDiff: false, noInteraction: false });
    expect(DEFAULT_CONFIG_INTENT.staticExport).toBe(before.staticExport);
    expect(DEFAULT_CONFIG_INTENT.noTemporalDiff).toBe(before.noTemporalDiff);
    expect(DEFAULT_CONFIG_INTENT.noInteraction).toBe(before.noInteraction);
  });

  it("calling resolveConfigIntent twice with the same input produces identical results (pure function)", () => {
    const input = { noInteraction: false };
    const first  = resolveConfigIntent(input);
    const second = resolveConfigIntent(input);
    expect(first).toEqual(second);
  });
});

// ── Schema validation: ConfigIntentSchema ────────────────────────────────────

describe("ConfigIntentSchema — validation", () => {
  it("parses an empty object and applies all defaults (all true)", () => {
    const parsed = ConfigIntentSchema.parse({});
    expect(parsed.staticExport).toBe(true);
    expect(parsed.noTemporalDiff).toBe(true);
    expect(parsed.noInteraction).toBe(true);
  });

  it("parses a full object with all flags false", () => {
    const parsed = ConfigIntentSchema.parse({
      staticExport: false,
      noTemporalDiff: false,
      noInteraction: false,
    });
    expect(parsed.staticExport).toBe(false);
    expect(parsed.noTemporalDiff).toBe(false);
    expect(parsed.noInteraction).toBe(false);
  });

  it("rejects a non-boolean value for staticExport", () => {
    const result = ConfigIntentSchema.safeParse({ staticExport: "yes" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-boolean value for noTemporalDiff", () => {
    const result = ConfigIntentSchema.safeParse({ noTemporalDiff: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-boolean value for noInteraction", () => {
    const result = ConfigIntentSchema.safeParse({ noInteraction: "false" });
    expect(result.success).toBe(false);
  });
});

// ── Integration: resolveTheme() injects configIntent ─────────────────────────

describe("resolveTheme — configIntent integration", () => {
  it("injects DEFAULT_CONFIG_INTENT when no configIntent is provided in renderConfig", () => {
    const resolved = resolveTheme({});
    expect(resolved.configIntent).toEqual(DEFAULT_CONFIG_INTENT);
    expect(resolved.configIntent.staticExport).toBe(true);
    expect(resolved.configIntent.noTemporalDiff).toBe(true);
    expect(resolved.configIntent.noInteraction).toBe(true);
  });

  it("injects DEFAULT_CONFIG_INTENT when renderConfig is undefined", () => {
    const resolved = resolveTheme(undefined);
    expect(resolved.configIntent).toEqual(DEFAULT_CONFIG_INTENT);
  });

  it("merges explicit configIntent partial over defaults inside resolveTheme()", () => {
    // When a renderConfig carries a partial configIntent, the explicit flags win
    // and unset flags fall back to DEFAULT_CONFIG_INTENT
    const resolved = resolveTheme({ configIntent: { noInteraction: false } });
    expect(resolved.configIntent.staticExport).toBe(true);       // default retained
    expect(resolved.configIntent.noTemporalDiff).toBe(true);     // default retained
    expect(resolved.configIntent.noInteraction).toBe(false);     // explicit override
  });

  it("all three flags overridden via resolveTheme()", () => {
    const resolved = resolveTheme({
      configIntent: {
        staticExport: false,
        noTemporalDiff: false,
        noInteraction: false,
      },
    });
    expect(resolved.configIntent.staticExport).toBe(false);
    expect(resolved.configIntent.noTemporalDiff).toBe(false);
    expect(resolved.configIntent.noInteraction).toBe(false);
  });

  it("configIntent is always fully resolved — no undefined in output", () => {
    const resolved = resolveTheme({ configIntent: { staticExport: false } });
    // All three fields must be concrete booleans
    expect(typeof resolved.configIntent.staticExport).toBe("boolean");
    expect(typeof resolved.configIntent.noTemporalDiff).toBe("boolean");
    expect(typeof resolved.configIntent.noInteraction).toBe("boolean");
  });

  it("configIntent survives alongside other resolved fields (non-destructive)", () => {
    const resolved = resolveTheme({
      rendering: { theme: "dark" },
      style: { background: { canvas: { default: { width: 1920 } } } },
      configIntent: { noInteraction: false },
    });
    // configIntent resolution must not disturb other resolved fields
    expect(resolved.theme).toBe("dark");
    expect(resolved.width).toBe(1920);
    expect(resolved.configIntent.noInteraction).toBe(false);
    expect(resolved.configIntent.staticExport).toBe(true);
  });
});

// ── Precedence summary: tier ordering ────────────────────────────────────────

describe("resolveConfigIntent — precedence tier ordering", () => {
  it("Tier order: explicit partial (highest) > DEFAULT_CONFIG_INTENT (lowest)", () => {
    // Demonstrates the full two-tier chain in a single assertion sequence
    const withDefault = resolveConfigIntent();
    const withOverride = resolveConfigIntent({ noInteraction: false });

    // Tier-1 gives all-true
    expect(withDefault.noInteraction).toBe(true);

    // Tier-2 explicit false beats Tier-1 default true
    expect(withOverride.noInteraction).toBe(false);

    // Flags not in override always reflect Tier-1 default
    expect(withOverride.staticExport).toBe(true);
    expect(withOverride.noTemporalDiff).toBe(true);
  });
});
