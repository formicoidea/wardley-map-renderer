import { z } from "zod";
import {
  resolveAxisLabels,
  type ResolvedAxisLabels,
} from "./blocks/wardley-map/wardley-map-consts.js";
import {
  KNOWN_RENDERABLE_TYPES,
  type KnownRenderableType,
} from "./renderable-type.js";
import {
  CoordinateSpaceSchema as CanvasCoordinateSpaceSchema,
  DEFAULT_COORDINATE_SPACE,
  type CoordinateSpace,
} from "./coordinate-space.js";
// New RenderConfig input shape (display/rendering/style) + adapter to the nested
// legacy shape. render-config-v3 has NO runtime dependency on this module (only a
// type-only import), so this import is cycle-safe.
import {
  RenderConfigV3Schema,
  renderConfigV3ToLegacy,
  type RenderConfigV3Input,
} from "./render-config-v3.js";

// Zod-free render helpers (browser-safe). Imported for internal use and re-exported.
import { evo, vis, evoTarget, visTarget, resolveColor, resolveTypeStyle } from "./schema-helpers.js";
export { evo, vis, evoTarget, visTarget, resolveColor, resolveTypeStyle };

// Re-export coordinate space types and defaults for convenience
export { DEFAULT_COORDINATE_SPACE } from "./coordinate-space.js";
export type { CoordinateSpace } from "./coordinate-space.js";

// ── Typography sub-schema (kept VALUE schema) ────────────────────────────────
// TypographyConfig (the type) is consumed by ResolvedRenderConfig.typography.
// Kept after the v3-only cutover; the v3 input maps style.global.{fontFamily,
// labelScale} → this shape via renderConfigV3ToLegacy.

/**
 * TypographyConfigSchema — groups font and text-scale concerns.
 *   - `fontFamily`  — CSS font-family stack applied to all map text elements
 *   - `labelScale`  — unitless multiplier for component label font size
 *
 * Each leaf has its own `.default()` — omit partially or entirely.
 */
export const TypographyConfigSchema = z.object({
  /** CSS font-family stack applied to all map text elements. Default: "Inter, sans-serif" */
  fontFamily: z.string().default("Inter, sans-serif"),
  /**
   * Unitless multiplier for component label font size.
   * Base: 12 px; 1.0 = no scaling. Resolution-independent.
   * Valid range: >0 to 5×.
   */
  labelScale: z.number().positive().max(5).default(1.0),
  /**
   * Global comfort multiplier applied to EVERY text (title, axes, phases,
   * legend, component labels) on top of per-element scales:
   * `fontSize = base × textScale × elementScale`. Absent → 1.
   */
  textScale: z.number().positive().max(5).optional(),
  /**
   * Per-element label scales from `style.<element>.label.scale` (absent → 1).
   * `nodes` is keyed by renderable type (`_default` fallback).
   */
  elementScales: z.object({
    title: z.number().positive().max(5).optional(),
    legend: z.number().positive().max(5).optional(),
    axisEvolution: z.number().positive().max(5).optional(),
    axisValueChain: z.number().positive().max(5).optional(),
    phases: z.array(z.number().positive().max(5).optional()).optional(),
    nodes: z.record(z.string(), z.number().positive().max(5)).optional(),
  }).optional(),
});

/** TypeScript type for TypographyConfig (output after Zod defaults applied) */
export type TypographyConfig = z.infer<typeof TypographyConfigSchema>;

// ── 3-decimal precision helper ──────────────────────────────
/** Round a number to 3 decimal places (API boundary normalization). */
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ── Evolution axis ──────────────────────────────────────────
// Phase 1: single float. Phase 2+: swap to distribution array.
export const EvolutionSchema = z.number().min(0).max(1).transform(round3);

// ── Evolution range (optional min-max span) ─────────────────
// Represents a component's evolution uncertainty or span as [min, max].
// Both values are normalized [0, 1] and min must be ≤ max.
export const EvolutionRangeSchema = z
  .tuple([EvolutionSchema, EvolutionSchema])
  .refine(([min, max]) => min <= max, {
    message: "evolutionRange[0] (min) must be ≤ evolutionRange[1] (max)",
  });

// ── Node taxonomy: type → subtype → nature ─────────────────────────────────
// type:    top-level node category (3 values).
// subtype: refines a component; informationally labels a pipeline.
// nature:  METADATA only — NO visual effect (kept for analysis/LLM value).
// Per-type validity of subtype/nature is enforced by ComponentSchema.superRefine.
export const ComponentTypeEnum = z.enum(["anchor", "component", "pipeline"]);

/**
 * Subtype superset. `component` uses the full set; `pipeline` accepts the subset
 * {functional, userNeed, solution} (informational only — no child constraint).
 */
export const SubtypeEnum = z.enum([
  "userNeed",
  "market",
  "ecosystem",
  "solution",
  "functional",
  "supplier",
]);
export type Subtype = z.infer<typeof SubtypeEnum>;

/**
 * Nature — metadata only (no visual effect). Allowed set depends on type/subtype:
 *   anchor                → personae | generic | group
 *   component / userNeed  → natural | anthropic
 *   component / functional→ practice | data | activity | knowledge
 */
export const NatureEnum = z.enum([
  "personae",
  "generic",
  "group",
  "natural",
  "anthropic",
  "practice",
  "data",
  "activity",
  "knowledge",
]);
export type Nature = z.infer<typeof NatureEnum>;

// Per-branch allowed sets (consumed by ComponentSchema.superRefine).
const ANCHOR_NATURES = ["personae", "generic", "group"] as const;
const USERNEED_NATURES = ["natural", "anthropic"] as const;
const FUNCTIONAL_NATURES = ["practice", "data", "activity", "knowledge"] as const;
const COMPONENT_SUBTYPES = [
  "userNeed",
  "market",
  "ecosystem",
  "solution",
  "functional",
  "supplier",
] as const;
const PIPELINE_SUBTYPES = ["functional", "userNeed", "solution"] as const;

// ── Label (nested: name + optional position offset) ─────────
export const LabelPositionSchema = z.object({
  dx: z.number(),
  dy: z.number(),
});

export const LabelSchema = z.object({
  name: z.string(),
  position: LabelPositionSchema.optional(),
});

// ── Position (nested: evolution + visibility) ────────────────
export const EvolutionFieldSchema = z.object({
  scalar: EvolutionSchema,
  range: EvolutionRangeSchema.optional(),
});

export const VisibilityFieldSchema = z.object({
  scalar: z.number().min(0).max(1).transform(round3),
});

export const PositionSchema = z.object({
  evolution: EvolutionFieldSchema,
  visibility: VisibilityFieldSchema,
});

// ── EvolveType enum (closed set of arrow movement types) ────────────────────
/**
 * Closed enum of all supported evolution arrow types.
 * Derived from the data schema — this is the single source of truth for valid evolveType values.
 * Also used as keys in RenderConfig.evolveStyles to ensure evolveStyles stays in sync.
 */
export const EvolveTypeEnum = z.enum(["natural", "ecosystem", "forced", "late"]);
export type EvolveType = z.infer<typeof EvolveTypeEnum>;

// ── EvolvesTo target ────────────────────────────────────────
export const EvolvesToSchema = z.object({
  position: z.object({
    evolution: z.object({ scalar: EvolutionSchema }),
    visibility: z.object({ scalar: z.number().min(0).max(1).transform(round3) }),
  }),
  evolveType: EvolveTypeEnum.default("natural"),
  /** When true, indicates resistance to evolution (inertia barrier at phase boundary). */
  inertia: z.boolean().optional(),
});

// ── Pipeline geometry ───────────────────────────────────────
// Pipeline-specific bounding box and handle position
export const PipelineGeometrySchema = z.object({
  evoStart: EvolutionSchema,
  evoEnd: EvolutionSchema,
  visStart: z.number().min(0).max(1).transform(round3),
  visEnd: z.number().min(0).max(1).transform(round3),
  handleEvolution: EvolutionSchema.optional(),
});

// ── Method decorator (generic category + recommendation) ───────────────────
// Generic named category (e.g. "buying-policy"); `recommendation` is a per-component
// label (e.g. an evolution-zone descriptor). Per-category styling lives in the
// RenderConfig under style.decorators.method (keyed by category).
export const MethodSchema = z.object({
  category: z.string(),
  recommendation: z.string(),
});

// ── Step decorator (numbered sticker on a component) ───────────────────────
export const StepDecoratorSchema = z.object({
  number: z.number().int().min(1),
  color: z.string().optional(),
});

