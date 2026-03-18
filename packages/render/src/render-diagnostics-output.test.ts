/**
 * @file render-diagnostics-output.test.ts
 *
 * Dedicated tests for the **public RenderDiagnostics output shape** returned by
 * `resolveConfig`.
 *
 * This file tests the PUBLIC API surface only — the `{ config, diagnostics }`
 * return value from `resolveConfig` — as opposed to the internal
 * `ResolveDiagnostics` / `DiagnosticsCollector` infrastructure tested in
 * `resolve-diagnostics.test.ts`.
 *
 * ## What is tested here
 *
 * 1. **RenderDiagnosticsSchema shape** — Zod schema accepts/rejects objects with
 *    the correct three-field structure.
 * 2. **EMPTY_RENDER_DIAGNOSTICS constant** — all three arrays are empty and the
 *    constant satisfies the `RenderDiagnostics` type.
 * 3. **resolveConfig → { config, diagnostics }** — the destructured output
 *    carries a valid `RenderDiagnostics` alongside the resolved `RenderConfig`.
 * 4. **diagnostics.unrecognizedTypes** — populated with string keys for
 *    component types not in KNOWN_RENDERABLE_TYPES (via typeColors catchall).
 * 5. **diagnostics.constraintViolations** — empty array (stub) — constraint
 *    violation messages not yet wired to this field.
 * 6. **diagnostics.warnings** — empty array (stub) — advisory messages not yet
 *    wired to this field.
 *
 * ## Naming convention
 *
 * This file is named `render-diagnostics-output.test.ts` to distinguish it from:
 *   - `resolve-diagnostics.test.ts`  → internal collector infrastructure
 *   - `resolve-config-diagnostics.test.ts` → constraint + Zod integration
 *
 * @module render-diagnostics-output
 */

import { describe, it, expect } from "vitest";
import {
  RenderDiagnosticsSchema,
  EMPTY_RENDER_DIAGNOSTICS,
  type RenderDiagnostics,
} from "./resolve-conflict.js";
import { resolveConfig } from "./resolve-conflict.js";

// ── 1. RenderDiagnosticsSchema — Zod schema shape validation ─────────────────

