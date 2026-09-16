/**
 * coordinate-space.ts — CoordinateSpace definition
 *
 * Defines the CoordinateSpace structure that encapsulates ALL coordinate-system-
 * defining parameters for a Wardley Map canvas:
 *
 *   - Canvas pixel dimensions (`width`, `height`)
 *   - Evolution axis range as a normalized [start, end] tuple
 *   - Visibility axis range as a normalized [high, low] tuple
 *   - Coordinate unit declaration (`unit: 'canvas-px'`)
 *
 * ## Why a dedicated structure?
 *
 * These fields collectively define the mapping from normalized component
 * positions (in [0, 1] data space) to canvas pixel positions.  They are
 * COORDINATE-SYSTEM concerns and must NOT live inside decorative/chrome
 * containers (e.g. `background` / `MapChrome`) or scattered across the flat
 * `RenderConfig` top-level.
 *
 * ## Coordinate spaces in use
 *
 * Three distinct coordinate spaces are used across the render pipeline:
 *
 * **canvas px-space** (declared by this schema):
 *   - `width` / `height` — canvas pixel dimensions
 *   - node radii, stroke widths, legend `{x,y}` positions (external to this file)
 *   - When `outputHint.targetWidth` is present, all canvas px-space values
 *     are scaled by `outputHint.targetWidth / width` before rasterisation.
 *
 * **normalized [0, 1]** (component data — what `evolutionRange` and `visibilityRange` map):
 *   - `component.position.evolution.scalar` (0 = genesis, 1 = commodity)
 *   - `component.position.visibility.scalar` (0 = visible/top, 1 = invisible/bottom)
 *     OWM convention: 0 = top/most-visible, 1 = bottom/least-visible
 *
 * **unitless multipliers** (external to this file):
 *   - `labelScale` — multiplied by the 12 px base font size
 *   - Resolution-independent: NOT scaled by `outputHint.targetWidth / width`
 *
 * ## Default values
 *
 * `DEFAULT_COORDINATE_SPACE` reconstructs current renderer behavior exactly:
 *   - 1600 × 800 px canvas (MapKeep standard grid)
 *   - `evolutionRange: [0, 1]` — full Genesis → Commodity span
 *   - `visibilityRange: [0, 1]` — full Visible → Invisible span (OWM convention)
 *   - `unit: 'canvas-px'`
 *
 * @module coordinate-space
 */

import { z } from "zod";

/** Round a number to 3 decimal places (API boundary normalization). */
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ── OutputHintSchema ─────────────────────────────────────────────────────────

/**
 * Zod schema for resolution-independent output hints.
 *
 * An `OutputHint` is an **advisory** structure attached to a `CoordinateSpace`
 * that tells the renderer about the intended output dimensions and resolution.
 * It does NOT change the internal coordinate space — component positions are
 * always computed in the canvas px-space defined by `width` / `height`.
 *
 * ## Resolution-independence semantics
 *
 * A Wardley Map SVG is naturally resolution-independent — SVG is a vector
 * format.  However, raster exports (PNG, JPEG) and display scaling (retina
 * screens) require knowing the intended physical or logical output size.
 * `OutputHint` provides this information:
 *
 * | Field         | Meaning                                                  |
 * |---------------|----------------------------------------------------------|
 * | `targetWidth` | Intended display width in CSS pixels (logical pixels)    |
 * | `targetHeight`| Intended display height in CSS pixels (logical pixels)   |
 * | `dpi`         | Output DPI for raster exports (default: 96 = screen DPI) |
 *
 * ## Example — 2× retina export
 *
 * ```ts
 * // Canvas is 1600×800 px (internal coordinate space)
 * // Intended display is 800×400 logical pixels at 2× device pixel ratio
 * coordinateSpace: {
 *   width: 1600, height: 800,
 *   outputHint: { targetWidth: 800, targetHeight: 400, dpi: 192 }
 * }
 * ```
 *
 * ## All fields are optional
 *
 * When `outputHint` is absent (or all its fields are undefined), the renderer
 * treats the canvas pixel dimensions as the intended output size at 96 DPI.
 *
 * @see CoordinateSpaceSchema — parent schema that embeds this as `outputHint?`
 * @see OutputHint — TypeScript type inferred from this schema
 */
