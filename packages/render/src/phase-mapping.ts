/**
 * phase-mapping.ts — Range-based style resolution for evolution positions
 *
 * Implements a position-range-based style lookup that decouples style resolution
 * from phaseLabels cardinality.  Phase labels are display-only strings; styles
 * are always resolved by querying which range a given evolution value [0..1] falls
 * into, returning the associated styleKey.
 *
 * ## Motivation
 *
 * The existing `evolveStyles` map uses named keys (natural / ecosystem / forced /
 * late) from the `EvolveTypeEnum` closed enum.  This creates a hard coupling
 * between the *style vocabulary* and the four named arrow types — a deliberate
 * tension documented in schema.ts ("Known tension: closed evolveStyles keys vs.
 * open-length phaseLabels").
 *
 * This module resolves that tension by providing a **position-range-based** layer:
 *
 *   - `PhaseMappingEntry` maps a normalized evolution range `[start, end]` to a
 *     `styleKey` string.
 *   - `PhaseMapping` is an ordered list of non-overlapping entries covering any
 *     contiguous sub-interval of [0, 1].
 *   - `resolveStyleByPosition(position, mapping)` finds the entry whose range
 *     contains `position` and returns its `styleKey`.
 *
 * ## Interval convention
 *
 * Entries use **half-open** intervals `[start, end)` except for the **last matching
 * entry** whose `end` equals `1.0`, which uses a **closed** interval `[start, end]`.
 * This ensures that `position = 1.0` (full commodity) always resolves to the
 * rightmost entry rather than falling through.
 *
 * Specifically: `resolveStyleByPosition` considers a position to be in an entry if:
 *   `start <= position < end`   — for entries where `end < 1.0`
 *   `start <= position <= end`  — for entries where `end === 1.0` (rightmost boundary)
 *
 * ## Default phase mapping
 *
 * `DEFAULT_PHASE_MAPPING` mirrors the standard four-zone Wardley Map division
 * (Genesis / Custom-Built / Product / Commodity) as defined in
 * `wardley-map-consts.ts`:
 *
 *   Genesis       [0.000, 0.175)  → styleKey: "genesis"
 *   Custom-Built  [0.175, 0.400)  → styleKey: "custom-built"
 *   Product       [0.400, 0.700)  → styleKey: "product"
 *   Commodity     [0.700, 1.000]  → styleKey: "commodity"
 *
 * ## Relationship to evolveStyles
 *
 * This utility does NOT replace `evolveStyles` in the current render pipeline.
 * It is an **additive** companion that enables callers to resolve a style key from
 * a position, which can then be used to look up styles in any map keyed by those
 * style keys.  Future work may wire this into the evolvesto-layer renderer.
 *
 * ## Non-breaking contract
 *
 * This module introduces only new exports; it does not modify any existing schema,
 * function signature, or default value.  All existing tests continue to pass.
 *
 * @module phase-mapping
 */

import { z } from "zod";

// ── PhaseMappingEntry ────────────────────────────────────────────────────────

/**
 * A single phase range entry: maps an evolution range `[start, end]` to a
 * `styleKey` string.
 *
 * `styleKey` is a plain string — it does NOT have to match any closed enum.
 * This is the key design decision: the style vocabulary is **open**, not tied
 * to `EvolveTypeEnum` names.  Callers can use arbitrary style keys such as
 * "genesis", "custom-built", "product", "commodity", or domain-specific terms.
 *
 * @example Standard four-zone entry for the genesis zone:
 *   { start: 0, end: 0.175, styleKey: "genesis" }
 */
