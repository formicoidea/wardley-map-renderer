/**
 * render-config-v2.ts — RenderConfig sub-schema decomposition
 *
 * Defines the structured sub-schemas decomposing RenderConfig into coherent
 * sub-concerns: spatial, styling, filtering, typography.
 *
 * Also defines per-theme baseline values (palette, font, strokeWidth) for the
 * three supported visual themes: "default", "dark", and "highContrast".
 *
 * Design rules:
 *   - Only "default" theme has fully specified values.
 *   - "dark" and "highContrast" are placeholders identical to "default" for now.
 *   - Font config is limited to fontFamily + labelScale (no per-element sizes).
 *   - strokeWidth default is 1 (also the Zod schema default in schema.ts).
 *   - Theme baselines provide fallback values — explicit RenderConfig fields
 *     always take precedence when resolving the effective render options.
 *   - SpatialConfig groups canvas dimensions + coordinate space declaration.
 *   - TypographyConfig groups font family + label scale (unitless multiplier).
 *
 * Usage:
 *   import { resolveThemeBaseline, SpatialConfigSchema, TypographyConfigSchema } from "./render-config-v2.js";
 *   const baseline = resolveThemeBaseline("dark");
 *   const spatial = SpatialConfigSchema.parse({ width: 800, height: 400 });
 *   const typography = TypographyConfigSchema.parse({ labelScale: 1.5 });
 *
 * @see src/schema.ts for ThemeEnum, CoordinateSpaceSchema, and RenderConfigSchema definitions.
 * @module render-config-v2
 */

import { z } from "zod";
import {
  ThemeEnum,
  EvolveStylesMapSchema,
  NodeRadiiSchema,
  LocaleEnum,
  BackgroundSchema,
  LayerTogglesSchema,
  LegendSchema,
  FiltersSchema,
} from "./schema.js";
import {
  CoordinateSpaceSchema,
  type CoordinateSpace,
} from "./coordinate-space.js";
import {
  KNOWN_RENDERABLE_TYPES,
  type KnownRenderableType,
} from "./renderable-type.js";

// LayerTogglesSchema is re-exported and used only in backward-compat shim logic.
// The canonical API is filters.layers (see FiltersSchema).

// Re-export ThemeEnum, LocaleEnum from schema.ts — single source of truth for validation
export { ThemeEnum, LocaleEnum } from "./schema.js";
export type { Theme, Locale } from "./schema.js";

// Re-export the canonical CoordinateSpaceSchema and CoordinateSpace type from coordinate-space.ts.
// Sub-AC 6a: CoordinateSpace is now defined in coordinate-space.ts (not a local duplicate here).
// The stub CoordinateSpaceSchema / CoordinateSpaceDeclaration from schema.ts are superseded.
export { CoordinateSpaceSchema } from "./coordinate-space.js";
export type { CoordinateSpace } from "./coordinate-space.js";

// ── CoordinateSpace ──────────────────────────────────────────────────────────
//
// Sub-AC 6a: The canonical CoordinateSpace type has been extracted to
// coordinate-space.ts and is re-exported from this module above.
//
// The CoordinateSpace type documents the three distinct coordinate spaces in use:
//   - Canvas px-space (absolute pixels): width, height, nodeRadii, strokeWidth, legend {x,y}
//     → When outputHint.targetWidth is set, SCALE these by targetWidth/coordinateSpace.width
//   - Unitless multipliers (relative scale): labelScale
//     → Resolution-independent; NOT scaled by outputHint — always applied as-is
//   - Normalized [0,1] (component positions): evolution.scalar, visibility.scalar
//
// @see CoordinateSpace in coordinate-space.ts — canonical Zod-validated type
// @see CoordinateSpaceSchema in coordinate-space.ts — Zod schema with full validation

// ── SpatialConfig sub-schema ─────────────────────────────────────────────────

/**
 * SpatialConfig — Zod sub-schema grouping all canvas dimension and coordinate
 * space concerns for a Wardley Map render.
 *
 * This is the first sub-concern extracted from the flat RenderConfig:
 *   - `width`  / `height`      — canvas pixel dimensions (px-space)
 *   - `coordinateSpace`        — explicit coordinate space declaration (units + origin)
 *
 * Defaults applied at parse time:
 *   - `width`  → 1600 px
 *   - `height` → 800 px
 *   - `coordinateSpace.units`  → "px"    (only supported value)
 *   - `coordinateSpace.origin` → "top-left" (only supported value)
 *
 * ## Backward-compatibility contract
 * The flat `width` / `height` / `coordinateSpace` fields continue to exist on
 * `RenderConfigSchema` in schema.ts. This sub-schema is an ADDITIVE grouping
 * that allows consuming code to validate spatial concerns in isolation and
 * serves as the blueprint for the future nested structure migration.
 *
 * ## Relationship to CoordinateSpace type
 * `CoordinateSpace` (in coordinate-space.ts) is the canonical Zod-validated type
 * documenting the three distinct coordinate spaces in the system (px-space, unitless
 * multipliers, normalized [0,1]).  `SpatialConfigSchema` is an ADDITIVE grouping
 * that allows validating spatial concerns in isolation.
 *
 * The `coordinateSpace` sub-field now uses the full `CoordinateSpaceSchema` from
 * coordinate-space.ts — it includes width, height, evolutionRange, visibilityRange,
 * and the unit/origin declarations.
 *
 * @example
 *   const spatial = SpatialConfigSchema.parse({});
 *   // → { width: 1600, height: 800 }
 *
 *   const halved = SpatialConfigSchema.parse({ width: 800, height: 400 });
 *   // → { width: 800, height: 400 }
 *
 * @see CoordinateSpaceSchema in coordinate-space.ts — full Zod definition with width, height, ranges
 * @see CoordinateSpace in coordinate-space.ts — canonical TypeScript type
 * @see RenderConfigSchema in schema.ts for the flat config that contains these fields
 */