// ── Component (node) ───────────────────────────────────────────────────────
// Single object + superRefine (rather than a discriminated union) so the inferred
// type stays a flat object for the many consumers that read fields generically.
export const ComponentSchema = z
  .object({
    id: z.string(),
    label: LabelSchema,
    type: ComponentTypeEnum,
    // Refines a component; informational label on a pipeline. Validity per type.
    subtype: SubtypeEnum.optional(),
    // Metadata only — NO visual effect. Validity depends on type/subtype.
    nature: NatureEnum.optional(),
    position: PositionSchema,
    description: z.string().optional(),
    // Evolution movement targets
    evolvesTo: z.array(EvolvesToSchema).optional(),
    // Pipeline geometry (only for type === "pipeline")
    pipelineGeometry: PipelineGeometrySchema.optional(),
    // Optional color override (Tailwind-style name, e.g. "red-600")
    color: z.string().optional(),
    // ── Gameplay decorators (component-level annotations) ──
    method: MethodSchema.optional(),
    inertia: z.boolean().optional(),
    accelerator: z.boolean().optional(),
    deaccelerator: z.boolean().optional(),
    step: StepDecoratorSchema.optional(),
  })
  .superRefine((c, ctx) => {
    if (c.type === "anchor") {
      if (c.subtype !== undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subtype"], message: "anchor must not have a subtype" });
      if (c.nature !== undefined && !ANCHOR_NATURES.includes(c.nature as (typeof ANCHOR_NATURES)[number]))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nature"], message: `anchor nature must be one of: ${ANCHOR_NATURES.join(", ")}` });
    } else if (c.type === "component") {
      if (c.subtype !== undefined && !COMPONENT_SUBTYPES.includes(c.subtype as (typeof COMPONENT_SUBTYPES)[number]))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subtype"], message: `component subtype must be one of: ${COMPONENT_SUBTYPES.join(", ")}` });
      if (c.nature !== undefined) {
        const allowed: readonly string[] =
          c.subtype === "userNeed" ? USERNEED_NATURES :
          c.subtype === "functional" ? FUNCTIONAL_NATURES :
          [];
        if (!allowed.includes(c.nature))
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nature"], message: `nature for component/${c.subtype ?? "(no subtype)"} must be one of: ${allowed.join(", ") || "(none — only userNeed|functional carry a nature)"}` });
      }
    } else if (c.type === "pipeline") {
      if (c.subtype !== undefined && !PIPELINE_SUBTYPES.includes(c.subtype as (typeof PIPELINE_SUBTYPES)[number]))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subtype"], message: `pipeline subtype must be one of: ${PIPELINE_SUBTYPES.join(", ")}` });
      if (c.nature !== undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nature"], message: "pipeline must not have a nature" });
    }
  });

// ── Relation (edge) ────────────────────────────────────────
// Breaking change: consumer/supplier replaces source/target (which had replaced from/to)
// flow: optional semantic annotation for the nature of the dependency
// Relation types:
//   - DependsOn: standard dependency (A depends on B)
//   - Flow: data/value/information flow between components
//   - Constraint: regulatory, policy, or structural constraint
export const RelationTypeEnum = z.enum(["DependsOn", "Flow", "Constraint"]);

export const FlowSchema = z.object({
  /** Semantic label describing what flows along the edge (e.g. "data", "money", "risk", "information") */
  label: z.string(),
  /** Optional visual style hint for the edge (e.g. "dashed", "bold") */
  style: z.enum(["solid", "dashed", "bold"]).default("solid"),
});

export const RelationSchema = z.object({
  id: z.string(), // unique relation identifier (required)
  consumer: z.string(), // component id (dependency origin — the depender, consumes the supplier)
  supplier: z.string(), // component id (dependency destination — the depended-upon, supplies the consumer)
  type: RelationTypeEnum.default("DependsOn"),
  /** Optional flow annotation describing what passes along this edge */
  flow: FlowSchema.optional(),
});

// ── Supported locales for axis labels ─────────────────────
export const LocaleEnum = z.enum(["en", "fr"]);

// ── Axis labels (i18n) ────────────────────────────────────
// All fields optional — renderConfig.axes.locale selects the preset, individual fields override.
export const AxisLabelsSchema = z.object({
  /** X-axis main label (e.g. "Evolution") */
  xAxis: z.string().optional(),
  /** Y-axis main label (e.g. "Value Chain" / "Chaîne de valeur") */
  yAxis: z.string().optional(),
  /**
   * Ordered list of evolution phase labels — arbitrarily sized (not locked to 4).
   *
   * Default presets provide 4 labels (Genesis / Custom-Built / Product / Commodity),
   * but any number ≥ 1 is accepted to match maps with a different number of zones.
   *
   * Each entry is `string | undefined`:
   *   - `undefined` — use the locale-preset label for that index (per-element fallback)
   *   - `''`        — suppress the label for that phase column (explicit empty)
   *   - `'text'`    — use exactly that string regardless of locale (explicit override)
   *
   * @see ResolvedAxisLabels.phases — corresponding resolved field (always `string[]` after resolution)
   * @see resolveAxisLabels — resolution function preserving explicit-empty vs absent distinction
   */
  phases: z.array(z.string().optional()).min(1).optional(),
  /** Direction indicator at left/start of evolution axis (e.g. "Uncharted") */
  evolutionStart: z.string().optional(),
  /** Direction indicator at right/end of evolution axis (e.g. "Industrialized") */
  evolutionEnd: z.string().optional(),
  /** Direction indicator at top of value chain axis (e.g. "Visible") */
  visibilityHigh: z.string().optional(),
  /** Direction indicator at bottom of value chain axis (e.g. "Invisible") */
  visibilityLow: z.string().optional(),
});

// ── Axes config ───────────────────────────────────────────
// The legacy `AxesConfigSchema` (wrapping locale + axisLabels) was an INPUT
// wrapper, removed in the v3-only cutover. The locale lives in `rendering.locale`
// (v3) and axis label text in `style.background.{axisEvolution,axisValueChain,
// phases}.label.text`. The internal bridge output exposes them as
// RenderConfigInput.axes.{locale,axisLabels} (a plain shape). `AxisLabelsSchema`
// (above) is kept — it is the leaf value schema consumed by resolveTheme.

// ── Legend config ──────────────────────────────────────────
export const LegendPositionEnum = z.enum([
  "top-left", "top-right", "bottom-left", "bottom-right", "auto"
]);

/**
 * Explicit pixel-coordinate anchor for the legend bounding box.
 *
 * `{x, y}` represents the **top-left corner** of the legend bounding box in
 * canvas px-space (origin = top-left corner of the canvas, x increases rightward,
 * y increases downward).
 *
 * The legend box extends rightward and downward from this anchor point.
 * Validation enforces `0 ≤ x ≤ canvasWidth` and `0 ≤ y ≤ canvasHeight`
 * so that the anchor itself always lies within the canvas area.
 *
 * Note: the legend box may extend beyond the canvas right/bottom edge if the
 * legend content is wide/tall relative to the remaining canvas space. Use
 * `legendOverflow` on `LegendSchema` to control this behaviour.
 *
 * @example Position legend top-left anchor at (100, 600):
 *   legend: { position: { x: 100, y: 600 } }
 *
 * @remarks CoordinateSpace category: **canvas px-space**.
 * @see LegendSchema.legendOverflow for overflow handling when the box exceeds canvas bounds
 */
export const LegendPositionXYSchema = z.object({
  /**
   * Horizontal distance in px from the canvas left edge to the **left edge**
   * of the legend bounding box (px-space, canvas coordinate space).
   * Valid range: `0 ≤ x ≤ canvasWidth`.
   */
  x: z.number(),
  /**
   * Vertical distance in px from the canvas top edge to the **top edge**
   * of the legend bounding box (px-space, canvas coordinate space).
   * Valid range: `0 ≤ y ≤ canvasHeight`.
   */
  y: z.number(),
});

/**
 * Controls how a legend bounding box that extends beyond the canvas boundary is handled.
 *
 * This field is only relevant when `position` is an explicit `{x, y}` coordinate
 * that places the legend anchor near the canvas edge.
 *
 * - `'allow'`  *(default)* — the legend SVG is rendered as-is; overflow is visible
 *   beyond the canvas bounds when the SVG viewport allows it. Safe for most consumers.
 * - `'clip'`   — the legend SVG group is wrapped in a `<clipPath>` that clips content
 *   to the canvas rectangle. Useful when exporting to PNG or embedding in constrained containers.
 * - `'warn'`   — same as `'allow'` but the renderer emits a console warning when the
 *   legend box extends beyond the canvas. Useful during authoring/debugging.
 *
 * Named positions (`"top-left"`, `"bottom-right"`, `"auto"`, etc.) are automatically
 * clamped to fit within the canvas, so `legendOverflow` has no effect for those values.
 */
export const LegendOverflowEnum = z.enum(["clip", "allow", "warn"]);
export type LegendOverflow = z.infer<typeof LegendOverflowEnum>;

export const LegendSchema = z.object({
  /**
   * Show or hide the legend box.
   * Default: true (visible).
   * @category viewer-preference
   */
  show: z.boolean().default(true),
  /**
   * Legend position — a named anchor ("top-left", "bottom-right", etc.) or explicit
   * pixel coordinates `{x, y}` in canvas px-space.
   * Default: "bottom-right".
   * @category viewer-preference
   */
  position: z.union([LegendPositionEnum, LegendPositionXYSchema]).default("bottom-right"),
  /**
   * Controls behaviour when the legend bounding box extends beyond the canvas boundary.
   * Only meaningful when `position` is an explicit `{x, y}` coordinate object.
   * Default: `'allow'` (render as-is, no clipping).
   * @see LegendOverflowEnum for full semantics of each option
   * @category viewer-preference
   */
  legendOverflow: LegendOverflowEnum.default("allow"),
});

// ── Node radii (TypeStyleMap<number> with required _default) ──────────────
/**
 * NodeRadiiSchema — TypeStyleMap<number> for per-type node circle radii.
 *
 * Uses the `typeStyleMapSchema` factory (see TypeStyleMap section below) with
 * `requireDefault: true`:
 *   - `_default` is **required** — ensures a fallback exists for any unlisted renderable type
 *   - Per-type keys (KNOWN_RENDERABLE_TYPES values) are optional — override `_default` for that type
 *   - Unknown keys are **rejected** at parse time (strict schema, closed key set)
 *
 * Precedence (highest wins): `nodeRadii[componentType]` → `nodeRadii._default`
 *
 * @see typeStyleMapSchema — the generic factory used to create this schema
 * @see KNOWN_RENDERABLE_TYPES — the rendering-local closed set of valid per-type keys
 * @see CoordinateSpace in coordinate-space.ts for the canvas coordinate space definition
 *
 * @example All types use 5 px:
 *   nodeRadii: { _default: 5 }
 *
 * @example Anchors larger, others at default:
 *   nodeRadii: { _default: 5, anchor: 10 }
 *
 * @example Full per-type override:
 *   nodeRadii: { _default: 5, "user-need": 7, anchor: 6, pipeline: 4 }
 *
 * @example Unknown key rejected (strict schema, TypeStyleMap pattern):
 *   nodeRadii: { _default: 5, unknownKey: 3 }  // ← parse error
 */
export const NodeRadiiSchema = typeStyleMapSchema(
  z.number().positive().max(50),
  KNOWN_RENDERABLE_TYPES,
  { requireDefault: true }
);

/**
 * NodeRadii — TypeScript type for per-type node circle radii.
 *
 * `_default` is required; RenderableType keys (component, user-need, pipeline, note, anchor)
 * are optional per-type overrides.
 *
 * Explicitly defined (rather than inferred via `z.infer`) so that consumers receive a
 * concrete `{ _default: number } & Record<string, number>` type instead of the widened
 * `{ [x: string]: unknown }` that Zod infers from the dynamically-built shape object.
 */
export type NodeRadii = { _default: number } & Record<string, number>;

// ── TypeStyleMap — generic per-type styling abstraction ───────────────────
/**
 * Generic Zod schema factory for a **TypeStyleMap**: a record keyed by type name
 * with a required `_default` fallback entry.
 *
 * This is the unified pattern used by `nodeRadii`, `typeColors`, and `evolveStyles`.
 * All three follow the same `_default` fallback mechanism:
 *
 * ```
 * Precedence (highest wins): map[specificType]  →  map._default
 * ```
 *
 * `_default` is **required** when the map object is provided — it ensures a
 * meaningful fallback exists for any type not explicitly listed.
 * The containing field (e.g. `typeColors`) remains optional; omitting it entirely
 * keeps current behaviour (no per-type overrides).
 *
 * @param valueSchema - Zod schema for each map value
 *
 * @example Per-type color overrides with fallback:
 *   typeColors: { _default: "#000000", component: "#ff0000" }
 *
 * @example All types use the same radius:
 *   nodeRadii: { _default: 5 }
 */
export function makeTypeStyleMapSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({ _default: valueSchema }).catchall(valueSchema);
}

/**
 * TypeStyleMap schema factory — creates a **strict** per-type style override map with a
 * closed key set. Unknown keys are rejected at parse time via `.strict()`.
 *
 * The resulting Zod schema accepts:
 *   - `_default` — required when `options.requireDefault` is `true`; optional otherwise
 *   - Each key in `enumOptions` — optional per-type override
 *   - All other keys — **rejected** (strict schema)
 *
 * ## `requireDefault` semantics
 * - `requireDefault: true` (e.g. `nodeRadii`): `_default` must always be present when the
 *   field is provided. Ensures a fallback for every component type not explicitly listed.
 * - `requireDefault: false` (default, e.g. `evolveStyles`): `_default` is optional; the
 *   renderer's hardcoded per-type defaults serve as the final fallback level.
 *
 * ## Precedence (highest wins)
 * ```
 * map[specificType]  →  map._default  →  renderer hardcoded defaults
 * ```
 *
 * @param valueSchema        - Zod schema for each style value
 * @param enumOptions        - Closed set of valid per-type keys (e.g. KNOWN_RENDERABLE_TYPES)
 * @param options            - Optional configuration
 * @param options.requireDefault - When true, `_default` is required; otherwise optional
 *
 * @example nodeRadii — required _default, strict KNOWN_RENDERABLE_TYPES keys:
 *   typeStyleMapSchema(z.number().positive().max(50), KNOWN_RENDERABLE_TYPES, { requireDefault: true })
 *   // Accepts: { _default: 5, anchor: 10 }
 *   // Rejects: { _default: 5, unknownKey: 3 }   ← unknown key
 *   // Rejects: { anchor: 10 }                    ← missing required _default
 *
 * @example evolveStyles — optional _default, strict EvolveTypeEnum keys:
 *   typeStyleMapSchema(EvolveStyleSchema, EvolveTypeEnum.options)
 *   // Accepts: {}
 *   // Accepts: { _default: { stroke: "#333" }, natural: { stroke: "#dc2626" } }
 *   // Rejects: { genesis: { stroke: "#000" } }   ← unknown key
 */
export function typeStyleMapSchema<TValue extends z.ZodTypeAny>(
  valueSchema: TValue,
  enumOptions: readonly string[],
  options?: { requireDefault?: boolean }
) {
  const shape: Record<string, z.ZodTypeAny> = {
    _default: options?.requireDefault
      ? valueSchema
      : (valueSchema.optional() as z.ZodOptional<TValue>),
  };
  for (const k of enumOptions) {
    shape[k] = valueSchema.optional() as z.ZodOptional<TValue>;
  }
  return z.object(shape).strict();
}

/**
 * TypeStyleMap<T> — a per-`RenderableType` style override map with a required `_default`
 * fallback key.  All values share the same type `T`.
 *
 * Key type: `RenderableType | '_default'`
 *  - `_default` — required when the map object is provided; acts as the catch-all fallback.
 *  - `KnownRenderableType` keys (component, user-need, pipeline, note, anchor) — optional
 *    explicit per-type overrides.
 *  - Branded/unknown renderable type strings — also accepted via the index signature
 *    derived from `BrandedRenderableType`, ensuring forward-compatible extensibility.
 *
 * **No import of the data-layer `ComponentType` enum is needed**: all style-map keying
 * uses the rendering-local `RenderableType` vocabulary declared in `renderable-type.ts`.
 *
 * Consumers look up values via `resolveTypeStyle` (preferred) or directly:
 * ```ts
 * const value = map[specificType] ?? map._default;
 * ```
 *
 * Precedence (highest wins): `map[specificType]` → `map._default`
 *
 * Note: for `evolveStyles` the `_default` is optional (non-breaking).
 * Use `Partial<TypeStyleMap<T>>` where `_default` must not be required.
 */
export type TypeStyleMap<T> = { _default: T } & { [K in KnownRenderableType]?: T } & { [key: string]: T | undefined };

// ── TypeColors (per-component-type color overrides) ──────────────────────
// TypeColors uses makeTypeStyleMapSchema which enforces _default as a REQUIRED
// key at both the Zod validation level and the TypeScript type level.
/**
 * Per-component-type color override map using the TypeStyleMap pattern.
 *
 * `_default` is required when the object is provided and acts as the
 * catch-all fallback color for any component type not explicitly listed.
 *
 * Precedence (highest wins):
 * ```
 * component.color  →  typeColors[componentType]  →  typeColors._default  →  NODE_STROKE
 * ```
 *
 * @example Override all types with a dark default, components in red:
 *   typeColors: { _default: "#374151", component: "#dc2626" }
 *
 * @example Single type override (anchor in blue, others use node default):
 *   typeColors: { _default: "#000000", anchor: "#2563eb" }
 */
export const TypeColorsSchema = makeTypeStyleMapSchema(z.string());

export type TypeColors = z.infer<typeof TypeColorsSchema>;

// ── Coordinate space declaration ────────────────────────────────────────────
/**
 * Explicit coordinate space declaration for the Wardley Map canvas.
 *
 * The canvas coordinate system places (0, 0) at the top-left corner.
 * Only "px" (canvas pixels) is supported as coordinate units.
 *
 * Three distinct coordinate spaces are in use across the schema:
 *
 * **px-space** (declared by this schema):
 *   - canvas dimensions: `width` / `height` (default 1600 × 800 px)
 *   - node radii: `nodeRadii._default` / per-type (absolute pixels)
 *   - stroke width: `strokeWidth` (default 1 px)
 *   - legend position when `{x, y}` object (pixels from top-left corner)
 *   - When `outputHint.targetWidth` is set, ALL px-space values must be scaled
 *     by `outputHint.targetWidth / width` before rasterisation.
 *
 * **unitless multipliers** (relative scale, not in px-space):
 *   - `labelScale` — multiplied by the 12 px base font size (default 1.0)
 *   - Resolution-independent: NOT scaled by `outputHint`
 *
 * **normalized [0, 1]** (component data, not affected by canvas dimensions):
 *   - `component.position.evolution.scalar` (0 = genesis, 1 = commodity)
 *   - `component.position.visibility.scalar` (0 = visible/top, 1 = invisible/bottom)
 *
 * @see CoordinateSpace in coordinate-space.ts for the full documentation
 * @see OutputHintSchema — declares targetWidth for resolution-independence scaling
 */
export const CoordinateSpaceSchema = z.object({
  /**
   * Coordinate units for all px-space values in RenderConfig.
   * Only `"px"` (canvas pixels) is supported — component positions remain
   * in normalized [0, 1] space regardless of this setting.
   *
   * @category platform-constraint
   */
  units: z.literal("px").default("px"),
  /**
   * Origin convention for the canvas coordinate system.
   * `"top-left"` means (0, 0) is at the top-left corner of the canvas.
   * This is the only supported origin; provided for explicit documentation purposes.
   *
   * @category platform-constraint
   */
  origin: z.literal("top-left").default("top-left"),
});

export type CoordinateSpaceDeclaration = z.infer<typeof CoordinateSpaceSchema>;

// ── Render config (optional visual overrides embedded in map JSON) ──
// Mirrors RenderOptions from render/types.ts but as a Zod schema,
// allowing render hints to travel with the map payload.

/** Evolve arrow style per evolve type */
export const EvolveStyleSchema = z.object({
  stroke: z.string().optional(),
  strokeDasharray: z.string().optional(),
});

/**
 * Mapping of EvolveType → EvolveStyle, with an optional `_default` catch-all fallback.
 *
 * Uses the TypeStyleMap pattern (see `makeTypeStyleMapSchema`), but with OPTIONAL `_default`
 * (non-breaking evolution: existing callers that omit `_default` continue to work, falling
 * through to the renderer's hardcoded per-type defaults).
 *
 * Keys are constrained to the closed EvolveTypeEnum plus `_default`. Unknown keys are
 * rejected at parse time (.strict()).
 *
 * ## `_default` semantics
 * When `_default` IS provided, it inserts a mid-level override:
 *
 * ```
 * Resolution order per property (highest wins):
 *   1. Explicit per-type key  (e.g. natural.stroke)
 *   2. _default               (catch-all fallback from caller-supplied map)
 *   3. Hardcoded renderer default  (EVOLVE_STYLES in evolvesto-layer.ts)
 * ```
 *
 * ## Known tension: closed evolveStyles keys vs. open-length phaseLabels
 * The `EvolveTypeEnum` keys (natural / ecosystem / forced / late) are derived from
 * the data-schema `ComponentType` and form a **closed enum**.  By contrast, the
 * phase-label array (`background.evolutionPhases.phases`) is **open-length** — a map
 * can display any number of labelled evolution columns.
 *
 * This creates a deliberate mismatch between the *display vocabulary* (how many
 * labelled columns exist) and the *style vocabulary* (which named arrow types exist).
 * The two are intentionally decoupled: adding more phase columns does NOT require
 * adding new `evolveStyles` keys, and the evolveStyles enum does NOT dictate how
 * many phase dividers the map renders.
 *
 * **Migration path**: a future version will replace named `evolveStyles` keys with
 * position-range-based styles mapping `[evolutionStart, evolutionEnd]` intervals to
 * arrow styles, removing the hard coupling to named zone labels entirely.
 *
 * @example Override all types with a single _default:
 *   { _default: { stroke: "#666666", strokeDasharray: "4,2" } }
 *
 * @example Mix _default with per-type override:
 *   { _default: { stroke: "#888888" }, natural: { stroke: "#dc2626" } }
 *   // natural uses #dc2626; ecosystem/forced/late fall back to #888888
 */
export const EvolveStylesMapSchema = (() => {
  // Inline factory: strict schema with optional `_default` + optional EvolveType keys.
  // Contrast with makeTypeStyleMapSchema (used by nodeRadii/typeColors) which requires `_default`.
  const shape: Record<string, z.ZodOptional<typeof EvolveStyleSchema>> = {
    _default: EvolveStyleSchema.optional(),
  };
  for (const k of EvolveTypeEnum.options) {
    shape[k] = EvolveStyleSchema.optional();
  }
  return z.object(shape).strict();
})();

// ── Theme ────────────────────────────────────────────────
// Named visual themes. "default" is the classic Wardley Map look.
// dark/highContrast are placeholders (identical to default for now).
export const ThemeEnum = z.enum(["default", "dark", "highContrast"]);

// ── Background layer sub-schemas ─────────────────────────
// Controls display of background canvas elements: axes, phase dividers, labels.

/**
 * Evolution (X) axis display controls and main label override.
 *
 * All fields are `@category viewer-preference` — they control what a viewer sees
 * (show/hide axis, label text) without affecting the coordinate system.
 */
export const EvolutionXAxisSchema = z.object({
  /**
   * Show evolution (X) axis arrow and main label (default: true).
   *
   * @category viewer-preference
   */
  show: z.boolean().optional(),
  /**
   * i18n override for the x-axis main label (e.g. "Evolution"). Locale preset used if absent.
   *
   * @category viewer-preference
   */
  xAxis: z.string().optional(),
});

/**
 * Value Chain (Y) axis display controls and main label override.
 *
 * All fields are `@category viewer-preference` — they control what a viewer sees
 * (show/hide axis, label text) without affecting the coordinate system.
 */
export const ValueChainYAxisSchema = z.object({
  /**
   * Show value chain (Y) axis arrow and main label (default: true).
   *
   * @category viewer-preference
   */
  show: z.boolean().optional(),
  /**
   * i18n override for the y-axis main label (e.g. "Value Chain"). Locale preset used if absent.
   *
   * @category viewer-preference
   */
  yAxis: z.string().optional(),
});

/**
 * @deprecated Sub-AC 2 (MapChrome refactor): direction indicator label overrides
 * (`evolutionStart`, `evolutionEnd`, `visibilityHigh`, `visibilityLow`) have been
 * removed from `MapChrome` / `BackgroundSchema`.  Direction cue labels are now
 * locale-only — use `renderConfig.axes.locale` to select the language preset.
 *
 * This schema is kept as an empty object to preserve the exported type name for
 * downstream consumers; any previously supported fields are silently stripped by Zod.
 */
export const AxisDirectionLabelsSchema = z.object({});

/**
 * Evolution phase dividers, labels display controls, and i18n phase label overrides.
 *
 * Toggling `showPhaseDividerAndLabel=false` hides BOTH the dashed phase
 * divider lines AND the phase labels (Genesis/Custom-Built/Product/Commodity),
 * independently of whether the evolution axis itself is shown.
 *
 * All fields are `@category viewer-preference` — they control presentational
 * phase scaffolding without affecting the coordinate system or component data.
 */
export const EvolutionPhasesSchema = z.object({
  /**
   * Show evolution phase dividers (dashed vertical lines) AND phase labels together (default: true).
   *
   * @category viewer-preference
   */
  showPhaseDividerAndLabel: z.boolean().default(true),
  /**
   * Ordered list of i18n overrides for evolution phase labels.
   *
   * Arbitrarily sized — not locked to 4. Default presets supply 4 labels
   * (Genesis / Custom-Built / Product / Commodity). Any array with ≥ 1 element
   * is accepted so that maps with non-standard phase counts can be labeled correctly.
   *
   * ## Phase vocabulary vs. evolveStyles keys — known tension
   * The `evolveStyles` keys (natural / ecosystem / forced / late) are a **closed enum**
   * derived from the data-schema `ComponentType`.  This `phases` array is now **open-length**.
   * There is therefore a deliberate mismatch: you can display 3 or 5 phase columns
   * while `evolveStyles` still uses the four named arrow types.
   *
   * **Migration path**: a future version will replace named `evolveStyles` keys with
   * position-range-based styles `[evolutionStart, evolutionEnd] → style`, removing
   * the hard coupling between named zone labels and arrow-style vocabulary entirely.
   *
   * ## Explicit-empty vs. absent distinction
   *
   * Each element in the array is `string | undefined`:
   *   - `undefined`  → use the locale-preset label for that phase index (per-element fallback)
   *   - `''`         → suppress the label for that phase column (explicit empty suppression)
   *   - `'text'`     → use exactly that string, overriding the locale preset for that index
   *
   * If the `phases` field itself is omitted (`undefined`), the full locale preset array is used.
   *
   * @category viewer-preference
   * @see resolveAxisLabels — resolution function that preserves the explicit-empty vs absent distinction
   */
  phases: z.array(z.string().optional()).min(1).optional(),
});

/**
 * Map chrome: canvas fill color + presentational axis/phase display controls.
 *
 * `BackgroundSchema` / `MapChrome` contains **only presentational axis/phase
 * configuration** — the decorative scaffolding that gives the map its Wardley Map
 * identity but does not define the coordinate system or encode component data:
 *
 *  - **Canvas background color** (`color`) — the fill behind the plot area
 *  - **Evolution (X) axis** (`evolutionXAxis`) — show/hide toggle + main label override
 *  - **Value Chain (Y) axis** (`valueChainYAxis`) — show/hide toggle + main label override
 *  - **Phase dividers & labels** (`evolutionPhases`) — dashed vertical lines and phase
 *    label overrides (Genesis / Custom-Built / Product / Commodity)
 *
 * ## Ontological scope
 *
 * This object is a **pure viewer-preference container**.  Every field answers the
 * question "what does the viewer want to see?" — show/hide axes, override label text,
 * change the canvas background color.
 *
 * It does NOT contain:
 *  - Coordinate-system-defining fields (`width`, `height`, `evolutionRange`,
 *    `visibilityRange`, `coordinateSpace`) — those live in {@link CoordinateSpace}
 *  - Axis direction indicator labels (`evolutionStart`, `evolutionEnd`,
 *    `visibilityHigh`, `visibilityLow`) — removed in Sub-AC 2; direction cues are
 *    now locale-only (see `renderConfig.axes.locale`)
 *  - Any author-intent or data-layer fields
 *
 * All fields (including sub-fields of nested schemas) carry `@category viewer-preference`.
 *
 * ## Field inventory
 * | Field              | Category           | Purpose                                                 |
 * |--------------------|--------------------|---------------------------------------------------------|
 * | `color`            | viewer-preference  | Canvas fill color (cosmetic, theme-controlled)          |
 * | `evolutionXAxis`   | viewer-preference  | X-axis show toggle + main label override                |
 * | `valueChainYAxis`  | viewer-preference  | Y-axis show toggle + main label override                |
 * | `evolutionPhases`  | viewer-preference  | Phase divider/label show toggle + phase label overrides |
 *
 * The field is named `background` on {@link RenderConfigSchema} for backward
 * compatibility; use the {@link MapChromeSchema} alias and {@link MapChrome}
 * type in new code.
 *
 * @alias background — field name on RenderConfigSchema (preserved for backward compatibility)
 * @see CoordinateSpace — for coordinate-system-defining fields (width, height, ranges)
 * @see MapChromeSchema — preferred alias for this schema in new code
 */
export const BackgroundSchema = z.object({
  /**
   * Canvas background color (CSS hex, 3–8 digit, defaults to "#ffffff").
   *
   * @category viewer-preference
   */
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Must be a valid hex color").optional(),
  /**
   * Evolution (X) axis show toggle and main label override.
   *
   * @category viewer-preference
   */
  evolutionXAxis: EvolutionXAxisSchema.optional(),
  /**
   * Value Chain (Y) axis show toggle and main label override.
   *
   * @category viewer-preference
   */
  valueChainYAxis: ValueChainYAxisSchema.optional(),
  /**
   * Evolution phase dividers and labels display controls.
   *
   * @category viewer-preference
   */
  evolutionPhases: EvolutionPhasesSchema.optional(),
});

/**
 * Alias for {@link BackgroundSchema} — prefer this name in new code.
 *
 * `MapChromeSchema` contains **only presentational axis/phase configuration** for
 * a Wardley Map render: canvas background color, axis show/hide toggles, main axis
 * label overrides, phase divider visibility, and phase label overrides.
 *
 * The underlying schema is identical to `BackgroundSchema`; the `background`
 * field name is preserved on {@link RenderConfigSchema} for backward compatibility.
 *
 * ## Ontological scope (presentational only)
 *
 * Every field in `MapChromeSchema` is `@category viewer-preference` — including all
 * sub-fields of nested schemas (`EvolutionXAxisSchema`, `ValueChainYAxisSchema`,
 * `EvolutionPhasesSchema`).  They control what a viewer sees without touching the
 * coordinate system or component data.
 *
 * Explicitly out of scope for `MapChromeSchema`:
 *  - Coordinate-system-defining fields (`width`, `height`, `evolutionRange`,
 *    `visibilityRange`, `coordinateSpace`) — live in {@link CoordinateSpace}
 *  - Axis direction indicator labels — locale-only since Sub-AC 2
 *  - Any author-intent, interaction, or temporal diff concerns
 *
 * @see BackgroundSchema — underlying schema (identical, preserved for backward compat)
 * @see CoordinateSpace — coordinate-system-defining fields live here, NOT in MapChrome
 */
export const MapChromeSchema = BackgroundSchema;

// ── LayerToggleDAG — layer toggle constraint graph ──────────────────────────
//
// Formalizes visibility-toggle constraints between rendering layers as a DAG.
// An edge { dependent: "A", requires: "B" } means:
//   when B is toggled off, A must also be toggled off.
//
// DISTINCT from the render-level LAYER_DAG (render/layer-dag.ts) which
// captures implementation data-dependencies needed during Phase 1 geometry
// computation. This DAG captures user-facing semantic constraints — which
// layers have no meaningful visual output without another layer being visible.
//
// The generic validator `validateLayerToggles(dag)` traverses this DAG at
// schema-validation time, producing one ZodIssue per violated edge.
// No hand-coded per-pair logic exists in LayerTogglesSchema.superRefine.

/**
 * A single directed dependency edge in the layer toggle constraint DAG.
 *
 * Semantics: when `requires` is set to `false`, `dependent` must also be
 * explicitly set to `false` (because `dependent` has no meaningful visual
 * output without `requires` being rendered).
 */
export interface LayerToggleDependencyEdge {
  /** The layer that has a visual dependency on another layer */
  readonly dependent: string;
  /** The layer that must be visible for `dependent` to render meaningfully */
  readonly requires: string;
  /** Human-readable explanation of why this dependency exists */
  readonly reason: string;
}

/**
 * A layer toggle constraint DAG — an ordered list of dependency edges.
 *
 * The generic validator (`validateLayerToggles`) traverses all edges and
 * emits a Zod issue for each violated constraint. New constraints are added
 * by extending `LAYER_TOGGLE_DAG` alone — no changes to superRefine are needed.
 */
export type LayerToggleDAG = readonly LayerToggleDependencyEdge[];

/**
 * Canonical toggle constraint DAG for Wardley Map rendering layers.
 *
 * This is the **single source of truth** for which layers require other
 * layers to be visible. Both `LayerTogglesSchema.superRefine` (via the
 * generic `validateLayerToggles` validator) and `LAYER_DEPENDENCY_CONSTRAINTS`
 * (the legacy flat-map export) are derived from this instance.
 *
 * Declared constraints:
 *   - evolvesTo → nodes: arrows are anchored to node pixel positions
 *   - labels    → nodes: label placement uses node bounding boxes
 *
 * Note: `edges → nodes` is NOT a toggle constraint. Although `edges` uses
 * node positions during geometry computation (Phase 1), it can be
 * independently toggled off without semantic inconsistency — that is an
 * implementation dependency, not a user-facing toggle constraint.
 *
 * @see render/layer-dag.ts for the render-level data-dependency DAG (which
 *   does include edges → nodes as an implementation dependency).
 */
export const LAYER_TOGGLE_DAG = [
  {
    dependent: "evolvesTo",
    requires: "nodes",
    reason: "evolvesTo arrows are anchored to node positions",
  },
  {
    dependent: "labels",
    requires: "nodes",
    reason: "labels are positioned relative to node circles",
  },
] as const satisfies LayerToggleDAG;

/**
 * Generic Zod superRefine validator derived by traversing a LayerToggleDAG.
 *
 * For each edge in the DAG, checks: if `requires` is off (false) and
 * `dependent` is on (true or unset — defaulting to visible), adds a ZodIssue.
 *
 * No hand-coded per-pair logic — new constraints are added by extending
 * `LAYER_TOGGLE_DAG` alone; this function is agnostic to the specific pairs.
 *
 * @param dag - The toggle constraint DAG to traverse
 * @returns A superRefine callback suitable for use with `.superRefine(...)`
 */
export function validateLayerToggles(
  dag: LayerToggleDAG,
): (data: Record<string, boolean | undefined>, ctx: z.RefinementCtx) => void {
  return (data, ctx) => {
    for (const edge of dag) {
      // Absent toggle defaults to visible (true) — same as each layer renderer's default.
      const requiredVisible = (data[edge.requires] as boolean | undefined) ?? true;
      const dependentVisible = (data[edge.dependent] as boolean | undefined) ?? true;

      if (!requiredVisible && dependentVisible) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [edge.dependent],
          message:
            `${edge.dependent} layer requires ${edge.requires}=true — ${edge.reason}. ` +
            `Set ${edge.dependent}: false when ${edge.requires}: false.`,
        });
      }
    }
  };
}

