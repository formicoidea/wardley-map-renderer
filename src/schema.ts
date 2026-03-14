import { z } from "zod";

// ── Evolution axis ──────────────────────────────────────────
// Phase 1: single float. Phase 2+: swap to distribution array.
export const EvolutionSchema = z.number().min(0).max(1);

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
  evolveType: z.enum(["natural", "ecosystem", "forced"]).default("natural"),
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
  // Visibility on the value chain: 1 = top/visible to user, 0 = bottom/invisible
  // MapKeep convention: higher = more visible to user = higher on the map
  visibility: z.number().min(0).max(1),
  description: z.string().optional(),
  // Optional label offset for rendering (pixels relative to component center)
  labelPosition: z
    .object({ dx: z.number(), dy: z.number() })
    .optional(),
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
export const RelationTypeEnum = z.enum(["DependsOn"]);

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

// ── Axes visibility ────────────────────────────────────────
export const AxesSchema = z.object({
  valueChain: z.boolean().default(true),
  evolution: z.boolean().default(true),
});

// ── Wardley Map ────────────────────────────────────────────
export const WardleyMapSchema = z.object({
  title: z.string(),
  components: z.array(ComponentSchema).min(1),
  relations: z.array(RelationSchema),
  context: z.string().optional(),
  // Grid dimensions for coordinate mapping (default 1600×800)
  gridSize: GridSizeSchema.default({ width: 1600, height: 800 }),
  // Axes visibility toggles
  axes: AxesSchema.default({ valueChain: true, evolution: true }),
});

// ── TypeScript types derived from Zod ──────────────────────
export type Component = z.infer<typeof ComponentSchema>;
export type EvolvesTo = z.infer<typeof EvolvesToSchema>;
export type PipelineGeometry = z.infer<typeof PipelineGeometrySchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Flow = z.infer<typeof FlowSchema>;
export type RelationType = z.infer<typeof RelationTypeEnum>;
export type GridSize = z.infer<typeof GridSizeSchema>;
export type Axes = z.infer<typeof AxesSchema>;
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
    // OWM uses 0-1 scale, visibility inverted (0=bottom, 1=top in OWM)
    const vis = (1 - c.visibility).toFixed(2);
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

  const relations = (raw.edges ?? []).map((e: any) => {
    const rel: any = {
      source: e.source ?? e.from, // support legacy from/to field names
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