export const SpatialConfigSchema = z.object({
  /**
   * Canvas width in pixels — defines the horizontal extent of the canvas coordinate space.
   * All px-space values (nodeRadii, strokeWidth, legend position) are interpreted within this space.
   * Default: 1600 px. Valid range: 1–10000 px.
   *
   * @remarks CoordinateSpace category: **canvas px-space** — this dimension, together with
   *   `height`, establishes the px coordinate space that `nodeRadii`, `strokeWidth`, and
   *   legend `{x, y}` positions are measured in. When you change `width`, scale those
   *   px-space values proportionally. `labelScale` is NOT px-space and does not need scaling.
   * @see CoordinateSpace for the full coordinate space declaration
   * @category layout-structural
   */
  width: z
    .number()
    .positive()
    .max(10000, "Canvas width must not exceed 10000 px")
    .default(1600),

  /**
   * Canvas height in pixels — defines the vertical extent of the canvas coordinate space.
   * Default: 800 px. Valid range: 1–10000 px.
   *
   * @remarks CoordinateSpace category: **canvas px-space** — this dimension, together with
   *   `width`, establishes the px coordinate space that `nodeRadii`, `strokeWidth`, and
   *   legend `{x, y}` positions are measured in. When you change `height`, scale those
   *   px-space values proportionally. `labelScale` is NOT px-space and does not need scaling.
   * @see CoordinateSpace for the full coordinate space declaration
   * @category layout-structural
   */
  height: z
    .number()
    .positive()
    .max(10000, "Canvas height must not exceed 10000 px")
    .default(800),

  /**
   * Explicit coordinate space declaration for this canvas.
   *
   * Uses the canonical `CoordinateSpaceSchema` from coordinate-space.ts which
   * encapsulates ALL coordinate-system-defining parameters:
   *  - `units: "px"` — only canvas pixels are supported (default).
   *  - `origin: "top-left"` — (0, 0) is the top-left corner of the canvas (default).
   *  - `width` / `height` — canvas pixel dimensions (default 1600 × 800).
   *  - `evolutionRange` — [start, end] normalized display range (default [0, 1]).
   *  - `visibilityRange` — [high, low] normalized display range (default [0, 1]).
   *  - `unit: "canvas-px"` — coordinate unit declaration.
   *
   * All fields default automatically — this field is optional.
   *
   * @see CoordinateSpaceSchema in coordinate-space.ts — full Zod definition
   * @see CoordinateSpace in coordinate-space.ts — canonical TypeScript type
   * @category platform-constraint
   */
  coordinateSpace: CoordinateSpaceSchema.optional(),
});

/** TypeScript type for the SpatialConfig sub-schema */
export type SpatialConfig = z.infer<typeof SpatialConfigSchema>;

/** Default SpatialConfig values (canvas 1600 × 800 px, top-left origin, px units) */
export const DEFAULT_SPATIAL_CONFIG: SpatialConfig = SpatialConfigSchema.parse({});

// ── TypographyConfig sub-schema ──────────────────────────────────────────────

/**
 * TypographyConfig — Zod sub-schema grouping all font and text-scale concerns
 * for a Wardley Map render.
 *
 * This is the typography sub-concern extracted from the flat RenderConfig:
 *   - `fontFamily`  — CSS font-family stack applied to all map text elements
 *   - `labelScale`  — unitless multiplier for component label font size
 *
 * Defaults applied at parse time:
 *   - `fontFamily`  → "Inter, sans-serif"
 *   - `labelScale`  → 1.0  (base 12 px label size, no scaling)
 *
 * ## Coordinate space category
 * `labelScale` is a **unitless multiplier** — NOT a px-space value.
 * It scales relative to the base 12 px font size regardless of canvas dimensions.
 * @see CoordinateSpace for the full distinction between px-space, unitless, and normalized values.
 *
 * ## Backward-compatibility contract
 * The flat `fontFamily` / `labelScale` fields continue to exist on
 * `RenderConfigSchema` in schema.ts. This sub-schema is an ADDITIVE grouping
 * that allows consuming code to validate typography concerns in isolation and
 * serves as the blueprint for the future nested structure migration.
 *
 * @example
 *   const typography = TypographyConfigSchema.parse({});
 *   // → { fontFamily: "Inter, sans-serif", labelScale: 1.0 }
 *
 *   const larger = TypographyConfigSchema.parse({ labelScale: 1.5 });
 *   // → { fontFamily: "Inter, sans-serif", labelScale: 1.5 }
 *
 *   const custom = TypographyConfigSchema.parse({ fontFamily: "Georgia, serif", labelScale: 0.9 });
 *   // → { fontFamily: "Georgia, serif", labelScale: 0.9 }
 *
 * @see RenderConfigSchema in schema.ts for the flat config that contains these fields
 * @see CoordinateSpace in coordinate-space.ts for the coordinate space documentation
 * @see ThemeBaseline.font for the per-theme font baseline values
 */
export const TypographyConfigSchema = z.object({
  /**
   * CSS font-family stack applied to all map text elements (node labels, axis labels,
   * phase labels, legend text).
   *
   * Any valid CSS `font-family` value is accepted (e.g. "Inter, sans-serif",
   * "Georgia, serif", "monospace").
   * Default: "Inter, sans-serif"
   * @category viewer-preference
   */
  fontFamily: z.string().default("Inter, sans-serif"),

  /**
   * Unitless multiplier for component label font size.
   *
   * The base font size is 12 px; `labelScale` scales it proportionally:
   *   - `1.0` → 12 px (default, no scaling)
   *   - `0.8` → 9.6 px (smaller labels)
   *   - `1.5` → 18 px (50% larger labels)
   *
   * ## Resolution independence
   *
   * `labelScale` is **resolution-independent** — it is a dimensionless ratio, NOT a
   * canvas pixel value.  Consequently:
   *
   * - Changing `coordinateSpace.width` (canvas resize) does NOT require updating `labelScale`.
   * - Adding `outputHint.targetWidth` (PNG export at higher resolution) does NOT scale
   *   `labelScale` — the font size ratio remains the same regardless of output dimensions.
   *
   * Contrast with `nodeRadii` and `strokeWidth`, which ARE canvas px-space values and ARE
   * scaled by `outputHint.targetWidth / coordinateSpace.width` when `outputHint` is present.
   *
   * Valid range: >0 to 5× (enforced by Zod).
   *
   * @remarks CoordinateSpace category: **unitless multiplier** — this value is NOT expressed
   *   in the canvas px coordinate space. Do NOT scale when resizing the canvas or setting
   *   `outputHint`; scale `nodeRadii` and `strokeWidth` instead.
   * @see outputHint (schema.ts) — controls px-space scaling; does NOT affect labelScale
   * @see nodeRadii — px-space value that IS scaled by outputHint
   * @see strokeWidth — px-space value that IS scaled by outputHint
   * @see CoordinateSpace — labelScale is listed as a "unitless multiplier"
   * @category viewer-preference
   */
  labelScale: z.number().positive().max(5).default(1.0),
});

