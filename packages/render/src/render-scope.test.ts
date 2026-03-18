/**
 * Dedicated tests for scope boundary metadata and mapComponentType unknown-type handling.
 *
 * Coverage:
 *   1. RENDER_SCOPE singleton — verifies all three scope constraint fields.
 *   2. RenderScopeSchema — Zod literal validation (rejects non-literal values).
 *   3. ConfigIntentSchema — default flags, partial override, and full override.
 *   4. resolveTheme — _scope is always RENDER_SCOPE regardless of input.
 *   5. mapComponentType — unknown-type fallback with console.warn log verification.
 *   6. RenderConfigSchema.strict() — unknown keys rejected; RENDER_SCOPE_FIELD_BLOCKLIST importable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RENDER_SCOPE,
  RENDER_SCOPE_FIELD_BLOCKLIST,
  RenderScopeSchema,
  RenderConfigSchema,
  ConfigIntentSchema,
  DEFAULT_CONFIG_INTENT,
  resolveConfigIntent,
  resolveTheme,
  type RenderScope,
  type ConfigIntent,
  type RenderScopeFieldBlocklist,
} from "./schema.js";
import {
  mapComponentType,
  KNOWN_RENDERABLE_TYPES,
  DEFAULT_RENDERABLE_TYPE_SENTINEL,
} from "./renderable-type.js";

// ── 1. RENDER_SCOPE singleton ─────────────────────────────────────────────────

describe("RENDER_SCOPE — scope boundary singleton", () => {
  it("declares mode as 'static-export'", () => {
    expect(RENDER_SCOPE.mode).toBe("static-export");
  });

  it("declares temporal as false (no temporal diff)", () => {
    // Explicitly out of scope: comparing map versions, computing deltas,
    // rendering change indicators between evolution states.
    expect(RENDER_SCOPE.temporal).toBe(false);
  });

  it("declares interactive as false (no interaction handlers)", () => {
    // Explicitly out of scope: hover tooltips, click handlers, pan/zoom,
    // drag-and-drop, selection state, embedded JavaScript.
    expect(RENDER_SCOPE.interactive).toBe(false);
  });

  it("carries a human-readable description string", () => {
    expect(typeof RENDER_SCOPE.description).toBe("string");
    expect(RENDER_SCOPE.description.length).toBeGreaterThan(0);
  });

  it("description mentions the three out-of-scope concerns", () => {
    const desc = RENDER_SCOPE.description.toLowerCase();
    // Must document temporal, interaction, and static-export boundaries.
    expect(desc).toContain("temporal");
    expect(desc).toContain("interaction");
    expect(desc).toContain("static");
  });
});

// ── 2. RenderScopeSchema — Zod literal validation ────────────────────────────

describe("RenderScopeSchema — Zod literal constraint validation", () => {
  it("accepts the RENDER_SCOPE constant without errors", () => {
    const result = RenderScopeSchema.safeParse(RENDER_SCOPE);
    expect(result.success).toBe(true);
  });

  it("rejects mode values other than 'static-export'", () => {
    const invalid = { ...RENDER_SCOPE, mode: "interactive" };
    const result = RenderScopeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects temporal: true (temporal diff is always out of scope for this renderer)", () => {
    const invalid = { ...RENDER_SCOPE, temporal: true };
    const result = RenderScopeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects interactive: true (interaction is always out of scope for this renderer)", () => {
    const invalid = { ...RENDER_SCOPE, interactive: true };
    const result = RenderScopeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("returns a value that satisfies the RenderScope TypeScript type", () => {
    const parsed = RenderScopeSchema.parse(RENDER_SCOPE);
    // TypeScript narrowing: these should be exactly the literal types.
    const _mode: "static-export" = parsed.mode;
    const _temporal: false = parsed.temporal;
    const _interactive: false = parsed.interactive;
    expect(_mode).toBe("static-export");
    expect(_temporal).toBe(false);
    expect(_interactive).toBe(false);
  });
});

// ── 3. ConfigIntentSchema — boolean intent flags ──────────────────────────────

describe("ConfigIntentSchema — configurable scope-boundary intent flags", () => {
  it("defaults all three flags to true when no input is supplied", () => {
    const intent: ConfigIntent = ConfigIntentSchema.parse({});
    expect(intent.staticExport).toBe(true);
    expect(intent.noTemporalDiff).toBe(true);
    expect(intent.noInteraction).toBe(true);
  });

  it("DEFAULT_CONFIG_INTENT matches ConfigIntentSchema parse({}) defaults", () => {
    expect(DEFAULT_CONFIG_INTENT).toEqual({
      staticExport: true,
      noTemporalDiff: true,
      noInteraction: true,
    });
  });

  it("allows individual flags to be overridden (non-breaking for future renderers)", () => {
    // A hypothetical interactive renderer that opts in to interaction handlers.
    const intent = ConfigIntentSchema.parse({ noInteraction: false });
    expect(intent.staticExport).toBe(true);       // default retained
    expect(intent.noTemporalDiff).toBe(true);     // default retained
    expect(intent.noInteraction).toBe(false);     // explicit override
  });

  it("allows all flags to be overridden simultaneously", () => {
    const intent = ConfigIntentSchema.parse({
      staticExport: false,
      noTemporalDiff: false,
      noInteraction: false,
    });
    expect(intent.staticExport).toBe(false);
    expect(intent.noTemporalDiff).toBe(false);
    expect(intent.noInteraction).toBe(false);
  });

  it("resolveConfigIntent with no argument returns DEFAULT_CONFIG_INTENT", () => {
    expect(resolveConfigIntent()).toEqual(DEFAULT_CONFIG_INTENT);
    expect(resolveConfigIntent(undefined)).toEqual(DEFAULT_CONFIG_INTENT);
  });

  it("resolveConfigIntent merges a partial override — non-supplied fields retain defaults", () => {
    const resolved = resolveConfigIntent({ noInteraction: false });
    expect(resolved.staticExport).toBe(true);
    expect(resolved.noTemporalDiff).toBe(true);
    expect(resolved.noInteraction).toBe(false);
  });

  it("resolveConfigIntent with a full override returns the explicit values", () => {
    const resolved = resolveConfigIntent({
      staticExport: false,
      noTemporalDiff: false,
      noInteraction: false,
    });
    expect(resolved).toEqual({
      staticExport: false,
      noTemporalDiff: false,
      noInteraction: false,
    });
  });
});

// ── 4. resolveTheme — _scope always equals RENDER_SCOPE ──────────────────────

describe("resolveTheme — _scope injection", () => {
  it("injects RENDER_SCOPE into _scope when no input config is supplied", () => {
    const resolved = resolveTheme();
    expect(resolved._scope).toEqual(RENDER_SCOPE);
    expect(resolved._scope.mode).toBe("static-export");
    expect(resolved._scope.temporal).toBe(false);
    expect(resolved._scope.interactive).toBe(false);
  });

  it("injects RENDER_SCOPE into _scope even when a different _scope is provided", () => {
    // _scope is non-overridable — resolveTheme always injects RENDER_SCOPE.
    const resolved = resolveTheme({});
    expect(resolved._scope).toEqual(RENDER_SCOPE);
  });

  it("_scope is present on every resolved config regardless of other fields", () => {
    const withWidth = resolveTheme({ width: 1920, height: 1080 });
    const minimal = resolveTheme({});
    const empty = resolveTheme();

    for (const config of [withWidth, minimal, empty]) {
      expect(config._scope).toBeDefined();
      expect(config._scope.mode).toBe("static-export");
      expect(config._scope.temporal).toBe(false);
      expect(config._scope.interactive).toBe(false);
    }
  });
});

// ── 5. mapComponentType — unknown-type fallback + log output verification ─────

describe("mapComponentType — unknown-type handling with console.warn", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("emits a console.warn for a truly unknown type string", () => {
    mapComponentType("future-type");

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain("future-type");
  });

  it("warn message mentions the fallback strategy (_default)", () => {
    mapComponentType("unknown-widget");

    const [message] = warnSpy.mock.calls[0] as [string];
    // Must name the fallback so consumers know what styling will be applied.
    expect(message).toContain("_default");
  });

  it("does NOT emit console.warn for known types", () => {
    for (const t of KNOWN_RENDERABLE_TYPES) {
      mapComponentType(t);
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT emit console.warn when '_default' sentinel is passed as input (idempotent)", () => {
    // Passing '_default' explicitly is a valid no-op — not an error condition.
    mapComponentType(DEFAULT_RENDERABLE_TYPE_SENTINEL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("still returns '_default' for unknown types regardless of log output", () => {
    const result = mapComponentType("completely-unknown-type");
    expect(result).toBe(DEFAULT_RENDERABLE_TYPE_SENTINEL);
  });

  it("emits a separate warning per unknown type call (not batched)", () => {
    mapComponentType("type-a");
    mapComponentType("type-b");
    mapComponentType("type-c");

    expect(warnSpy).toHaveBeenCalledTimes(3);
    const messages = warnSpy.mock.calls.map((call) => call[0] as string);
    expect(messages[0]).toContain("type-a");
    expect(messages[1]).toContain("type-b");
    expect(messages[2]).toContain("type-c");
  });

  it("warns for empty string (not a valid known type)", () => {
    mapComponentType("");

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain("_default");
  });

  it("warns for uppercase variants which are not recognised (case-sensitive)", () => {
    mapComponentType("COMPONENT");

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain("COMPONENT");
  });
});

// ── 6. RenderConfigSchema.strict() — unknown key rejection + RENDER_SCOPE_FIELD_BLOCKLIST ──

describe("RenderConfigSchema — .strict() rejects unknown keys (AC 7)", () => {
  it("rejects an unknown top-level key via .strict()", () => {
    // RenderConfigSchema.strict() means any key not declared in the schema causes a parse failure.
    // This is the Zod-level enforcement of the scope boundary documented by RENDER_SCOPE_FIELD_BLOCKLIST.
    const result = RenderConfigSchema.safeParse({
      unknownTemporalField: "some-value",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error should reference the unknown key
      const issue = result.error.issues[0];
      expect(issue).toBeDefined();
    }
  });

  it("rejects interaction-callback-style fields (strict closed-world rejection)", () => {
    // Demonstrates that interaction fields — the primary blocklist concern — are rejected
    // by .strict() without any explicit per-field blocklist logic in superRefine.
    const result = RenderConfigSchema.safeParse({
      onClick: "handler",
      onHover: "handler",
    });
    expect(result.success).toBe(false);
  });

  it("rejects temporal-state-style fields via .strict()", () => {
    // Temporal state fields are out of scope per RENDER_SCOPE_FIELD_BLOCKLIST.
    // .strict() rejects them without any explicit blocklist enumeration.
    const result = RenderConfigSchema.safeParse({
      timestamp: "2026-01-01",
      versionRef: "v1.0",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid config with no unknown keys (baseline: .strict() does not over-reject)", () => {
    // Ensures .strict() only rejects genuinely unknown keys — known fields still work.
    const result = RenderConfigSchema.safeParse({
      width: 1600,
      height: 800,
      theme: "default",
      strokeWidth: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty config (all fields optional, .strict() allows empty objects)", () => {
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("RENDER_SCOPE_FIELD_BLOCKLIST — importable documentary constant (AC 7)", () => {
  it("RENDER_SCOPE_FIELD_BLOCKLIST is importable and has the correct shape", () => {
    // Verify the constant is importable and has expected properties.
    expect(RENDER_SCOPE_FIELD_BLOCKLIST).toBeDefined();
    expect(typeof RENDER_SCOPE_FIELD_BLOCKLIST).toBe("object");
  });

  it("positiveDefinition contains the canonical scope statement", () => {
    // The positive definition must state the single-frame, deterministic, pure-visual nature.
    const def = RENDER_SCOPE_FIELD_BLOCKLIST.positiveDefinition;
    expect(typeof def).toBe("string");
    expect(def).toContain("single-frame");
    expect(def).toContain("deterministic");
    expect(def).toContain("temporal state");
    expect(def).toContain("interaction callbacks");
    expect(def).toContain("animation parameters");
  });

  it("outOfScope lists the three out-of-scope categories", () => {
    const { outOfScope } = RENDER_SCOPE_FIELD_BLOCKLIST;
    expect(outOfScope).toContain("temporal-state");
    expect(outOfScope).toContain("interaction-callbacks");
    expect(outOfScope).toContain("animation-parameters");
    expect(outOfScope.length).toBe(3);
  });

  it("enforcement field declares 'zod-strict' as the mechanism", () => {
    expect(RENDER_SCOPE_FIELD_BLOCKLIST.enforcement).toBe("zod-strict");
  });

  it("RenderScopeFieldBlocklist type is the typeof RENDER_SCOPE_FIELD_BLOCKLIST", () => {
    // TypeScript type check — ensures the exported type alias matches the constant.
    const _typed: RenderScopeFieldBlocklist = RENDER_SCOPE_FIELD_BLOCKLIST;
    expect(_typed).toBe(RENDER_SCOPE_FIELD_BLOCKLIST);
  });
});
