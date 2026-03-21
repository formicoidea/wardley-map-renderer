/**
 * @file resolve-conflict.ts
 *
 * Defines the author/viewer field taxonomy for RenderConfig and exports the
 * `resolveConflict()` merge function that applies it.
 *
 * ## Why a taxonomy?
 *
 * A RenderConfig can originate from two sources with opposing authority:
 *
 * - **Author** — the map creator who controls the canonical visual design:
 *   canvas dimensions, coordinate space, background chrome, node styles,
 *   evolution-arrow styles, layout algorithm, filters, and legend placement.
 *
 * - **Viewer** — the end-user who controls their display environment:
 *   visual theme (dark/light), axes config (locale + axis labels), and label scale.
 *
 * When both sources supply a value for the same field, one must win.  This
 * module defines that rule as a first-class, exported constant so every
 * consumer applies the same precedence — no implicit shadowing.
 *
 * ## Taxonomy categories
 *
 * | Category              | Winner        | Fields                                                       |
 * |-----------------------|---------------|--------------------------------------------------------------|
 * | `author-intent`       | `authorConfig`| width, height, coordinateSpace, background, typography,      |
 * |                       |               | nodeRadii, avoidCollisions, typeColors, evolveStyles, legend, |
 * |                       |               | filters, strokeWidth                                         |
 * | `viewer-preference`   | `viewerConfig`| theme, axes                                                |
 *
 * ## Precedence chain
 *
 * ```
 * For author-intent fields:    authorConfig.field  →  schema default
 * For viewer-preference fields: viewerConfig.field →  schema default
 * ```
 *
 * Fields that are `undefined` on the winning side fall through to the Zod
 * schema default (applied when the merged config is later passed to
 * `resolveTheme()`).  The field from the *losing* side is discarded entirely
 * — it is not used as a secondary fallback.
 *
 * @see resolveConflict — the merge function
 * @see resolveTheme — applies theme baseline + inline overrides to a single RenderConfig
 */

import { z } from "zod";
import {
  RenderConfigSchema,
  TIERED_RENDER_CONFIG_TAXONOMY,
  type RenderConfig,
  type RenderConfigInput,
} from "./schema.js";
import {
  evaluateConstraints,
  type ConstraintEvaluationOptions,
  type ConstraintPolicy,
} from "./render-config-constraints.js";
import { collectConfigDiagnostics } from "./resolve-diagnostics.js";

// ── RenderDiagnostics ─────────────────────────────────────────────────────────

/**
 * Structured diagnostics returned alongside the resolved RenderConfig.
 *
 * Each array collects a different category of advisory or error message
 * surfaced during config resolution:
 *
 * | Field                 | Populated by                                    |
 * |-----------------------|-------------------------------------------------|
 * | `unrecognizedTypes`   | Component type names not in KNOWN_RENDERABLE_TYPES |
 * | `constraintViolations`| Field-interaction constraint violations (from    |
 * |                       | CONFIG_CONSTRAINT_GRAPH / checkConstraints)      |
 * | `warnings`            | Non-blocking advisory messages (e.g. deprecated  |
 * |                       | field usage, i18n fallbacks, schema coercions)   |
 *
 * @remarks Runtime population logic is added in subsequent Sub-ACs.
 *   Sub-AC 1 defines the type only; all arrays are empty stubs until then.
 *
 * @see resolveConfig — returns `{ config, diagnostics }` using this type
 */
export const RenderDiagnosticsSchema = z.object({
  /**
   * Component type strings from the map data that were not found in
   * `KNOWN_RENDERABLE_TYPES`.  The renderer falls back to `_default` styling
   * for these types; callers can surface them as user-facing warnings.
   */
  unrecognizedTypes: z.array(z.string()),
  /**
   * Human-readable messages for each field-interaction constraint violation
   * detected by `checkConstraints`.  Populated from `ConstraintViolation.message`
   * for each violation in the constraint graph evaluation pass.
   */
  constraintViolations: z.array(z.string()),
  /**
   * Non-blocking advisory messages emitted during config resolution — e.g.
   * i18n label fallbacks, deprecated field coercions, schema default overrides.
   */
  warnings: z.array(z.string()),
});

