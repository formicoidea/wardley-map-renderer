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
} from "./render-config-v3.js";
// TypographyConfigSchema is defined locally below to avoid circular dependency
// with render-config-v2.ts (which imports from schema.ts).
// The render-config-v2.ts TypographyConfigSchema is the canonical definition;
// this local copy MUST stay in sync.

// Re-export coordinate space types and defaults for convenience
export { DEFAULT_COORDINATE_SPACE } from "./coordinate-space.js";
export type { CoordinateSpace } from "./coordinate-space.js";

// ── Typography sub-schema ────────────────────────────────────────────────────
// Defined here (not imported from render-config-v2.ts) to avoid circular deps.
// render-config-v2.ts imports from schema.ts, so schema.ts cannot import back.

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
});

/** TypeScript type for TypographyConfig (output after Zod defaults applied) */
export type TypographyConfig = z.infer<typeof TypographyConfigSchema>;

/** TypeScript input type for TypographyConfig (accepts partial input before defaults) */
export type TypographyConfigInput = z.input<typeof TypographyConfigSchema>;

/** Default TypographyConfig values (Inter font, 1.0× label scale) */
export const DEFAULT_TYPOGRAPHY_CONFIG: TypographyConfig = TypographyConfigSchema.parse({});

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
// Breaking change: source/target replaces from/to, DependsOn type
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
  source: z.string(), // component id (dependency origin — the depender)
  target: z.string(), // component id (dependency destination — the depended-upon)
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

// ── Axes config (groups axisLabels + locale) ──────────────
/**
 * Axes configuration sub-schema — groups all axis-related settings:
 *   - `locale`     — language preset for axis labels ("en" | "fr")
 *   - `axisLabels` — i18n label overrides for axes and phase labels
 *
 * Each leaf field has its own Zod `.default()` or `.optional()` — omit partially or entirely.
 *
 * @see AxisLabelsSchema for the full label override fields
 * @see LocaleEnum for supported locales
 */
export const AxesConfigSchema = z.object({
  /** Locale preset for axis labels (default: "en"). */
  locale: LocaleEnum.default("en"),
  /** i18n axis label overrides — locale preset used as base, individual fields override. */
  axisLabels: AxisLabelsSchema.optional(),
});

export type AxesConfig = z.infer<typeof AxesConfigSchema>;
export type AxesConfigInput = z.input<typeof AxesConfigSchema>;

/** Default axes config — English locale, no label overrides. */
export const DEFAULT_AXES_CONFIG: AxesConfig = AxesConfigSchema.parse({});

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

/**
 * Resolve a value from a TypeStyleMap by component type, falling back to `_default`.
 *
 * This is the canonical per-type-with-fallback lookup used across all TypeStyleMap
 * consumers (nodeRadii, typeColors, evolveStyles).  Centralising the logic here
 * ensures every consumer behaves identically and avoids duplicated cast patterns.
 *
 * Lookup precedence: `map[type]` → `map._default`
 *
 * @param map  - A TypeStyleMap<T> (required _default) or Partial<TypeStyleMap<T>> (optional _default)
 * @param type - The component / evolve type string to look up
 * @returns The per-type value if present, otherwise the `_default`, otherwise `undefined`
 *
 * @example
 *   const r = resolveTypeStyle(nodeRadii, comp.type); // number
 *   const c = resolveTypeStyle(typeColors, "anchor");  // string | undefined
 */
export function resolveTypeStyle<T>(
  map: Partial<TypeStyleMap<T>>,
  type: string
): T | undefined {
  return (map as Record<string, T | undefined>)[type] ?? map._default;
}

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

// ── Unified visibility filters ────────────────────────────────────────────────
// Consolidates two previously separate top-level fields into one semantic group:
//   - layers                (visual layer toggles, post-render)  ← was `layerToggles`
//   - excludeComponentTypes (data filter, pre-render)            ← renamed from `excludeTypes`
//
// ## Rename: excludeTypes → excludeComponentTypes
// The old top-level `excludeTypes` field has been renamed to `filters.excludeComponentTypes`
// to (a) clarify it filters by component TYPE (not arbitrary criteria), and (b) nest it
// alongside the related `layers` toggle inside the `filters` object.
//
// ## Two-level filtering model
// The two mechanisms operate at different levels but serve the same intent:
// controlling what is shown in the rendered output.
//
//   filters.layers: {boolean per layer} — skip entire SVG layer renderers (post-render)
//     → toggling a layer off skips its SVG fragment; all map data remains in render context
//   filters.excludeComponentTypes: [type[]] — remove component types from data (pre-render)
//     → removed before geometry is computed; affects ALL layers simultaneously
export const FiltersSchema = z.object({
  /**
   * **Visual layer toggles (post-render):** Enable or disable entire SVG rendering
   * layers independently. When a layer toggle is `false`, that layer's renderer is
   * skipped and contributes no SVG fragments — but all map data remains loaded in the
   * render context.
   *
   * @distinction Contrast with `excludeComponentTypes` (data filter, pre-render):
   *   - `layers` operates at the **visual layer level**: only the SVG output of
   *     the toggled layer is omitted. Other layers may still reference the same data.
   *     For example, setting `nodes: false` hides node circles but labels and edges
   *     for those components are still rendered by their respective layers.
   *   - `excludeComponentTypes` operates at the **data level**: filtered components are
   *     removed before geometry is computed, affecting ALL layers simultaneously.
   *
   * Layers NOT included here (they have dedicated controls):
   *   - `axes`   → background.evolutionXAxis / valueChainYAxis / evolutionPhases
   *   - `legend` → legend.show
   *
   * All layer toggles default to `true` (visible) when absent.
   *
   * @category viewer-preference
   */
  layers: LayerTogglesSchema.optional(),
  /**
   * **Data filter (pre-render):** Component types to completely remove from the data
   * before any layer processes it. Components matching these types are excluded from
   * ALL layers — nodes, labels, edges, pipelines, notes — as if they did not exist
   * in the map data at all.
   *
   * **Renamed from `excludeTypes`** (old v1 top-level field) — now nested inside
   * `filters` alongside `layers` to clarify that this is a data-level filter, not
   * a visual-layer toggle. The field name `excludeComponentTypes` also makes explicit
   * that the filter discriminates by component **type** (as defined by `ComponentTypeEnum`).
   *
   * Valid type values: `"component"` | `"user-need"` | `"pipeline"` | `"note"` | `"anchor"` | `"market"` | `"ecosystem"`
   *
   * @distinction Contrast with `layers` (visual-layer toggles, post-render):
   *   - `excludeComponentTypes` operates at the **data level** (pre-render): filtered
   *     components are removed before geometry is computed. Edges referencing excluded
   *     components may also be suppressed. Use this to permanently remove a component
   *     type from the rendered output regardless of which layer would draw it.
   *   - `layers` operates at the **visual layer level** (post-render): a layer's
   *     renderer is simply skipped (returns no SVG fragments). Data is still loaded
   *     into the render context — only the SVG output of that specific layer is omitted.
   *
   * @example Hide all notes and anchors from the rendered map:
   *   `filters: { excludeComponentTypes: ["note", "anchor"] }`
   *
   * @category author-intent
   */
  excludeComponentTypes: z.array(ComponentTypeEnum).optional(),
});