export const OutputHintSchema = z.object({
  /**
   * Intended display width in CSS / logical pixels.
   *
   * When provided, the renderer uses `targetWidth` as the SVG `width` attribute
   * and computes a scale factor of `coordinateSpace.width / targetWidth` for
   * raster exports.
   *
   * Default: `undefined` (falls back to `coordinateSpace.width`).
   *
   * Valid range: 1–10000 px.
   *
   * @category layout-structural
   */
  targetWidth: z
    .number()
    .positive()
    .max(10000, "targetWidth must not exceed 10000 px")
    .optional(),

  /**
   * Intended display height in CSS / logical pixels.
   *
   * When provided, the renderer uses `targetHeight` as the SVG `height`
   * attribute and computes a scale factor of `coordinateSpace.height /
   * targetHeight` for raster exports.
   *
   * Default: `undefined` (falls back to `coordinateSpace.height`).
   *
   * Valid range: 1–10000 px.
   *
   * @category layout-structural
   */
  targetHeight: z
    .number()
    .positive()
    .max(10000, "targetHeight must not exceed 10000 px")
    .optional(),

  /**
   * Output DPI (dots per inch) for raster exports.
   *
   * Used when exporting to PNG or JPEG to embed the correct resolution
   * metadata and scale the pixel buffer appropriately.
   *
   * Common values:
   * - `96`  — standard screen DPI (CSS reference pixel)
   * - `150` — draft print quality
   * - `192` — 2× retina screen DPI
   * - `300` — standard print quality
   *
   * Default: `undefined` (renderer assumes 96 DPI).
   *
   * Valid range: 1–2400 DPI.
   *
   * @category layout-structural
   */
  dpi: z
    .number()
    .positive()
    .max(2400, "dpi must not exceed 2400")
    .optional(),
});

/**
 * TypeScript type for resolution-independent output hints.
 *
 * Inferred from `OutputHintSchema`.  All fields are optional — the type
 * reflects the parsed shape where every field may be `undefined`.
 *
 * @see OutputHintSchema — Zod schema with validation
 * @see CoordinateSpace — parent type that embeds this as `outputHint?`
 */
export type OutputHint = z.infer<typeof OutputHintSchema>;

// ── CoordinateSpaceSchema ────────────────────────────────────────────────────

/**
 * Zod schema for the Wardley Map coordinate space.
 *
 * Encapsulates ALL coordinate-system-defining parameters for a map render:
 * canvas pixel dimensions, normalized axis ranges, and coordinate unit.
 *
 * ## Narrowed scope
 *
 * This schema is **exclusively a coordinate-system / layout concern**.  Every field
 * answers the question "how do I map a normalized component position to a canvas
 * pixel position?" — not "how does the map look to a viewer?" and not "what is the
 * author's intent?"  Fields are annotated with `@category platform-constraint`
 * (coordinate-system declarations) or `@category layout-structural` (canvas dimensions).
 *
 * Fields that control appearance (colors, fonts, label text) or layer visibility
 * belong in `MapChrome` / `RenderConfigSchema`, NOT here.
 *
 * All fields have defaults — the schema can be parsed with `{}` and will
 * return `DEFAULT_COORDINATE_SPACE`.
 *
 * ## Validation rules
 * - `width` and `height` must be positive and ≤ 10000 px
 * - `evolutionRange[0]` must be strictly less than `evolutionRange[1]`
 * - `visibilityRange[0]` (high/top) must be strictly less than `visibilityRange[1]` (low/bottom)
 * - Both range endpoints must be in [0, 1]
 * - `unit` only accepts `'canvas-px'` (the single supported unit)
 *
 * @example Default coordinate space (reconstructs current renderer behavior):
 *   CoordinateSpaceSchema.parse({})
 *   // → { width: 1600, height: 800, evolutionRange: [0, 1], visibilityRange: [0, 1], unit: 'canvas-px' }
 *
 * @example Half-size canvas with partial evolution range:
 *   CoordinateSpaceSchema.parse({ width: 800, height: 400, evolutionRange: [0.1, 0.9] })
 *   // → { width: 800, height: 400, evolutionRange: [0.1, 0.9], visibilityRange: [0, 1], unit: 'canvas-px' }
 *
 * @see DEFAULT_COORDINATE_SPACE — pre-built default instance
 * @see CoordinateSpace — TypeScript type inferred from this schema
 */
