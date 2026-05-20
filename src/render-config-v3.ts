/**
 * render-config-v3.ts — the redesigned RenderConfig INPUT schema.
 *
 * Three orthogonal axes (see docs/render-config-redesign.md):
 *   - `display`   — booleans only (what is visible: layers + per-type/subtype)
 *   - `rendering` — non-visual render parameters (locale, avoidCollisions)
 *   - `style`     — per-element appearance, each element `{ default, override }`
 *
 * ADDITIVE / NON-BREAKING for now: this module defines the new shape and a
 * transformer `renderConfigV3ToLegacy()` that maps it onto the existing nested
 * `RenderConfigInput`, so the unchanged `resolveTheme()` / flat
 * `ResolvedRenderConfig` pipeline (and all renderers) consume it with zero
 * changes. A later breaking step will swap `WardleyMapSchema.renderConfig` to
 * this schema and migrate the config tests.
 *
 * Global typography/strokeWidth: the flat resolved contract needs single global
 * values, while the new shape is per-element. `style.global` is the single
 * baseline source; per-element `label`/`line` facets are accepted but inert for
 * font/scale/strokeWidth until the resolved contract is expanded (audit C2).
 *
 * @module render-config-v3
 */

import { z } from "zod";
import { componentRenderableType } from "./renderable-type.js";
// Type-only import from schema.ts (erased at runtime → no import cycle when
// schema.ts imports this module to wire v3 into WardleyMapSchema).
import type { RenderConfigInput } from "./schema.js";

// Closed sets are inlined (not imported from schema.ts) to keep this module free
// of any runtime dependency on schema.ts at evaluation time. They mirror the
// canonical enums in schema.ts (stable, closed vocabularies).
const LOCALES = ["en", "fr"] as const;
const THEMES = ["default", "dark", "highContrast"] as const;
const LEGEND_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "auto"] as const;
const NODE_TYPES = ["anchor", "component", "pipeline"] as const;
const SUBTYPES = ["userNeed", "market", "ecosystem", "solution", "functional", "supplier"] as const;
const EVOLVE_TYPES = ["natural", "ecosystem", "forced", "late"] as const;

// ── Facets ───────────────────────────────────────────────────────────────────
// All facet fields are optional: `default` supplies the standard, `override` a
// partial customization; the effective value is the deep-merge of the two.

const OffsetSchema = z.object({ dx: z.number(), dy: z.number() });

export const SymbolFacetSchema = z.object({
  shape: z.string().optional(),
  radius: z.number().positive().max(50).optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).max(8).optional(),
});

export const LabelFacetSchema = z.object({
  fontFamily: z.string().optional(),
  scale: z.number().positive().max(5).optional(),
  color: z.string().optional(),
  offset: OffsetSchema.optional(),
  text: z.string().optional(),
});

export const LineFacetSchema = z.object({
  color: z.string().optional(),
  width: z.number().min(0).max(8).optional(),
  dash: z.string().optional(),
});

export const BoxFacetSchema = z.object({
  position: z.union([z.enum(LEGEND_POSITIONS), z.object({ x: z.number(), y: z.number() })]).optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
});

/** Build an element style `{ default?, override? }` over a facet-bag schema. */
function elementStyle<T extends z.ZodTypeAny>(facets: T) {
  return z.object({ default: facets.optional(), override: facets.optional() });
}

const SymbolLabelFacets = z.object({
  symbol: SymbolFacetSchema.optional(),
  label: LabelFacetSchema.optional(),
});
const LineFacets = z.object({ line: LineFacetSchema.optional() });
const LineLabelFacets = z.object({
  line: LineFacetSchema.optional(),
  label: LabelFacetSchema.optional(),
});

const NodeElement = elementStyle(SymbolLabelFacets);
const LineElement = elementStyle(LineFacets);

export type RenderConfigV3 = z.infer<typeof RenderConfigV3Schema>;
export type RenderConfigV3Input = z.input<typeof RenderConfigV3Schema>;

// ── display (booleans only) ──────────────────────────────────────────────────