export const PhaseMappingEntrySchema = z.object({
  /**
   * Normalized evolution start value (inclusive lower bound), in [0, 1].
   *
   * Must be strictly less than `end`.
   *
   * @category layout
   */
  start: z.number().min(0).max(1),

  /**
   * Normalized evolution end value, in [0, 1].
   *
   * The interval semantics are:
   *   - `[start, end)` (exclusive) when `end < 1.0`
   *   - `[start, end]` (inclusive) when `end === 1.0`
   *
   * This half-open convention ensures that boundary values (e.g. 0.175, 0.4)
   * resolve unambiguously to the **next** zone rather than the current one,
   * matching the EVOLUTION_PHASES convention in wardley-map-consts.ts.
   *
   * Must be strictly greater than `start`.
   *
   * @category layout
   */
  end: z.number().min(0).max(1),

  /**
   * Style key associated with this range.
   *
   * Open string — callers may use any non-empty string as a style key.
   * Common values for the default four-zone mapping:
   *   "genesis" | "custom-built" | "product" | "commodity"
   *
   * @category author-intent
   */
  styleKey: z.string().min(1, "styleKey must be a non-empty string"),
}).refine(
  ({ start, end }) => start < end,
  { message: "PhaseMappingEntry: start must be strictly less than end" }
);

/**
 * TypeScript type for a single phase range entry.
 * Inferred from `PhaseMappingEntrySchema`.
 */
export type PhaseMappingEntry = z.infer<typeof PhaseMappingEntrySchema>;

// ── PhaseMappingSchema ───────────────────────────────────────────────────────

/**
 * Zod schema for a `PhaseMapping`: an ordered list of non-overlapping
 * `PhaseMappingEntry` objects.
 *
 * ## Validation rules
 *
 * 1. Each entry must have `start < end` (enforced by `PhaseMappingEntrySchema`).
 * 2. Entries must be sorted: `entries[i].start >= entries[i-1].end` (no overlap,
 *    gaps are permitted).
 * 3. An empty array is valid (represents "no ranges"; all positions resolve to
 *    `undefined`).
 *
 * ## Gaps
 *
 * Gaps between ranges are allowed.  A position that falls in a gap resolves to
 * `undefined`.  This lets callers model partial phase mappings (e.g. only style
 * the commodity zone while leaving everything else unstyled).
 *
 * @example Standard four-zone mapping (no gaps, full [0, 1] coverage):
 *   [
 *     { start: 0,     end: 0.175, styleKey: "genesis"      },
 *     { start: 0.175, end: 0.4,   styleKey: "custom-built" },
 *     { start: 0.4,   end: 0.7,   styleKey: "product"      },
 *     { start: 0.7,   end: 1.0,   styleKey: "commodity"    },
 *   ]
 *
 * @example Partial mapping (only commodity zone):
 *   [{ start: 0.7, end: 1.0, styleKey: "commodity" }]
 */
export const PhaseMappingSchema = z
  .array(PhaseMappingEntrySchema)
  .superRefine((entries, ctx) => {
    // Validate non-overlapping, sorted order
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];
      if (curr.start < prev.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `PhaseMapping entries must be sorted and non-overlapping: ` +
            `entry[${i}].start (${curr.start}) must be ≥ entry[${i - 1}].end (${prev.end})`,
          path: [i, "start"],
        });
      }
    }
  });

/**
 * TypeScript type for a `PhaseMapping`.
 * Inferred from `PhaseMappingSchema`.
 *
 * An ordered list of non-overlapping phase range entries.
 * Gaps between entries are permitted.
 */
export type PhaseMapping = z.infer<typeof PhaseMappingSchema>;

// ── DEFAULT_PHASE_MAPPING ────────────────────────────────────────────────────

/**
 * Default phase mapping mirroring the standard four-zone Wardley Map division.
 *
 * Zone boundaries match the constants in `wardley-map-consts.ts`:
 *   - `EVOLUTION_PHASE_CUSTOM`    = 0.175
 *   - `EVOLUTION_PHASE_PRODUCT`   = 0.4
 *   - `EVOLUTION_PHASE_COMMODITY` = 0.7
 *
 * Style keys are lowercase hyphenated zone names:
 *   "genesis" | "custom-built" | "product" | "commodity"
 *
 * These style keys intentionally do NOT match the `EvolveTypeEnum` values
 * (natural / ecosystem / forced / late) — they represent **position zones**,
 * not **arrow movement types**.
 *
 * Usage:
 * ```ts
 * const styleKey = resolveStyleByPosition(component.position.evolution.scalar, DEFAULT_PHASE_MAPPING);
 * // → "genesis" | "custom-built" | "product" | "commodity" | undefined
 * ```
 */