// ── SpatialConfig sub-schema ──────────────────────────────────────────────────
/**
 * SpatialConfigSchema — groups all canvas dimension, coordinate space, and
 * geometry concerns for a Wardley Map render.
 *
 * Fields:
 *   - `width`           — canvas width in pixels (default: 1600)
 *   - `height`          — canvas height in pixels (default: 800)
 *   - `coordinateSpace` — explicit coordinate space declaration (units + origin)
 *   - `strokeWidth`     — edge/outline stroke width in canvas px-space (default: 1)
 *   - `nodeRadii`       — per-type node circle radii in canvas px-space (default: { _default: 5 })
 *
 * Each leaf field has its own Zod `.default()` — omit partially or entirely.
 *
 * @see CoordinateSpaceSchema in coordinate-space.ts — full Zod definition
 * @see NodeRadiiSchema — TypeStyleMap<number> schema with required _default
 */
export const SpatialConfigSchema = z.object({
  /** Canvas width in pixels. Default: 1600 px. Valid range: 1–10000 px. */
  width: z
    .number()
    .positive()
    .max(10000, "Canvas width must not exceed 10000 px")
    .default(1600),
  /** Canvas height in pixels. Default: 800 px. Valid range: 1–10000 px. */
  height: z
    .number()
    .positive()
    .max(10000, "Canvas height must not exceed 10000 px")
    .default(800),
  /** Explicit coordinate space declaration (units, origin, ranges). */
  coordinateSpace: CanvasCoordinateSpaceSchema.optional(),
  /** Stroke width in canvas px-space for edges and node outlines. Default: 1 px. */
  strokeWidth: z.number().min(0.25).max(8).default(1),
  /** Per-type node circle radii in canvas px-space. _default is required. */
  nodeRadii: NodeRadiiSchema.default({ _default: 5 }),
});

/** TypeScript type for SpatialConfig (output after Zod defaults applied) */
export type SpatialConfig = z.infer<typeof SpatialConfigSchema>;

/** TypeScript input type for SpatialConfig (accepts partial input before defaults) */
export type SpatialConfigInput = z.input<typeof SpatialConfigSchema>;

/** Default SpatialConfig — canvas 1600×800 px, strokeWidth 1, nodeRadii._default 5 */
export const DEFAULT_SPATIAL_CONFIG: SpatialConfig = SpatialConfigSchema.parse({});

// ── StylingConfig sub-schema ──────────────────────────────────────────────────
/**
 * StylingConfigSchema — groups all visual styling concerns:
 *   - `theme`        — named visual theme preset (default: "default")
 *   - `palette`      — per-component-type color overrides
 *   - `evolveStyles` — per-evolve-type arrow stroke style overrides
 *   - `background`   — canvas background color and axis/phase display controls
 *
 * Design rule: themes handle only colors and font — strokeWidth and nodeRadii belong to spatial.
 *
 * Each leaf field has its own Zod `.default()` or `.optional()` — omit partially or entirely.
 *
 * @see ThemeEnum — Zod enum definition for theme names
 * @see TypeColorsSchema — palette shape (KNOWN_RENDERABLE_TYPES keys)
 * @see EvolveStylesMapSchema — evolveStyles key constraints (EvolveTypeEnum)
 * @see BackgroundSchema — background canvas color and axis/phase controls
 */
export const StylingConfigSchema = z.object({
  /** Named visual theme preset. Default: "default". */
  theme: ThemeEnum.default("default"),
  /** Per-renderable-type color overrides (any CSS color string). */
  palette: TypeColorsSchema.optional(),
  /** Per-evolve-type arrow stroke style overrides. */
  evolveStyles: EvolveStylesMapSchema.optional(),
  /** Background canvas color and axis/phase display controls. */
  background: BackgroundSchema.optional(),
});

/** TypeScript type for StylingConfig (output after Zod defaults applied) */
export type StylingConfig = z.infer<typeof StylingConfigSchema>;

/** TypeScript input type for StylingConfig (accepts partial input before defaults) */
export type StylingConfigInput = z.input<typeof StylingConfigSchema>;

/** Default StylingConfig — "default" theme, no palette/evolveStyles/background overrides */
export const DEFAULT_STYLING_CONFIG: StylingConfig = StylingConfigSchema.parse({});

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

// ── ConfigFieldCategory — 4-tier field classification vocabulary ──────────────
//
// Every field in the RenderConfig ontology carries exactly one `@category` tag
// from this closed set.  The four tiers reflect the precedence and semantic role
// of each field:
//
//   platform-constraint  — Fields that define hard invariants of this renderer.
//                          They constrain the coordinate system and capability envelope
//                          that all other fields operate within. Callers MUST NOT assume
//                          values outside the declared constraint (e.g. units≠"px" would
//                          break all px-space fields). Examples: coordinateSpace,
//                          configIntent, CoordinateSpaceSchema.units/origin.
//
//   author-intent        — Fields that encode the map author's deliberate design choices:
//                          which component types to show, what color to use for each type,
//                          how evolution arrows should look. These influence the semantic
//                          meaning of the rendered map. Examples: typeColors, evolveStyles,
//                          filters.excludeComponentTypes.
//
//   viewer-preference    — Fields that control presentational and display preferences
//                          that a viewer (or rendering client) may adjust without
//                          changing the map's information content: theme, locale, axis
//                          visibility, font, label size, legend position, layer toggles.
//                          Examples: theme, locale, background, fontFamily, labelScale,
//                          legend, filters.layers, strokeWidth.
//
//   layout-structural    — Fields that define the geometric layout of the canvas:
//                          canvas dimensions, node radii, collision avoidance, output size.
//                          These affect the physical positioning and sizing of elements
//                          but not their information content or semantic styling.
//                          Examples: width, height, nodeRadii, avoidCollisions, outputHint.
//
// ## Relationship to the 3-tier precedence chain
// The category vocabulary is orthogonal to the theme-resolution precedence chain
// (theme baseline → explicit field → explicit label string).  Category describes
// the *semantic role* of a field; precedence describes the *resolution order*.
//
// ## Usage
// Use `ConfigFieldCategory` as the JSDoc `@category` tag value on every Zod field
// definition in RenderConfig sub-schemas and on the top-level RenderConfigSchema.
// The type is a pure TypeScript type alias — no runtime enforcement.