/** TypeScript type for TypographyConfig, inferred from TypographyConfigSchema */
export type TypographyConfig = z.infer<typeof TypographyConfigSchema>;

/** Default TypographyConfig values (Inter font, 1.0× label scale) */
export const DEFAULT_TYPOGRAPHY_CONFIG: TypographyConfig =
  TypographyConfigSchema.parse({});

// ── ThemeBaseline type ───────────────────────────────────────────────────────

/**
 * Per-theme baseline values applied before explicit RenderConfig field overrides.
 * All fields are fully specified so the renderer always has a fallback.
 */
export interface ThemeBaseline {
  /** Background and foreground color palette for canvas elements */
  palette: {
    /** Canvas background fill color */
    background: string;
    /** Default stroke/fill for generic "component" nodes */
    component: string;
    /** Default stroke/fill for "user-need" nodes */
    "user-need": string;
    /** Default stroke/fill for "pipeline" nodes */
    pipeline: string;
    /** Default stroke/fill for "note" nodes */
    note: string;
    /** Default stroke/fill for "anchor" nodes */
    anchor: string;
    /** Axis arrow and label color */
    axis: string;
    /** Phase divider dashed-line color */
    divider: string;
    /** Phase label and direction indicator color */
    label: string;
    /** Dependency edge stroke color */
    edge: string;
  };
  /** Font baseline — fontFamily and labelScale only */
  font: {
    /** CSS font-family stack for all map text */
    fontFamily: string;
    /**
     * Unitless multiplier applied to the base 12 px label size (default 1.0 = 12 px).
     * Not a px value — it scales relative to the base font size regardless of canvas dimensions.
     * @see CoordinateSpace for the distinction between px-space values and unitless multipliers
     */
    labelScale: number;
  };
  /**
   * Stroke width in px-space (canvas coordinate space) for edges and node outlines.
   * Default: 1 px. Valid range: 0.25–8 px.
   * @see CoordinateSpace for the canvas coordinate space definition
   */
  strokeWidth: number;
  /**
   * Per-type node circle radii in px-space (canvas coordinate space).
   * `_default` is required and serves as the catch-all fallback.
   * Default: `{ _default: 5 }` (5 px radius).
   * @see CoordinateSpace for the canvas coordinate space definition
   */
  nodeRadii: { _default: number } & Record<string, number>;
}

// ── Default theme baseline ───────────────────────────────────────────────────

/**
 * "default" theme — classic Wardley Map look (white background, dark gray tones).
 * This is the only fully-specified theme; other themes are placeholders.
 */
export const DEFAULT_THEME_BASELINE: ThemeBaseline = {
  palette: {
    background: "#ffffff",
    component: "#374151",    // Tailwind gray-700
    "user-need": "#1d4ed8",  // Tailwind blue-700
    pipeline: "#374151",     // same as component
    note: "#6b7280",         // Tailwind gray-500
    anchor: "#111827",       // Tailwind gray-900
    axis: "#374151",         // dark gray arrows/labels
    divider: "#d1d5db",      // Tailwind gray-300 — dashed phase dividers
    label: "#6b7280",        // Tailwind gray-500 — phase/direction labels
    edge: "#374151",         // dark gray dependency arrows
  },
  font: {
    fontFamily: "Inter, sans-serif",
    labelScale: 1.0,
  },
  strokeWidth: 1,
  nodeRadii: { _default: 3 },
};

// ── Dark theme baseline (placeholder — identical to default) ─────────────────

/**
 * "dark" theme — placeholder, currently identical to "default".
 * Will be updated in a future iteration with dark background colors.
 */
export const DARK_THEME_BASELINE: ThemeBaseline = {
  ...DEFAULT_THEME_BASELINE,
  palette: { ...DEFAULT_THEME_BASELINE.palette },
  font: { ...DEFAULT_THEME_BASELINE.font },
};

// ── High-contrast theme baseline (placeholder — identical to default) ────────

/**
 * "highContrast" theme — placeholder, currently identical to "default".
 * Will be updated in a future iteration with high-contrast WCAG colors.
 */
export const HIGH_CONTRAST_THEME_BASELINE: ThemeBaseline = {
  ...DEFAULT_THEME_BASELINE,
  palette: { ...DEFAULT_THEME_BASELINE.palette },
  font: { ...DEFAULT_THEME_BASELINE.font },
};

// ── Theme registry ───────────────────────────────────────────────────────────

/** All theme baselines indexed by theme name */
export const THEME_BASELINES: Record<string, ThemeBaseline> = {
  default: DEFAULT_THEME_BASELINE,
  dark: DARK_THEME_BASELINE,
  highContrast: HIGH_CONTRAST_THEME_BASELINE,
};

// ── Theme resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the theme baseline for a given theme name.
 *
 * Falls back to "default" if the theme name is undefined or not recognized.
 *
 * @param theme - Optional theme name from ThemeEnum ("default" | "dark" | "highContrast")
 * @returns The ThemeBaseline for the requested theme
 *
 * @example
 *   const baseline = resolveThemeBaseline("dark");
 *   // Returns DARK_THEME_BASELINE (currently identical to DEFAULT_THEME_BASELINE)
 *
 *   const baseline2 = resolveThemeBaseline(undefined);
 *   // Returns DEFAULT_THEME_BASELINE
 */
export function resolveThemeBaseline(theme?: string): ThemeBaseline {
  return THEME_BASELINES[theme ?? "default"] ?? DEFAULT_THEME_BASELINE;
}

// ── StylingConfig sub-schema ──────────────────────────────────────────────────

/**
 * TypeColorsSchema — per-renderable-type CSS color override map.
 *
 * Keys are restricted to the KNOWN_RENDERABLE_TYPES closed set (rendering-local
 * vocabulary declared in renderable-type.ts — decoupled from the data-schema
 * ComponentType enum). All fields are optional — only provided keys override the
 * theme baseline palette. Absent keys fall back to the ThemeBaseline.palette for
 * that type.
 *
 * Value format: any CSS color string (hex, rgb, named).
 * Recommended: 6-digit hex (e.g. "#374151") for consistency with ThemeBaseline.
 *
 * @see KNOWN_RENDERABLE_TYPES in renderable-type.ts — the rendering-local closed set of valid keys
 * @see ThemeBaseline.palette — the fallback colors when a key is absent
 */
