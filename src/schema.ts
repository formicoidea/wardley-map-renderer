import { z } from "zod";

// ── Evolution axis ──────────────────────────────────────────
// Phase 1: single float. Phase 2+: swap to distribution array.
export const EvolutionSchema = z.number().min(0).max(1);

// ── Evolution range (optional min-max span) ─────────────────
// Represents a component's evolution uncertainty or span as [min, max].
// Both values are normalized [0, 1] and min must be ≤ max.
export const EvolutionRangeSchema = z
  .tuple([EvolutionSchema, EvolutionSchema])
  .refine(([min, max]) => min <= max, {
    message: "evolutionRange[0] (min) must be ≤ evolutionRange[1] (max)",
  });

// ── Component types (aligned with MapKeep) ──────────────────
// 5 types: component (generic capacity), user-need, pipeline, note, anchor
export const ComponentTypeEnum = z.enum([
  "component",
  "user-need",
  "pipeline",
  "note",
  "anchor",
]);

// ── Nature (optional semantic annotation) ───────────────────
// Freeform natures for future extensibility, not type-coupled
export const NatureEnum = z
  .enum([
    "activity",
    "practice",
    "data",
    "knowledge",
    "natural_need",
    "technical_system_need",
  ])
  .optional();

// ── EvolvesTo target ────────────────────────────────────────
export const EvolvesToSchema = z.object({
  evolution: EvolutionSchema,
  visibility: z.number().min(0).max(1),
  evolveType: z.enum(["natural", "ecosystem", "forced", "late"]).default("natural"),
});

// ── Pipeline geometry ───────────────────────────────────────
// Pipeline-specific bounding box and handle position
export const PipelineGeometrySchema = z.object({
  evoStart: EvolutionSchema,
  evoEnd: EvolutionSchema,
  visStart: z.number().min(0).max(1),
  visEnd: z.number().min(0).max(1),
  handleEvolution: EvolutionSchema.optional(),
});

// ── Component ──────────────────────────────────────────────
export const ComponentSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: ComponentTypeEnum,
  nature: NatureEnum,
  evolution: EvolutionSchema,
  // Visibility on the value chain: 0 = top/visible to user, 1 = bottom/invisible
  // OWM convention: 0 = top of map (visible), 1 = bottom (invisible infrastructure)
  visibility: z.number().min(0).max(1),
  description: z.string().optional(),
  // Optional label offset for rendering (pixels relative to component center)
  labelPosition: z
    .object({ dx: z.number(), dy: z.number() })
    .optional(),
  // Optional evolution range: [min, max] span for evolution uncertainty or breadth
  evolutionRange: EvolutionRangeSchema.optional(),
  // Evolution movement targets
  evolvesTo: z.array(EvolvesToSchema).optional(),
  // Pipeline geometry (only for type === "pipeline")
  pipelineGeometry: PipelineGeometrySchema.optional(),
  // Optional color override (Tailwind-style name, e.g. "red-600")
  color: z.string().optional(),
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
  source: z.string(), // component id (dependency origin — the depender)
  target: z.string(), // component id (dependency destination — the depended-upon)
  type: RelationTypeEnum.default("DependsOn"),
  /** Optional flow annotation describing what passes along this edge */
  flow: FlowSchema.optional(),
});

// ── Grid size ──────────────────────────────────────────────
export const GridSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

// ── Supported locales for axis labels ─────────────────────
export const LocaleEnum = z.enum(["en", "fr"]);

