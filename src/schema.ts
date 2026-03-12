import { z } from "zod";

// ── Evolution axis ──────────────────────────────────────────
// Phase 1: single float. Phase 2+: swap to distribution array.
export const EvolutionSchema = z.number().min(0).max(1);

// ── Component types & natures (from SEED spec) ─────────────
export const ComponentTypeEnum = z.enum(["anchor", "need", "capacity"]);

export const AnchorNature = z.null();
export const NeedNature = z.enum(["natural_need", "technical_system_need"]);
export const CapacityNature = z.enum([
  "activity",
  "practice",
  "data",
  "knowledge",
]);

// ── Component ──────────────────────────────────────────────
export const ComponentSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: ComponentTypeEnum,
  nature: z.union([AnchorNature, NeedNature, CapacityNature]),
  evolution: EvolutionSchema,
  // Visibility on the value chain (0 = top/visible, 1 = bottom/invisible)
  visibility: z.number().min(0).max(1),
  description: z.string().optional(),
  // Optional label offset for rendering (pixels relative to component center)
  labelPosition: z
    .object({ dx: z.number(), dy: z.number() })
    .optional(),
});

// ── Relation (edge) ────────────────────────────────────────
export const RelationSchema = z.object({
  from: z.string(), // component id
  to: z.string(), // component id
  type: z.enum(["dependency", "flow"]).default("dependency"),
});

// ── Wardley Map ────────────────────────────────────────────
export const WardleyMapSchema = z.object({
  title: z.string(),
  components: z.array(ComponentSchema).min(1),
  relations: z.array(RelationSchema),
  context: z.string().optional(),
});

// ── TypeScript types derived from Zod ──────────────────────
export type Component = z.infer<typeof ComponentSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type WardleyMap = z.infer<typeof WardleyMapSchema>;

// ── Engine 3: Hardcoded validation ─────────────────────────

/** Validate nature matches type */
export function validateComponent(c: Component): string[] {
  const errors: string[] = [];

  if (c.type === "anchor" && c.nature !== null) {
    errors.push(`Anchor "${c.label}" must have null nature, got "${c.nature}"`);
  }
  if (
    c.type === "need" &&
    !["natural_need", "technical_system_need"].includes(c.nature as string)
  ) {
    errors.push(
      `Need "${c.label}" must have nature natural_need|technical_system_need, got "${c.nature}"`
    );
  }
  if (
    c.type === "capacity" &&
    !["activity", "practice", "data", "knowledge"].includes(c.nature as string)
  ) {
    errors.push(
      `Capacity "${c.label}" must have nature activity|practice|data|knowledge, got "${c.nature}"`
    );
  }

  return errors;
}

/** Validate full map structural constraints */
export function validateMap(map: WardleyMap): string[] {
  const errors: string[] = [];
  const ids = new Set(map.components.map((c) => c.id));

  // Must have at least one anchor
  const anchors = map.components.filter((c) => c.type === "anchor");
  if (anchors.length === 0) {
    errors.push("Map must have at least one anchor (user/stakeholder)");
  }

  // Validate each component
  for (const c of map.components) {
    errors.push(...validateComponent(c));
  }

  // Validate relations reference valid IDs
  for (const r of map.relations) {
    if (!ids.has(r.from))
      errors.push(`Relation references unknown component: ${r.from}`);
    if (!ids.has(r.to))
      errors.push(`Relation references unknown component: ${r.to}`);
  }

  return errors;
}

/** Auto-fix common LLM mistakes */
export function sanitizeMap(raw: WardleyMap): WardleyMap {
  const map = structuredClone(raw);

  for (const c of map.components) {
    // Clamp evolution
    c.evolution = Math.max(0, Math.min(1, c.evolution));
    c.visibility = Math.max(0, Math.min(1, c.visibility));

    // Force anchor nature to null
    if (c.type === "anchor") {
      (c as any).nature = null;
    }
  }

  // Deduplicate relations
  const seen = new Set<string>();
  map.relations = map.relations.filter((r) => {
    const key = `${r.from}->${r.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return map;
}

/** Convert JSON pivot to OWM (Online Wardley Maps) text format */
export function toOWM(map: WardleyMap): string {
  const lines: string[] = [`title ${map.title}`, ""];

  // Evolution axis labels
  lines.push(
    "evolution genesis / concept -> custom / emerging -> product / converging -> commodity / accepted"
  );
  lines.push("");

  // Components: "component Name [visibility, evolution]"
  for (const c of map.components) {
    // OWM uses 0-1 scale, visibility inverted (0=bottom, 1=top in OWM)
    const vis = (1 - c.visibility).toFixed(2);
    const evo = c.evolution.toFixed(2);
    lines.push(`component ${c.label} [${vis}, ${evo}]`);
  }

  lines.push("");

  // Relations
  const byId = new Map(map.components.map((c) => [c.id, c]));
  for (const r of map.relations) {
    const from = byId.get(r.from);
    const to = byId.get(r.to);
    if (from && to) {
      lines.push(`${from.label}->${to.label}`);
    }
  }

  return lines.join("\n");
}