// ── Layer toggles ────────────────────────────────────────────────
// Controls visibility of the 7 content layers independently.
//
// Excluded from layerToggles — these have dedicated controls:
//   - 'axes'   → background.evolutionXAxis / valueChainYAxis / evolutionPhases
//   - 'legend' → legend.show
//
// All toggles default to true (visible) when absent/undefined.
//
// Layer dependency constraints are encoded in LAYER_TOGGLE_DAG (above) and
// enforced generically via validateLayerToggles — no per-pair hardcoded logic.
export const LayerTogglesSchema = z
  .object({
    /**
     * Show/hide the title layer (map title text above plot area). Default: true
     * @category viewer-preference
     */
    title: z.boolean().optional(),
    /**
     * Show/hide the pipelines layer (pipeline background rectangles). Default: true
     * @category viewer-preference
     */
    pipelines: z.boolean().optional(),
    /**
     * Show/hide the edges layer (dependency relation lines). Default: true
     * @category viewer-preference
     */
    edges: z.boolean().optional(),
    /**
     * Show/hide the evolvesTo layer (evolution movement arrows). Default: true.
     * Dependency: requires nodes=true (evolvesTo arrows are anchored to node positions).
     * @category viewer-preference
     */
    evolvesTo: z.boolean().optional(),
    /**
     * Show/hide the nodes layer (component circles/markers). Default: true.
     * If set to false, evolvesTo and labels must also be set to false.
     * @category viewer-preference
     */
    nodes: z.boolean().optional(),
    /**
     * Show/hide the labels layer (component text labels). Default: true.
     * Dependency: requires nodes=true (labels are positioned relative to node circles).
     * @category viewer-preference
     */
    labels: z.boolean().optional(),
    /**
     * Show/hide the notes layer (note annotations). Default: true
     * @category viewer-preference
     */
    notes: z.boolean().optional(),
  })
  .superRefine(validateLayerToggles(LAYER_TOGGLE_DAG));