export const CoordinateSpaceSchema = z.object({
  /**
   * Coordinate units for canvas px-space values.
   * Only `"px"` (canvas pixels) is supported.
   *
   * Included for compatibility with `schema.ts`'s `CoordinateSpaceSchema` —
   * both declare `units: "px"` so that the `coordinateSpace` field on
   * `RenderConfigSchema` can be tested for either field name.
   *
   * @remarks This alias field shadows the `unit: "canvas-px"` declaration that
   *   is the primary unit identifier in this schema.
   * @category platform-constraint
   */
  units: z.literal("px").default("px"),
  /**
   * Origin convention for the canvas coordinate system.
   * `"top-left"` means (0, 0) is at the top-left corner.
   *
   * Included for compatibility with `schema.ts`'s `CoordinateSpaceSchema`.
   *
   * @category platform-constraint
   */
  origin: z.literal("top-left").default("top-left"),
  /**
   * Canvas width in pixels — defines the horizontal extent of the canvas.
   *
   * All px-space values (`nodeRadii`, `strokeWidth`, legend `{x,y}` positions)
   * are interpreted within this canvas width.  When you change `width`, scale
   * those px-space values proportionally.
   *
   * Default: 1600 px (MapKeep standard grid width).
   * Valid range: 1–10000 px.
   *
   * @remarks CoordinateSpace category: **canvas px-space**.
   * @category layout-structural
   */
  width: z
    .number()
    .positive()
    .max(10000, "Canvas width must not exceed 10000 px")
    .default(1600),

  /**
   * Canvas height in pixels — defines the vertical extent of the canvas.
   *
   * All px-space values (`nodeRadii`, `strokeWidth`, legend `{x,y}` positions)
   * are interpreted within this canvas height.  When you change `height`, scale
   * those px-space values proportionally.
   *
   * Default: 800 px (MapKeep standard grid height).
   * Valid range: 1–10000 px.
   *
   * @remarks CoordinateSpace category: **canvas px-space**.
   * @category layout-structural
   */
  height: z
    .number()
    .positive()
    .max(10000, "Canvas height must not exceed 10000 px")
    .default(800),

  /**
   * Evolution axis range as a `[start, end]` tuple in **normalized [0, 1]** space.
   *
   * - `start` — normalized evolution value mapped to the **left edge** of the canvas
   * - `end`   — normalized evolution value mapped to the **right edge** of the canvas
   *
   * In the standard Wardley Map convention:
   *   - 0 = Genesis (left / uncharted)
   *   - 1 = Commodity (right / industrialized)
   *
   * Use a sub-range (e.g. `[0.2, 0.8]`) to zoom into a portion of the evolution
   * axis without changing component position data.
   *
   * Constraint: `start` must be strictly less than `end`.
   * Default: `[0, 1]` — full Genesis → Commodity range.
   *
   * @remarks CoordinateSpace category: **normalized [0, 1]** — NOT px-space.
   * @category platform-constraint
   */
  evolutionRange: z
    .tuple([z.number().min(0).max(1).transform(round3), z.number().min(0).max(1).transform(round3)])
    .refine(([s, e]) => s < e, {
      message:
        "evolutionRange[0] (start) must be strictly less than evolutionRange[1] (end)",
    })
    .default([0, 1]),

  /**
   * Visibility axis range as a `[high, low]` tuple in **normalized [0, 1]** space.
   *
   * - `high` — normalized visibility value mapped to the **top edge** of the canvas
   * - `low`  — normalized visibility value mapped to the **bottom edge** of the canvas
   *
   * OWM visibility convention:
   *   - 0 = top / most visible (customer-facing)
   *   - 1 = bottom / least visible (infrastructure)
   *
   * In the default case `[0, 1]`, the full visibility range is shown.
   * Use a sub-range (e.g. `[0, 0.5]`) to focus on the visible half only.
   *
   * Constraint: `high` must be strictly less than `low`.
   * Default: `[0, 1]` — full Visible → Invisible range.
   *
   * @remarks CoordinateSpace category: **normalized [0, 1]** — NOT px-space.
   * @see OWM visibility convention — 0 = top/visible, 1 = bottom/invisible (no inversion).
   * @category platform-constraint
   */
  visibilityRange: z
    .tuple([z.number().min(0).max(1).transform(round3), z.number().min(0).max(1).transform(round3)])
    .refine(([h, l]) => h < l, {
      message:
        "visibilityRange[0] (high/top) must be strictly less than visibilityRange[1] (low/bottom)",
    })
    .default([0, 1]),

  /**
   * Coordinate unit declaration.
   *
   * Only `'canvas-px'` is supported — all `width`, `height`, `nodeRadii`,
   * `strokeWidth`, and legend `{x,y}` values are in canvas pixels.
   * Component positions (`evolution`, `visibility`) remain in normalized [0, 1]
   * space regardless of this setting.
   *
   * This field is primarily a machine-readable assertion/contract for API
   * consumers and documentation tools.
   *
   * Default: `'canvas-px'`.
   *
   * @category platform-constraint
   */
  unit: z.literal("canvas-px").default("canvas-px"),

  /**
   * Optional output hint for resolution-independent rendering.
   *
   * Provides hints to the renderer about the intended output dimensions and
   * resolution.  These are **advisory** — renderers may use them to:
   *   - Scale SVG viewBox / `width` and `height` attributes for retina displays
   *   - Embed correct DPI metadata in raster exports (PNG, JPEG)
   *   - Derive physical dimensions (e.g. for print) from pixel dimensions + DPI
   *
   * All fields are optional.  When absent the renderer falls back to the canvas
   * pixel dimensions (`width` / `height`) with an assumed screen DPI of 96.
   *
   * **Relationship to `width` / `height`:**
   * - `width` / `height` define the **canvas coordinate space** (pixel grid for
   *   layout calculations).
   * - `outputHint.targetWidth` / `targetHeight` declare the **intended display
   *   size** — e.g. a `2×` retina export would keep `width: 1600, height: 800`
   *   but set `targetWidth: 800, targetHeight: 400` (half the logical size) so
   *   the renderer knows to apply a 2× scale factor.
   *
   * When `outputHint` is absent the rendering is assumed to be 1:1 (no scaling).
   *
   * @category layout-structural
   * @see OutputHintSchema — Zod schema for this field
   * @see OutputHint — TypeScript type for this field
   */
  outputHint: OutputHintSchema.optional(),
});