describe("RenderDiagnosticsSchema — three-field Zod schema", () => {
  it("accepts a fully populated RenderDiagnostics object", () => {
    const result = RenderDiagnosticsSchema.safeParse({
      unrecognizedTypes: ["future-type", "legacy-widget"],
      constraintViolations: ["legend.position.x out of coordinateSpace bounds"],
      warnings: ["i18n: xAxis fell back to English default"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unrecognizedTypes).toHaveLength(2);
      expect(result.data.constraintViolations).toHaveLength(1);
      expect(result.data.warnings).toHaveLength(1);
    }
  });

  it("accepts an all-empty RenderDiagnostics object (baseline / happy-path)", () => {
    const result = RenderDiagnosticsSchema.safeParse({
      unrecognizedTypes: [],
      constraintViolations: [],
      warnings: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unrecognizedTypes).toEqual([]);
      expect(result.data.constraintViolations).toEqual([]);
      expect(result.data.warnings).toEqual([]);
    }
  });

  it("rejects an object missing the 'unrecognizedTypes' field", () => {
    const result = RenderDiagnosticsSchema.safeParse({
      constraintViolations: [],
      warnings: [],
    });
    // The schema requires all three fields to be present arrays
    expect(result.success).toBe(false);
  });

  it("rejects an object where 'constraintViolations' is not an array of strings", () => {
    const result = RenderDiagnosticsSchema.safeParse({
      unrecognizedTypes: [],
      constraintViolations: [42, true],   // numbers/booleans — not strings
      warnings: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an object where 'warnings' is not an array", () => {
    const result = RenderDiagnosticsSchema.safeParse({
      unrecognizedTypes: [],
      constraintViolations: [],
      warnings: "single string — not an array",
    });
    expect(result.success).toBe(false);
  });

  it("RenderDiagnostics TypeScript type is satisfied by the schema-parsed value", () => {
    const parsed: RenderDiagnostics = RenderDiagnosticsSchema.parse({
      unrecognizedTypes: [],
      constraintViolations: [],
      warnings: [],
    });
    // TypeScript type check — all three fields must be string[]
    const _ut: string[] = parsed.unrecognizedTypes;
    const _cv: string[] = parsed.constraintViolations;
    const _w: string[] = parsed.warnings;
    expect(_ut).toEqual([]);
    expect(_cv).toEqual([]);
    expect(_w).toEqual([]);
  });
});

// ── 2. EMPTY_RENDER_DIAGNOSTICS — the canonical empty constant ────────────────

describe("EMPTY_RENDER_DIAGNOSTICS — canonical empty diagnostics constant", () => {
  it("has all three arrays empty", () => {
    expect(EMPTY_RENDER_DIAGNOSTICS.unrecognizedTypes).toEqual([]);
    expect(EMPTY_RENDER_DIAGNOSTICS.constraintViolations).toEqual([]);
    expect(EMPTY_RENDER_DIAGNOSTICS.warnings).toEqual([]);
  });

  it("satisfies RenderDiagnosticsSchema.parse without error", () => {
    // The constant should always pass its own schema
    expect(() => RenderDiagnosticsSchema.parse(EMPTY_RENDER_DIAGNOSTICS)).not.toThrow();
  });

  it("the typed constant satisfies the RenderDiagnostics TypeScript type", () => {
    // Direct assignment test — verifies the exported constant's type annotation
    const _typed: RenderDiagnostics = EMPTY_RENDER_DIAGNOSTICS;
    expect(_typed).toBe(EMPTY_RENDER_DIAGNOSTICS);
  });
});

// ── 3. resolveConfig → { config, diagnostics } output shape ──────────────────

describe("resolveConfig → { config, diagnostics } output shape", () => {
  it("returns an object with both 'config' and 'diagnostics' properties", () => {
    const result = resolveConfig({}, {});
    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("diagnostics");
  });

  it("diagnostics has all three required arrays", () => {
    const { diagnostics } = resolveConfig({}, {});
    expect(diagnostics).toHaveProperty("unrecognizedTypes");
    expect(diagnostics).toHaveProperty("constraintViolations");
    expect(diagnostics).toHaveProperty("warnings");
    expect(Array.isArray(diagnostics.unrecognizedTypes)).toBe(true);
    expect(Array.isArray(diagnostics.constraintViolations)).toBe(true);
    expect(Array.isArray(diagnostics.warnings)).toBe(true);
  });

  it("diagnostics satisfies RenderDiagnosticsSchema for an empty input config", () => {
    const { diagnostics } = resolveConfig({}, {});
    const validated = RenderDiagnosticsSchema.safeParse(diagnostics);
    expect(validated.success).toBe(true);
  });

  it("diagnostics satisfies RenderDiagnosticsSchema when config has unrecognized typeColors keys", () => {
    // typeColors uses .catchall() — unrecognized key passes Zod but appears in diagnostics
    const { diagnostics } = resolveConfig(
      {},
      { typeColors: { _default: "#374151", "future-type": "#f59e0b" } as never },
    );
    const validated = RenderDiagnosticsSchema.safeParse(diagnostics);
    expect(validated.success).toBe(true);
    if (validated.success) {
      // unrecognized key lands in the string array
      expect(validated.data.unrecognizedTypes).toContain("future-type");
    }
  });
});

// ── 4. diagnostics.unrecognizedTypes — string[] surface ──────────────────────

describe("RenderDiagnostics.unrecognizedTypes — public string[] surface", () => {
  it("is empty when typeColors has only known renderable type keys", () => {
    const { diagnostics } = resolveConfig(
      {},
      {
        typeColors: {
          _default: "#374151",
          component: "#dc2626",
          "user-need": "#3b82f6",
          pipeline: "#22c55e",
          note: "#f59e0b",
          anchor: "#8b5cf6",
        },
      },
    );
    expect(diagnostics.unrecognizedTypes).toHaveLength(0);
  });

  it("contains the unrecognized key string — NOT the full UnrecognizedTypeEntry object", () => {
    // The PUBLIC API returns string[], not the richer DiagnosticsCollector entries
    const { diagnostics } = resolveConfig(
      {},
      { typeColors: { _default: "#000", "mystery-type": "#f00" } as never },
    );
    // Each element is a plain string
    expect(diagnostics.unrecognizedTypes.every((t) => typeof t === "string")).toBe(true);
    // The unrecognized type name is present as a string
    expect(diagnostics.unrecognizedTypes).toContain("mystery-type");
  });

  it("does NOT include '_default' in unrecognizedTypes", () => {
    // '_default' is a sentinel, not a component type — never reported as unrecognized
    const { diagnostics } = resolveConfig(
      {},
      { typeColors: { _default: "#000", "weird-type": "#f00" } as never },
    );
    expect(diagnostics.unrecognizedTypes).not.toContain("_default");
  });

  it("collects multiple unrecognized type names in a single call", () => {
    const { diagnostics } = resolveConfig(
      {},
      {
        typeColors: {
          _default: "#000",
          component: "#f00",       // known
          "stale-type": "#0f0",    // unrecognized
          "legacy-widget": "#00f", // unrecognized
        } as never,
      },
    );
    expect(diagnostics.unrecognizedTypes).toContain("stale-type");
    expect(diagnostics.unrecognizedTypes).toContain("legacy-widget");
    expect(diagnostics.unrecognizedTypes).not.toContain("component");
    expect(diagnostics.unrecognizedTypes.length).toBe(2);
  });
});

// ── 5. diagnostics.constraintViolations — string[] stub ──────────────────────

describe("RenderDiagnostics.constraintViolations — string[] (stub: always empty[])", () => {
  it("is always empty [] in the current implementation (stub)", () => {
    // constraintViolations population is wired through resolveConfig's violationPolicy
    // Currently returns [] unless violationPolicy is wired to populate this array.
    const { diagnostics } = resolveConfig({}, {});
    expect(diagnostics.constraintViolations).toEqual([]);
  });

  it("remains empty [] even when a valid config is provided", () => {
    const { diagnostics } = resolveConfig(
      { theme: "dark" },
      { width: 1600, height: 800, strokeWidth: 2 },
    );
    expect(diagnostics.constraintViolations).toEqual([]);
  });
});

// ── 6. diagnostics.warnings — string[] stub ──────────────────────────────────

describe("RenderDiagnostics.warnings — string[] (stub: always empty[])", () => {
  it("is always empty [] in the current implementation (stub)", () => {
    const { diagnostics } = resolveConfig({}, {});
    expect(diagnostics.warnings).toEqual([]);
  });

  it("remains empty [] for any valid non-empty config input", () => {
    const { diagnostics } = resolveConfig(
      {},
      {
        typeColors: { _default: "#000", component: "#f00" },
        strokeWidth: 1.5,
      },
    );
    expect(diagnostics.warnings).toEqual([]);
  });
});