export const TypeColorsSchema = z
  .object(
    Object.fromEntries(
      KNOWN_RENDERABLE_TYPES.map((k) => [k, z.string().optional()])
    ) as Record<KnownRenderableType, z.ZodOptional<z.ZodString>>
  )
  .partial();

/** TypeScript type for TypeColors (all component-type fields optional) */
export type TypeColors = z.infer<typeof TypeColorsSchema>;

/**
 * StylingConfig — Zod sub-schema grouping all visual styling concerns:
 *   - `typeColors`:    per-component-type color overrides
 *   - `evolveStyles`:  per-evolve-type arrow stroke style overrides
 *   - `nodeRadii`:     per-component-type node circle radii (px-space)
 *   - `strokeWidth`:   edge and node-outline stroke width (px-space)
 *
 * ## Defaults applied at parse time
 * | Field          | Default           | Description                              |
 * |----------------|-------------------|------------------------------------------|
 * | `strokeWidth`  | `1`               | 1 px stroke for edges and node outlines  |
 * | `nodeRadii`    | `{ _default: 5 }` | 5 px radius for all component types      |
 * | `typeColors`   | `undefined`       | Theme baseline palette is used           |
 * | `evolveStyles` | `undefined`       | Hardcoded per-type defaults in layer     |
 *
 * ## Theme resolution precedence (highest wins)
 *   1. Explicit StylingConfig field (this schema — highest priority)
 *   2. Theme baseline (`ThemeBaseline.palette` / `strokeWidth` / `nodeRadii`)
 *   3. Hardcoded renderer defaults in each layer renderer (lowest — last resort)
 *
 * ## Cross-schema contract (single source of truth)
 * - `typeColors` keys are derived from `KNOWN_RENDERABLE_TYPES` (renderable-type.ts) — decoupled from data-schema ComponentType.
 * - `evolveStyles` keys are constrained by `EvolveTypeEnum` via `EvolveStylesMapSchema`
 *   (schema.ts) — this ensures evolveStyles stays in sync with the closed enum of
 *   evolution arrow types. Unknown keys are rejected at parse time (.strict()).
 * - `nodeRadii` uses `NodeRadiiSchema` (schema.ts) — `_default` is required when provided.
 *
 * ## Purely structural grouping
 * This sub-schema introduces no new behavioral capabilities. It is a structural
 * decomposition of existing flat `RenderConfigSchema` fields into a coherent group.
 * The flat fields (`typeColors`, `evolveStyles`, `nodeRadii`, `strokeWidth`) continue
 * to exist on `RenderConfigSchema` in schema.ts for backward compatibility.
 *
 * @example Minimal — use all defaults:
 *   const s = StylingConfigSchema.parse({});
 *   // → { strokeWidth: 1, nodeRadii: { _default: 5 }, typeColors: undefined, evolveStyles: undefined }
 *
 * @example Override stroke width and enlarge nodes:
 *   const s = StylingConfigSchema.parse({ strokeWidth: 2, nodeRadii: { _default: 8 } });
 *   // → { strokeWidth: 2, nodeRadii: { _default: 8 }, ... }
 *
 * @example Per-type color and evolve style overrides:
 *   const s = StylingConfigSchema.parse({
 *     typeColors: { "user-need": "#1d4ed8", component: "#374151" },
 *     evolveStyles: { natural: { stroke: "#dc2626", strokeDasharray: "6,3" } },
 *   });
 *
 * @see EvolveStylesMapSchema in schema.ts — evolveStyles key constraints (EvolveTypeEnum)
 * @see NodeRadiiSchema in schema.ts — nodeRadii shape (_default required)
 * @see TypeColorsSchema (above) — typeColors shape (KNOWN_RENDERABLE_TYPES keys)
 * @see ThemeBaseline — per-theme fallback values for palette, strokeWidth, nodeRadii
 */