/**
 * Layer dependency constraints — flat-map view derived from `LAYER_TOGGLE_DAG`.
 *
 * Each key is a layer that **depends on** another layer being visible.
 * The value is the required layer that must be enabled (or left at its default of true)
 * for the dependent layer to render correctly.
 *
 * This constant is a backward-compat projection of `LAYER_TOGGLE_DAG` for consumers
 * that need the simple key→value shape. The authoritative source of constraints is
 * `LAYER_TOGGLE_DAG`; add new constraints there (not here).
 *
 * Constraint enforcement happens via `LayerTogglesSchema.superRefine`, which
 * traverses `LAYER_TOGGLE_DAG` generically — no hand-coded per-pair logic.
 *
 * @example
 *   `evolvesTo: "nodes"` — evolvesTo arrows are anchored to node circle positions.
 *                          When nodes=false, evolvesTo must also be false.
 *   `labels: "nodes"` — label positions are computed relative to node circles.
 *                        When nodes=false, labels must also be false.
 */
export const LAYER_DEPENDENCY_CONSTRAINTS = Object.fromEntries(
  LAYER_TOGGLE_DAG.map((e) => [e.dependent, e.requires])
) as { readonly evolvesTo: "nodes"; readonly labels: "nodes" };

// ── Legacy RenderConfig INPUT sub-schemas (REMOVED in v3-only cutover) ─────────
// FiltersSchema, SpatialConfigSchema, StylingConfigSchema (and their DEFAULT_*
// constants + input/output types) were INPUT wrapper schemas for the deleted
// legacy RenderConfigSchema. The public input shape is now RenderConfigV3Schema;
// the internal nested intermediate is the plain `RenderConfigInput` interface
// (above). The leaf VALUE schemas they referenced — NodeRadiiSchema,
// TypeColorsSchema, EvolveStylesMapSchema, BackgroundSchema, LayerTogglesSchema —
// are KEPT (consumed by the bridge output + resolveTheme).

