/**
 * wardley-map-zoom-utils.ts — Zoom-stable text rendering utilities.
 *
 * These utilities enable text elements in the Wardley Map SVG to maintain
 * a constant visual size regardless of the Edgeless canvas zoom level.
 *
 * ## How it works
 *
 * When the Edgeless canvas zooms in/out, it applies a CSS transform to
 * the surface. All SVG content scales proportionally — including text.
 * To counteract this, we render text at `baseFontSize / clampedZoom`,
 * which means:
 *
 *   • At zoom=2.0 (200%), font-size is halved in SVG units → visually same size
 *   • At zoom=0.5 (50%), font-size is doubled in SVG units → visually same size
 *   • Clamping prevents extreme sizes at very high/low zoom levels
 *
 * The zoom factor is clamped to [ZOOM_LABEL_SCALE_MIN, ZOOM_LABEL_SCALE_MAX]
 * to ensure labels never become unreadably small or absurdly large.
 */

import {
  ZOOM_LABEL_SCALE_MIN,
  ZOOM_LABEL_SCALE_MAX,
} from './wardley-map-consts.js';

/**
 * Clamp a zoom value to the safe range for label scaling.
 *
 * @param zoom - The raw canvas zoom level (e.g. 0.1 to 10.0)
 * @returns The clamped zoom, bounded by [ZOOM_LABEL_SCALE_MIN, ZOOM_LABEL_SCALE_MAX]
 */
export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_LABEL_SCALE_MIN, Math.min(zoom, ZOOM_LABEL_SCALE_MAX));
}

/**
 * Compute a zoom-stable font size.
 *
 * @param baseFontSize - The desired visual font size in pixels (at zoom=1.0)
 * @param zoom - The current canvas zoom level
 * @returns The SVG font-size value that will appear as `baseFontSize` visually
 *
 * @example
 * ```ts
 * // At zoom=2.0, to get 12px visual text:
 * zoomStableFontSize(12, 2.0) // => 6 (SVG px, renders as 12 visual px)
 *
 * // At zoom=0.5, to get 12px visual text:
 * zoomStableFontSize(12, 0.5) // => 24 (SVG px, renders as 12 visual px)
 *
 * // At zoom=1.0 (no zoom):
 * zoomStableFontSize(12, 1.0) // => 12 (no adjustment)
 * ```
 */
export function zoomStableFontSize(baseFontSize: number, zoom: number): number {
  return baseFontSize / clampZoom(zoom);
}

/**
 * Compute a zoom-stable stroke width.
 * Same principle as font size — structural lines that should not
 * change visual thickness with zoom.
 *
 * @param baseWidth - The desired visual stroke width at zoom=1.0
 * @param zoom - The current canvas zoom level
 * @returns The SVG stroke-width value that maintains constant visual width
 */
export function zoomStableStrokeWidth(baseWidth: number, zoom: number): number {
  return baseWidth / clampZoom(zoom);
}

/**
 * Options for zoom-stable SVG text rendering.
 */
export interface ZoomStableTextOptions {
  /** CSS fill color (default: inherited) */
  fill?: string;
  /** CSS font-weight (default: '400') */
  fontWeight?: string;
  /** SVG text-anchor: 'start' | 'middle' | 'end' (default: 'middle') */
  textAnchor?: string;
  /** SVG dominant-baseline (default: 'central') */
  dominantBaseline?: string;
  /** Rotation angle in degrees around the anchor point (default: 0 = no rotation) */
  rotate?: number;
}