/** Structured diagnostics returned alongside a resolved RenderConfig. */
export type RenderDiagnostics = z.infer<typeof RenderDiagnosticsSchema>;

/**
 * The canonical empty (stub) RenderDiagnostics used until runtime population
 * logic is wired in subsequent Sub-ACs.
 */
export const EMPTY_RENDER_DIAGNOSTICS: RenderDiagnostics = {
  unrecognizedTypes: [],
  constraintViolations: [],
  warnings: [],
} as const;

// ── Author-intent field registry ─────────────────────────────────────────────

/**
 * Fields whose canonical value comes from the **map author**.
 *
 * These fields express intentional design decisions about the map's
 * appearance and content — canvas size, coordinate space, visual style,
 * layout, and what to include.  When both an author config and a viewer
 * config supply a value for one of these fields, the author's value wins
 * and the viewer's value is silently discarded.
 *
 * ### Fields in this category
 *
 * | Field             | Rationale                                                      |
 * |-------------------|----------------------------------------------------------------|
 * | `width`           | Canvas pixel width — part of the coordinate space contract     |
 * | `height`          | Canvas pixel height — part of the coordinate space contract    |
 * | `coordinateSpace` | Axis ranges & units — defines the normalized map geometry      |
 * | `background`      | Chrome (axes, phase dividers, color) — structural map scaffold |
 * | `typography`      | Font family + label scale — typographic design group           |
 * | `nodeRadii`       | Node circle sizes in px-space — visual design                  |
 * | `avoidCollisions` | Label collision algorithm — layout design                      |
 * | `typeColors`      | Color overrides per component type — visual design             |
 * | `evolveStyles`    | Evolution arrow stroke styles — visual design                  |
 * | `legend`          | Legend visibility, position, overflow — map navigation choice  |
 * | `filters`         | Layer toggles + excluded component types — content selection   |
 * | `strokeWidth`     | Edge / outline line weight — visual design                     |
 *
 * @see VIEWER_PREFERENCE_FIELDS — the complementary set of viewer-owned fields
 */
export const AUTHOR_INTENT_FIELDS = [
  "spatial",
  "typography",
  "styling",
  "filters",
  "legend",
  "avoidCollisions",
  "methods",
  "configIntent",
] as const satisfies ReadonlyArray<keyof RenderConfig>;

/** Union of all field names in the author-intent category. */
export type AuthorIntentField = typeof AUTHOR_INTENT_FIELDS[number];

// ── Viewer-preference field registry ─────────────────────────────────────────

/**
 * Fields whose canonical value comes from the **viewer** (end-user).
 *
 * These fields express the viewer's display-environment preferences — they
 * do not change the semantic content or structural design of the map.  When
 * both an author config and a viewer config supply a value for one of these
 * fields, the viewer's value wins and the author's value is silently
 * discarded.
 *
 * ### Fields in this category
 *
 * | Field        | Rationale                                                         |
 * |--------------|-------------------------------------------------------------------|
 * | `theme`      | Visual theme (dark / light / high-contrast) — display preference  |
 * | `axes`       | Axes config (locale + axis labels) — viewer locale preference    |
 * (labelScale is now inside typography group)
 *
 * @see AUTHOR_INTENT_FIELDS — the complementary set of author-owned fields
 */
export const VIEWER_PREFERENCE_FIELDS = [
  "axes",
] as const satisfies ReadonlyArray<keyof RenderConfig>;

/** Union of all field names in the viewer-preference category. */
export type ViewerPreferenceField = typeof VIEWER_PREFERENCE_FIELDS[number];

// ── resolveConflict ───────────────────────────────────────────────────────────

