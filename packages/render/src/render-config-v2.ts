/**
 * RenderConfig Zod schema — controls visual rendering of Wardley Maps.
 *
 * This schema is part of the API contract: consumers send renderConfig
 * alongside a WardleyMap JSON to customize the rendered output.
 *
 * All fields are optional with sensible defaults, making the simplest
 * request just a map with no renderConfig at all.
 *
 * Design principles:
 *   - Backward-compatible: new fields are always optional (additive only)
 *   - Extensible: theme/palette/layers can grow without breaking existing clients
 *   - Serializable: pure JSON, no functions or class instances
 *
 * @module render-config
 */

import { z } from "zod";

// ── Supported locales for axis labels ─────────────────────
export const LocaleEnum = z.enum(["en", "fr"]);

// ── Axis labels override (i18n) ───────────────────────────
// All fields optional, no defaults — only overrides what's explicitly set.
// RenderConfig variant: locale has no default so unset fields fall through
// to map.axes.labels or locale preset.
export const AxisLabelsOverrideSchema = z.object({
  /** Locale preset override (no default — only overrides if explicitly set) */
  locale: LocaleEnum.optional(),
  /** X-axis main label (e.g. "Evolution") */
  xAxis: z.string().optional(),
  /** Y-axis main label (e.g. "Value Chain" / "Chaîne de valeur") */
  yAxis: z.string().optional(),
  /** Evolution phase labels — exactly 4 strings: [Genesis, Custom, Product, Commodity] */
  phases: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  /** Direction indicator at left/start of evolution axis (e.g. "Uncharted") */
  evolutionStart: z.string().optional(),
  /** Direction indicator at right/end of evolution axis (e.g. "Industrialized") */
  evolutionEnd: z.string().optional(),
  /** Direction indicator at top of value chain axis (e.g. "Visible") */
  visibilityHigh: z.string().optional(),
  /** Direction indicator at bottom of value chain axis (e.g. "Invisible") */
  visibilityLow: z.string().optional(),
});

// ── Theme ───────────────────────────────────────────────────────
// Named visual themes. "default" is the classic Wardley Map look.
// Extensible: new themes can be added without breaking existing clients.
export const ThemeEnum = z.enum(["default", "dark", "highContrast"]);

// ── Color palette ───────────────────────────────────────────────
// Overrides for specific semantic color slots.
// Limited for v1 (extensible later with more slots).
export const PaletteSchema = z.object({
  /** Background color of the map canvas (CSS hex) */
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color (e.g. #ffffff)").optional(),

  /** Default node fill color (CSS hex) */
  nodeFill: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color").optional(),

  /** Default node stroke color (CSS hex) */
  nodeStroke: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color").optional(),

  /** Default edge/relation line color (CSS hex) */
  edgeStroke: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color").optional(),

  /** Label text color (CSS hex) */
  labelColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color").optional(),

  /** Axes and grid line color (CSS hex) */
  axisColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color").optional(),

  /** Pipeline background fill color (CSS hex) */
  pipelineFill: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color").optional(),

  /** Evolution arrow color (CSS hex) */
  evolveStroke: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color").optional(),
}).strict();

// ── Font configuration ──────────────────────────────────────────
export const FontSchema = z.object({
  /** Font family for all text elements (CSS font-family value) */
  family: z.string().min(1).optional(),

  /** Base font size in pixels for component labels */
  sizePx: z.number().int().min(6).max(48).optional(),

  /** Font size in pixels for the map title */
  titleSizePx: z.number().int().min(8).max(72).optional(),

  /** Font size in pixels for axis labels */
  axisSizePx: z.number().int().min(6).max(36).optional(),
}).strict();

// ── Layer toggles ───────────────────────────────────────────────
// Toggle visibility of individual rendering layers.
// All default to true (visible). Set to false to hide.
// Mirrors the canonical LayerName set from the renderer.
export const LayerTogglesSchema = z.object({
  /** Map title text above the plot area */
  title: z.boolean().optional(),

  /** Plot border, grid lines, phase dividers, axis labels */
  axes: z.boolean().optional(),

  /** Pipeline background rectangles */
  pipelines: z.boolean().optional(),

  /** Dependency relation lines */
  edges: z.boolean().optional(),

  /** Evolution movement arrows */
  evolvesTo: z.boolean().optional(),

  /** Component circles/markers */
  nodes: z.boolean().optional(),

  /** Component text labels */
  labels: z.boolean().optional(),

  /** Note annotations */
  notes: z.boolean().optional(),

  /** Legend overlay */
  legend: z.boolean().optional(),
}).strict();

// ── RenderConfig (top-level) ────────────────────────────────────
export const RenderConfigSchema = z.object({
  /** Named visual theme preset (defaults to "default") */
  theme: ThemeEnum.default("default"),

  /** Color palette overrides (applied on top of the selected theme) */
  palette: PaletteSchema.optional(),

  /** Font configuration */
  font: FontSchema.optional(),

  /** Stroke width in pixels for edges and node outlines (defaults to 1) */
  strokeWidth: z.number().min(0.25).max(8).default(1),

  /** Toggle visibility of individual rendering layers */
  layerToggles: LayerTogglesSchema.optional(),

  /** Axis label overrides — locale-aware with per-field overrides.
   *  Applied on top of map.axes.labels (highest priority).
   *  Uses AxisLabelsOverrideSchema (locale has no default) so unset fields
   *  fall through to map.axes.labels or locale preset. */
  axisLabels: AxisLabelsOverrideSchema.optional(),
}).strict();

// ── TypeScript types derived from Zod ───────────────────────────
export type Theme = z.infer<typeof ThemeEnum>;
export type Palette = z.infer<typeof PaletteSchema>;
export type Font = z.infer<typeof FontSchema>;
export type LayerToggles = z.infer<typeof LayerTogglesSchema>;
export type RenderConfig = z.infer<typeof RenderConfigSchema>;

// ── Defaults (useful for merging in the renderer) ───────────────
export const DEFAULT_RENDER_CONFIG: RenderConfig = RenderConfigSchema.parse({});

export const DEFAULT_PALETTE: Required<Palette> = {
  background: "#ffffff",
  nodeFill: "#000000",
  nodeStroke: "#000000",
  edgeStroke: "#000000",
  labelColor: "#000000",
  axisColor: "#999999",
  pipelineFill: "#e8e8e8",
  evolveStroke: "#cc0000",
};

export const DEFAULT_FONT: Required<Font> = {
  family: "Inter, sans-serif",
  sizePx: 12,
  titleSizePx: 18,
  axisSizePx: 10,
};

export const DEFAULT_LAYER_TOGGLES: Required<LayerToggles> = {
  title: true,
  axes: true,
  pipelines: true,
  edges: true,
  evolvesTo: true,
  nodes: true,
  labels: true,
  notes: true,
  legend: true,
};