// ── ConfigIntent (scope-boundary intent flags as first-class booleans) ──
//
// ConfigIntentSchema uses z.boolean() with defaults, allowing future renderer variants
// to declare different intent profiles (e.g. an interactive HTML/canvas renderer
// that sets noInteraction: false) while sharing the same schema and merge infrastructure.
//
// When a RenderConfig is resolved via resolveTheme(), configIntent is always fully resolved
// (no undefined) — consumers do not need to null-coalesce.

/**
 * Zod schema for configurable scope-boundary intent flags.
 *
 * Declares **what this renderer does** (`staticExport: true`) and
 * **what it does NOT do** (`noTemporalDiff: true`, `noInteraction: true`) as
 * first-class, mergeable boolean metadata.
 *
 * `ConfigIntentSchema` uses `z.boolean()` with defaults, making
 * the flags configurable for future renderer variants without breaking the schema shape.
 *
 * **Default values** (all `true` for `@wardleyapi/render`):
 *
 * | Flag             | Default | Meaning                                              |
 * |------------------|---------|------------------------------------------------------|
 * | `staticExport`   | `true`  | Output is a one-shot static SVG/PNG                  |
 * | `noTemporalDiff` | `true`  | Temporal diffing (map-version comparison) is excluded |
 * | `noInteraction`  | `true`  | SVG output is inert (no JS, no event listeners)      |
 *
 * @see DEFAULT_CONFIG_INTENT — default values as a plain typed constant
 * @see resolveConfigIntent — merges a partial override over the defaults
 */
export const ConfigIntentSchema = z.object({
  /**
   * Whether this renderer produces a one-shot static export.
   *
   * When `true`: no streaming, no incremental updates, no mutable rendering state
   * between successive render calls.
   *
   * Default: `true` — `@wardleyapi/render` is always a static-export renderer.
   * @category platform-constraint
   */
  staticExport: z.boolean().default(true),
  /**
   * Whether temporal diffing is out of scope for this renderer.
   *
   * When `true`: comparing two map versions, computing deltas, or rendering
   * change indicators (added/removed/moved) is not supported by this renderer.
   *
   * Default: `true` — this renderer only handles single-snapshot maps.
   * @category platform-constraint
   */
  noTemporalDiff: z.boolean().default(true),
  /**
   * Whether interaction handlers are out of scope for this renderer.
   *
   * When `true`: the SVG output is inert — no JS, no event listeners, no hover
   * state, no pan/zoom, no drag-and-drop.
   *
   * Default: `true` — `@wardleyapi/render` emits inert SVG markup.
   * @category platform-constraint
   */
  noInteraction: z.boolean().default(true),
});

/** TypeScript type inferred from {@link ConfigIntentSchema}. */
export type ConfigIntent = z.infer<typeof ConfigIntentSchema>;

/** Input type for ConfigIntent — accepts partial input before defaults */
export type ConfigIntentInput = z.input<typeof ConfigIntentSchema>;

/**
 * Default ConfigIntent for the `@wardleyapi/render` package.
 *
 * All scope-boundary flags are `true`:
 * - `staticExport: true`   — static export only, no streaming
 * - `noTemporalDiff: true` — temporal diffing is excluded
 * - `noInteraction: true`  — SVG output is inert
 *
 * Injected by {@link resolveTheme} into every {@link ResolvedRenderConfig} when
 * no explicit `configIntent` is supplied in the input config.
 *
 * @see ConfigIntentSchema — the Zod schema this is derived from
 * @see resolveConfigIntent — merges partial overrides over these defaults
 */
export const DEFAULT_CONFIG_INTENT: ConfigIntent = ConfigIntentSchema.parse({});

/**
 * Resolve a partial ConfigIntent by merging explicit fields over
 * {@link DEFAULT_CONFIG_INTENT}.
 *
 * ## Precedence chain (highest wins):
 *
 * ```
 * Level 1 (lowest):  DEFAULT_CONFIG_INTENT
 *                    Provides fallback for every flag.
 *                    All flags default to true for this renderer.
 *
 * Level 2 (highest): Explicit field values in `partial`
 *                    Any field present in `partial` overrides the default.
 *                    Fields absent from `partial` retain the default value.
 * ```
 *
 * All returned values are concrete booleans (no `undefined`). Consumers do not
 * need to null-coalesce.
 *
 * @param partial - Optional partial ConfigIntent to merge over defaults.
 *   Only fields that are explicitly set in `partial` override the default.
 * @returns Fully resolved ConfigIntent with all three flags set.
 *
 * @example Resolve with no overrides — returns the all-true defaults:
 * ```ts
 * const intent = resolveConfigIntent();
 * intent.staticExport   // true
 * intent.noTemporalDiff // true
 * intent.noInteraction  // true
 * ```
 *
 * @example Override a single flag — others retain their defaults:
 * ```ts
 * const intent = resolveConfigIntent({ noInteraction: false });
 * intent.staticExport   // true   (default retained)
 * intent.noTemporalDiff // true   (default retained)
 * intent.noInteraction  // false  (explicit override)
 * ```
 *
 * @example Override all flags:
 * ```ts
 * const intent = resolveConfigIntent({ staticExport: false, noTemporalDiff: false, noInteraction: false });
 * intent.staticExport   // false
 * intent.noTemporalDiff // false
 * intent.noInteraction  // false
 * ```
 */
export function resolveConfigIntent(partial?: Partial<ConfigIntent>): ConfigIntent {
  if (partial == null) return DEFAULT_CONFIG_INTENT;
  return {
    staticExport: partial.staticExport ?? DEFAULT_CONFIG_INTENT.staticExport,
    noTemporalDiff: partial.noTemporalDiff ?? DEFAULT_CONFIG_INTENT.noTemporalDiff,
    noInteraction: partial.noInteraction ?? DEFAULT_CONFIG_INTENT.noInteraction,
  };
}

// ── Resolution-independence contract ────────────────────────
//
// Three distinct coordinate spaces govern how field values are interpreted.
// The contract below applies to all px-space fields in RenderConfig:
//
//   scaleFactor = coordinateSpace.outputHint.targetWidth / coordinateSpace.width
//              (computed by computeScaleFactor() in coordinate-space.ts)
//
//   SCALED (canvas px-space):    nodeRadii, strokeWidth, legend {x,y}
//   NOT SCALED (unitless):       labelScale — already resolution-independent
//   NOT SCALED (normalized):     evolution.scalar, visibility.scalar
//
// When coordinateSpace.outputHint is absent, scaleFactor = 1 (no-op, identity).
// All existing behavior is preserved unchanged when outputHint is not provided.
//
// @see OutputHintSchema in coordinate-space.ts — outputHint field definition
// @see computeScaleFactor in coordinate-space.ts — derives ScaleFactor from CoordinateSpace
// @see ScaleFactor in coordinate-space.ts — { x, y, uniform } result type

// ── MethodConfig — per-method rendering configuration ──────────────────
/**
 * Schema for a single method entry in `renderConfig.methods[]`.
 *
 * Each entry maps a method type string to its rendering color and i18n legend labels.
 * The `legend` record must contain exactly 3 keys (typically "en", "fr", and one more,
 * or the three method display names for different contexts).
 *
 * @example
 *   { type: "build", color: "#00a86b", legend: { en: "Build", fr: "Construire", de: "Bauen" } }
 */
export const MethodConfigSchema = z.object({
  /** Method type identifier (free string, validated at runtime against renderConfig) */
  type: z.string(),
  /** CSS color string for method indicator rendering */
  color: z.string(),
  /** i18n legend labels — must contain exactly 3 keys */
  legend: z.record(z.string(), z.string()).refine(
    (rec) => Object.keys(rec).length === 3,
    { message: "methods[].legend must have exactly 3 keys" },
  ),
});

export type MethodConfig = z.infer<typeof MethodConfigSchema>;

// ── RenderConfigInput — internal nested (legacy-shaped) intermediate ──────────
//
// The PUBLIC render-config input shape is RenderConfigV3Schema (display/rendering/
// style), validated at the WardleyMapSchema boundary. `renderConfigV3ToLegacy`
// transforms a parsed v3 object into this nested shape, which is what the renderer
// pipeline (resolveTheme + a few direct call-sites) consumes. It is an internal
// implementation detail — authors never write it directly anymore.
//
// Defined as a plain TS interface (no Zod) because the former legacy
// RenderConfigSchema and its sub-schemas have been deleted; only the kept VALUE
// schemas (NodeRadii, TypeColors, EvolveStylesMap, AxisLabels, Legend, CoordinateSpace,
// MethodConfig, ConfigIntent, LayerToggles) are reused for the leaf types.
export interface RenderConfigInput {
  /** Canvas dimensions, coordinate space, stroke width, per-type node radii. */
  spatial?: {
    width?: number;
    height?: number;
    coordinateSpace?: z.input<typeof CanvasCoordinateSpaceSchema>;
    strokeWidth?: number;
    nodeRadii?: z.input<typeof NodeRadiiSchema>;
  };
  /** Font family + label scale multiplier. */
  typography?: {
    fontFamily?: string;
    labelScale?: number;
    textScale?: number;
    elementScales?: TypographyConfig["elementScales"];
  };
  /** Theme, per-type palette, evolve styles, background chrome. */
  styling?: {
    theme?: Theme;
    palette?: z.input<typeof TypeColorsSchema>;
    evolveStyles?: z.input<typeof EvolveStylesMapSchema>;
    background?: MapChrome;
  };
  /** Layer toggles + per-component-type data exclusion. */
  filters?: {
    layers?: z.input<typeof LayerTogglesSchema>;
    excludeComponentTypes?: ComponentType[];
  };
  /** Legend visibility, position, overflow. */
  legend?: z.input<typeof LegendSchema>;
  /** Axis locale preset + i18n axis label overrides. */
  axes?: {
    locale?: Locale;
    axisLabels?: z.input<typeof AxisLabelsSchema>;
  };
  /** Label collision avoidance toggle. */
  avoidCollisions?: boolean;
  /** Per-method rendering configuration (color + i18n legend labels). */
  methods?: MethodConfig[];
  /** Scope-boundary intent flags (partial — merged over defaults). */
  configIntent?: Partial<ConfigIntent>;
}


// Gameplay (accelerator / deaccelerator / step) and method are now COMPONENT
// DECORATORS (see ComponentSchema). The former top-level AcceleratorSchema,
// StepSchema and WardleyMapSchema.accelerators/steps have been removed.

// ── Wardley Map ────────────────────────────────────────────
export const WardleyMapSchema = z.object({
  title: z.string(),
  components: z.array(ComponentSchema),
  relations: z.array(RelationSchema),
  context: z.string().optional(),
  // Optional render config. The PUBLIC input shape is the v3 schema
  // (display/rendering/style). It is validated by RenderConfigV3Schema and then
  // transformed — at parse time — into the internal nested legacy-shaped object
  // (RenderConfigInput) consumed by resolveTheme()/the flat ResolvedRenderConfig
  // pipeline and by the few call-sites that read map.renderConfig.spatial/legend
  // directly. The stored value is therefore the bridge output, NOT the v3 input.
  renderConfig: RenderConfigV3Schema.transform(
    (v3): RenderConfigInput => renderConfigV3ToLegacy(v3),
  ).optional(),
});