export const StylingConfigSchema = z.object({
  /**
   * Per-renderable-type color overrides (any CSS color string, e.g. "#374151").
   * Keys are restricted to KNOWN_RENDERABLE_TYPES (rendering-local vocabulary):
   *   "component" | "user-need" | "pipeline" | "note" | "anchor"
   *
   * When a type key is absent, the theme baseline palette color applies.
   * When a type key is present, the explicit color overrides the baseline for that type only.
   *
   * @see TypeColorsSchema (above) for the Zod definition
   * @see KNOWN_RENDERABLE_TYPES in renderable-type.ts — rendering-local closed set of valid keys
   * @category author-intent
   */
  typeColors: TypeColorsSchema.optional(),

  /**
   * Per-evolve-type arrow stroke style overrides.
   * Keys are constrained to the closed EvolveTypeEnum:
   *   "natural" | "ecosystem" | "forced" | "late"
   * Unknown keys are rejected at parse time (strict schema via EvolveStylesMapSchema).
   *
   * When absent for a type, the evolvesto-layer uses its hardcoded per-type color defaults.
   * Each entry can override `stroke` (color string) and/or `strokeDasharray` (SVG dash pattern).
   *
   * @see EvolveStylesMapSchema in schema.ts — schema definition (key constraints)
   * @see EvolveTypeEnum in schema.ts — the closed enum of valid evolveType values
   * @category author-intent
   */
  evolveStyles: EvolveStylesMapSchema.optional(),

  /**
   * Per-component-type node circle radii in **canvas px-space**.
   * `_default` is required and serves as the catch-all fallback for unlisted types.
   * Per-type keys (e.g. `"anchor"`, `"user-need"`) override `_default` for that type only.
   *
   * Default: `{ _default: 5 }` (5 px radius for all component types).
   * Valid values: positive numbers up to 50 px (enforced by NodeRadiiSchema).
   *
   * Precedence (highest wins): `nodeRadii[componentType]` → `nodeRadii._default`
   *
   * ## Scaling with coordinateSpace.outputHint (resolution independence)
   *
   * When `coordinateSpace.outputHint.targetWidth` is present, these values are scaled
   * by the ratio `outputHint.targetWidth / coordinateSpace.width` before rasterisation:
   *
   * ```
   *   scaleFactor    = coordinateSpace.outputHint.targetWidth / coordinateSpace.width
   *   renderedRadius = nodeRadii[type] × scaleFactor
   * ```
   *
   * Use `computeScaleFactor(coordinateSpace)` from `coordinate-space.ts` to derive the
   * `ScaleFactor`; apply `scaleFactor.uniform` to all px-space values.
   *
   * This ensures a 5 px radius on a 1600 px canvas becomes 10 px when exported at 3200 px.
   * Contrast with `labelScale`, which is a **unitless multiplier** and is NOT scaled by
   * `outputHint` — it is already resolution-independent.
   *
   * @remarks CoordinateSpace category: **canvas px-space** — absolute pixels. Scale using
   *   `computeScaleFactor(coordinateSpace).uniform` when rasterising at a different resolution.
   *   Do NOT scale `labelScale` — it is a unitless multiplier and is resolution-independent.
   * @see coordinateSpace.outputHint — set targetWidth to declare output resolution
   * @see computeScaleFactor in coordinate-space.ts — derives ScaleFactor from CoordinateSpace
   * @see labelScale — unitless multiplier; NOT scaled by outputHint
   * @see NodeRadiiSchema in schema.ts — schema definition with positive number validation
   * @see CoordinateSpace — px-space coordinate system documentation
   * @category layout-structural
   */
  nodeRadii: NodeRadiiSchema.default({ _default: 5 }),

  /**
   * Stroke width in **canvas px-space** applied to:
   *   - Dependency relation edge lines
   *   - Node circle outlines
   *   - Evolution arrow lines
   *
   * Default: 1 px. Valid range: 0.25–8 px (enforced by Zod).
   *
   * ## Scaling with coordinateSpace.outputHint (resolution independence)
   *
   * When `coordinateSpace.outputHint.targetWidth` is present, this value is scaled
   * by the ratio `outputHint.targetWidth / coordinateSpace.width` before rasterisation:
   *
   * ```
   *   scaleFactor         = coordinateSpace.outputHint.targetWidth / coordinateSpace.width
   *   renderedStrokeWidth = strokeWidth × scaleFactor
   * ```
   *
   * Use `computeScaleFactor(coordinateSpace)` from `coordinate-space.ts` to derive the
   * `ScaleFactor`; apply `scaleFactor.uniform` to all px-space values.
   *
   * This ensures a 1 px stroke on a 1600 px canvas becomes 2 px when exported at 3200 px.
   * Contrast with `labelScale`, which is a **unitless multiplier** and is NOT scaled by
   * `outputHint` — it is already resolution-independent.
   *
   * @remarks CoordinateSpace category: **canvas px-space** — absolute pixel measurement.
   *   Scale using `computeScaleFactor(coordinateSpace).uniform`. Do NOT scale `labelScale`.
   * @see coordinateSpace.outputHint — set targetWidth to declare output resolution
   * @see computeScaleFactor in coordinate-space.ts — derives ScaleFactor from CoordinateSpace
   * @see nodeRadii — also canvas px-space; also scaled by outputHint
   * @see labelScale — unitless multiplier; NOT scaled by outputHint
   * @see CoordinateSpace — px-space coordinate system documentation
   * @category viewer-preference
   */
  strokeWidth: z.number().min(0.25).max(8).default(1),
});

/** TypeScript type for StylingConfig (inferred from StylingConfigSchema, with defaults applied) */
export type StylingConfig = z.infer<typeof StylingConfigSchema>;

/**
 * TypeScript input type for StylingConfig — accepts partial input before Zod applies defaults.
 * Use this type for function parameters that accept a user-provided styling config object.
 *
 * Difference from `StylingConfig`:
 *   - `StylingConfig.strokeWidth` is `number` (always present after parse)
 *   - `StylingConfigInput.strokeWidth` is `number | undefined` (optional before parse)
 *   - Same for `nodeRadii`
 */
export type StylingConfigInput = z.input<typeof StylingConfigSchema>;

/**
 * Default StylingConfig — the "out-of-box" styling when no explicit config is provided.
 *
 * Produced by parsing an empty object through StylingConfigSchema:
 *   - `strokeWidth`:   1 px
 *   - `nodeRadii`:     `{ _default: 5 }` (5 px radius for all types)
 *   - `typeColors`:    `undefined` (theme baseline palette applies for each type)
 *   - `evolveStyles`:  `undefined` (evolvesto-layer hardcoded per-type defaults apply)
 *
 * @see ThemeBaseline — per-theme palette that applies when typeColors is undefined
 * @see DEFAULT_THEME_BASELINE — the "default" theme baseline used when no theme is specified
 */
export const DEFAULT_STYLING_CONFIG: StylingConfig = StylingConfigSchema.parse({});

// ── Backward-compat flat-to-nested preprocess ────────────────────────────────
//
// Accepts old flat v1 keys (width, height, strokeWidth, fontFamily, etc.) and
// lifts them into the appropriate nested sub-objects before Zod validation runs.
//
// Precedence rule: explicit nested sub-objects win over lifted flat keys.
// Mixed usage: `{ width: 800, styling: { strokeWidth: 2 } }` produces
// `{ spatial: { width: 800 }, styling: { strokeWidth: 2 } }`.

/** Flat v1 keys that belong in the spatial sub-object */
const SPATIAL_FLAT_KEYS = ["width", "height", "coordinateSpace"] as const;
/** Flat v1 keys that belong in the styling sub-object */
const STYLING_FLAT_KEYS = ["strokeWidth", "typeColors", "evolveStyles", "nodeRadii"] as const;
/** Flat v1 keys that belong in the typography sub-object */
const TYPOGRAPHY_FLAT_KEYS = ["fontFamily", "labelScale"] as const;
/**
 * Flat v1 backward-compat keys that map to a different path in v2.
 * - `layerToggles` → `filters.layers` (canonical v2 path)
 */
const COMPAT_FLAT_KEYS = ["layerToggles"] as const;

/** All flat keys that will be lifted into sub-objects */
const ALL_FLAT_KEYS: readonly string[] = [
  ...SPATIAL_FLAT_KEYS,
  ...STYLING_FLAT_KEYS,
  ...TYPOGRAPHY_FLAT_KEYS,
  ...COMPAT_FLAT_KEYS,
];