/**
 * Merge a viewer-supplied partial config and an author-supplied partial config
 * into a single validated {@link RenderConfig} by applying the author/viewer
 * field taxonomy.
 *
 * ## Precedence rules
 *
 * - **Author-intent fields** (see {@link AUTHOR_INTENT_FIELDS}): the value from
 *   `authorConfig` is used when present; the value from `viewerConfig` for the
 *   same field is **discarded** — it is not used as a fallback.
 *
 * - **Viewer-preference fields** (see {@link VIEWER_PREFERENCE_FIELDS}): the
 *   value from `viewerConfig` is used when present; the value from
 *   `authorConfig` for the same field is **discarded**.
 *
 * - **Unset fields** (the winning side did not supply a value): the field is
 *   omitted from the merged output, allowing {@link resolveTheme} to apply the
 *   theme baseline and schema defaults when the merged config is later
 *   resolved.
 *
 * ## Example
 *
 * ```ts
 * import { resolveConflict } from "@wardleyapi/render";
 *
 * // Author publishes their map with brand colors and specific canvas size.
 * const authorConfig = {
 *   width: 1920,
 *   height: 1080,
 *   typeColors: { _default: "#334155", "user-need": "#0ea5e9" },
 *   background: { color: "#f8fafc" },
 * };
 *
 * // Viewer wants dark mode in French.
 * const viewerConfig = {
 *   theme: "dark" as const,
 *   axes: { locale: "fr" as const },
 * };
 *
 * const merged = resolveConflict(viewerConfig, authorConfig);
 * // merged.width       === 1920              (from author)
 * // merged.typeColors  === { _default: … }   (from author)
 * // merged.theme       === "dark"             (from viewer)
 * // merged.axes.locale === "fr"              (from viewer)
 * const resolved = resolveTheme(merged);
 * ```
 *
 * @param viewerConfig - Partial config from the viewer side.
 *   Viewer-preference fields win; all other fields are ignored.
 * @param authorConfig - Partial config from the author side.
 *   Author-intent fields win; all other fields are ignored.
 * @returns A merged, Zod-validated {@link RenderConfig} ready to pass to
 *   {@link resolveTheme}.
 *
 * @throws {ZodError} If the merged config fails Zod validation (e.g.
 *   legend position out of canvas bounds). This should not happen if both
 *   input configs individually pass validation.
 */
export function resolveConflict(
  viewerConfig: Partial<RenderConfig>,
  authorConfig: Partial<RenderConfig>,
): RenderConfig {
  // Build the merged input object field-by-field, respecting the taxonomy.
  // We use a plain object and only set fields that are defined on the winning
  // side — this lets Zod apply .default() for unset fields (strokeWidth=1).
  const merged: Record<string, unknown> = {};

  // ── Author-intent fields (authorConfig wins) ──────────────────────────────
  if (authorConfig.spatial !== undefined) merged.spatial = authorConfig.spatial;
  if (authorConfig.typography !== undefined)
    merged.typography = authorConfig.typography;
  if (authorConfig.styling !== undefined)
    merged.styling = authorConfig.styling;
  if (authorConfig.avoidCollisions !== undefined)
    merged.avoidCollisions = authorConfig.avoidCollisions;
  if (authorConfig.legend !== undefined) merged.legend = authorConfig.legend;
  if (authorConfig.filters !== undefined) merged.filters = authorConfig.filters;
  if (authorConfig.methods !== undefined) merged.methods = authorConfig.methods;
  if (authorConfig.configIntent !== undefined)
    merged.configIntent = authorConfig.configIntent;

  // ── Viewer-preference fields (viewerConfig wins) ──────────────────────────
  if (viewerConfig.axes !== undefined) merged.axes = viewerConfig.axes;

  // Parse through Zod to apply defaults (e.g. strokeWidth=1) and validate.
  return RenderConfigSchema.parse(merged as RenderConfigInput);
}


// ── 4-Tier taxonomy field arrays ─────────────────────────────────────────────

/**
 * Fields classified as 'platform-constraint' in the 4-tier taxonomy.
 * Derived at runtime from TIERED_RENDER_CONFIG_TAXONOMY — single source of truth.
 *
 * These fields define the coordinate and layout system; they take highest
 * merge precedence.  authorConfig wins; viewer cannot override.
 *
 * @see TIERED_RENDER_CONFIG_TAXONOMY — source taxonomy
 * @see resolveConfig — data-driven merger that applies tiered precedence
 */