// ── TypeScript types derived from Zod ──────────────────────
export type Component = z.infer<typeof ComponentSchema>;
/** Union of all valid component type strings (derived from ComponentTypeEnum). */
export type ComponentType = z.infer<typeof ComponentTypeEnum>;
/** Method annotation object (type + preconisation, free strings). */
export type Method = z.infer<typeof MethodSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type LabelPosition = z.infer<typeof LabelPositionSchema>;
export type EvolutionField = z.infer<typeof EvolutionFieldSchema>;
export type VisibilityField = z.infer<typeof VisibilityFieldSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type EvolutionRange = z.infer<typeof EvolutionRangeSchema>;
export type EvolvesTo = z.infer<typeof EvolvesToSchema>;
export type PipelineGeometry = z.infer<typeof PipelineGeometrySchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Flow = z.infer<typeof FlowSchema>;
export type RelationType = z.infer<typeof RelationTypeEnum>;
export type AxisLabels = z.infer<typeof AxisLabelsSchema>;
export type Locale = z.infer<typeof LocaleEnum>;
export type Legend = z.infer<typeof LegendSchema>;
/** Input type for Legend — accepts partial input before defaults */
export type LegendInput = z.input<typeof LegendSchema>;
export type LegendPosition = z.infer<typeof LegendPositionEnum>;
export type LegendPositionXY = z.infer<typeof LegendPositionXYSchema>;
export type Theme = z.infer<typeof ThemeEnum>;
export type EvolutionXAxis = z.infer<typeof EvolutionXAxisSchema>;
export type ValueChainYAxis = z.infer<typeof ValueChainYAxisSchema>;
export type EvolutionPhases = z.infer<typeof EvolutionPhasesSchema>;
/**
 * @deprecated Sub-AC 2: direction indicator label fields have been removed from MapChrome.
 * This type is now equivalent to `{}` — kept for downstream type compatibility only.
 */
export type AxisDirectionLabels = z.infer<typeof AxisDirectionLabelsSchema>;
/**
 * Map chrome: canvas fill color, axis labels, phase dividers, and decorative
 * scaffolding elements.  Prefer this type alias in new code.
 *
 * @see MapChromeSchema for the Zod schema
 * @see Background for the deprecated alias preserved for backward compatibility
 */
export type MapChrome = z.infer<typeof BackgroundSchema>;

/**
 * @deprecated Use {@link MapChrome} instead. The type is identical; only the
 * name changes to reflect that this object groups *structural chrome* (axes,
 * phase dividers, decorative labels) rather than a purely visual "background".
 * The `background` field name on {@link RenderConfigSchema} is kept as-is for
 * backward compatibility.
 */
export type Background = MapChrome;
export type LayerToggles = z.infer<typeof LayerTogglesSchema>;
// RenderConfigInput is the internal nested (legacy-shaped) intermediate — defined
// as a plain TS interface above (no Zod). The PUBLIC render-config input shape is
// RenderConfigV3Schema. The former legacy RenderConfig / Filters / DEFAULT_*_CONFIG
// / DEFAULT_RENDER_CONFIG / resolveRenderConfigDefaults / rc* accessors have been
// removed in the v3-only cutover.
export type EvolveStyle = z.infer<typeof EvolveStyleSchema>;
export type EvolveStylesMap = z.infer<typeof EvolveStylesMapSchema>;
/** Step decorator (number + optional color), attached to a component. */
export type StepDecorator = z.infer<typeof StepDecoratorSchema>;
export type WardleyMap = z.infer<typeof WardleyMapSchema>;

// TypeStyleMap<V> is defined earlier alongside makeTypeStyleMapSchema and TypeColorsSchema.
// See the "TypeStyleMap — generic per-type styling abstraction" section above.

// ── Accessor shortcuts ── evo/vis/evoTarget/visTarget live in schema-helpers.ts

// The legacy `rc*` accessors (rcWidth/rcHeight/rcStrokeWidth/rcFontFamily/
// rcLabelScale/rcTheme/rcLocale) and `resolveRenderConfigDefaults` have been
// removed in the v3-only cutover. Consumers read fully-resolved values from
// `resolveTheme(...)` (ResolvedRenderConfig) instead of the raw input config.

// ── Color mapping ── resolveColor lives in schema-helpers.ts

// ── Engine 3: Hardcoded validation ─────────────────────────

/** Validate component structural constraints */
export function validateComponent(c: Component): string[] {
  const errors: string[] = [];

  // Pipeline must have pipelineGeometry
  if (c.type === "pipeline" && !c.pipelineGeometry) {
    errors.push(
      `Pipeline "${c.label.name}" should have pipelineGeometry defined`
    );
  }

  // Non-pipeline should not have pipelineGeometry
  if (c.type !== "pipeline" && c.pipelineGeometry) {
    errors.push(
      `Non-pipeline "${c.label.name}" should not have pipelineGeometry`
    );
  }

  // Validate evolutionRange consistency with evolution point
  const range = c.position.evolution.range;
  if (range) {
    const [min, max] = range;
    if (evo(c) < min || evo(c) > max) {
      errors.push(
        `Component "${c.label.name}" evolution (${evo(c)}) is outside its evolutionRange [${min}, ${max}]`
      );
    }
  }

  // Validate evolvesTo targets
  if (c.evolvesTo) {
    for (const e of c.evolvesTo) {
      if (evoTarget(e) <= evo(c)) {
        errors.push(
          `Component "${c.label.name}" evolvesTo target (evo=${evoTarget(e)}) should be further right than source (evo=${evo(c)})`
        );
      }
    }
  }

  return errors;
}

/** Validate full map structural constraints */
export function validateMap(map: WardleyMap): string[] {
  const errors: string[] = [];
  const ids = new Set(map.components.map((c) => c.id));

  // Must have at least one anchor or user-need
  const hasAnchorOrNeed = map.components.some(
    (c) => c.type === "anchor" || c.subtype === "userNeed"
  );
  if (!hasAnchorOrNeed) {
    errors.push(
      "Map should have at least one anchor or user-need (user/stakeholder)"
    );
  }

  // Validate each component
  for (const c of map.components) {
    errors.push(...validateComponent(c));
  }

  // Validate relations reference valid IDs
  for (const r of map.relations) {
    if (!ids.has(r.consumer))
      errors.push(`Relation references unknown component: ${r.consumer}`);
    if (!ids.has(r.supplier))
      errors.push(`Relation references unknown component: ${r.supplier}`);
  }

  return errors;
}

// ── Legacy type mapping for LLM / old-data backward compat ──────────────────
// Maps legacy flat type strings to the new {type, subtype} taxonomy.
// `note` is removed → mapped to a plain component. Old standalone types
// (market, ecosystem, user-need) become component subtypes.
const LEGACY_TYPE_MAP: Record<string, { type: Component["type"]; subtype?: Subtype }> = {
  capacity: { type: "component" },
  component: { type: "component" },
  need: { type: "component", subtype: "userNeed" },
  user_need: { type: "component", subtype: "userNeed" },
  "user-need": { type: "component", subtype: "userNeed" },
  userNeed: { type: "component", subtype: "userNeed" },
  anchor: { type: "anchor" },
  pipeline: { type: "pipeline" },
  market: { type: "component", subtype: "market" },
  ecosystem: { type: "component", subtype: "ecosystem" },
  solution: { type: "component", subtype: "solution" },
  functional: { type: "component", subtype: "functional" },
  supplier: { type: "component", subtype: "supplier" },
  note: { type: "component" },
};

const LEGACY_RELATION_TYPE_MAP: Record<string, string> = {
  dependency: "DependsOn",
  depends_on: "DependsOn",
  dependson: "DependsOn",
  DependsOn: "DependsOn",
  flow: "Flow",
  Flow: "Flow",
  data_flow: "Flow",
  constraint: "Constraint",
  Constraint: "Constraint",
  regulation: "Constraint",
};

/** Clamp a numeric value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Auto-fix common LLM mistakes and migrate legacy field names/types.
 *  Handles:
 *  - Legacy type names (capacity→component, need→user-need)
 *  - Legacy relation type names (dependency→DependsOn)
 *  - Legacy from/to → source/target in relations
 *  - Clamp all coordinates to [0,1]
 *  - Ensure evolvesTo entries have evolveType default
 *  - Ensure pipeline geometry evoStart ≤ evoEnd
 *  - Auto-populate pipelineGeometry from flat fields
 *  - Deduplicate relations
 *  - Remove orphan relations (referencing non-existent component IDs)
 */