/**
 * Backward-compat preprocess — lifts old flat v1 keys into the nested sub-config structure.
 *
 * When v1 flat keys (width, height, strokeWidth, fontFamily, etc.) are present:
 *   - They are merged into the corresponding sub-object (spatial/styling/typography)
 *   - Any explicit nested sub-object values override the lifted flat values
 *   - Non-lifted keys (theme, locale, background, filters, etc.) pass through unchanged
 *
 * ## Backward-compat shim: layerToggles → filters.layers
 * The old top-level `layerToggles` field (v1 / RenderConfigV2 early design) is
 * redirected to `filters.layers` — the canonical v2 path. If the caller also provides
 * `filters.layers` explicitly, that wins (explicit nested value takes precedence over
 * the lifted backward-compat key).
 *
 * Precedence for `filters.layers`:
 *   1. Explicit `filters.layers` in input (highest — canonical v2 usage)
 *   2. Top-level `layerToggles` flat key (lower — backward-compat shim)
 *
 * If no flat keys are present, the input passes through unchanged (zero-cost fast path).
 *
 * @param data - Raw input (may be flat v1 or nested v2 or mixed)
 * @returns Transformed input ready for nested Zod validation
 */
function flatToNestedPreprocess(data: unknown): unknown {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return data;

  const flat = data as Record<string, unknown>;

  // Fast path: no flat keys present — pass through as-is
  if (!ALL_FLAT_KEYS.some((key) => key in flat)) return flat;

  // Build result excluding flat keys and sub-object keys we'll reconstruct
  const EXCLUDED_FROM_COPY = new Set([...ALL_FLAT_KEYS, "spatial", "styling", "typography", "filters"]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!EXCLUDED_FROM_COPY.has(key)) {
      result[key] = value;
    }
  }

  // Build spatial: flat keys as base, explicit nested spatial overrides on top
  const spatialFromFlat: Record<string, unknown> = {};
  for (const k of SPATIAL_FLAT_KEYS) {
    if (k in flat) spatialFromFlat[k] = flat[k];
  }
  const spatialFromNested =
    typeof flat.spatial === "object" && flat.spatial !== null
      ? (flat.spatial as Record<string, unknown>)
      : {};
  const spatial = { ...spatialFromFlat, ...spatialFromNested };
  if (Object.keys(spatial).length > 0) result.spatial = spatial;

  // Build styling: flat keys as base, explicit nested styling overrides on top
  const stylingFromFlat: Record<string, unknown> = {};
  for (const k of STYLING_FLAT_KEYS) {
    if (k in flat) stylingFromFlat[k] = flat[k];
  }
  const stylingFromNested =
    typeof flat.styling === "object" && flat.styling !== null
      ? (flat.styling as Record<string, unknown>)
      : {};
  const styling = { ...stylingFromFlat, ...stylingFromNested };
  if (Object.keys(styling).length > 0) result.styling = styling;

  // Build typography: flat keys as base, explicit nested typography overrides on top
  const typoFromFlat: Record<string, unknown> = {};
  for (const k of TYPOGRAPHY_FLAT_KEYS) {
    if (k in flat) typoFromFlat[k] = flat[k];
  }
  const typoFromNested =
    typeof flat.typography === "object" && flat.typography !== null
      ? (flat.typography as Record<string, unknown>)
      : {};
  const typography = { ...typoFromFlat, ...typoFromNested };
  if (Object.keys(typography).length > 0) result.typography = typography;

  // Build filters: backward-compat shim for top-level `layerToggles` → `filters.layers`
  // Precedence: explicit filters.layers wins over lifted layerToggles.
  const filtersFromNested =
    typeof flat.filters === "object" && flat.filters !== null
      ? (flat.filters as Record<string, unknown>)
      : {};
  const filtersFromLayerToggles: Record<string, unknown> = {};
  if ("layerToggles" in flat && flat.layerToggles !== undefined) {
    // Only lift layerToggles if filters.layers is not explicitly provided
    filtersFromLayerToggles.layers = flat.layerToggles;
  }
  // Explicit filters.layers (from nested filters object) wins over layerToggles shim
  const filters = { ...filtersFromLayerToggles, ...filtersFromNested };
  if (Object.keys(filters).length > 0) result.filters = filters;
  else if (typeof flat.filters === "object" && flat.filters !== null) result.filters = flat.filters;

  return result;
}

// ── RenderConfigV2BaseSchema ─────────────────────────────────────────────────

/**
 * RenderConfigV2BaseSchema — top-level structured render config (no preprocess).
 *
 * Composes SpatialConfig, StylingConfig, and TypographyConfig sub-schemas alongside
 * the existing top-level fields into a coherent nested structure:
 *
 *   - `theme`           — visual theme preset ("default" | "dark" | "highContrast")
 *   - `locale`          — axis label locale ("en" | "fr")
 *   - `spatial`         — canvas dimensions and coordinate space (SpatialConfig)
 *   - `styling`         — stroke width, node radii, colors, evolve styles (StylingConfig)
 *   - `typography`      — font family and label scale (TypographyConfig)
 *   - `background`      — background color and axis/phase display controls
 *   - `filters`         — unified visibility filter (layers toggles + data-level type exclusion)
 *   - `legend`          — legend visibility and position
 *   - `avoidCollisions` — label collision avoidance flag
 *
 * All fields are optional — an empty object `{}` is always valid.
 *
 * ## Unified filters object — canonical visibility control
 * `filters.layers` operates at the **visual layer level** (post-render): toggling a layer
 * off skips its SVG fragment but all map data remains in the render context.
 * `filters.excludeComponentTypes` operates at the **data level** (pre-render): filtered
 * components are removed before any layer processes them, affecting ALL layers simultaneously.
 *
 * ## Backward-compat: top-level `layerToggles`
 * The old top-level `layerToggles` field (used in early v2 design) is accepted via the
 * `RenderConfigV2Schema` backward-compat shim and redirected to `filters.layers`.
 * Explicit `filters.layers` always wins over a top-level `layerToggles` key.
 *
 * @see RenderConfigV2Schema for the version with backward-compat flat-key preprocessing
 */