export const DEFAULT_PHASE_MAPPING: PhaseMapping = [
  { start: 0,     end: 0.175, styleKey: "genesis"      },
  { start: 0.175, end: 0.4,   styleKey: "custom-built" },
  { start: 0.4,   end: 0.7,   styleKey: "product"      },
  { start: 0.7,   end: 1.0,   styleKey: "commodity"    },
];

// ── resolveStyleByPosition ───────────────────────────────────────────────────

/**
 * Resolve the style key for a given evolution position [0..1] from a PhaseMapping.
 *
 * Looks up the first `PhaseMappingEntry` whose range contains `position` and
 * returns its `styleKey`.  Returns `undefined` if no entry matches (e.g. the
 * mapping has gaps and `position` falls in a gap, or the mapping is empty).
 *
 * ## Interval semantics
 *
 * Each entry uses a **half-open** interval `[start, end)` except for entries
 * whose `end === 1.0`, which use a **closed** interval `[start, end]`.  This
 * ensures that `position = 1.0` (the maximum evolution value) resolves to the
 * rightmost entry rather than falling through.
 *
 * Formally, an entry matches if:
 *   - `position >= start` AND `position < end`   — when `end < 1.0`
 *   - `position >= start` AND `position <= end`  — when `end === 1.0`
 *
 * ## Key design property
 *
 * Style resolution is **independent of phaseLabels cardinality**.  Labels are
 * display-only strings (used by the axes layer to render column headers).  Styles
 * are resolved purely from the position value and the PhaseMapping, which can
 * have any number of entries regardless of how many phase labels exist.
 *
 * ## Out-of-range positions
 *
 * Positions outside [0, 1] are handled gracefully: they simply return `undefined`
 * (no entry will match a position of -0.1 or 1.5 against a [0, 1] mapping).
 * Callers that require strict validation should clamp `position` to [0, 1] before
 * calling this function.
 *
 * @param position - Evolution value in [0, 1] (e.g. `component.position.evolution.scalar`)
 * @param mapping  - Ordered list of phase range entries to search
 * @returns The `styleKey` of the matching entry, or `undefined` if no entry matches
 *
 * @example Standard four-zone lookup:
 *   resolveStyleByPosition(0.05,  DEFAULT_PHASE_MAPPING)  // → "genesis"
 *   resolveStyleByPosition(0.175, DEFAULT_PHASE_MAPPING)  // → "custom-built"
 *   resolveStyleByPosition(0.5,   DEFAULT_PHASE_MAPPING)  // → "product"
 *   resolveStyleByPosition(0.7,   DEFAULT_PHASE_MAPPING)  // → "commodity"
 *   resolveStyleByPosition(1.0,   DEFAULT_PHASE_MAPPING)  // → "commodity"
 *
 * @example Empty mapping always returns undefined:
 *   resolveStyleByPosition(0.5, [])  // → undefined
 *
 * @example Partial mapping (only commodity zone):
 *   resolveStyleByPosition(0.5, [{ start: 0.7, end: 1.0, styleKey: "commodity" }])  // → undefined
 *   resolveStyleByPosition(0.8, [{ start: 0.7, end: 1.0, styleKey: "commodity" }])  // → "commodity"
 *
 * @pure This function is a pure computation with no side effects.
 */
export function resolveStyleByPosition(
  position: number,
  mapping: PhaseMapping
): string | undefined {
  for (const entry of mapping) {
    const inRange =
      position >= entry.start &&
      // Half-open [start, end) for end < 1.0; closed [start, end] for end === 1.0
      (position < entry.end || (entry.end === 1.0 && position <= entry.end));

    if (inRange) {
      return entry.styleKey;
    }
  }
  return undefined;
}