export function sanitizeMap(raw: WardleyMap): WardleyMap {
  const map = structuredClone(raw);

  for (const c of map.components) {
    // Migrate legacy type names (LLM / old data might still produce old types)
    const rawType = (c as any).type as string;
    const mapped = LEGACY_TYPE_MAP[rawType];
    if (mapped) {
      c.type = mapped.type;
      // Apply legacy-derived subtype only when the data didn't already set one.
      if (mapped.subtype !== undefined && c.subtype === undefined) {
        c.subtype = mapped.subtype;
      }
    } else {
      // Unknown type: default to "component"
      c.type = "component";
    }

    // Clamp evolution and visibility to [0,1]
    c.position.evolution.scalar = clamp01(c.position.evolution.scalar);
    c.position.visibility.scalar = clamp01(c.position.visibility.scalar);

    // Sanitize evolutionRange: clamp and ensure min ≤ max
    if (c.position.evolution.range) {
      c.position.evolution.range[0] = clamp01(c.position.evolution.range[0]);
      c.position.evolution.range[1] = clamp01(c.position.evolution.range[1]);
      if (c.position.evolution.range[0] > c.position.evolution.range[1]) {
        [c.position.evolution.range[0], c.position.evolution.range[1]] = [
          c.position.evolution.range[1], c.position.evolution.range[0],
        ];
      }
    }

    // Sanitize evolvesTo entries
    if (c.evolvesTo) {
      for (const e of c.evolvesTo) {
        e.position.evolution.scalar = clamp01(e.position.evolution.scalar);
        e.position.visibility.scalar = clamp01(e.position.visibility.scalar);
        // Ensure evolveType has a default
        if (!e.evolveType) {
          e.evolveType = "natural";
        }
      }
    }

    // Clamp pipeline geometry and ensure ordering
    if (c.pipelineGeometry) {
      const pg = c.pipelineGeometry;
      pg.evoStart = clamp01(pg.evoStart);
      pg.evoEnd = clamp01(pg.evoEnd);
      pg.visStart = clamp01(pg.visStart);
      pg.visEnd = clamp01(pg.visEnd);
      if (pg.handleEvolution !== undefined) {
        pg.handleEvolution = clamp01(pg.handleEvolution);
      }
      // Ensure evoStart ≤ evoEnd (swap if inverted)
      if (pg.evoStart > pg.evoEnd) {
        [pg.evoStart, pg.evoEnd] = [pg.evoEnd, pg.evoStart];
      }
      // Ensure visStart ≤ visEnd (swap if inverted)
      if (pg.visStart > pg.visEnd) {
        [pg.visStart, pg.visEnd] = [pg.visEnd, pg.visStart];
      }
      // Pipeline position represents center of geometry bounds
      c.position.evolution.scalar = (pg.evoStart + pg.evoEnd) / 2;
      c.position.visibility.scalar = (pg.visStart + pg.visEnd) / 2;
    }

    // Auto-populate pipelineGeometry from flat fields if missing
    if (c.type === "pipeline" && !c.pipelineGeometry) {
      const rawComp = c as any;
      if (rawComp.evoStart !== undefined) {
        c.pipelineGeometry = {
          evoStart: clamp01(rawComp.evoStart),
          evoEnd: clamp01(rawComp.evoEnd ?? evo(c)),
          visStart: clamp01(rawComp.visStart ?? vis(c)),
          visEnd: clamp01(rawComp.visEnd ?? vis(c)),
          handleEvolution: rawComp.handleEvolution !== undefined
            ? clamp01(rawComp.handleEvolution)
            : undefined,
        };
      }
    }

    // Strip empty label
    if (!c.label.name || c.label.name.trim() === "") {
      c.label.name = c.id;
    }
  }

  // Normalize relation ids and types
  const componentIds = new Set(map.components.map((c) => c.id));
  for (let i = 0; i < map.relations.length; i++) {
    const r = map.relations[i];

    // Auto-generate id if missing (legacy data)
    if (!r.id) {
      r.id = `rel-${r.consumer}-${r.supplier}-${i}`;
    }

    // Normalize relation type
    const rawRelType = (r.type as string) ?? "DependsOn";
    r.type = (LEGACY_RELATION_TYPE_MAP[rawRelType] ?? "DependsOn") as any;
  }

  // Remove orphan relations (referencing non-existent component IDs)
  map.relations = map.relations.filter(
    (r) => componentIds.has(r.consumer) && componentIds.has(r.supplier)
  );

  // Deduplicate relations
  const seen = new Set<string>();
  map.relations = map.relations.filter((r) => {
    const key = `${r.consumer}->${r.supplier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return map;
}

/** Convert JSON pivot to OWM (Online Wardley Maps) text format
 *  NOTE: temporarily broken due to schema breaking changes (consumer/supplier, types).
 *  Will be updated in a future iteration.
 */
export function toOWM(map: WardleyMap): string {
  const lines: string[] = [`title ${map.title}`, ""];

  // Evolution axis labels
  lines.push(
    "evolution genesis / concept -> custom / emerging -> product / converging -> commodity / accepted"
  );
  lines.push("");

  // Components: "component Name [visibility, evolution]"
  for (const c of map.components) {
    // OWM convention: 0=top, 1=bottom — same as our internal format, no conversion needed
    const v = vis(c).toFixed(2);
    const e = evo(c).toFixed(2);
    lines.push(`component ${c.label.name} [${v}, ${e}]`);
  }

  lines.push("");

  // Relations
  const byId = new Map(map.components.map((c) => [c.id, c]));
  for (const r of map.relations) {
    const src = byId.get(r.consumer);
    const tgt = byId.get(r.supplier);
    if (src && tgt) {
      lines.push(`${src.label.name}->${tgt.label.name}`);
    }
  }

  return lines.join("\n");
}

// ── MapKeep import helper ──────────────────────────────────

/** Convert a raw MapKeep JSON map to the pivot WardleyMap schema.
 *  Handles flat pipeline fields → pipelineGeometry and from/to → source/target.
 *  MapKeep format is flat (label: string, evolution: number, etc.) — we map to nested.
 */
export function fromMapKeep(raw: any): WardleyMap {
  const components = (raw.components ?? []).map((c: any) => {
    // Map the legacy MapKeep type string to the new {type, subtype} taxonomy.
    const mappedNode = LEGACY_TYPE_MAP[c.type] ?? { type: "component" as Component["type"] };
    const base: any = {
      id: c.id,
      label: {
        name: c.label,
        ...(c.labelPosition ? { position: c.labelPosition } : {}),
      },
      type: mappedNode.type,
      ...(mappedNode.subtype ? { subtype: mappedNode.subtype } : {}),
      position: {
        evolution: { scalar: c.evolution },
        visibility: { scalar: c.visibility },
      },
    };

    // Carry a nature only when it is valid in the new model: the functional
    // natures (practice/data/activity/knowledge) imply subtype "functional".
    // Other/legacy natures are dropped (no clean mapping; no visual effect).
    if (
      c.nature &&
      (["practice", "data", "activity", "knowledge"] as const).includes(c.nature) &&
      (base.subtype === undefined || base.subtype === "functional")
    ) {
      base.nature = c.nature;
      base.subtype = "functional";
    }
    if (c.color) base.color = c.color;
    if (c.description) base.description = c.description;

    // Map evolvesTo (flat MapKeep format → nested)
    if (c.evolvesTo && c.evolvesTo.length > 0) {
      base.evolvesTo = c.evolvesTo.map((e: any) => ({
        position: {
          evolution: { scalar: e.evolution },
          visibility: { scalar: e.visibility },
        },
        evolveType: e.evolveType ?? "natural",
      }));
    }

    // Map pipeline flat fields to pipelineGeometry
    // Pipeline position represents center of geometry bounds
    if (c.type === "pipeline" && c.evoStart !== undefined) {
      base.pipelineGeometry = {
        evoStart: c.evoStart,
        evoEnd: c.evoEnd,
        visStart: c.visStart,
        visEnd: c.visEnd,
        handleEvolution: c.handleEvolution,
      };
      // Override position to center of geometry bounds
      base.position = {
        evolution: { scalar: (c.evoStart + c.evoEnd) / 2 },
        visibility: { scalar: (c.visStart + c.visEnd) / 2 },
      };
    }

    return base;
  });

  // Convert EvolveTo edges into evolvesTo on source components
  const compMap = new Map<string, any>(components.map((c: any) => [c.id, c]));
  const rawEdges = raw.edges ?? [];
  for (const e of rawEdges) {
    if (e.type !== "EvolveTo") continue;
    const sourceId = e.source ?? e.from;
    const targetId = e.target ?? e.to;
    const src = compMap.get(sourceId);
    const tgt = compMap.get(targetId);
    if (!src || !tgt) continue;
    if (!src.evolvesTo) src.evolvesTo = [];
    src.evolvesTo.push({
      position: {
        evolution: { scalar: tgt.position.evolution.scalar },
        visibility: { scalar: tgt.position.visibility.scalar },
      },
      evolveType: "natural",
    });
  }

  const relations = rawEdges
    .filter((e: any) => (e.type ?? "DependsOn") !== "EvolveTo")
    .map((e: any, i: number) => {
      const source = e.source ?? e.from;
      const target = e.target ?? e.to;
      const rel: any = {
        id: e.id ?? `rel-${source}-${target}-${i}`,
        consumer: source,
        supplier: target,
        type: e.type ?? "DependsOn",
      };
      if (e.flow) rel.flow = e.flow;
      return rel;
    });

  return WardleyMapSchema.parse({
    title: raw.title ?? "Untitled",
    components,
    relations,
    context: raw.context,
    // Map gridSize → renderConfig canvas dimensions (v3 input shape).
    ...(raw.gridSize ? {
      renderConfig: {
        style: {
          background: {
            canvas: {
              default: {
                width: raw.gridSize.width ?? 1600,
                height: raw.gridSize.height ?? 800,
              },
            },
          },
        },
      },
    } : {}),
  });
}


// ── Resolved render config ──────────────────────────────────

/**
 * Flat, fully-resolved render configuration with all defaults applied.
 * Produced by resolveTheme() — consumers do not need to null-coalesce
 * nested optional fields.
 */
export interface ResolvedRenderConfig {
  /** Theme name that was applied */
  theme: "default" | "dark" | "highContrast";
  /** Locale used for axis label preset */
  locale: "en" | "fr";
  /** Canvas width in pixels — defines the horizontal extent of the canvas coordinate space */
  width: number;
  /** Canvas height in pixels — defines the vertical extent of the canvas coordinate space */
  height: number;
  /**
   * Background sub-object: canvas fill color.
   * `color` is always present after resolution (defaults to "#ffffff" for the "default" theme).
   * Moved from top-level `backgroundColor` (removed) — use `resolvedConfig.background.color`.
   */
  background: {
    /** Canvas background fill color (CSS hex, e.g. "#ffffff") */
    color: string;
  };
  /** Whether the evolution (X) axis arrow and direction labels are shown */
  showEvolutionXAxis: boolean;
  /** Whether the value chain (Y) axis arrow and direction labels are shown */
  showValueChainYAxis: boolean;
  /** Whether evolution phase dividers AND phase labels are shown (orthogonal to showEvolutionXAxis) */
  showPhaseDividerAndLabel: boolean;
  /**
   * Typography — font family, label scale, global textScale and per-element label scales.
   * All fields are fully resolved (no undefined) after resolveTheme().
   *
   * @see TypographyConfigSchema in render-config-v2.ts
   */
  typography: TypographyConfig;
  /**
   * Node circle radii in **canvas px-space**, keyed by component type.
   * `_default` is always present (guaranteed by resolveTheme with baseline value 5 px).
   * Lookup precedence: `nodeRadii[type]` → `nodeRadii._default`
   *
   * When `coordinateSpace.outputHint.targetWidth` is present, scale before rasterisation:
   * ```
   *   scaleFactor    = coordinateSpace.outputHint.targetWidth / coordinateSpace.width
   *   renderedRadius = nodeRadii[type] × scaleFactor
   * ```
   * Use `computeScaleFactor(coordinateSpace).uniform` for the scale value.
   *
   * @see NodeRadiiSchema — TypeStyleMap<number> schema with required _default
   * @see computeScaleFactor in coordinate-space.ts — derives ScaleFactor from CoordinateSpace
   * @see CoordinateSpace in coordinate-space.ts
   */
  nodeRadii: NodeRadii;
  /** Whether label collision avoidance is enabled */
  avoidCollisions: boolean;
  /**
   * Component types excluded from rendering.
   * @see FiltersSchema.excludeComponentTypes for full distinction vs filters.layers
   */
  excludeComponentTypes: ReadonlyArray<Component["type"]>;
  /**
   * Custom color overrides by component type using the TypeStyleMap pattern.
   * When the caller provided a `typeColors` object, `_default` is present and
   * acts as the catch-all fallback.  When not provided, resolves to `{}` (empty).
   *
   * Resolution order (highest wins):
   *   1. `component.color` (per-instance override)
   *   2. `typeColors[componentType]` (per-type explicit key)
   *   3. `typeColors._default` (TypeStyleMap fallback, present when typeColors was provided)
   *   4. Renderer hard-coded node default (`NODE_STROKE = "#000000"`)
   *
   * @see TypeColorsSchema — input schema that enforces _default presence
   */
  typeColors: { _default?: string } & { [K in KnownRenderableType]?: string } & { [key: string]: string | undefined };
  /**
   * evolveType to stroke style mapping for evolution arrows.
   * Keys are the closed EvolveTypeEnum values (natural/ecosystem/forced/late),
   * plus the optional `_default` catch-all fallback key.
   *
   * `_default` is optional — when absent the renderer falls back to its hardcoded per-type
   * defaults (EVOLVE_STYLES in evolvesto-layer.ts). Use `Partial<TypeStyleMap<EvolveStyle>>`
   * rather than `TypeStyleMap<EvolveStyle>` to allow `{}` (theme baseline default).
   *
   * Resolution order per style property (highest wins):
   *   1. Explicit per-type key (e.g. `natural.stroke`)
   *   2. `_default.stroke` (when present)
   *   3. Hardcoded renderer defaults in evolvesto-layer.ts
   */
  evolveStyles: Partial<TypeStyleMap<EvolveStyle>>;
  /** Fully resolved i18n axis labels (locale applied, individual overrides merged) */
  axisLabels: ResolvedAxisLabels;
  /** Legend visibility, position, and overflow handling */
  legend: {
    show: boolean;
    /**
     * Resolved legend position. Named presets are clamped automatically;
     * explicit `{x, y}` is the **top-left anchor** of the legend bounding box
     * in canvas px-space.
     */
    position: LegendPosition | LegendPositionXY;
    /**
     * How to handle the legend bounding box when it extends beyond the canvas boundary.
     * Applies only to explicit `{x, y}` positions (named presets are auto-clamped).
     */
    legendOverflow: LegendOverflow;
  };
  /**
   * Stroke width in **canvas px-space** for edges and node outlines.
   * Default: 1 px.
   *
   * When `coordinateSpace.outputHint.targetWidth` is present, scale before rasterisation:
   * ```
   *   scaleFactor         = coordinateSpace.outputHint.targetWidth / coordinateSpace.width
   *   renderedStrokeWidth = strokeWidth × scaleFactor
   * ```
   * Use `computeScaleFactor(coordinateSpace).uniform` for the scale value.
   *
   * @see computeScaleFactor in coordinate-space.ts — derives ScaleFactor from CoordinateSpace
   * @see CoordinateSpace in coordinate-space.ts
   */
  strokeWidth: number;
  /**
   * Resolved coordinate space — defines the evolution and visibility axis display ranges,
   * and optionally the output resolution hint for resolution-independence scaling.
   *
   * Extracted from `renderConfig.coordinateSpace` with fallback to DEFAULT_COORDINATE_SPACE.
   * Coordinate-defining fields (evolutionRange, visibilityRange, width, height) live here,
   * NOT in the MapChrome/BackgroundSchema container.
   *
   * Key fields:
   *   - `evolutionRange`:  [start, end] — [0, 1] shows full evolution axis
   *   - `visibilityRange`: [high, low] — [0, 1] shows full visibility axis
   *   - `width`, `height`: canvas pixel dimensions (default 1600 × 800)
   *   - `unit`:            "canvas-px" (only supported value)
   *   - `outputHint`:      optional; when present, `outputHint.targetWidth` drives
   *                        px-space scaling for `nodeRadii` and `strokeWidth`.
   *                        Use `computeScaleFactor(coordinateSpace)` to obtain the factor.
   *                        `labelScale` is NOT affected — it is resolution-independent.
   *
   * @see CoordinateSpaceSchema in coordinate-space.ts — Zod schema with validation
   * @see computeScaleFactor in coordinate-space.ts — derives ScaleFactor from CoordinateSpace
   * @see DEFAULT_COORDINATE_SPACE — the default values used when not provided
   */
  coordinateSpace: CoordinateSpace;
  /**
   * Resolved configurable scope-boundary intent flags.
   *
   * All three flags are always present as concrete booleans (no `undefined`).
   * For `@wardleyapi/render` all flags default to `true`:
   * - `staticExport: true`   — static export only
   * - `noTemporalDiff: true` — temporal diffing excluded
   * - `noInteraction: true`  — interaction excluded
   *
   * Injected by {@link resolveTheme} via {@link resolveConfigIntent}.
   *
   * @see ConfigIntentSchema — the Zod schema
   * @see DEFAULT_CONFIG_INTENT — the defaults
   */
  /** Method rendering configuration — array of method configs with type, color, and i18n legend labels */
  methods: MethodConfig[];
  /**
   * Resolved content-layer visibility toggles (title/pipelines/edges/evolvesTo/nodes/labels/notes).
   * Populated from `filters.layers`; absent toggles default to visible. Read by the
   * orchestrator's `applyLayerToggles` so all layer-visibility input flows through resolution
   * (no consumer reads `renderConfig.filters.layers` directly).
   */
  layerToggles: LayerToggles;
  configIntent: ConfigIntent;
}

// ── Theme baselines ─────────────────────────────────────────
// Each theme provides a distinct set of baseline values.
// Explicit renderConfig fields always override the selected theme baseline.

/** "default" theme — classic Wardley Map look (white background, dark gray tones, 1 px stroke). */
const THEME_BASELINE_DEFAULT: Omit<ResolvedRenderConfig, "theme"> = {
  locale: "en",
  width: 1600,
  height: 800,
  background: { color: "#ffffff" },
  showEvolutionXAxis: true,
  showValueChainYAxis: true,
  showPhaseDividerAndLabel: true,
  typography: { fontFamily: "Inter, sans-serif", labelScale: 1.0 },
  nodeRadii: { _default: 5 },
  avoidCollisions: true,
  excludeComponentTypes: [],
  typeColors: {},
  evolveStyles: {},
  axisLabels: resolveAxisLabels(), // en locale defaults
  legend: { show: true, position: "bottom-right" as const, legendOverflow: "allow" as const },
  strokeWidth: 1,
  coordinateSpace: DEFAULT_COORDINATE_SPACE,
  methods: [
    {
      type: "buying-policy",
      color: "#2563eb",
      legend: { Uncharted: "build", Transitional: "buy", Industrialized: "outsource" },
    },
    {
      type: "project-management",
      color: "#16a34a",
      legend: { Uncharted: "agile", Transitional: "lean", Industrialized: "sixsigma" },
    },
    {
      type: "attitudes",
      color: "#f59e0b",
      legend: { Uncharted: "pioneers", Transitional: "settlers", Industrialized: "town-planners" },
    },
  ],
  layerToggles: {},
  configIntent: DEFAULT_CONFIG_INTENT,
};

/**
 * "dark" theme — dark navy background, slightly heavier strokes.
 * Explicit renderConfig fields override these baseline values.
 */
const THEME_BASELINE_DARK: Omit<ResolvedRenderConfig, "theme"> = {
  ...THEME_BASELINE_DEFAULT,
  background: { color: "#1a1a2e" }, // dark navy
  strokeWidth: 1.5,
};

/**
 * "highContrast" theme — pure black background, heavier strokes, accessible font stack.
 * Designed to meet WCAG high-contrast guidelines (placeholder — full palette TBD).
 * Explicit renderConfig fields override these baseline values.
 */
const THEME_BASELINE_HIGH_CONTRAST: Omit<ResolvedRenderConfig, "theme"> = {
  ...THEME_BASELINE_DEFAULT,
  background: { color: "#000000" }, // pure black
  typography: { fontFamily: "Arial, sans-serif", labelScale: 1.0 }, // widely available accessible font
  strokeWidth: 2,
};

/**
 * Named theme baselines indexed by theme name.
 *
 * **Precedence chain (highest wins):**
 * ```
 *   inline field overrides  >  theme baseline  >  (no further fallback needed)
 * ```
 * "inline" = any explicit field in the renderConfig object (background.color, fontFamily, etc.)
 * "theme baseline" = the pre-defined set of values for the selected theme name
 *
 * @see resolveTheme for the full merging logic
 */
const THEME_BASELINES: Record<"default" | "dark" | "highContrast", Omit<ResolvedRenderConfig, "theme">> = {
  default: THEME_BASELINE_DEFAULT,
  dark: THEME_BASELINE_DARK,
  highContrast: THEME_BASELINE_HIGH_CONTRAST,
};

/**
 * Merge theme baseline + schema defaults + caller overrides into a flat resolved config.
 *
 * **Precedence chain (3 levels, highest wins):**
 *
 * ```
 * Level 1 (lowest):  Theme baseline defaults
 *                    Selected by `theme` name ("default" | "dark" | "highContrast").
 *                    Provides fallback for every resolved field.
 *                    Example: background.color="#ffffff", fontFamily="Inter, sans-serif"
 *
 * Level 2 (middle):  Top-level explicit field overrides
 *                    Direct fields on the renderConfig object (width, height, fontFamily,
 *                    strokeWidth, labelScale, locale, typeColors, evolveStyles, etc.).
 *                    These override theme baseline values for their respective fields.
 *
 * Level 3 (highest): Nested explicit field overrides inside background sub-objects
 *                    (background.color, background.evolutionXAxis.show,
 *                    background.evolutionXAxis.xAxis, background.evolutionPhases.phases, etc.).
 *                    These override both the theme baseline AND any top-level equivalents.
 * ```
 *
 * **i18n axis label precedence (specific 3-level chain):**
 * ```
 * Level 1: English baseline (theme default locale)
 *          → xAxis = "Evolution", phases[0] = "Genesis"
 * Level 2: Locale preset switch (`locale: "fr"`)
 *          → xAxis = "Évolution", phases[0] = "Genèse"
 * Level 3: Explicit label string in background sub-object
 *          (`background.evolutionXAxis.xAxis: "Custom"`)
 *          → xAxis = "Custom"  ← always wins regardless of locale
 * ```
 *
 * **Explicit-empty vs. absent distinction (i18n):**
 * ```
 * undefined (field absent)        → use locale-resolved default
 * '' (explicit empty string)      → render no label (explicit suppression); does NOT fall back to locale
 * 'non-empty string'              → use as-is, overrides locale preset
 * ```
 * This rule applies to all individual label fields (xAxis, yAxis, evolutionStart, etc.)
 * and to per-element entries of background.evolutionPhases.phases.
 *
 * When values at different levels conflict, the highest level always wins deterministically.
 * All resolved values are concrete (no undefined/null) — consumers do not need to null-coalesce.
 *
 * @param renderConfig - Optional RenderConfig from the map payload (all fields optional)
 * @returns Flat ResolvedRenderConfig with all values resolved to concrete values
 */
/** True when an input is the new v3 RenderConfig shape (display/rendering/style). */
function isV3RenderConfig(input: unknown): input is RenderConfigV3Input {
  return (
    input != null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    ("display" in input || "rendering" in input || "style" in input)
  );
}

export function resolveTheme(
  input?: RenderConfigInput | RenderConfigV3Input,
): ResolvedRenderConfig {
  // Accept the new v3 input shape directly by bridging it to the nested legacy
  // shape this resolver consumes. Legacy input passes through unchanged.
  const renderConfig: RenderConfigInput | undefined = isV3RenderConfig(input)
    ? renderConfigV3ToLegacy(RenderConfigV3Schema.parse(input))
    : (input as RenderConfigInput | undefined);
  const themeName = renderConfig?.styling?.theme ?? "default";
  const baseline = THEME_BASELINES[themeName];

  // Access nested sub-schemas
  const spatial = renderConfig?.spatial;
  const styling = renderConfig?.styling;
  const bg = styling?.background;

  return {
    theme: themeName,
    locale: renderConfig?.axes?.locale ?? "en",
    // Canvas dims: single source of truth. An explicit coordinateSpace.{width,height}
    // wins (it's the coordinate-system declaration); else spatial.{width,height};
    // else baseline. resolved.width and coordinateSpace.width (below) are derived
    // identically so they can never diverge (was: A1 duplication bug).
    width: spatial?.coordinateSpace?.width ?? spatial?.width ?? baseline.width,
    height: spatial?.coordinateSpace?.height ?? spatial?.height ?? baseline.height,
    background: { color: bg?.color ?? baseline.background.color },
    showEvolutionXAxis: bg?.evolutionXAxis?.show ?? baseline.showEvolutionXAxis,
    showValueChainYAxis: bg?.valueChainYAxis?.show ?? baseline.showValueChainYAxis,
    showPhaseDividerAndLabel: bg?.evolutionPhases?.showPhaseDividerAndLabel ?? baseline.showPhaseDividerAndLabel,
    typography: {
      fontFamily: renderConfig?.typography?.fontFamily ?? baseline.typography.fontFamily,
      labelScale: renderConfig?.typography?.labelScale ?? baseline.typography.labelScale,
      textScale: renderConfig?.typography?.textScale ?? 1,
      elementScales: renderConfig?.typography?.elementScales ?? {},
    },
    nodeRadii: (spatial?.nodeRadii
      ? { ...baseline.nodeRadii, ...spatial.nodeRadii }
      : baseline.nodeRadii) as NodeRadii,
    avoidCollisions: renderConfig?.avoidCollisions ?? baseline.avoidCollisions,
    excludeComponentTypes: renderConfig?.filters?.excludeComponentTypes ?? baseline.excludeComponentTypes,
    typeColors: styling?.palette ?? baseline.typeColors,
    evolveStyles: styling?.evolveStyles ?? baseline.evolveStyles,
    axisLabels: resolveAxisLabels({
      locale: renderConfig?.axes?.locale,
      // Axis label overrides from axes.axisLabels, fallback to background sub-fields
      xAxis: renderConfig?.axes?.axisLabels?.xAxis ?? bg?.evolutionXAxis?.xAxis,
      yAxis: renderConfig?.axes?.axisLabels?.yAxis ?? bg?.valueChainYAxis?.yAxis,
      phases: renderConfig?.axes?.axisLabels?.phases ?? bg?.evolutionPhases?.phases,
    }),
    legend: {
      show: renderConfig?.legend?.show ?? baseline.legend.show,
      position: renderConfig?.legend?.position ?? baseline.legend.position,
      legendOverflow: renderConfig?.legend?.legendOverflow ?? baseline.legend.legendOverflow,
    },
    strokeWidth: spatial?.strokeWidth ?? baseline.strokeWidth,
    // coordinateSpace: provided value (validated by CanvasCoordinateSpaceSchema) or
    // fall back to DEFAULT_COORDINATE_SPACE. A1 fix: canvas width/height are a SINGLE
    // source of truth — coordinateSpace.width/height always mirror the resolved canvas
    // width/height so computeScaleFactor() and rcWidth()/build-context can never diverge.
    // (The output/view dimension is a separate concern via coordinateSpace.outputHint.)
    coordinateSpace: {
      ...(spatial?.coordinateSpace != null
        ? { ...DEFAULT_COORDINATE_SPACE, ...spatial.coordinateSpace }
        : baseline.coordinateSpace),
      width: spatial?.coordinateSpace?.width ?? spatial?.width ?? baseline.width,
      height: spatial?.coordinateSpace?.height ?? spatial?.height ?? baseline.height,
    },
    // methods: use provided array or fall back to baseline (empty array)
    methods: renderConfig?.methods ?? baseline.methods,
    // layerToggles: resolved from filters.layers (absent toggles default to visible).
    // Routes all layer-visibility input through resolution.
    layerToggles: renderConfig?.filters?.layers ?? baseline.layerToggles,
    // configIntent: merge explicit partial overrides over DEFAULT_CONFIG_INTENT
    configIntent: resolveConfigIntent(renderConfig?.configIntent ?? undefined),
  };
}