export const RenderConfigV2BaseSchema = z.object({
  /**
   * Named visual theme preset — selects baseline palette, font, and stroke defaults.
   * @category viewer-preference
   */
  theme: ThemeEnum.optional(),

  /**
   * Locale preset for built-in axis labels ("en" | "fr").
   * Overridable per-label in `background` sub-objects.
   * @category viewer-preference
   */
  locale: LocaleEnum.optional(),

  /**
   * Canvas coordinate space — width, height, and coordinate system declaration.
   * @category layout-structural
   */
  spatial: SpatialConfigSchema.optional(),

  /**
   * Visual styling — stroke width, node radii, type colors, evolve styles.
   * @category author-intent
   */
  styling: StylingConfigSchema.optional(),

  /**
   * Typography — font family and label scale multiplier.
   * @category viewer-preference
   */
  typography: TypographyConfigSchema.optional(),

  /**
   * Background canvas color and axis/phase display controls.
   * @category viewer-preference
   */
  background: BackgroundSchema.optional(),

  /**
   * Unified visibility filters — canonical mechanism for controlling what is shown in the
   * rendered output. Consolidates two previously separate mechanisms:
   *
   * ### `filters.layers` — Visual layer toggles (post-render)
   * Enables or disables individual SVG rendering layers. When a layer toggle is `false`,
   * that layer's renderer is skipped and contributes no SVG fragments — but all map data
   * remains loaded in the render context for other layers to reference.
   *
   * Layer dependency constraints (enforced by LayerTogglesSchema.superRefine):
   *   - `evolvesTo` requires `nodes=true` (arrows are anchored to node positions)
   *   - `labels` requires `nodes=true` (labels are positioned relative to node circles)
   *
   * ### `filters.excludeComponentTypes` — Data filter (pre-render)
   * Removes component types from the map data **before** any rendering layer processes them.
   * Filtered components are removed from ALL layers simultaneously.
   *
   * @see FiltersSchema in schema.ts for full Zod field definitions
   * @see LAYER_DEPENDENCY_CONSTRAINTS in schema.ts for machine-readable constraint declarations
   * @category viewer-preference
   */
  filters: FiltersSchema.optional(),

  /**
   * Legend visibility and position.
   * @category viewer-preference
   */
  legend: LegendSchema.optional(),

  /**
   * Enable/disable label collision avoidance (default: true).
   * @category layout-structural
   */
  avoidCollisions: z.boolean().optional(),
}).superRefine((data, ctx) => {
  // ── Legend {x,y} canvas bounds validation ─────────────────────────────────
  // When legend.position is an explicit {x, y} coordinate object, enforce that
  // the position lies within the canvas: 0 ≤ x ≤ width and 0 ≤ y ≤ height.
  // Canvas dimensions are read from the spatial sub-object (default 1600 × 800 px).
  const pos = data.legend?.position;
  if (pos !== undefined && typeof pos === "object" && "x" in pos && "y" in pos) {
    const canvasWidth = data.spatial?.width ?? 1600;
    const canvasHeight = data.spatial?.height ?? 800;
    const { x, y } = pos as { x: number; y: number };

    if (x < 0 || x > canvasWidth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legend", "position", "x"],
        message:
          `legend.position.x (${x}) is out of canvas bounds — must be between 0 and ${canvasWidth} (canvas width).`,
      });
    }

    if (y < 0 || y > canvasHeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legend", "position", "y"],
        message:
          `legend.position.y (${y}) is out of canvas bounds — must be between 0 and ${canvasHeight} (canvas height).`,
      });
    }
  }
});

/** TypeScript type for the top-level structured RenderConfigV2 */
export type RenderConfigV2 = z.infer<typeof RenderConfigV2BaseSchema>;

/** TypeScript input type for RenderConfigV2 (before Zod applies defaults to sub-schemas) */
export type RenderConfigV2Input = z.input<typeof RenderConfigV2BaseSchema>;

// ── RenderConfigV2Schema (with backward-compat preprocess) ───────────────────

/**
 * RenderConfigV2Schema — structured render config with backward-compatible flat-key parsing.
 *
 * Extends RenderConfigV2BaseSchema with a preprocess step that lifts old v1 flat keys
 * (width, height, strokeWidth, fontFamily, labelScale, nodeRadii, typeColors, evolveStyles,
 * coordinateSpace, layerToggles) into their respective nested sub-objects before Zod
 * validation runs.
 *
 * This ensures non-breaking evolution: both old flat configs and new nested configs are accepted.
 *
 * **Backward-compat transform examples:**
 * ```
 * // Old flat v1 keys → lifted into spatial sub-object
 * { width: 800, height: 400 }
 *   → { spatial: { width: 800, height: 400 } }
 *
 * // Old flat styling + typography keys → lifted into sub-objects
 * { strokeWidth: 2, fontFamily: "Roboto" }
 *   → { styling: { strokeWidth: 2 }, typography: { fontFamily: "Roboto" } }
 *
 * // Mixed: flat key lifted, explicit nested sub-object wins for overlapping keys
 * { width: 800, spatial: { width: 1920, coordinateSpace: { units: "px" } } }
 *   → { spatial: { width: 1920, coordinateSpace: { units: "px" } } }
 *
 * // New nested v2 keys → pass through as-is (fast path)
 * { theme: "dark", spatial: { width: 800 }, styling: { strokeWidth: 2 } }
 *   → { theme: "dark", spatial: { width: 800 }, styling: { strokeWidth: 2 } }
 *
 * // Backward-compat: top-level layerToggles → filters.layers
 * { layerToggles: { nodes: false, evolvesTo: false, labels: false } }
 *   → { filters: { layers: { nodes: false, evolvesTo: false, labels: false } } }
 *
 * // Explicit filters.layers wins over layerToggles shim
 * { layerToggles: { title: false }, filters: { layers: { edges: false } } }
 *   → { filters: { layers: { edges: false } } }
 * ```
 *
 * @see RenderConfigV2BaseSchema for the pure nested schema (no preprocess)
 * @see flatToNestedPreprocess for the transform logic and precedence rules
 */
export const RenderConfigV2Schema = z.preprocess(
  flatToNestedPreprocess,
  RenderConfigV2BaseSchema
);

// ── DEFAULT_RENDER_CONFIG ────────────────────────────────────────────────────