// ── CoordinateSpace type ─────────────────────────────────────────────────────

/**
 * TypeScript type for the Wardley Map coordinate space.
 *
 * Inferred from `CoordinateSpaceSchema`.  All fields have required values after
 * parsing (defaults are applied by Zod; the type reflects the parsed shape).
 *
 * @see CoordinateSpaceSchema — Zod schema with validation and defaults
 * @see DEFAULT_COORDINATE_SPACE — pre-built default instance
 */
export type CoordinateSpace = z.infer<typeof CoordinateSpaceSchema>;

// ── DEFAULT_COORDINATE_SPACE ─────────────────────────────────────────────────

/**
 * Default CoordinateSpace instance — reconstructs current renderer behavior exactly.
 *
 * Values:
 * - `width: 1600` — MapKeep standard canvas width
 * - `height: 800` — MapKeep standard canvas height
 * - `evolutionRange: [0, 1]` — full Genesis → Commodity span
 * - `visibilityRange: [0, 1]` — full Visible → Invisible span (OWM convention)
 * - `unit: 'canvas-px'`
 *
 * Use as a starting point and spread-override individual fields:
 * ```ts
 * const space: CoordinateSpace = { ...DEFAULT_COORDINATE_SPACE, width: 800, height: 400 };
 * ```
 *
 * @see CoordinateSpaceSchema.parse({}) — always returns the same values
 */
export const DEFAULT_COORDINATE_SPACE: CoordinateSpace =
  CoordinateSpaceSchema.parse({});

// ScaleFactor / computeScaleFactor live in the zod-free coordinate-scale.ts
// (browser-safe render path) and are re-exported here.
export { computeScaleFactor, type ScaleFactor } from "./coordinate-scale.js";