// ── Axis labels (i18n) ────────────────────────────────────
// All fields optional — locale provides defaults, individual fields override.
export const AxisLabelsSchema = z.object({
  /** Locale preset: selects built-in label set (default: "en") */
  locale: LocaleEnum.default("en"),
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

/**
 * AxisLabelsOverrideSchema — variant for renderConfig.axisLabels.
 * Unlike AxisLabelsSchema, locale is optional WITHOUT a default,
 * so unset locale doesn't override axes.labels locale.
 */
export const AxisLabelsOverrideSchema = z.object({
  locale: LocaleEnum.optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  phases: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  evolutionStart: z.string().optional(),
  evolutionEnd: z.string().optional(),
  visibilityHigh: z.string().optional(),
  visibilityLow: z.string().optional(),
});

// ── Axes visibility ────────────────────────────────────────
export const AxesSchema = z.object({
  valueChain: z.boolean().default(true),
  evolution: z.boolean().default(true),
  /** i18n axis labels — locale-aware with per-field overrides */
  labels: AxisLabelsSchema.optional(),
});

// ── Legend config ──────────────────────────────────────────
export const LegendPositionEnum = z.enum([
  "top-left", "top-right", "bottom-left", "bottom-right", "auto"
]);

export const LegendSchema = z.object({
  show: z.boolean().default(true),
  position: LegendPositionEnum.default("auto"),
});

// ── Render config (optional visual overrides embedded in map JSON) ──
// Mirrors RenderOptions from render/types.ts but as a Zod schema,
// allowing render hints to travel with the map payload.

/** Evolve arrow style per evolve type */
export const EvolveStyleSchema = z.object({
  stroke: z.string().optional(),
  strokeDasharray: z.string().optional(),
});

export const RenderConfigSchema = z.object({
  /** Override canvas width (defaults to gridSize.width) */
  width: z.number().positive().optional(),
  /** Override canvas height (defaults to gridSize.height) */
  height: z.number().positive().optional(),
  /** Background color hex string (defaults to "#ffffff") */
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Must be a valid hex color").optional(),
  /** Whether to render axes */
  showAxes: z.boolean().optional(),
  /** Whether to render the value chain (y-axis) label */
  showValueChain: z.boolean().optional(),
  /** Whether to render evolution phase labels */
  showPhaseLabels: z.boolean().optional(),
  /** Font family for all text */
  fontFamily: z.string().optional(),
  /** Scale factor for component label font size (1.0 = default 12px) */
  labelScale: z.number().positive().max(5).optional(),
  /** Node circle radius in pixels */
  nodeRadius: z.number().positive().max(50).optional(),
  /** Enable/disable label collision avoidance */
  avoidCollisions: z.boolean().optional(),
  /** Component types to exclude from rendering */
  excludeTypes: z.array(ComponentTypeEnum).optional(),
  /** Custom color overrides by component type (hex values) */
  typeColors: z.object({
    "component": z.string().optional(),
    "user-need": z.string().optional(),
    "pipeline": z.string().optional(),
    "note": z.string().optional(),
    "anchor": z.string().optional(),
  }).partial().optional(),
  /** evolveType → stroke style mapping for evolution arrows */
  evolveStyles: z.object({
    natural: EvolveStyleSchema.optional(),
    ecosystem: EvolveStyleSchema.optional(),
    forced: EvolveStyleSchema.optional(),
  }).strict().optional(),
  /** Axis label overrides — applied on top of map.axes.labels (highest priority).
   *  Uses AxisLabelsOverrideSchema (locale has no default) so unset fields
   *  fall through to map.axes.labels or locale preset. */
  axisLabels: AxisLabelsOverrideSchema.optional(),
});

// ── Wardley Map ────────────────────────────────────────────
export const WardleyMapSchema = z.object({
  title: z.string(),
  components: z.array(ComponentSchema),
  relations: z.array(RelationSchema),
  context: z.string().optional(),
  // Grid dimensions for coordinate mapping (default 1600×800)
  gridSize: GridSizeSchema.default({ width: 1600, height: 800 }),
  // Axes visibility toggles
  axes: AxesSchema.default({ valueChain: true, evolution: true }),
  // Legend visibility and position
  legend: LegendSchema.default({ show: true, position: "auto" }),
  // Optional render config — visual overrides that travel with the map payload
  renderConfig: RenderConfigSchema.optional(),
});

// ── TypeScript types derived from Zod ──────────────────────
export type Component = z.infer<typeof ComponentSchema>;
export type EvolutionRange = z.infer<typeof EvolutionRangeSchema>;
export type EvolvesTo = z.infer<typeof EvolvesToSchema>;
export type PipelineGeometry = z.infer<typeof PipelineGeometrySchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Flow = z.infer<typeof FlowSchema>;
export type RelationType = z.infer<typeof RelationTypeEnum>;
export type GridSize = z.infer<typeof GridSizeSchema>;
export type Axes = z.infer<typeof AxesSchema>;
export type AxisLabels = z.infer<typeof AxisLabelsSchema>;
export type Locale = z.infer<typeof LocaleEnum>;
export type Legend = z.infer<typeof LegendSchema>;
export type LegendPosition = z.infer<typeof LegendPositionEnum>;
export type RenderConfig = z.infer<typeof RenderConfigSchema>;
export type EvolveStyle = z.infer<typeof EvolveStyleSchema>;
export type WardleyMap = z.infer<typeof WardleyMapSchema>;

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
      `Pipeline "${c.label}" should have pipelineGeometry defined`
    );
  }

  // Non-pipeline should not have pipelineGeometry
  if (c.type !== "pipeline" && c.pipelineGeometry) {
    errors.push(
      `Non-pipeline "${c.label}" should not have pipelineGeometry`
    );
  }

  // Validate evolutionRange consistency with evolution point
  if (c.evolutionRange) {
    const [min, max] = c.evolutionRange;
    if (c.evolution < min || c.evolution > max) {
      errors.push(
        `Component "${c.label}" evolution (${c.evolution}) is outside its evolutionRange [${min}, ${max}]`
      );
    }
  }

  // Validate evolvesTo targets
  if (c.evolvesTo) {
    for (const e of c.evolvesTo) {
      if (e.evolution <= c.evolution) {
        errors.push(
          `Component "${c.label}" evolvesTo target (evo=${e.evolution}) should be further right than source (evo=${c.evolution})`
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
    (c) => c.type === "anchor" || c.type === "user-need"
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

// ── Legacy type mapping for LLM backward compat ─────────────
const LEGACY_TYPE_MAP: Record<string, Component["type"]> = {
  capacity: "component",
  need: "user-need",
  "user_need": "user-need",
  anchor: "anchor",
  component: "component",
  "user-need": "user-need",
  pipeline: "pipeline",
  note: "note",
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
 *  - Default gridSize and axes if missing
 */
export function sanitizeMap(raw: WardleyMap): WardleyMap {
  const map = structuredClone(raw);

  // Ensure gridSize defaults
  if (!map.gridSize) {
    (map as any).gridSize = { width: 1600, height: 800 };
  } else {
    if (!map.gridSize.width || map.gridSize.width <= 0) map.gridSize.width = 1600;
    if (!map.gridSize.height || map.gridSize.height <= 0) map.gridSize.height = 800;
  }

  // Ensure axes defaults
  if (!map.axes) {
    (map as any).axes = { valueChain: true, evolution: true };
  }

  // Ensure legend defaults
  if (!map.legend) {
    (map as any).legend = { show: true, position: "auto" };
  }

  for (const c of map.components) {
    // Migrate legacy type names (LLM might still produce old types)
    const rawType = (c as any).type as string;
    const mappedType = LEGACY_TYPE_MAP[rawType];
    if (mappedType) {
      c.type = mappedType;
    } else {
      // Unknown type: default to "component"
      c.type = "component";
    }

    // Clamp evolution and visibility to [0,1]
    c.evolution = clamp01(c.evolution);
    c.visibility = clamp01(c.visibility);

    // Sanitize evolutionRange: clamp and ensure min ≤ max
    if (c.evolutionRange) {
      c.evolutionRange[0] = clamp01(c.evolutionRange[0]);
      c.evolutionRange[1] = clamp01(c.evolutionRange[1]);
      if (c.evolutionRange[0] > c.evolutionRange[1]) {
        [c.evolutionRange[0], c.evolutionRange[1]] = [c.evolutionRange[1], c.evolutionRange[0]];
      }
    }

    // Sanitize evolvesTo entries
    if (c.evolvesTo) {
      for (const e of c.evolvesTo) {
        e.evolution = clamp01(e.evolution);
        e.visibility = clamp01(e.visibility);
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
    }

    // Auto-populate pipelineGeometry from flat fields if missing
    if (c.type === "pipeline" && !c.pipelineGeometry) {
      const rawComp = c as any;
      if (rawComp.evoStart !== undefined) {
        c.pipelineGeometry = {
          evoStart: clamp01(rawComp.evoStart),
          evoEnd: clamp01(rawComp.evoEnd ?? c.evolution),
          visStart: clamp01(rawComp.visStart ?? c.visibility),
          visEnd: clamp01(rawComp.visEnd ?? c.visibility),
          handleEvolution: rawComp.handleEvolution !== undefined
            ? clamp01(rawComp.handleEvolution)
            : undefined,
        };
      }
    }

    // Strip empty label
    if (!c.label || c.label.trim() === "") {
      c.label = c.id;
    }
  }

  // Migrate legacy from/to → source/target and normalize relation types
  const componentIds = new Set(map.components.map((c) => c.id));
  for (const r of map.relations) {
    const rawRel = r as any;
    // Legacy from/to field migration (in case raw data sneaks through parse)
    if (!r.source && rawRel.from) r.source = rawRel.from;
    if (!r.target && rawRel.to) r.target = rawRel.to;

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
    if (c.type === "note") continue; // Notes not supported in OWM
    // OWM convention: 0=top, 1=bottom — same as our internal format, no conversion needed
    const vis = c.visibility.toFixed(2);
    const evo = c.evolution.toFixed(2);
    lines.push(`component ${c.label} [${vis}, ${evo}]`);
  }

  lines.push("");

  // Relations
  const byId = new Map(map.components.map((c) => [c.id, c]));
  for (const r of map.relations) {
    const src = byId.get(r.source);
    const tgt = byId.get(r.target);
    if (src && tgt) {
      lines.push(`${src.label}->${tgt.label}`);
    }
  }

  return lines.join("\n");
}

// ── MapKeep import helper ──────────────────────────────────

/** Convert a raw MapKeep JSON map to the pivot WardleyMap schema.
 *  Handles flat pipeline fields → pipelineGeometry and from/to → source/target.
 */
export function fromMapKeep(raw: any): WardleyMap {
  const components = (raw.components ?? []).map((c: any) => {
    const base: any = {
      id: c.id,
      label: c.label,
      type: c.type,
      evolution: c.evolution,
      visibility: c.visibility,
    };

    if (c.nature) base.nature = c.nature;
    if (c.color) base.color = c.color;
    if (c.description) base.description = c.description;
    if (c.labelPosition) base.labelPosition = c.labelPosition;

    // Map evolvesTo
    if (c.evolvesTo && c.evolvesTo.length > 0) {
      base.evolvesTo = c.evolvesTo.map((e: any) => ({
        evolution: e.evolution,
        visibility: e.visibility,
        evolveType: e.evolveType ?? "natural",
      }));
    }

    // Map pipeline flat fields to pipelineGeometry
    if (c.type === "pipeline" && c.evoStart !== undefined) {
      base.pipelineGeometry = {
        evoStart: c.evoStart,
        evoEnd: c.evoEnd,
        visStart: c.visStart,
        visEnd: c.visEnd,
        handleEvolution: c.handleEvolution,
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
      evolution: tgt.evolution,
      visibility: tgt.visibility,
      evolveType: "natural",
    });
  }

  const relations = rawEdges
    .filter((e: any) => (e.type ?? "DependsOn") !== "EvolveTo")
    .map((e: any) => {
      const rel: any = {
        source: e.source ?? e.from,
        target: e.target ?? e.to,
        type: e.type ?? "DependsOn",
      };
      if (e.flow) rel.flow = e.flow;
      return rel;
    });

  return WardleyMapSchema.parse({
    title: raw.title ?? "Untitled",
    components,
    relations,
    gridSize: raw.gridSize ?? { width: 1600, height: 800 },
    axes: raw.axes ?? { valueChain: true, evolution: true },
    context: raw.context,
  });
}
