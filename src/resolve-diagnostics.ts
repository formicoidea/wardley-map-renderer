/**
 * resolve-diagnostics.ts
 *
 * Runtime diagnostic types and collection for the `resolveConfig` merge pipeline.
 *
 * ## What this module does
 *
 * Formalises the implicit diagnostic surface of `resolveConfig` as first-class,
 * introspectable structures instead of fire-and-forget `console.warn` calls.
 *
 * ### Unrecognized type detection
 *
 * `collectConfigDiagnostics` inspects TypeStyleMap fields in a resolved
 * `RenderConfig` and reports any keys that the current renderer does not
 * recognise as a `KnownRenderableType` or the `_default` sentinel.
 *
 * Fields inspected:
 *  - `typeColors`  — uses `.catchall()` schema, so any string key is Zod-valid
 *                    but the renderer only acts on KNOWN_RENDERABLE_TYPES + `_default`.
 *  - `evolveStyles` — uses a strict schema with EvolveTypeEnum keys; an unrecognized
 *                    key would be rejected by Zod, but pre-parse configs are still
 *                    inspectable.
 *  - `nodeRadii`   — uses a strict schema with KNOWN_RENDERABLE_TYPES keys; same note.
 *
 * ### Diagnostic output contract
 *
 * `resolveConfig` accepts an optional `options.diagnosticsOut` container.
 * When provided, the collected `UnrecognizedTypeEntry[]` is pushed into it
 * **after** the Zod parse step, so only the final merged values are inspected.
 *
 * When `options.diagnosticsOut` is **absent**, `resolveConfig` behaves exactly
 * as before — no console output, no side effects.
 *
 * ### Replacing debug logging
 *
 * Previously, the only signal for unrecognized component types was an ad-hoc
 * `console.warn` string in `mapComponentType` (renderable-type.ts).  That call
 * has been replaced with a structured JSON diagnostic entry so that callers can
 * parse/intercept it consistently.
 *
 * @see resolveConfig (resolve-conflict.ts) — wires in diagnosticsOut
 * @see mapComponentType (renderable-type.ts) — structured diagnostic at data boundary
 * @see ConstraintEvaluationOptions — options bag that includes diagnosticsOut
 *
 * @module resolve-diagnostics
 */

import { KNOWN_RENDERABLE_TYPES } from "./renderable-type.js";

// ── EvolveType keys (from schema) — mirrored here to avoid circular imports ──

/**
 * Valid EvolveType keys for `evolveStyles`, mirrored from `EvolveTypeEnum.options`
 * to avoid a circular import from schema.ts.
 *
 * These are the only named keys the renderer acts on in `evolveStyles`;
 * any other key (besides `_default`) would be unrecognized.
 */
const KNOWN_EVOLVE_TYPE_KEYS: ReadonlySet<string> = new Set<string>([
  "natural",
  "ecosystem",
  "forced",
  "late",
]);

// ── Recognized key sets ────────────────────────────────────────────────────

/**
 * Valid keys for `typeColors` and `nodeRadii` TypeStyleMaps:
 *  - `_default` — the required fallback sentinel
 *  - Every `KnownRenderableType` — first-class renderer vocabulary
 */
const RECOGNIZED_TYPE_STYLE_KEYS: ReadonlySet<string> = new Set<string>([
  "_default",
  ...(KNOWN_RENDERABLE_TYPES as readonly string[]),
]);

/**
 * Valid keys for `evolveStyles` TypeStyleMap:
 *  - `_default` — optional fallback sentinel
 *  - Every EvolveType value — natural, ecosystem, forced, late
 */
const RECOGNIZED_EVOLVE_STYLE_KEYS: ReadonlySet<string> = new Set<string>([
  "_default",
  ...KNOWN_EVOLVE_TYPE_KEYS,
]);

// ── RenderableTypeRecognitionLevel ────────────────────────────────────────

/**
 * Recognition level for a RenderableType key found in a TypeStyleMap.
 *
 * - `"known"`       — the key is in `KNOWN_RENDERABLE_TYPES` or is `"_default"`;
 *                     the renderer has explicit visual handling for it.
 * - `"unrecognized"` — the key is NOT in the recognized set; the renderer will
 *                     use the `_default` fallback, making the key semantically
 *                     inert.  This often indicates a typo or data-schema drift.
 */
export type RenderableTypeRecognitionLevel = "known" | "unrecognized";

// ── UnrecognizedTypeEntry ─────────────────────────────────────────────────