/**
 * 4-tier category vocabulary for RenderConfig field classification.
 *
 * Every field in the RenderConfig ontology is annotated with exactly one
 * `@category` tag whose value is a member of this type.
 *
 * | Category              | Role                                                                |
 * |-----------------------|---------------------------------------------------------------------|
 * | `platform-constraint` | Hard invariants defining the renderer's coordinate/capability envelope |
 * | `author-intent`       | Map author's deliberate design choices (colors, styles, exclusions) |
 * | `viewer-preference`   | Presentational preferences a viewer may adjust (theme, locale, axes) |
 * | `layout-structural`   | Geometric layout of the canvas (dimensions, radii, collision)       |
 *
 * This type is an alias for {@link FieldCategory} — the canonical 4-tier type used
 * by `TIERED_RENDER_CONFIG_TAXONOMY` and `getFieldTierCategory`.
 * Both names refer to the same union; `ConfigFieldCategory` is the externally-facing
 * name for use in JSDoc `@category` annotations across all RenderConfig sub-schemas.
 *
 * @see FieldCategory — the canonical runtime type (defined later in this file)
 * @see TIERED_RENDER_CONFIG_TAXONOMY — per-field tier classification
 * @see ConfigIntentSchema — platform-constraint flags
 * @see RenderConfigSchema — top-level fields annotated with this vocabulary
 */
// Forward-reference alias: FieldCategory is defined later in this file.
// TypeScript resolves type aliases lazily, so this is always valid.
export type ConfigFieldCategory = FieldCategory;

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