export const DisplaySchema = z.object({
  // render layers
  title: z.boolean().optional(),
  nodes: z.boolean().optional(),
  labels: z.boolean().optional(),
  edges: z.boolean().optional(),
  pipelines: z.boolean().optional(),
  notes: z.boolean().optional(),
  evolveArrows: z.boolean().optional(),
  axisEvolution: z.boolean().optional(),
  axisValueChain: z.boolean().optional(),
  phases: z.boolean().optional(),
  legend: z.boolean().optional(),
  accelerators: z.boolean().optional(),
  steps: z.boolean().optional(),
  // per component type (false → excluded)
  component: z.boolean().optional(),
  anchor: z.boolean().optional(),
  pipeline: z.boolean().optional(),
}).strict();

// ── rendering (non-visual params) ────────────────────────────────────────────

export const RenderingSchema = z.object({
  locale: z.enum(LOCALES).optional(),
  avoidCollisions: z.boolean().optional(),
  theme: z.enum(THEMES).optional(),
}).strict();

// ── style ────────────────────────────────────────────────────────────────────

export const GlobalStyleSchema = z.object({
  fontFamily: z.string().optional(),
  labelScale: z.number().positive().max(5).optional(),
  strokeWidth: z.number().min(0.25).max(8).optional(),
  color: z.string().optional(),
}).strict();

export const StyleSchema = z.object({
  global: GlobalStyleSchema.optional(),
  view: elementStyle(z.object({
    width: z.number().positive().max(10000).optional(),
    height: z.number().positive().max(10000).optional(),
    dpi: z.number().positive().max(2400).optional(),
    align: z.enum(["center", "top-left"]).optional(),
  })).optional(),
  title: elementStyle(z.object({ label: LabelFacetSchema.optional() })).optional(),
  legend: elementStyle(z.object({
    box: BoxFacetSchema.optional(),
    label: LabelFacetSchema.optional(),
  })).optional(),
  background: z.object({
    canvas: elementStyle(z.object({
      width: z.number().positive().max(10000).optional(),
      height: z.number().positive().max(10000).optional(),
      evolutionRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
      visibilityRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
      fill: z.string().optional(),
    })).optional(),
    axisEvolution: elementStyle(LineLabelFacets).optional(),
    axisValueChain: elementStyle(LineLabelFacets).optional(),
    phases: elementStyle(z.object({
      line: LineFacetSchema.optional(),
      labels: z.array(LabelFacetSchema).optional(),
    })).optional(),
  }).optional(),
  // nodes — cascade default → byType → bySubtype (nature excluded from style)
  nodes: z.object({
    default: NodeElement.optional(),
    byType: z.object({
      anchor: NodeElement.optional(),
      component: NodeElement.optional(),
      pipeline: NodeElement.optional(),
    }).optional(),
    bySubtype: z.object({
      userNeed: NodeElement.optional(),
      market: NodeElement.optional(),
      ecosystem: NodeElement.optional(),
      solution: NodeElement.optional(),
      functional: NodeElement.optional(),
      supplier: NodeElement.optional(),
    }).optional(),
  }).optional(),
  relations: z.object({
    dependency: LineElement.optional(),
    flow: elementStyle(LineLabelFacets).optional(),
    constraint: LineElement.optional(),
  }).optional(),
  movement: z.object({
    natural: LineElement.optional(),
    ecosystem: LineElement.optional(),
    forced: LineElement.optional(),
    late: LineElement.optional(),
  }).optional(),
  // Decorators — per-category method styling (color + i18n legend). Other
  // decorators (accelerator/deaccelerator/step/inertia) use renderer-hardcoded
  // styles for now (no resolved-config knob), so they are not modelled here yet.
  decorators: z.object({
    method: z.record(
      z.string(),
      elementStyle(z.object({
        color: z.string().optional(),
        legend: z.record(z.string(), z.string()).optional(),
      })),
    ).optional(),
  }).strict().optional(),
}).strict();

export const RenderConfigV3Schema = z.object({
  display: DisplaySchema.optional(),
  rendering: RenderingSchema.optional(),
  style: StyleSchema.optional(),
}).strict();

// ── Transformer: v3 → legacy RenderConfigInput ───────────────────────────────

type AnyFacets = Record<string, unknown> | undefined;
/** merge(default, override) for a single element's facet-bag. */
function mergeElement(el: { default?: AnyFacets; override?: AnyFacets } | undefined): Record<string, any> {
  if (!el) return {};
  return { ...(el.default ?? {}), ...(el.override ?? {}) };
}
/** Deep-merge two facet objects one level into their sub-facets (symbol/label/line). */
function mergeFacet(a: any, b: any): any {
  const out: any = { ...(a ?? {}) };
  for (const k of Object.keys(b ?? {})) {
    out[k] = { ...(a?.[k] ?? {}), ...(b[k] ?? {}) };
  }
  return out;
}