/**
 * A diagnostic entry recording a single TypeStyleMap key that the renderer
 * does not recognise.
 *
 * These entries are populated into `ResolveDiagnostics.unrecognizedTypes` by
 * `collectConfigDiagnostics` and surfaced to callers via
 * `ConstraintEvaluationOptions.diagnosticsOut`.
 *
 * @example
 *   // typeColors: { _default: "#000", "future-type": "#f00" }
 *   // → UnrecognizedTypeEntry { type: "future-type", field: "typeColors", recognitionLevel: "unrecognized" }
 */
export interface UnrecognizedTypeEntry {
  /**
   * The type key string that was not recognized.
   * This key will never be directly matched at render time; only the
   * `_default` fallback applies for this key.
   */
  readonly type: string;
  /**
   * The RenderConfig field where the unrecognized key was found.
   * One of the three TypeStyleMap fields:
   *  - `"typeColors"`  — per-component-type color overrides
   *  - `"evolveStyles"` — per-evolve-type arrow style overrides
   *  - `"nodeRadii"`   — per-component-type node circle radii
   */
  readonly field: "typeColors" | "evolveStyles" | "nodeRadii";
  /** Always `"unrecognized"` — included for discriminated union exhaustiveness. */
  readonly recognitionLevel: "unrecognized";
}

// ── ResolveDiagnostics ────────────────────────────────────────────────────

/**
 * Runtime diagnostics collected by `resolveConfig`.
 *
 * Currently contains only `unrecognizedTypes` — TypeStyleMap keys that the
 * renderer has no explicit visual handling for.  Future Sub-ACs may extend
 * this with additional diagnostic categories.
 *
 * **Immutable**: this is the read-only result type.
 * For the mutable output container passed to `resolveConfig`, use
 * {@link DiagnosticsCollector}.
 *
 * @see collectConfigDiagnostics — produces a ResolveDiagnostics from a config
 * @see EMPTY_RESOLVE_DIAGNOSTICS — zero-diagnostic constant for initialization
 */
export interface ResolveDiagnostics {
  /**
   * TypeStyleMap keys in the resolved config that are not in the renderer's
   * recognized vocabulary (KNOWN_RENDERABLE_TYPES + `_default`).
   *
   * An empty array means all TypeStyleMap keys are recognized.
   * A non-empty array means some keys exist that the renderer will silently
   * ignore (falling back to `_default`), which may indicate a typo or
   * stale config from a previous schema version.
   */
  readonly unrecognizedTypes: readonly UnrecognizedTypeEntry[];
}

// ── EMPTY_RESOLVE_DIAGNOSTICS ─────────────────────────────────────────────

/**
 * Zero-diagnostic constant — a `ResolveDiagnostics` value with no findings.
 *
 * Use this as an initialization value or as the expected result for a
 * fully-recognized config.
 *
 * @example
 *   const diag = collectConfigDiagnostics(config);
 *   if (diag.unrecognizedTypes.length === 0) {
 *     // config is fully recognized — same as EMPTY_RESOLVE_DIAGNOSTICS
 *   }
 */
export const EMPTY_RESOLVE_DIAGNOSTICS: ResolveDiagnostics = Object.freeze({
  unrecognizedTypes: Object.freeze([] as readonly UnrecognizedTypeEntry[]),
});

// ── DiagnosticsCollector ──────────────────────────────────────────────────

/**
 * Mutable container for runtime diagnostics — passed via
 * `ConstraintEvaluationOptions.diagnosticsOut` so `resolveConfig` can write
 * collected findings into it.
 *
 * **Caller responsibility**: create a fresh collector before each `resolveConfig`
 * call, then read it after the call completes.  The collector is populated
 * **in-place** (push semantics), not replaced.
 *
 * @example
 * ```ts
 * import { resolveConfig } from "@wardleyapi/render";
 * import { createDiagnosticsCollector } from "@wardleyapi/render";
 *
 * const collector = createDiagnosticsCollector();
 * const config = resolveConfig(viewer, author, { diagnosticsOut: collector });
 *
 * if (collector.unrecognizedTypes.length > 0) {
 *   console.warn("Config has unrecognized type keys:", collector.unrecognizedTypes);
 * }
 * ```
 *
 * @see createDiagnosticsCollector — factory function
 * @see ConstraintEvaluationOptions.diagnosticsOut — where to pass the collector
 */
export interface DiagnosticsCollector {
  /** Accumulated unrecognized type entries from the most recent `resolveConfig` call. */
  unrecognizedTypes: UnrecognizedTypeEntry[];
}