export const RenderConfigSchema = z.object({
  /**
   * Spatial — canvas dimensions, coordinate space, stroke width, and node radii.
   *
   * Groups all canvas dimension, coordinate space, and geometry concerns:
   *   - `width`           — canvas width in pixels (default: 1600)
   *   - `height`          — canvas height in pixels (default: 800)
   *   - `coordinateSpace` — explicit coordinate space declaration (units + origin)
   *   - `strokeWidth`     — edge/outline stroke width in canvas px-space (default: 1)
   *   - `nodeRadii`       — per-type node circle radii in canvas px-space (default: { _default: 5 })
   *
   * Each leaf field has its own Zod `.default()` — omit partially or entirely.
   *
   * @see SpatialConfigSchema for the full sub-schema
   * @category layout-structural
   */
  spatial: SpatialConfigSchema.optional(),

  /**
   * Typography — font family and label scale multiplier.
   *
   * Groups all font and text-scale concerns:
   *   - `fontFamily`  — CSS font-family stack applied to all map text elements
   *   - `labelScale`  — unitless multiplier for component label font size (1.0 = 12 px base)
   *
   * Each leaf field has its own Zod `.default()` — omit partially or entirely.
   *
   * @see TypographyConfigSchema for the Zod sub-schema
   * @see DEFAULT_TYPOGRAPHY_CONFIG for the default values
   * @category viewer-preference
   */
  typography: TypographyConfigSchema.optional(),

  /**
   * Styling — theme, palette (colors), evolve styles, background.
   *
   * Groups all visual styling concerns:
   *   - `theme`        — named visual theme preset (default: "default")
   *   - `palette`      — per-component-type color overrides
   *   - `evolveStyles` — per-evolve-type arrow stroke style overrides
   *   - `background`   — canvas background color and axis/phase display controls
   *
   * Design rule: themes handle only colors and font — strokeWidth and nodeRadii belong to spatial.
   *
   * Each leaf field has its own Zod `.default()` or `.optional()` — omit partially or entirely.
   *
   * @see StylingConfigSchema for the full sub-schema
   * @category author-intent
   */
  styling: StylingConfigSchema.optional(),

  /**
   * Unified visibility filters — consolidates two distinct mechanisms for controlling
   * what is shown in the rendered output.
   *
   * ### `filters.layers` — Visual layer toggles (post-render)
   * Enables or disables individual SVG rendering layers.
   *
   * ### `filters.excludeComponentTypes` — Data filter (pre-render)
   * Removes component types from the map data before any layer processes them.
   *
   * @see FiltersSchema for full Zod field definitions and per-field JSDoc
   * @category viewer-preference
   */
  filters: FiltersSchema.optional(),

  /**
   * Legend visibility and position.
   *
   * Groups all legend-related settings:
   *   - `show`           — show/hide the legend box (default: true)
   *   - `position`       — named anchor or explicit {x, y} coordinates (default: "bottom-right")
   *   - `legendOverflow` — overflow handling for explicit position (default: "allow")
   *
   * @see LegendSchema for the full sub-schema
   * @category viewer-preference
   */
  legend: LegendSchema.optional(),

  /**
   * Axes configuration — locale preset and i18n axis label overrides.
   *
   * Groups all axis-related settings:
   *   - `axes.locale`     — language preset for axis labels ("en" | "fr"), default "en"
   *   - `axes.axisLabels`  — per-field label overrides (xAxis, yAxis, phases, etc.)
   *
   * Each leaf field has its own Zod default — omit partially or entirely.
   *
   * @see AxesConfigSchema for the full sub-schema
   * @category viewer-preference
   */
  axes: AxesConfigSchema.optional(),

  /**
   * Enable/disable label collision avoidance.
   * @category layout-structural
   */
  avoidCollisions: z.boolean().optional(),

  /**
   * Method rendering configuration — maps method type strings to colors and i18n legend labels.
   *
   * Each entry defines how a specific method type (e.g. "build", "buy", "outsource") is
   * rendered: its indicator color and its legend labels (exactly 3 keys per entry).
   *
   * @category author-intent
   */
  methods: z.array(MethodConfigSchema).optional(),

  /**
   * Configurable scope-boundary intent flags.
   *
   * Declares what this renderer does (`staticExport`) and does NOT do
   * (`noTemporalDiff`, `noInteraction`) as first-class boolean metadata.
   *
   * @see ConfigIntentSchema — the full field schema
   * @see DEFAULT_CONFIG_INTENT — the default values
   * @category platform-constraint
   */
  configIntent: ConfigIntentSchema.partial().optional(),
})
  .superRefine((data, ctx) => {
  // ── Legend {x,y} bounds validation ───────────────────────────────────────
  // When legend.position is an explicit {x, y} coordinate object, enforce that
  // the position lies within the canvas: 0 ≤ x ≤ width and 0 ≤ y ≤ height.
  // Canvas dimensions read from spatial sub-object (default 1600 × 800 px).
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

// Gameplay (accelerator / deaccelerator / step) and method are now COMPONENT
// DECORATORS (see ComponentSchema). The former top-level AcceleratorSchema,
// StepSchema and WardleyMapSchema.accelerators/steps have been removed.

// ── Wardley Map ────────────────────────────────────────────
export const WardleyMapSchema = z.object({
  title: z.string(),
  components: z.array(ComponentSchema),
  relations: z.array(RelationSchema),
  context: z.string().optional(),
  // Optional render config. Accepts EITHER the new v3 input shape
  // (display/rendering/style) — transformed to the nested legacy shape via
  // renderConfigV3ToLegacy — OR the legacy nested shape directly. Both resolve
  // through the unchanged resolveTheme()/flat ResolvedRenderConfig pipeline.
  renderConfig: z
    .preprocess((val) => {
      if (
        val != null &&
        typeof val === "object" &&
        !Array.isArray(val) &&
        ("display" in val || "rendering" in val || "style" in val)
      ) {
        return renderConfigV3ToLegacy(RenderConfigV3Schema.parse(val));
      }
      return val;
    }, RenderConfigSchema)
    .optional(),
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
export type Filters = z.infer<typeof FiltersSchema>;
/** Input type for Filters — accepts partial input before defaults */
export type FiltersInput = z.input<typeof FiltersSchema>;
export type RenderConfig = z.infer<typeof RenderConfigSchema>;
/** Input type for RenderConfig — all nested sub-schemas accept partial input before defaults */
export type RenderConfigInput = z.input<typeof RenderConfigSchema>;

/**
 * Default render configuration — concrete baseline values for the nested RenderConfig.
 *
 * Represents the standard "out-of-box" canvas configuration before any caller
 * overrides or theme resolution. All sub-schemas are resolved with their defaults.
 *
 * @see SpatialConfigSchema — spatial defaults (1600×800 canvas, strokeWidth 1, nodeRadii._default 5)
 * @see TypographyConfigSchema — typography defaults (Inter font, 1.0× label scale)
 * @see StylingConfigSchema — styling defaults ("default" theme, no overrides)
 * @see AxesConfigSchema — axes defaults (English locale, no label overrides)
 * @see LegendSchema — legend defaults (show=true, position="bottom-right")
 */
/** Default legend config — show=true, position="bottom-right", overflow="allow". */
export const DEFAULT_LEGEND_CONFIG = LegendSchema.parse({});

/** Default filters config — all layers visible, no component types excluded. */
export const DEFAULT_FILTERS_CONFIG = FiltersSchema.parse({});

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  spatial: DEFAULT_SPATIAL_CONFIG,
  typography: DEFAULT_TYPOGRAPHY_CONFIG,
  styling: DEFAULT_STYLING_CONFIG,
  filters: DEFAULT_FILTERS_CONFIG,
  legend: DEFAULT_LEGEND_CONFIG,
  axes: DEFAULT_AXES_CONFIG,
  configIntent: DEFAULT_CONFIG_INTENT,
};
export type EvolveStyle = z.infer<typeof EvolveStyleSchema>;
export type EvolveStylesMap = z.infer<typeof EvolveStylesMapSchema>;
/** Step decorator (number + optional color), attached to a component. */
export type StepDecorator = z.infer<typeof StepDecoratorSchema>;
export type WardleyMap = z.infer<typeof WardleyMapSchema>;

// TypeStyleMap<V> is defined earlier alongside makeTypeStyleMapSchema and TypeColorsSchema.
// See the "TypeStyleMap — generic per-type styling abstraction" section above.

// ── Accessor shortcuts ──────────────────────────────────────
// Reduce verbosity of .position.evolution.scalar everywhere

/** Get evolution scalar from a component */
export function evo(c: Component): number { return c.position.evolution.scalar; }

/** Get visibility scalar from a component */
export function vis(c: Component): number { return c.position.visibility.scalar; }

/** Get evolution scalar from an evolvesTo target */
export function evoTarget(e: EvolvesTo): number { return e.position.evolution.scalar; }

/** Get visibility scalar from an evolvesTo target */
export function visTarget(e: EvolvesTo): number { return e.position.visibility.scalar; }

// ── RenderConfig accessor helpers ───────────────────────────
// Reduce verbosity when accessing nested RenderConfig sub-schema fields.
// Each accessor reads from the nested group with a fallback to the default.

// Cached resolved defaults for accessors (avoids repeated optional chaining)
const _defaultSpatial = DEFAULT_SPATIAL_CONFIG;
const _defaultTypography = DEFAULT_TYPOGRAPHY_CONFIG;
const _defaultStyling = DEFAULT_STYLING_CONFIG;
const _defaultAxes = DEFAULT_AXES_CONFIG;

/** Get canvas width from a RenderConfig (spatial.width, default 1600) */
export function rcWidth(rc?: RenderConfigInput): number {
  return rc?.spatial?.width ?? _defaultSpatial.width;
}

/** Get canvas height from a RenderConfig (spatial.height, default 800) */
export function rcHeight(rc?: RenderConfigInput): number {
  return rc?.spatial?.height ?? _defaultSpatial.height;
}

/** Get stroke width from a RenderConfig (spatial.strokeWidth, default 1) */
export function rcStrokeWidth(rc?: RenderConfigInput): number {
  return rc?.spatial?.strokeWidth ?? _defaultSpatial.strokeWidth;
}

/** Get font family from a RenderConfig (typography.fontFamily, default "Inter, sans-serif") */
export function rcFontFamily(rc?: RenderConfigInput): string {
  return rc?.typography?.fontFamily ?? _defaultTypography.fontFamily;
}

/** Get label scale from a RenderConfig (typography.labelScale, default 1.0) */
export function rcLabelScale(rc?: RenderConfigInput): number {
  return rc?.typography?.labelScale ?? _defaultTypography.labelScale;
}

/** Get theme from a RenderConfig (styling.theme, default "default") */
export function rcTheme(rc?: RenderConfigInput): Theme {
  return (rc?.styling?.theme ?? _defaultStyling.theme) as Theme;
}

/** Get locale from a RenderConfig (axes.locale, default "en") */
export function rcLocale(rc?: RenderConfigInput): Locale {
  return (rc?.axes?.locale ?? _defaultAxes.locale) as Locale;
}

/**
 * Merge a partial RenderConfigInput with defaults to produce a fully resolved RenderConfig.
 *
 * Parses the input through RenderConfigSchema (applying Zod defaults) then
 * deep-merges with DEFAULT_RENDER_CONFIG to guarantee every leaf field is present.
 *
 * @param input - Partial nested config input (any sub-schema can be omitted)
 * @returns Fully resolved RenderConfig with all defaults applied
 */
export function resolveRenderConfigDefaults(input?: RenderConfigInput): RenderConfig {
  if (!input) return { ...DEFAULT_RENDER_CONFIG };
  const parsed = RenderConfigSchema.parse(input);
  return {
    spatial: parsed.spatial ? { ..._defaultSpatial, ...parsed.spatial } : _defaultSpatial,
    typography: parsed.typography ? { ..._defaultTypography, ...parsed.typography } : _defaultTypography,
    styling: parsed.styling ? { ..._defaultStyling, ...parsed.styling } : _defaultStyling,
    filters: parsed.filters ? { ...DEFAULT_FILTERS_CONFIG, ...parsed.filters } : DEFAULT_FILTERS_CONFIG,
    legend: parsed.legend ? { ...DEFAULT_LEGEND_CONFIG, ...parsed.legend } : DEFAULT_LEGEND_CONFIG,
    axes: parsed.axes ? { ..._defaultAxes, ...parsed.axes } : _defaultAxes,
    avoidCollisions: parsed.avoidCollisions,
    methods: parsed.methods,
    configIntent: parsed.configIntent
      ? { ...DEFAULT_CONFIG_INTENT, ...parsed.configIntent }
      : DEFAULT_CONFIG_INTENT,
  };
}

// ── Color mapping ──────────────────────────────────────────
// Minimal Tailwind-to-hex mapping with black fallback
const COLOR_MAP: Record<string, string> = {
  "red-600": "#dc2626",
  "blue-600": "#2563eb",
  "green-600": "#16a34a",
  "yellow-600": "#ca8a04",
  "orange-600": "#ea580c",
  "purple-600": "#9333ea",
};

/** Resolve a Tailwind-style color name to hex, with black fallback */
export function resolveColor(color: string | undefined): string {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color;
  return COLOR_MAP[color] ?? "#000000";
}

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
    if (!ids.has(r.source))
      errors.push(`Relation references unknown component: ${r.source}`);
    if (!ids.has(r.target))
      errors.push(`Relation references unknown component: ${r.target}`);
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

  // Migrate legacy from/to → source/target and normalize relation types
  const componentIds = new Set(map.components.map((c) => c.id));
  for (let i = 0; i < map.relations.length; i++) {
    const r = map.relations[i];
    const rawRel = r as any;
    // Legacy from/to field migration (in case raw data sneaks through parse)
    if (!r.source && rawRel.from) r.source = rawRel.from;
    if (!r.target && rawRel.to) r.target = rawRel.to;

    // Auto-generate id if missing (legacy data)
    if (!r.id) {
      r.id = `rel-${r.source}-${r.target}-${i}`;
    }

    // Normalize relation type
    const rawRelType = (r.type as string) ?? "DependsOn";
    r.type = (LEGACY_RELATION_TYPE_MAP[rawRelType] ?? "DependsOn") as any;
  }

  // Remove orphan relations (referencing non-existent component IDs)
  map.relations = map.relations.filter(
    (r) => componentIds.has(r.source) && componentIds.has(r.target)
  );

  // Deduplicate relations
  const seen = new Set<string>();
  map.relations = map.relations.filter((r) => {
    const key = `${r.source}->${r.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return map;
}

/** Convert JSON pivot to OWM (Online Wardley Maps) text format
 *  NOTE: temporarily broken due to schema breaking changes (source/target, types).
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
    const src = byId.get(r.source);
    const tgt = byId.get(r.target);
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
        source,
        target,
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
    // Map gridSize → renderConfig dimensions
    ...(raw.gridSize ? {
      renderConfig: {
        width: raw.gridSize.width ?? 1600,
        height: raw.gridSize.height ?? 800,
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
   * Typography — font family and label scale multiplier.
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
export function resolveTheme(renderConfig?: RenderConfigInput): ResolvedRenderConfig {
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


// ── Field-Category Taxonomy ──────────────────────────────────
//
// Every field in RenderConfig (and sub-schemas CoordinateSpace, Background,
// Legend, Filters) is annotated as one of two mutually exclusive categories:
//
//   'author-intent'     — set by the map creator; defines the map's intended
//                         presentation and structure. MUST NOT be silently
//                         overridden by a viewer-preferences object.
//   'viewer-preference' — can be overridden by a consumer/viewer of the map.
//                         Examples: theme, locale, font family, colors.
//
// All three coordinate-system-defining top-level fields (width, height,
// coordinateSpace) are 'author-intent' — they MUST NOT live inside
// chrome/background containers (see goal constraints).
//
// TypeStyleMap-keyed values (nodeRadii, typeColors, evolveStyles) are
// 'viewer-preference' as a group; the _default fallback key is also
// viewer-preference since it is part of the style value system.
//

/**
 * Discriminates between fields set by the map author vs. preferences a
 * viewer/consumer may override — using the 4-tier precedence system.
 *
 * Precedence order (highest → lowest):
 *
 * - `'platform-constraint'`  Fields whose values constrain the coordinate and
 *                            layout system. Highest authority — authorConfig
 *                            wins; viewer cannot override. Examples: width,
 *                            height, coordinateSpace (constrains legend
 *                            positioning), configIntent.
 *
 * - `'layout-structural'`    Fields that define structural layout decisions:
 *                            background (axis/phase visibility), legend (show
 *                            flag), filters (data scope). authorConfig wins;
 *                            viewer cannot override structural choices.
 *
 * - `'author-intent'`        Visual design decisions that are part of the map's
 *                            intended presentation (colors, stroke widths,
 *                            radii, font). Cannot be silently replaced by
 *                            viewer preferences.
 *
 * - `'viewer-preference'`    Consumer/viewer can customise these without
 *                            changing the map's semantic content (theme,
 *                            locale, labelScale).
 *
 * @see TIER_PRECEDENCE — the ordered array of all four tiers
 * @see TIERED_RENDER_CONFIG_TAXONOMY — per-field tier classification
 */
export type FieldCategory =
  | "platform-constraint"
  | "layout-structural"
  | "author-intent"
  | "viewer-preference";

/**
 * Metadata record attached to a single RenderConfig (or sub-schema) field.
 * The `satisfies` constraint on taxonomy consts ensures exhaustiveness at
 * definition time without widening the inferred literal types.
 */
export interface FieldMetadata {
  readonly category: FieldCategory;
  /** One-line rationale for the classification. */
  readonly description: string;
  /**
   * Whether this field may appear in a viewer-preferences override object.
   * Mirrors `category === 'viewer-preference'` but expressed as a boolean
   * for direct use in resolver guard clauses.
   */
  readonly overridable: boolean;
}

// ── RenderConfig top-level field taxonomy ───────────────────

/**
 * Maps every top-level input field of {@link RenderConfigSchema} to its
 * {@link FieldMetadata}.
 *
 * Consumed by {@link getRenderConfigFieldCategory} and
 * {@link isViewerOverridable} helpers, and by `resolveTheme` when it needs
 * to apply only viewer-preference fields from an override payload.
 *
 * Classification rationale:
 * | Field            | Category           | Reason |
 * |------------------|--------------------|--------|
 * | width / height   | author-intent      | Coordinate-system-defining — locked (goal constraint) |
 * | coordinateSpace  | author-intent      | Encapsulates ALL coord-system params |
 * | theme            | viewer-preference  | Visual preset, no semantic change |
 * | axes             | viewer-preference  | Locale + axis labels, no semantic change |
 * | background       | author-intent      | Contains structural axis-visibility sub-fields |
 * | typography       | author-intent      | fontFamily (brand) + labelScale (accessibility) |
 * | nodeRadii        | author-intent      | Node sizes in px-space — visual design |
 * | avoidCollisions  | author-intent      | Label layout algorithm — design decision |
 * | typeColors       | author-intent      | Color overrides per type — visual design |
 * | evolveStyles     | author-intent      | Arrow stroke styles — visual design |
 * | legend           | author-intent      | legend.show is structural; see LEGEND_FIELD_TAXONOMY |
 * | filters          | author-intent      | excludeComponentTypes is structural data filter |
 * | strokeWidth      | author-intent      | Edge/outline line weight — visual design |
 */
export const RENDER_CONFIG_FIELD_TAXONOMY = {
  spatial: {
    category: "author-intent" as const,
    description:
      "Spatial group — canvas dimensions, coordinate space, stroke width, node radii. " +
      "Contains coordinate-system-defining fields that must not live in chrome/background containers.",
    overridable: false,
  },
  typography: {
    category: "author-intent" as const,
    description:
      "Typography group — fontFamily (author brand decision) and labelScale (viewer accessibility). " +
      "Compound field classified author-intent at top level due to fontFamily.",
    overridable: false,
  },
  styling: {
    category: "author-intent" as const,
    description:
      "Styling group — theme, palette (colors), evolve styles, background. " +
      "Contains visual design decisions (colors, theme, axis display controls).",
    overridable: false,
  },
  filters: {
    category: "author-intent" as const,
    description:
      "Compound field: excludeComponentTypes is a structural data filter (author-intent); " +
      "layer toggles are viewer-preference. " +
      "See FILTERS_FIELD_TAXONOMY for per-sub-field detail.",
    overridable: false,
  },
  legend: {
    category: "author-intent" as const,
    description:
      "Compound field: legend.show is a structural author decision; " +
      "position and overflow are viewer-preference. " +
      "See LEGEND_FIELD_TAXONOMY for per-sub-field detail.",
    overridable: false,
  },
  axes: {
    category: "viewer-preference" as const,
    description:
      "Axes configuration group — locale preset and i18n axis label overrides. " +
      "Cosmetic, does not change map structure.",
    overridable: true,
  },
  avoidCollisions: {
    category: "author-intent" as const,
    description:
      "Label collision-avoidance algorithm toggle — layout design decision",
    overridable: false,
  },
  methods: {
    category: "author-intent" as const,
    description:
      "Per-method rendering configuration (type, color, i18n legend labels) — visual design decision",
    overridable: false,
  },
  configIntent: {
    category: "author-intent" as const,
    description:
      "Configurable scope-boundary intent flags (staticExport, noTemporalDiff, noInteraction) — " +
      "first-class schema metadata; author-intent because it defines the renderer's operational contract",
    overridable: false,
  },
} as const satisfies Record<string, FieldMetadata>;

// ── CoordinateSpace sub-field taxonomy ──────────────────────

/**
 * Maps every field of CoordinateSpace to its FieldMetadata.
 *
 * All CoordinateSpace fields are 'author-intent' and non-overridable:
 * they collectively define the coordinate system of the canvas, which is
 * a structural concern determined by the map author.
 */
export const COORDINATE_SPACE_FIELD_TAXONOMY = {
  width: {
    category: "author-intent" as const,
    description: "Canvas width in pixels — defines horizontal extent of px-space",
    overridable: false,
  },
  height: {
    category: "author-intent" as const,
    description: "Canvas height in pixels — defines vertical extent of px-space",
    overridable: false,
  },
  evolutionRange: {
    category: "author-intent" as const,
    description:
      "Normalised [start, end] slice of the evolution axis to display — part of coordinate system",
    overridable: false,
  },
  visibilityRange: {
    category: "author-intent" as const,
    description:
      "Normalised [start, end] slice of the visibility axis to display — part of coordinate system",
    overridable: false,
  },
  units: {
    category: "author-intent" as const,
    description: "Unit system declaration (always 'px') — structural",
    overridable: false,
  },
  unit: {
    category: "author-intent" as const,
    description: "Coordinate unit type (always 'canvas-px') — structural",
    overridable: false,
  },
  origin: {
    category: "author-intent" as const,
    description: "Canvas coordinate origin (always 'top-left') — structural",
    overridable: false,
  },
} as const satisfies Record<string, FieldMetadata>;

// ── Background sub-field taxonomy ───────────────────────────

/**
 * Maps sub-fields of BackgroundSchema (accessed via `renderConfig.background`)
 * to their FieldMetadata.
 *
 * Note the mixed nature of this compound field:
 * - `color` is a cosmetic viewer preference (theme controls it).
 * - All axis/phase visibility flags are structural author decisions.
 * - All axis label text fields are author-authored strings.
 *
 * Dot-notation keys are used for nested sub-objects
 * (e.g. "evolutionXAxis.show").
 */
export const BACKGROUND_FIELD_TAXONOMY = {
  color: {
    category: "viewer-preference" as const,
    description:
      "Canvas background fill color — cosmetic, controlled by theme baseline",
    overridable: true,
  },
  "evolutionXAxis.show": {
    category: "author-intent" as const,
    description:
      "Whether the evolution (X) axis arrow and direction labels are rendered — structural decision",
    overridable: false,
  },
  "evolutionXAxis.xAxis": {
    category: "author-intent" as const,
    description:
      "Custom evolution axis label text — authored string, overrides locale preset",
    overridable: false,
  },
  "valueChainYAxis.show": {
    category: "author-intent" as const,
    description:
      "Whether the value-chain (Y) axis arrow and direction labels are rendered — structural decision",
    overridable: false,
  },
  "valueChainYAxis.yAxis": {
    category: "author-intent" as const,
    description:
      "Custom value-chain axis label text — authored string, overrides locale preset",
    overridable: false,
  },
  "evolutionPhases.showPhaseDividerAndLabel": {
    category: "author-intent" as const,
    description:
      "Whether evolution phase dividers and phase labels are rendered — structural decision",
    overridable: false,
  },
  "evolutionPhases.phases": {
    category: "author-intent" as const,
    description:
      "Custom phase label text array — authored strings, override locale preset",
    overridable: false,
  },
  // axisLabels removed in Sub-AC 2 — direction indicator labels are now locale-only
} as const satisfies Record<string, FieldMetadata>;

// ── Legend sub-field taxonomy ────────────────────────────────

/**
 * Maps sub-fields of LegendSchema (accessed via `renderConfig.legend`)
 * to their FieldMetadata.
 *
 * `show` is author-intent because the decision to include a legend is part
 * of the map's communicative design; `position` and `legendOverflow` are
 * layout preferences the viewer can adjust.
 */
export const LEGEND_FIELD_TAXONOMY = {
  show: {
    category: "author-intent" as const,
    description:
      "Whether the legend is visible — the author decides if a legend enhances the map",
    overridable: false,
  },
  position: {
    category: "viewer-preference" as const,
    description:
      "Legend position — named preset or explicit {x, y} in px-space; layout preference",
    overridable: true,
  },
  legendOverflow: {
    category: "viewer-preference" as const,
    description:
      "How to handle legend overflow beyond canvas boundary — layout preference",
    overridable: true,
  },
} as const satisfies Record<string, FieldMetadata>;

// ── Filters sub-field taxonomy ───────────────────────────────

/**
 * Maps sub-fields of FiltersSchema (accessed via `renderConfig.filters`)
 * to their FieldMetadata.
 *
 * `excludeComponentTypes` is structural: the author decides which component
 * types are relevant to the map's story. Layer toggles are presentation-level
 * and can be adjusted by the viewer without changing the data.
 */
export const FILTERS_FIELD_TAXONOMY = {
  excludeComponentTypes: {
    category: "author-intent" as const,
    description:
      "Component types excluded from rendering — pre-render data filter, structural author decision",
    overridable: false,
  },
  "layers.*": {
    category: "viewer-preference" as const,
    description:
      "Layer visibility toggles (nodes/edges/labels/etc) — post-render visual toggles, viewer preference",
    overridable: true,
  },
} as const satisfies Record<string, FieldMetadata>;

// ── TypeStyleMap taxonomy ────────────────────────────────────

/**
 * Category classification for the TypeStyleMap pattern used by
 * `nodeRadii`, `typeColors`, and `evolveStyles`.
 *
 * All TypeStyleMap implementations follow the same taxonomy:
 * style values (including the `_default` fallback) are 'viewer-preference',
 * because they are cosmetic and do not affect map semantics.
 *
 * The `_default` key is a structural fallback mechanism, but its value
 * is still a visual style — hence viewer-preference.
 */
export const TYPE_STYLE_MAP_TAXONOMY = {
  _default: {
    category: "viewer-preference" as const,
    description:
      "Catch-all fallback style applied to any type with no explicit key — cosmetic",
    overridable: true,
  },
  _perTypeEntry: {
    category: "viewer-preference" as const,
    description:
      "Per-type style override (keyed by RenderableType enum values) — cosmetic",
    overridable: true,
  },
} as const satisfies Record<string, FieldMetadata>;

// ── Taxonomy helper functions ────────────────────────────────

/**
 * Returns the FieldCategory for a named top-level RenderConfig field.
 *
 * Consumed by resolveTheme (and future viewer-config merge logic) to decide
 * whether a caller-supplied override is permitted for a given field.
 *
 * @example
 *   getRenderConfigFieldCategory("theme")           // "viewer-preference"
 *   getRenderConfigFieldCategory("coordinateSpace") // "author-intent"
 */
export function getRenderConfigFieldCategory(
  fieldName: keyof typeof RENDER_CONFIG_FIELD_TAXONOMY,
): FieldCategory {
  return RENDER_CONFIG_FIELD_TAXONOMY[fieldName].category;
}

/**
 * Returns `true` if the named top-level RenderConfig field can appear in a
 * viewer-preferences override object (i.e. its category is
 * `'viewer-preference'`).
 *
 * @example
 *   isViewerOverridable("theme")           // true
 *   isViewerOverridable("coordinateSpace") // false
 */
export function isViewerOverridable(
  fieldName: keyof typeof RENDER_CONFIG_FIELD_TAXONOMY,
): boolean {
  return RENDER_CONFIG_FIELD_TAXONOMY[fieldName].overridable;
}

/**
 * Returns all top-level RenderConfig field names that are viewer-overridable.
 *
 * Useful for whitelisting a viewer-config object before merging it into an
 * author-supplied config.
 *
 * @example
 *   getViewerOverridableFields()
 *   // ["theme", "axes", "labelScale"]
 */
export function getViewerOverridableFields(): ReadonlyArray<
  keyof typeof RENDER_CONFIG_FIELD_TAXONOMY
> {
  return (
    Object.keys(RENDER_CONFIG_FIELD_TAXONOMY) as Array<
      keyof typeof RENDER_CONFIG_FIELD_TAXONOMY
    >
  ).filter((key) => RENDER_CONFIG_FIELD_TAXONOMY[key].overridable);
}


// ── 4-Tier Precedence System ─────────────────────────────────
//
// Extends the 2-tier author/viewer system with two higher-priority tiers:
//
//   'platform-constraint'  — fields whose values constrain the rest of the
//                            coordinate and layout system (width, height,
//                            coordinateSpace, configIntent).  These
//                            take highest precedence: authorConfig wins, and
//                            any viewer override is rejected.
//
//   'layout-structural'    — fields that define the map's structural scaffold:
//                            background (axis / phase visibility), legend
//                            (show flag), filters (data scope).  authorConfig
//                            wins; viewer cannot override structural choices.
//
//   'author-intent'        — visual design decisions: colors, stroke widths,
//                            radii, font.  authorConfig wins.
//
//   'viewer-preference'    — display-environment preferences: theme, locale,
//                            labelScale.  viewerConfig wins.
//
// Precedence (highest → lowest):
//   platform-constraint > layout-structural > author-intent > viewer-preference

/**
 * Priority-ordered tuple of all four FieldCategory tier names.
 * Index 0 is the highest-authority tier.
 */
export const TIER_PRECEDENCE = [
  "platform-constraint",
  "layout-structural",
  "author-intent",
  "viewer-preference",
] as const satisfies ReadonlyArray<FieldCategory>;

/**
 * Maps every top-level input field of RenderConfigSchema to its 4-tier FieldCategory.
 *
 * This is the data-driven successor to the 2-tier RENDER_CONFIG_FIELD_TAXONOMY.
 * Consumed by getFieldTierCategory and resolveConfig() in resolve-conflict.ts.
 *
 * | Field            | Tier                |
 * |------------------|---------------------|
 * | width / height   | platform-constraint |
 * | coordinateSpace  | platform-constraint |
 * | configIntent     | platform-constraint |
 * | background       | layout-structural   |
 * | legend           | layout-structural   |
 * | filters          | layout-structural   |
 * | typography       | author-intent       |
 * | nodeRadii        | author-intent       |
 * | avoidCollisions  | author-intent       |
 * | typeColors       | author-intent       |
 * | evolveStyles     | author-intent       |
 * | strokeWidth      | author-intent       |
 * | theme            | viewer-preference   |
 * | axes             | viewer-preference   |
 */
export const TIERED_RENDER_CONFIG_TAXONOMY = {
  // ── Tier 1: platform-constraint (highest authority) ─────────────────────
  spatial: {
    category: "platform-constraint" as const,
    description: "Canvas dimensions, coordinate space, stroke width, node radii — constrains all layout and positioning",
    overridable: false,
  },
  configIntent: {
    category: "platform-constraint" as const,
    description: "Scope-boundary intent flags — defines the renderer's operational contract",
    overridable: false,
  },
  // ── Tier 2: layout-structural ────────────────────────────────────────────
  legend: {
    category: "layout-structural" as const,
    description: "legend.show is a structural author decision; position/overflow bundled here",
    overridable: false,
  },
  filters: {
    category: "layout-structural" as const,
    description: "excludeComponentTypes is a structural data filter; layer toggles bundled here",
    overridable: false,
  },
  // ── Tier 3: author-intent ────────────────────────────────────────────────
  styling: {
    category: "author-intent" as const,
    description: "Theme, palette (colors), evolve styles, background — visual design decisions",
    overridable: false,
  },
  typography: {
    category: "author-intent" as const,
    description: "Typography group — fontFamily (author brand) and labelScale (viewer accessibility)",
    overridable: false,
  },
  avoidCollisions: {
    category: "author-intent" as const,
    description: "Label collision-avoidance algorithm toggle — layout design decision",
    overridable: false,
  },
  methods: {
    category: "author-intent" as const,
    description: "Per-method rendering configuration (type, color, i18n legend labels) — visual design decision",
    overridable: false,
  },
  // ── Tier 4: viewer-preference (lowest authority) ──────────────────────────
  axes: {
    category: "viewer-preference" as const,
    description: "Axes configuration — locale preset and i18n axis label overrides. Cosmetic, does not change map structure.",
    overridable: true,
  },
} as const satisfies Record<string, FieldMetadata>;

/**
 * Returns the tiered FieldCategory for a named top-level RenderConfig field,
 * using the 4-tier TIERED_RENDER_CONFIG_TAXONOMY.
 *
 * Unlike getRenderConfigFieldCategory (2-tier legacy), this may return
 * "platform-constraint" or "layout-structural" in addition to the legacy values.
 *
 * @example
 *   getFieldTierCategory("width")        // "platform-constraint"
 *   getFieldTierCategory("background")   // "layout-structural"
 *   getFieldTierCategory("typeColors")   // "author-intent"
 *   getFieldTierCategory("theme")        // "viewer-preference"
 */
export function getFieldTierCategory(
  fieldName: keyof typeof TIERED_RENDER_CONFIG_TAXONOMY,
): FieldCategory {
  return TIERED_RENDER_CONFIG_TAXONOMY[fieldName].category;
}