export const PLATFORM_CONSTRAINT_FIELDS: ReadonlyArray<
  keyof typeof TIERED_RENDER_CONFIG_TAXONOMY
> = (
  Object.keys(TIERED_RENDER_CONFIG_TAXONOMY) as Array<
    keyof typeof TIERED_RENDER_CONFIG_TAXONOMY
  >
).filter((k) => TIERED_RENDER_CONFIG_TAXONOMY[k].category === "platform-constraint");

/**
 * Fields classified as 'layout-structural' in the 4-tier taxonomy.
 * Derived at runtime from TIERED_RENDER_CONFIG_TAXONOMY — single source of truth.
 *
 * These fields define the structural scaffold (axes, legend show-flag, data
 * filters); second-highest merge precedence.  authorConfig wins.
 *
 * @see TIERED_RENDER_CONFIG_TAXONOMY — source taxonomy
 * @see resolveConfig — data-driven merger that applies tiered precedence
 */
export const LAYOUT_STRUCTURAL_FIELDS: ReadonlyArray<
  keyof typeof TIERED_RENDER_CONFIG_TAXONOMY
> = (
  Object.keys(TIERED_RENDER_CONFIG_TAXONOMY) as Array<
    keyof typeof TIERED_RENDER_CONFIG_TAXONOMY
  >
).filter((k) => TIERED_RENDER_CONFIG_TAXONOMY[k].category === "layout-structural");

// ── resolveConfig ─────────────────────────────────────────────────────────────

/**
 * Merge a viewer-supplied partial config and an author-supplied partial config
 * into a single validated RenderConfig by applying the **4-tier field
 * taxonomy** declared in {@link TIERED_RENDER_CONFIG_TAXONOMY}.
 *
 * This is the data-driven successor to {@link resolveConflict}.  Instead of
 * hardcoded field lists it reads each field's `category` from the taxonomy at
 * runtime, making the merge logic introspectable and easy to extend.
 *
 * ## Tier precedence (highest → lowest)
 *
 * | Tier                  | Source        | Fields                                           |
 * |-----------------------|---------------|--------------------------------------------------|
 * | `platform-constraint` | authorConfig  | width, height, coordinateSpace, configIntent |
 * | `layout-structural`   | authorConfig  | background, legend, filters                      |
 * | `author-intent`       | authorConfig  | typography, nodeRadii, avoidCollisions, typeColors, evolveStyles, strokeWidth |
 * | `viewer-preference`   | viewerConfig  | theme, axes                                    |
 *
 * ## Difference from resolveConflict()
 *
 * `resolveConflict()` uses hardcoded `AUTHOR_INTENT_FIELDS` /
 * `VIEWER_PREFERENCE_FIELDS` arrays and applies a 2-tier merge.  `resolveConfig()`
 * reads `TIERED_RENDER_CONFIG_TAXONOMY` at runtime and applies a 4-tier merge —
 * the same net result for the current field set, but guaranteed to stay in sync
 * as the taxonomy evolves.
 *
 * @param viewerConfig - Partial config from the viewer side.
 *   Only `viewer-preference` fields are used; all others are ignored.
 * @param authorConfig - Partial config from the author side.
 *   Fields in tiers 1–3 (`platform-constraint`, `layout-structural`,
 *   `author-intent`) are used; `viewer-preference` fields are ignored.
 * @param options - Optional constraint evaluation options.
 *   `options.violationPolicy` controls how field-interaction constraint violations
 *   are handled after the merge (default: `'warn'`).  Pass `'clip'` to auto-correct
 *   violations (e.g. clamp legend XY to canvas bounds); pass `'throw'` to fail fast
 *   on any violation.
 *   @see ConstraintEvaluationOptions — options type
 *   @see ViolationPolicy — policy values: `'warn'` | `'throw'` | `'clip'`
 * @returns An object `{ config, diagnostics }` where `config` is the merged,
 *   Zod-validated RenderConfig ready for rendering, and `diagnostics` contains
 *   structured advisory/error information collected during resolution.
 *   Constraints are evaluated after the Zod parse step and before the value is returned.
 *
 * @throws {ZodError} If the merged config fails Zod validation.
 * @throws {ConstraintViolationError} If `options.violationPolicy === 'throw'` and
 *   any field-interaction constraint is violated.
 *
 * @see resolveConflict — the 2-tier predecessor (kept for backward compat)
 * @see TIERED_RENDER_CONFIG_TAXONOMY — the declarative taxonomy driving this function
 * @see TIER_PRECEDENCE — the ordered tier names
 * @see RENDER_CONFIG_CONSTRAINT_GRAPH in render-config-constraints.ts — the constraint graph
 * @see RenderDiagnostics — the diagnostics type returned alongside config
 */