// ── createDiagnosticsCollector ────────────────────────────────────────────

/**
 * Create a fresh, empty `DiagnosticsCollector`.
 *
 * Pass the returned object to `resolveConfig` via
 * `options.diagnosticsOut`.  After `resolveConfig` returns, read
 * `collector.unrecognizedTypes` to inspect collected diagnostics.
 *
 * @returns A new mutable {@link DiagnosticsCollector} with an empty
 *   `unrecognizedTypes` array.
 *
 * @example
 * ```ts
 * const collector = createDiagnosticsCollector();
 * resolveConfig(viewer, author, { diagnosticsOut: collector });
 * console.log(collector.unrecognizedTypes); // []
 * ```
 */
export function createDiagnosticsCollector(): DiagnosticsCollector {
  return { unrecognizedTypes: [] };
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Collect unrecognized keys from a single TypeStyleMap field.
 * @internal
 */
function collectUnrecognizedFromMap(
  map: Record<string, unknown> | undefined,
  field: UnrecognizedTypeEntry["field"],
  recognizedKeys: ReadonlySet<string>,
): UnrecognizedTypeEntry[] {
  if (!map) return [];
  return Object.keys(map)
    .filter((k) => !recognizedKeys.has(k))
    .map((k) => ({
      type: k,
      field,
      recognitionLevel: "unrecognized" as const,
    }));
}

// ── collectConfigDiagnostics ──────────────────────────────────────────────

/**
 * Inspect TypeStyleMap fields in `config` and return a `ResolveDiagnostics`
 * describing any keys that the renderer does not recognise.
 *
 * ## Fields inspected
 *
 * | Field          | Recognized key set                           |
 * |----------------|----------------------------------------------|
 * | `typeColors`   | `_default` + `KNOWN_RENDERABLE_TYPES`        |
 * | `evolveStyles` | `_default` + `EvolveTypeEnum.options`        |
 * | `nodeRadii`    | `_default` + `KNOWN_RENDERABLE_TYPES`        |
 *
 * ## Why `typeColors` is the most common source
 *
 * `typeColors` uses a `.catchall()` Zod schema (accepts any string key),
 * while `evolveStyles` and `nodeRadii` use `.strict()` schemas (reject
 * unknown keys at Zod parse time).  A fully-parsed config will therefore
 * only have unrecognized keys in `typeColors`.
 *
 * Pre-parse or manually-assembled configs may have unrecognized keys in
 * any field — this function handles all three fields defensively.
 *
 * ## Non-breaking
 *
 * This is a pure read-only inspection — it does **not** modify `config`.
 * Callers receive the diagnostic result and decide what to do with it.
 *
 * @param config - A partial or fully resolved `RenderConfig`.
 *   All fields are optional; absent fields produce no diagnostic entries.
 * @returns A `ResolveDiagnostics` object.  `unrecognizedTypes` is empty
 *   when all TypeStyleMap keys are recognized.
 *
 * @example Recognized config → empty diagnostics:
 * ```ts
 * collectConfigDiagnostics({
 *   typeColors: { _default: "#000", component: "#f00" },
 * })
 * // → { unrecognizedTypes: [] }
 * ```
 *
 * @example Unrecognized key → diagnostic entry:
 * ```ts
 * collectConfigDiagnostics({
 *   typeColors: { _default: "#000", "future-type": "#f00" },
 * })
 * // → { unrecognizedTypes: [{ type: "future-type", field: "typeColors", recognitionLevel: "unrecognized" }] }
 * ```
 */
export function collectConfigDiagnostics(
  config: {
    typeColors?: Record<string, unknown>;
    evolveStyles?: Record<string, unknown>;
    nodeRadii?: Record<string, unknown>;
  },
): ResolveDiagnostics {
  const unrecognizedTypes: UnrecognizedTypeEntry[] = [
    ...collectUnrecognizedFromMap(
      config.typeColors,
      "typeColors",
      RECOGNIZED_TYPE_STYLE_KEYS,
    ),
    ...collectUnrecognizedFromMap(
      config.evolveStyles,
      "evolveStyles",
      RECOGNIZED_EVOLVE_STYLE_KEYS,
    ),
    ...collectUnrecognizedFromMap(
      config.nodeRadii,
      "nodeRadii",
      RECOGNIZED_TYPE_STYLE_KEYS,
    ),
  ];

  return Object.freeze({ unrecognizedTypes: Object.freeze(unrecognizedTypes) });
}