/**
 * Default render configuration — concrete baseline values for RenderConfigV2.
 *
 * Represents the standard "out-of-box" canvas configuration before any caller
 * overrides or theme resolution. Callers can spread or merge this with their
 * own partial config:
 *
 * @example Basic spread:
 *   const myConfig = { ...DEFAULT_RENDER_CONFIG, theme: "dark" };
 *
 * @example Deep merge for a sub-object:
 *   const myConfig: RenderConfigV2 = {
 *     ...DEFAULT_RENDER_CONFIG,
 *     spatial: { ...DEFAULT_RENDER_CONFIG.spatial, width: 1920 },
 *   };
 *
 * **Theme resolution precedence chain** (highest wins):
 * ```
 * Level 1 (lowest):  Theme baseline defaults
 *                    Selected by `theme` name ("default" | "dark" | "highContrast").
 *                    Provides fallback for every resolved field (palette, font, strokes).
 *                    Example: background.color="#ffffff", fontFamily="Inter, sans-serif"
 *
 * Level 2 (middle):  Explicit sub-config field overrides
 *                    Fields in spatial/styling/typography sub-objects override the theme baseline.
 *
 * Level 3 (highest): Explicit label string in background sub-objects
 *                    (background.color, background.evolutionXAxis.xAxis, etc.)
 *                    These override both theme baseline AND any sub-config field values.
 * ```
 *
 * @see resolveTheme in schema.ts for the full theme resolution function
 * @see ThemeBaseline for the per-theme palette/font/stroke baseline values
 */
export const DEFAULT_RENDER_CONFIG = {
  theme: "default",
  spatial: {
    width: 1600,
    height: 800,
  },
  styling: {
    strokeWidth: 1,
    nodeRadii: { _default: 5 },
  },
  typography: {
    fontFamily: "Inter, sans-serif",
    labelScale: 1.0,
  },
} satisfies RenderConfigV2;

// ── PhaseMapping ──────────────────────────────────────────────────────────────

/**
 * Canonical set of Wardley Map evolution phase style keys (closed enum).
 *
 * These four keys form the authoritative vocabulary for referencing individual
 * evolution phases in style maps, constraint graphs, and phase-range lookups.
 * They are intentionally decoupled from the display-label strings (which vary
 * by locale) and from the evolvesTo arrow types (EvolveTypeEnum).
 *
 * Ordering: genesis → custom → product → commodity (left to right, 0 → 1).
 */
export const PHASE_KEYS = ["genesis", "custom", "product", "commodity"] as const;

/**
 * TypeScript union type for a single Wardley Map evolution phase key.
 * Derived from the closed {@link PHASE_KEYS} tuple — adding a new phase
 * requires updating PHASE_KEYS (single source of truth).
 */
export type PhaseKey = (typeof PHASE_KEYS)[number];

/**
 * Zod schema for a single normalized [0..1] range tuple representing a
 * phase's positional span on the evolution axis.
 *
 * Constraints:
 *   - Both values must be in [0, 1]
 *   - start must be ≤ end (non-empty range)
 *
 * @example [0, 0.17]  → genesis zone spans from 0% to 17% of the axis
 * @example [0.63, 1]  → commodity zone spans from 63% to 100% of the axis
 */
export const PhaseRangeSchema = z
  .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
  .refine(([start, end]) => start <= end, {
    message: "PhaseRange start must be ≤ end",
  });

/** TypeScript type for a normalized [start, end] phase range on the evolution axis */
export type PhaseRange = z.infer<typeof PhaseRangeSchema>;

/**
 * PhaseMappingSchema — Zod schema binding each evolution phase style key to its
 * positional [start, end] range on the normalized [0..1] evolution axis.
 *
 * All four phase keys (genesis/custom/product/commodity) are required — the mapping
 * must be complete so that renderers can always find a range for any given phase.
 *
 * ### Relationship to other schemas
 * - **Decoupled from display labels**: `EvolutionPhasesSchema.phases` (open-length string
 *   array) controls which text labels are shown — PhaseMapping controls the positional
 *   ranges used for style lookups and geometry.
 * - **Decoupled from arrow types**: `EvolveTypeEnum` (natural/ecosystem/forced/late) is
 *   the vocabulary for evolution arrows; PhaseKey (genesis/custom/product/commodity) is
 *   the vocabulary for phase zones. The two are intentionally orthogonal.
 * - **Decoupled from ComponentType**: RenderConfig does not import the data-schema
 *   ComponentType enum at runtime; PhaseKey is render-layer-local vocabulary.
 *
 * ### CoordinateSpace category
 * All range values are **normalized [0, 1]** — they correspond to component
 * `position.evolution.scalar` values, not canvas pixels.
 * @see CoordinateSpace in coordinate-space.ts for the coordinate space taxonomy.
 *
 * @example
 *   PhaseMappingSchema.parse(DEFAULT_PHASE_MAPPING)
 *   // → { genesis: [0, 0.17], custom: [0.17, 0.37], product: [0.37, 0.63], commodity: [0.63, 1] }
 */
export const PhaseMappingSchema = z.object(
  Object.fromEntries(
    PHASE_KEYS.map((k) => [k, PhaseRangeSchema])
  ) as Record<PhaseKey, typeof PhaseRangeSchema>
);

/** TypeScript type for PhaseMapping — a complete map of phase keys to positional ranges */
export type PhaseMapping = z.infer<typeof PhaseMappingSchema>;

/**
 * Default phase mapping — the standard Wardley Map evolution zone boundaries.
 *
 * Binds the four canonical phase style keys to their [start, end] positional
 * ranges on the normalized [0..1] evolution axis:
 *
 * ```
 * ┌──────────────┬─────────────────┬────────────────────┬──────────────────────────┐
 * │  Genesis     │  Custom-Built   │  Product (+Rental) │  Commodity (+Utility)    │
 * │  0 → 0.17    │  0.17 → 0.37   │  0.37 → 0.63       │  0.63 → 1.0              │
 * └──────────────┴─────────────────┴────────────────────┴──────────────────────────┘
 * ```
 *
 * ### Usage
 * Renderers and constraint graph evaluators should use DEFAULT_PHASE_MAPPING as their
 * fallback when no explicit phase mapping is configured. Callers can provide a
 * custom PhaseMapping to override individual zone boundaries (e.g. for maps with
 * non-standard phase distributions).
 *
 * ### Non-breaking contract
 * This constant is additive — it does not modify any existing schema defaults or
 * function signatures. It serves as the declarative source of truth for phase
 * boundary positions that were previously hardcoded in individual renderers.
 *
 * @see PHASE_KEYS — the closed enum of phase style key names
 * @see PhaseMappingSchema — Zod schema for validating custom phase mappings
 * @see PhaseRange — the [start, end] range type
 */
export const DEFAULT_PHASE_MAPPING: PhaseMapping = {
  genesis:   [0,    0.17],
  custom:    [0.17, 0.37],
  product:   [0.37, 0.63],
  commodity: [0.63, 1.0],
};