export function resolveConfig(
  viewerConfig: Partial<RenderConfig>,
  authorConfig: Partial<RenderConfig>,
  options?: ConstraintEvaluationOptions,
): { config: RenderConfig; diagnostics: RenderDiagnostics } {
  // Build the merged object by reading each field's tier from the taxonomy.
  // Only set a field when the winning side has a defined value — this lets
  // Zod apply .default() for unset fields (e.g. strokeWidth defaults to 1).
  const merged: Record<string, unknown> = {};

  for (const [field, meta] of Object.entries(TIERED_RENDER_CONFIG_TAXONOMY)) {
    const key = field as keyof RenderConfig;

    if (meta.category === "viewer-preference") {
      // Tier 4: viewerConfig wins
      if (viewerConfig[key] !== undefined) merged[key] = viewerConfig[key];
    } else {
      // Tiers 1–3 (platform-constraint, layout-structural, author-intent):
      // authorConfig wins; viewerConfig value is silently discarded.
      if (authorConfig[key] !== undefined) merged[key] = authorConfig[key];
    }
  }

  // Parse through Zod to apply schema defaults and validate.
  const parsed = RenderConfigSchema.parse(merged as RenderConfigInput);

  // ── Constraint evaluation ─────────────────────────────────────────────────
  // Run the declarative constraint graph after the merge + Zod parse.
  // Constraints catch field-interaction issues that Zod per-field validation
  // cannot express (e.g. legend.position.x out of coordinateSpace bounds).
  // violationPolicy defaults to 'warn' — non-breaking, backward compatible.
  const policy: ConstraintPolicy = options?.violationPolicy ?? "warn";
  const config = evaluateConstraints(parsed, policy);

  // ── Diagnostics — Sub-AC 2: runtime population ────────────────────────────
  // Inspect the resolved config's TypeStyleMap fields for unrecognized type
  // keys.  A "recognized" key is either `_default` or a member of
  // KNOWN_RENDERABLE_TYPES (for typeColors / nodeRadii) or EvolveTypeEnum
  // (for evolveStyles).  Any other key is semantically inert — the renderer
  // falls back to `_default` for it, which may indicate a typo or data-schema
  // drift.
  //
  // Populate `diagnosticsOut` (if the caller provided one) with the richer
  // UnrecognizedTypeEntry objects, and always populate the `diagnostics` return
  // value with the flat string array for the existing `RenderDiagnostics` shape.
  const configDiag = collectConfigDiagnostics({
    typeColors: config.styling?.palette as Record<string, unknown> | undefined,
    evolveStyles: config.styling?.evolveStyles as Record<string, unknown> | undefined,
    nodeRadii: config.spatial?.nodeRadii as Record<string, unknown> | undefined,
  });

  // Propagate to the optional mutable output container (richer entry format)
  if (options?.diagnosticsOut) {
    options.diagnosticsOut.unrecognizedTypes.push(
      ...configDiag.unrecognizedTypes,
    );
  }

  const diagnostics: RenderDiagnostics = {
    ...EMPTY_RENDER_DIAGNOSTICS,
    // Flatten to string[] for the public RenderDiagnostics shape.
    // Each entry carries field + type info; we expose just the type name here
    // to remain backward-compatible with the Sub-AC 1 string[] contract.
    unrecognizedTypes: configDiag.unrecognizedTypes.map((e) => e.type),
  };

  return { config, diagnostics };
}
