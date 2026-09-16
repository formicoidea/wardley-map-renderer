/**
 * Zod-free resolution-independence scale helper (browser-safe render path).
 * Re-exported from coordinate-space.ts.
 *
 * @module coordinate-scale
 */

import type { CoordinateSpace } from "./coordinate-space.js";

// ── ScaleFactor ──────────────────────────────────────────────────────────────

/**
 * Scale factors derived from a `CoordinateSpace` + `outputHint` pair.
 *
 * When `outputHint` is absent (or has no `targetWidth`/`targetHeight`), all
 * factors are `1` — no scaling is applied and the rendering is 1:1.
 *
 * When `outputHint.targetWidth` and/or `targetHeight` are present, the factors
 * represent the ratio between the requested output dimensions and the internal
 * canvas coordinate space:
 *
 * ```
 * x       = targetWidth  / coordinateSpace.width   (horizontal scale)
 * y       = targetHeight / coordinateSpace.height  (vertical scale)
 * uniform = min(x, y)                              (preserves proportions)
 * ```
 *
 * **Usage rules:**
 * - Apply `uniform` to **px-space** values (`nodeRadii`, `strokeWidth`) so that
 *   element sizes remain visually proportional to the output canvas.
 * - Do **NOT** apply any factor to `labelScale` — it is a unitless multiplier
 *   relative to a fixed base font size and is independent of canvas dimensions.
 * - Use `x` / `y` only when explicitly handling non-uniform scaling.
 *
 * @see computeScaleFactor — derives a ScaleFactor from a CoordinateSpace
 */
export interface ScaleFactor {
  /** Horizontal scale: targetWidth / coordinateSpace.width (1 when no hint) */
  readonly x: number;
  /** Vertical scale: targetHeight / coordinateSpace.height (1 when no hint) */
  readonly y: number;
  /**
   * Uniform scale — `min(x, y)`.
   *
   * Apply this to all px-space values (nodeRadii, strokeWidth) to maintain
   * proportional element sizes regardless of whether the canvas aspect ratio
   * changes.  When x === y (proportional resize), `uniform === x === y`.
   */
  readonly uniform: number;
}

// ── computeScaleFactor ───────────────────────────────────────────────────────

/**
 * Derive scale factors from a `CoordinateSpace`'s `outputHint`.
 *
 * ## Resolution-independence semantics
 *
 * The internal canvas coordinate space (`coordinateSpace.width` × `height`)
 * defines the pixel grid used for all layout calculations — component positions,
 * plot area margins, legend placement, etc.
 *
 * When `outputHint.targetWidth` / `targetHeight` are provided, the **renderer
 * output** should be sized to those target dimensions instead of the internal
 * canvas size.  All px-space values (node radii, stroke widths) must be scaled
 * by the resulting factor so that the rendered map looks visually identical
 * regardless of the output resolution.
 *
 * ## What IS scaled (px-space values)
 * - `nodeRadii` — node circle radii in canvas pixels
 * - `strokeWidth` — edge and outline stroke width in canvas pixels
 *
 * ## What is NOT scaled (unitless / normalized values)
 * - `labelScale` — unitless multiplier on the 12 px base font size; it is
 *   independent of canvas dimensions and MUST be left unchanged.
 * - Component positions (`evolution.scalar`, `visibility.scalar`) — already
 *   normalized [0, 1]; they are remapped by `evoToX`/`visToY` which use the
 *   new target dimensions.
 *
 * ## Scale factor formula
 * ```
 * x       = targetWidth  / coordinateSpace.width   (or 1 if targetWidth absent)
 * y       = targetHeight / coordinateSpace.height  (or 1 if targetHeight absent)
 * uniform = min(x, y)                              (use for px-space values)
 * ```
 *
 * ## Examples
 *
 * ```ts
 * // No outputHint — identity scale (no-op)
 * computeScaleFactor(DEFAULT_COORDINATE_SPACE)
 * // → { x: 1, y: 1, uniform: 1 }
 *
 * // Half-size output (e.g. thumbnail)
 * computeScaleFactor({ ...DEFAULT_COORDINATE_SPACE, outputHint: { targetWidth: 800, targetHeight: 400 } })
 * // → { x: 0.5, y: 0.5, uniform: 0.5 }
 *
 * // 2× retina: canvas is 1600×800, target display is 800×400 logical px at 2× DPR
 * // The scale factor is 0.5 — px-space values are halved so the map fits in
 * // the 800 px logical space (the 2× DPR is handled by the SVG viewBox).
 * computeScaleFactor({ ...DEFAULT_COORDINATE_SPACE, outputHint: { targetWidth: 800, targetHeight: 400 } })
 * // → { x: 0.5, y: 0.5, uniform: 0.5 }
 *
 * // Width-only hint — height scale defaults to 1
 * computeScaleFactor({ ...DEFAULT_COORDINATE_SPACE, outputHint: { targetWidth: 400 } })
 * // → { x: 0.25, y: 1, uniform: 0.25 }
 * ```
 *
 * @param coordinateSpace - Validated coordinate space (from `CoordinateSpaceSchema.parse`)
 * @returns ScaleFactor with `x`, `y`, and `uniform` fields (all `1` when no outputHint)
 *
 * @see ScaleFactor — return type documentation
 * @see OutputHint — the advisory hint structure embedded in CoordinateSpace
 * @see CoordinateSpace — parent type that embeds `outputHint?`
 */
export function computeScaleFactor(coordinateSpace: CoordinateSpace): ScaleFactor {
  const hint = coordinateSpace.outputHint;

  // Fast path: no hint → identity scale (no-op, avoids all arithmetic)
  if (!hint || (hint.targetWidth === undefined && hint.targetHeight === undefined)) {
    return { x: 1, y: 1, uniform: 1 };
  }

  const x = hint.targetWidth !== undefined
    ? hint.targetWidth / coordinateSpace.width
    : 1;

  const y = hint.targetHeight !== undefined
    ? hint.targetHeight / coordinateSpace.height
    : 1;

  const uniform = Math.min(x, y);

  return { x, y, uniform };
}