/**
 * Map a validated RenderConfigV3 onto the existing nested `RenderConfigInput`,
 * so the unchanged resolveTheme()/flat-ResolvedRenderConfig pipeline consumes it.
 *
 * Honored now: canvas dims/ranges/fill, output hint, global font/scale/stroke,
 * per-renderable-type node radii + colors, evolve (movement) line styles, axis
 * + phase label text, locale, avoidCollisions, theme, layer/type display toggles,
 * legend show/position. Per-element font/stroke/label-color are accepted but
 * inert until the resolved contract is expanded (audit C2).
 */
export function renderConfigV3ToLegacy(v3: RenderConfigV3 | undefined): RenderConfigInput {
  const out: any = {};
  if (!v3) return out;
  const { display, rendering, style } = v3;

  // ── rendering ──
  if (rendering?.avoidCollisions !== undefined) out.avoidCollisions = rendering.avoidCollisions;
  if (rendering?.locale !== undefined) out.axes = { ...(out.axes ?? {}), locale: rendering.locale };
  if (rendering?.theme !== undefined) out.styling = { ...(out.styling ?? {}), theme: rendering.theme };

  // ── style.global → typography + strokeWidth ──
  const g = style?.global;
  if (g?.fontFamily !== undefined || g?.labelScale !== undefined) {
    out.typography = {
      ...(g?.fontFamily !== undefined ? { fontFamily: g.fontFamily } : {}),
      ...(g?.labelScale !== undefined ? { labelScale: g.labelScale } : {}),
    };
  }
  const spatial: any = {};
  if (g?.strokeWidth !== undefined) spatial.strokeWidth = g.strokeWidth;

  // ── background.canvas → spatial dims + coordinateSpace + background.color ──
  const canvas = mergeElement(style?.background?.canvas as any);
  if (canvas.width !== undefined) spatial.width = canvas.width;
  if (canvas.height !== undefined) spatial.height = canvas.height;
  const cs: any = {};
  if (canvas.width !== undefined) cs.width = canvas.width;
  if (canvas.height !== undefined) cs.height = canvas.height;
  if (canvas.evolutionRange !== undefined) cs.evolutionRange = canvas.evolutionRange;
  if (canvas.visibilityRange !== undefined) cs.visibilityRange = canvas.visibilityRange;

  // ── view → coordinateSpace.outputHint ──
  const view = mergeElement(style?.view as any);
  if (view.width !== undefined || view.height !== undefined || view.dpi !== undefined) {
    cs.outputHint = {
      ...(view.width !== undefined ? { targetWidth: view.width } : {}),
      ...(view.height !== undefined ? { targetHeight: view.height } : {}),
      ...(view.dpi !== undefined ? { dpi: view.dpi } : {}),
    };
  }
  if (Object.keys(cs).length > 0) spatial.coordinateSpace = cs;

  // ── nodes cascade → nodeRadii + palette (keyed by renderable type) ──
  const nodeRadii: Record<string, number> = {};
  const palette: Record<string, string> = {};
  const applyNode = (key: string, el: any) => {
    const m = mergeFacet(el?.default, el?.override);
    if (m.symbol?.radius !== undefined) nodeRadii[key] = m.symbol.radius;
    const color = m.symbol?.stroke ?? m.symbol?.fill;
    if (color !== undefined) palette[key] = color;
  };
  applyNode("_default", style?.nodes?.default);
  const bt = style?.nodes?.byType;
  if (bt) for (const t of ["anchor", "component", "pipeline"] as const) {
    if (bt[t]) applyNode(componentRenderableType(t, undefined), bt[t]);
  }
  const bs = style?.nodes?.bySubtype;
  if (bs) for (const s of SUBTYPES) {
    if ((bs as any)[s]) applyNode(componentRenderableType("component", s), (bs as any)[s]);
  }
  if (Object.keys(nodeRadii).length > 0) {
    spatial.nodeRadii = { _default: 5, ...nodeRadii };
  }

  // ── movement → evolveStyles ──
  const evolveStyles: Record<string, any> = {};
  if (style?.movement) for (const e of EVOLVE_TYPES) {
    const el = (style.movement as any)[e];
    if (!el) continue;
    const m = mergeFacet(el.default, el.override);
    if (m.line) {
      evolveStyles[e] = {
        ...(m.line.color !== undefined ? { stroke: m.line.color } : {}),
        ...(m.line.dash !== undefined ? { strokeDasharray: m.line.dash } : {}),
      };
    }
  }

  // ── styling (palette / evolveStyles / background.color) ──
  const styling: any = { ...(out.styling ?? {}) };
  if (Object.keys(palette).length > 0) styling.palette = { _default: "#000000", ...palette };
  if (Object.keys(evolveStyles).length > 0) styling.evolveStyles = evolveStyles;
  const bgColor = canvas.fill;
  const bg: any = {};
  if (bgColor !== undefined) bg.color = bgColor;

  // ── axis + phase label text → axes.axisLabels; display axis toggles → background ──
  const axisLabels: any = {};
  const axisEvoText = mergeFacet(
    (style?.background?.axisEvolution as any)?.default,
    (style?.background?.axisEvolution as any)?.override,
  )?.label?.text;
  const axisVcText = mergeFacet(
    (style?.background?.axisValueChain as any)?.default,
    (style?.background?.axisValueChain as any)?.override,
  )?.label?.text;
  if (axisEvoText !== undefined) axisLabels.xAxis = axisEvoText;
  if (axisVcText !== undefined) axisLabels.yAxis = axisVcText;
  const phasesMerged = mergeFacet(
    (style?.background?.phases as any)?.default,
    (style?.background?.phases as any)?.override,
  );
  if (Array.isArray(phasesMerged?.labels)) {
    axisLabels.phases = phasesMerged.labels.map((l: any) => l?.text);
  }
  if (Object.keys(axisLabels).length > 0) {
    out.axes = { ...(out.axes ?? {}), axisLabels };
  }

  // background axis/phase show toggles
  if (display?.axisEvolution !== undefined) bg.evolutionXAxis = { show: display.axisEvolution };
  if (display?.axisValueChain !== undefined) bg.valueChainYAxis = { show: display.axisValueChain };
  if (display?.phases !== undefined) bg.evolutionPhases = { showPhaseDividerAndLabel: display.phases };
  if (Object.keys(bg).length > 0) styling.background = bg;
  if (Object.keys(styling).length > 0) out.styling = styling;

  // ── display content-layer toggles + type exclusions → filters ──
  const layers: any = {};
  for (const k of ["title", "nodes", "labels", "edges", "pipelines", "notes"] as const) {
    if (display?.[k] !== undefined) layers[k] = display[k];
  }
  if (display?.evolveArrows !== undefined) layers.evolvesTo = display.evolveArrows;
  const excludeComponentTypes: string[] = [];
  for (const t of NODE_TYPES) {
    if (display?.[t] === false) excludeComponentTypes.push(t);
  }
  const filters: any = {};
  if (Object.keys(layers).length > 0) filters.layers = layers;
  if (excludeComponentTypes.length > 0) filters.excludeComponentTypes = excludeComponentTypes;
  if (Object.keys(filters).length > 0) out.filters = filters;

  // ── legend show + position ──
  const legend: any = {};
  if (display?.legend !== undefined) legend.show = display.legend;
  const legendBox = mergeFacet((style?.legend as any)?.default, (style?.legend as any)?.override)?.box;
  if (legendBox?.position !== undefined) legend.position = legendBox.position;
  if (Object.keys(legend).length > 0) out.legend = legend;

  // ── decorators.method → legacy renderConfig.methods[] (per category) ──
  const methodStyles = (style as any)?.decorators?.method as
    | Record<string, { default?: any; override?: any }>
    | undefined;
  if (methodStyles) {
    const methods: any[] = [];
    for (const category of Object.keys(methodStyles)) {
      const m = mergeElement(methodStyles[category]);
      methods.push({
        type: category,
        ...(m.color !== undefined ? { color: m.color } : {}),
        ...(m.legend !== undefined ? { legend: m.legend } : {}),
      });
    }
    if (methods.length > 0) out.methods = methods;
  }

  if (Object.keys(spatial).length > 0) out.spatial = spatial;

  return out as RenderConfigInput;
}
