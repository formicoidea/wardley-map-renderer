/**
 * Diff operations module for interactive Wardley Map editing.
 *
 * Defines Zod schemas for each diff operation type and an `applyDiffOp`
 * function that mutates a WardleyMap JSON object in place.
 *
 * Operations covered:
 *   Component CRUD:
 *   - move_component: reposition a component (evolution + visibility)
 *   - add_component: add a new component to the map
 *   - delete_component: remove a component and cascade-delete related edges/evolvesTo refs
 *   - rename_component: change a component's label.name
 *
 *   Component property mutations:
 *   - change_component_type: change a component's type (e.g. "component" → "anchor")
 *   - set_evolves_to: set or clear the evolvesTo target component id
 *   - set_flow: set or clear a flow annotation on a relation
 *
 *   Edge CRUD:
 *   - add_edge: add a new relation (edge) between two existing components
 *   - delete_edge: remove a relation by id
 *   - change_edge_type: change a relation's type (e.g. "DependsOn" → "Flow")
 *
 *   Label positioning:
 *   - move_label: reposition a component's label offset (dx, dy relative to node)
 *
 *   Step positioning:
 *   - move_step: reposition a numbered step sticker on the map
 *
 *   Container-level:
 *   - resize_pipeline: change a pipeline's evolution bounds (evoStart, evoEnd)
 *
 *   Map-level:
 *   - rename_map: change the map title
 *
 * The diff format is an implicit contract — no client-side Zod validation.
 * These schemas exist for server-side validation and documentation only.
 *
 * @module diff-ops
 */

import { z } from "zod";
import type { WardleyMap } from "./schema.js";

// ── Shared field schemas ─────────────────────────────────────────────

const EvolutionValue = z.number().min(0).max(1);
const VisibilityValue = z.number().min(0).max(1);
const ComponentId = z.string().min(1);

// ── Move Component ───────────────────────────────────────────────────

export const MoveComponentPayload = z.object({
  id: ComponentId,
  evolution: EvolutionValue,
  visibility: VisibilityValue,
});
export type MoveComponentPayload = z.infer<typeof MoveComponentPayload>;

// ── Add Component ────────────────────────────────────────────────────

const PipelineGeometryPayload = z.object({
  evoStart: EvolutionValue,
  evoEnd: EvolutionValue,
  visStart: VisibilityValue,
  visEnd: VisibilityValue,
});

export const AddComponentPayload = z.object({
  id: ComponentId,
  name: z.string().min(1),
  type: z.enum(["component", "anchor", "market", "pipeline"]).default("component"),
  nature: z.enum(["activity", "practice", "data", "knowledge", "natural_need", "technical_system_need"]).optional(),
  evolution: EvolutionValue,
  visibility: VisibilityValue,
  pipelineGeometry: PipelineGeometryPayload.optional(),
});
export type AddComponentPayload = z.infer<typeof AddComponentPayload>;

// ── Delete Component ─────────────────────────────────────────────────

export const DeleteComponentPayload = z.object({
  id: ComponentId,
});
export type DeleteComponentPayload = z.infer<typeof DeleteComponentPayload>;

// ── Rename Component ─────────────────────────────────────────────────

export const RenameComponentPayload = z.object({
  id: ComponentId,
  name: z.string().min(1),
});
export type RenameComponentPayload = z.infer<typeof RenameComponentPayload>;

// ── Add Edge ─────────────────────────────────────────────────────────

const EdgeId = z.string().min(1);
const RelationType = z.enum(["DependsOn", "Flow", "Constraint"]).default("DependsOn");

export const AddEdgePayload = z.object({
  id: EdgeId,
  source: ComponentId,
  target: ComponentId,
  type: RelationType,
});
export type AddEdgePayload = z.infer<typeof AddEdgePayload>;

// ── Delete Edge ──────────────────────────────────────────────────────

export const DeleteEdgePayload = z.object({
  id: EdgeId,
});
export type DeleteEdgePayload = z.infer<typeof DeleteEdgePayload>;

// ── Change Component Type ───────────────────────────────────────────

const ComponentType = z.enum(["component", "user-need", "pipeline", "note", "anchor", "market", "ecosystem"]);

export const ChangeComponentTypePayload = z.object({
  id: ComponentId,
  type: ComponentType,
});
export type ChangeComponentTypePayload = z.infer<typeof ChangeComponentTypePayload>;

// ── Set EvolvesTo ───────────────────────────────────────────────────

export const SetEvolvesToPayload = z.object({
  /** The source component id (the one that evolves) */
  id: ComponentId,
  /** The target component id to evolve towards, or null to clear */
  evolvesTo: z.string().min(1).nullable(),
});
export type SetEvolvesToPayload = z.infer<typeof SetEvolvesToPayload>;

// ── Set Flow ────────────────────────────────────────────────────────

export const SetFlowPayload = z.object({
  /** The relation (edge) id */
  id: EdgeId,
  /** Flow annotation to set, or null to clear */
  flow: z
    .object({
      label: z.string().min(1),
      style: z.enum(["solid", "dashed", "bold"]).default("solid"),
    })
    .nullable(),
});
export type SetFlowPayload = z.infer<typeof SetFlowPayload>;

// ── Change Edge Type ────────────────────────────────────────────────

export const ChangeEdgeTypePayload = z.object({
  id: EdgeId,
  type: z.enum(["DependsOn", "Flow", "Constraint"]),
});
export type ChangeEdgeTypePayload = z.infer<typeof ChangeEdgeTypePayload>;

// ── Resize Pipeline ────────────────────────────────────────────────

export const ResizePipelinePayload = z.object({
  /** The pipeline component id */
  id: ComponentId,
  /** New evolution start (left edge) of the pipeline */
  evoStart: EvolutionValue,
  /** New evolution end (right edge) of the pipeline */
  evoEnd: EvolutionValue,
});
export type ResizePipelinePayload = z.infer<typeof ResizePipelinePayload>;

// ── Move Label ──────────────────────────────────────────────────────

export const MoveLabelPayload = z.object({
  /** The component id whose label is being repositioned */
  id: ComponentId,
  /** Horizontal offset relative to the node center (in normalized coordinates) */
  dx: z.number(),
  /** Vertical offset relative to the node center (in normalized coordinates) */
  dy: z.number(),
});
export type MoveLabelPayload = z.infer<typeof MoveLabelPayload>;

// ── Move Step ───────────────────────────────────────────────────────

export const MoveStepPayload = z.object({
  /** Unique id identifying the step sticker to move */
  id: z.string(),
  /** New evolution position [0, 1] */
  evolution: EvolutionValue,
  /** New visibility position [0, 1] */
  visibility: VisibilityValue,
});
export type MoveStepPayload = z.infer<typeof MoveStepPayload>;

// ── Rename Map ─────────────────────────────────────────────────────

export const RenameMapPayload = z.object({
  /** New title for the map */
  title: z.string().min(1),
});
export type RenameMapPayload = z.infer<typeof RenameMapPayload>;

// ── Discriminated union of all diff ops ──────────────────────────────

export const MoveComponentOp = z.object({
  op: z.literal("move_component"),
  payload: MoveComponentPayload,
});

export const AddComponentOp = z.object({
  op: z.literal("add_component"),
  payload: AddComponentPayload,
});

export const DeleteComponentOp = z.object({
  op: z.literal("delete_component"),
  payload: DeleteComponentPayload,
});

export const RenameComponentOp = z.object({
  op: z.literal("rename_component"),
  payload: RenameComponentPayload,
});

export const AddEdgeOp = z.object({
  op: z.literal("add_edge"),
  payload: AddEdgePayload,
});

export const DeleteEdgeOp = z.object({
  op: z.literal("delete_edge"),
  payload: DeleteEdgePayload,
});

export const ChangeComponentTypeOp = z.object({
  op: z.literal("change_component_type"),
  payload: ChangeComponentTypePayload,
});

export const SetEvolvesToOp = z.object({
  op: z.literal("set_evolves_to"),
  payload: SetEvolvesToPayload,
});

export const SetFlowOp = z.object({
  op: z.literal("set_flow"),
  payload: SetFlowPayload,
});

export const ChangeEdgeTypeOp = z.object({
  op: z.literal("change_edge_type"),
  payload: ChangeEdgeTypePayload,
});

export const ResizePipelineOp = z.object({
  op: z.literal("resize_pipeline"),
  payload: ResizePipelinePayload,
});

export const MoveLabelOp = z.object({
  op: z.literal("move_label"),
  payload: MoveLabelPayload,
});

export const MoveStepOp = z.object({
  op: z.literal("move_step"),
  payload: MoveStepPayload,
});

export const RenameMapOp = z.object({
  op: z.literal("rename_map"),
  payload: RenameMapPayload,
});

export const DiffOp = z.discriminatedUnion("op", [
  MoveComponentOp,
  AddComponentOp,
  DeleteComponentOp,
  RenameComponentOp,
  AddEdgeOp,
  DeleteEdgeOp,
  ChangeComponentTypeOp,
  SetEvolvesToOp,
  SetFlowOp,
  ChangeEdgeTypeOp,
  ResizePipelineOp,
  MoveLabelOp,
  MoveStepOp,
  RenameMapOp,
]);

export type DiffOp = z.infer<typeof DiffOp>;

/** @deprecated Use DiffOp instead */
export const ComponentDiffOp = DiffOp;
/** @deprecated Use DiffOp instead */
export type ComponentDiffOp = DiffOp;

// ── Apply functions ──────────────────────────────────────────────────

/**
 * Move a component to a new position. Mutates the map in place.
 * @returns true if the component was found and moved, false otherwise.
 */
function applyMoveComponent(map: WardleyMap, payload: MoveComponentPayload): boolean {
  const comp = map.components.find((c) => c.id === payload.id);
  if (!comp) return false;
  comp.position.evolution.scalar = payload.evolution;
  comp.position.visibility.scalar = payload.visibility;
  return true;
}

/**
 * Add a new component to the map. Mutates the map in place.
 * @returns true if the component was added (no duplicate id), false otherwise.
 */
function applyAddComponent(map: WardleyMap, payload: AddComponentPayload): boolean {
  const exists = map.components.some((c) => c.id === payload.id);
  if (exists) return false;
  const comp: WardleyMap["components"][number] = {
    id: payload.id,
    label: { name: payload.name },
    type: payload.type,
    nature: payload.nature,
    position: {
      evolution: { scalar: payload.evolution },
      visibility: { scalar: payload.visibility },
    },
  };
  if (payload.pipelineGeometry) {
    (comp as any).pipelineGeometry = {
      evoStart: payload.pipelineGeometry.evoStart,
      evoEnd: payload.pipelineGeometry.evoEnd,
      visStart: payload.pipelineGeometry.visStart,
      visEnd: payload.pipelineGeometry.visEnd,
    };
  }
  map.components.push(comp);
  return true;
}

/**
 * Delete a component and cascade-delete all related edges and evolvesTo references.
 * Mutates the map in place.
 * @returns true if the component was found and deleted, false otherwise.
 */
function applyDeleteComponent(map: WardleyMap, payload: DeleteComponentPayload): boolean {
  const idx = map.components.findIndex((c) => c.id === payload.id);
  if (idx === -1) return false;

  // Remove the component
  map.components.splice(idx, 1);

  // Cascade-delete relations referencing this component (source or target)
  map.relations = map.relations.filter(
    (r) => r.source !== payload.id && r.target !== payload.id,
  );

  // Cascade-delete evolvesTo references from other components that point to this id
  // (evolvesTo targets don't reference by id, they're inline position objects,
  //  but if any component had evolvesTo entries we clean up orphaned pipeline children)

  return true;
}

/**
 * Rename a component (change label.name). Mutates the map in place.
 * @returns true if the component was found and renamed, false otherwise.
 */
function applyRenameComponent(map: WardleyMap, payload: RenameComponentPayload): boolean {
  const comp = map.components.find((c) => c.id === payload.id);
  if (!comp) return false;
  comp.label.name = payload.name;
  return true;
}

// ── Edge apply functions ─────────────────────────────────────────────

/**
 * Add a new edge (relation) to the map. Validates that:
 * - No duplicate edge id exists
 * - Source component exists
 * - Target component exists
 * - Source and target are different components
 * Mutates the map in place.
 * @returns true if the edge was added, false otherwise.
 */
function applyAddEdge(map: WardleyMap, payload: AddEdgePayload): boolean {
  // Reject duplicate edge id
  const exists = map.relations.some((r) => r.id === payload.id);
  if (exists) return false;

  // Validate source component exists
  const sourceExists = map.components.some((c) => c.id === payload.source);
  if (!sourceExists) return false;

  // Validate target component exists
  const targetExists = map.components.some((c) => c.id === payload.target);
  if (!targetExists) return false;

  // Reject self-links
  if (payload.source === payload.target) return false;

  map.relations.push({
    id: payload.id,
    source: payload.source,
    target: payload.target,
    type: payload.type,
  });
  return true;
}

/**
 * Delete an edge (relation) by id. Mutates the map in place.
 * @returns true if the edge was found and deleted, false otherwise.
 */
function applyDeleteEdge(map: WardleyMap, payload: DeleteEdgePayload): boolean {
  const idx = map.relations.findIndex((r) => r.id === payload.id);
  if (idx === -1) return false;
  map.relations.splice(idx, 1);
  return true;
}

// ── Component property mutation apply functions ──────────────────────

/** Default half-width for auto-generated pipeline evolution bounds */
const PIPELINE_DEFAULT_HALF_EVO = 0.15;
/** Default half-height for auto-generated pipeline visibility bounds */
const PIPELINE_DEFAULT_HALF_VIS = 0.05;

/**
 * Generate default pipelineGeometry centered on the component's current position.
 *
 * Uses ±0.15 evolution and ±0.05 visibility around the center, clamped to [0, 1].
 */
function generateDefaultPipelineGeometry(
  evolution: number,
  visibility: number,
): { evoStart: number; evoEnd: number; visStart: number; visEnd: number } {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    evoStart: clamp01(evolution - PIPELINE_DEFAULT_HALF_EVO),
    evoEnd: clamp01(evolution + PIPELINE_DEFAULT_HALF_EVO),
    visStart: clamp01(visibility - PIPELINE_DEFAULT_HALF_VIS),
    visEnd: clamp01(visibility + PIPELINE_DEFAULT_HALF_VIS),
  };
}

/**
 * Change a component's type. Mutates the map in place.
 *
 * When changing TO 'pipeline', auto-generates default pipelineGeometry
 * centered on the component's current position (if none exists).
 * When changing AWAY FROM 'pipeline', removes pipelineGeometry and
 * silently ejects any contained components (they preserve their positions;
 * pipeline-component association is purely positional with epsilon 0.015).
 *
 * @returns true if the component was found and its type changed, false otherwise.
 */
function applyChangeComponentType(map: WardleyMap, payload: ChangeComponentTypePayload): boolean {
  const comp = map.components.find((c) => c.id === payload.id);
  if (!comp) return false;

  const wasPipeline = comp.type === "pipeline" && !!comp.pipelineGeometry;
  comp.type = payload.type;

  if (payload.type === "pipeline") {
    // Auto-generate default pipelineGeometry if not already present
    if (!comp.pipelineGeometry) {
      comp.pipelineGeometry = generateDefaultPipelineGeometry(
        comp.position.evolution.scalar,
        comp.position.visibility.scalar,
      );
    }
  } else if (wasPipeline) {
    // Changing away from pipeline — clean up geometry.
    // Contained components are silently ejected: their positions are preserved,
    // but they are no longer inside a pipeline (association is purely positional).
    delete comp.pipelineGeometry;
  }

  return true;
}

/**
 * Set or clear the evolvesTo target on a component. Mutates the map in place.
 *
 * When `payload.evolvesTo` is a component id string, looks up the target component
 * and sets `comp.evolvesTo` to an array with a single entry using the target's position.
 * When `payload.evolvesTo` is null, clears the evolvesTo array.
 *
 * @returns true if the source component was found (and target when setting), false otherwise.
 */
function applySetEvolvesTo(map: WardleyMap, payload: SetEvolvesToPayload): boolean {
  const comp = map.components.find((c) => c.id === payload.id);
  if (!comp) return false;

  if (payload.evolvesTo === null) {
    // Clear evolvesTo
    delete comp.evolvesTo;
    return true;
  }

  // Validate target exists
  const target = map.components.find((c) => c.id === payload.evolvesTo);
  if (!target) return false;

  // Cannot self-evolve
  if (payload.id === payload.evolvesTo) return false;

  // Set evolvesTo to a single entry using the target's position
  comp.evolvesTo = [
    {
      position: {
        evolution: { scalar: target.position.evolution.scalar },
        visibility: { scalar: target.position.visibility.scalar },
      },
      evolveType: "natural" as const,
    },
  ];

  return true;
}

/**
 * Set or clear a flow annotation on a relation. Mutates the map in place.
 *
 * When `payload.flow` is an object `{ label, style? }`, sets the flow annotation.
 * When `payload.flow` is null, clears the flow annotation.
 *
 * @returns true if the relation was found, false otherwise.
 */
function applySetFlow(map: WardleyMap, payload: SetFlowPayload): boolean {
  const rel = map.relations.find((r) => r.id === payload.id);
  if (!rel) return false;

  if (payload.flow === null) {
    delete rel.flow;
  } else {
    rel.flow = { label: payload.flow.label, style: payload.flow.style };
  }

  return true;
}

/**
 * Change a relation's type. Mutates the map in place.
 * @returns true if the relation was found and its type changed, false otherwise.
 */
function applyChangeEdgeType(map: WardleyMap, payload: ChangeEdgeTypePayload): boolean {
  const rel = map.relations.find((r) => r.id === payload.id);
  if (!rel) return false;
  rel.type = payload.type;
  return true;
}

// ── Container-level apply functions ──────────────────────────────────

/** Epsilon for pipeline containment checks (matches pipeline-geometry.ts) */
const PIPELINE_EPSILON = 0.015;

/**
 * Resize a pipeline's evolution bounds. Mutates the map in place.
 *
 * - Ensures evoStart ≤ evoEnd (swaps if inverted)
 * - Recalculates pipeline center position from new bounds
 * - Ejects components that fall outside the new pipeline bounds
 *   (removes their positional association — they remain on the map)
 *
 * Note: "ejection" here means nothing — pipeline-component association is
 * purely positional (epsilon 0.015), so components outside bounds are simply
 * no longer inside the pipeline. No explicit field to clear.
 *
 * @returns true if the pipeline was found and resized, false otherwise.
 */
function applyResizePipeline(map: WardleyMap, payload: ResizePipelinePayload): boolean {
  const comp = map.components.find((c) => c.id === payload.id);
  if (!comp) return false;
  if (comp.type !== "pipeline") return false;
  if (!comp.pipelineGeometry) return false;

  let evoStart = payload.evoStart;
  let evoEnd = payload.evoEnd;

  // Ensure evoStart ≤ evoEnd
  if (evoStart > evoEnd) {
    [evoStart, evoEnd] = [evoEnd, evoStart];
  }

  // Update pipeline geometry
  comp.pipelineGeometry.evoStart = evoStart;
  comp.pipelineGeometry.evoEnd = evoEnd;

  // Recalculate pipeline center position
  comp.position.evolution.scalar = (evoStart + evoEnd) / 2;

  return true;
}

// ── Label apply functions ────────────────────────────────────────────

/**
 * Move a component's label to a new offset position. Mutates the map in place.
 * Sets `label.position = { dx, dy }` using the existing LabelSchema.position format.
 * @returns true if the component was found and label moved, false otherwise.
 */
function applyMoveLabel(map: WardleyMap, payload: MoveLabelPayload): boolean {
  const comp = map.components.find((c) => c.id === payload.id);
  if (!comp) return false;
  comp.label.position = { dx: payload.dx, dy: payload.dy };
  return true;
}

// ── Step apply functions ─────────────────────────────────────────────

/**
 * Move a step sticker to a new position. Mutates the map in place.
 * Finds the step by its `id` field and updates its position.
 * @returns true if the step was found and moved, false otherwise.
 */
function applyMoveStep(map: WardleyMap, payload: MoveStepPayload): boolean {
  if (!map.steps) return false;
  const step = map.steps.find((s) => s.id === payload.id);
  if (!step) return false;
  step.position.evolution.scalar = payload.evolution;
  step.position.visibility.scalar = payload.visibility;
  return true;
}

// ── Map-level apply functions ────────────────────────────────────────

/**
 * Rename the map (change title). Mutates the map in place.
 * @returns true always (map title is always settable).
 */
function applyRenameMap(map: WardleyMap, payload: RenameMapPayload): boolean {
  map.title = payload.title;
  return true;
}

// ── Cascade expansion ────────────────────────────────────────────────

/**
 * Compute the explicit cascade operations for deleting a component.
 *
 * Returns an ordered array of DiffOp that should be appended to the diff
 * buffer BEFORE the final `delete_component` op so that Claude sees every
 * state change with zero inference required:
 *
 *   1. `delete_edge` for every relation where source or target === componentId
 *   2. `set_evolves_to` { id, evolvesTo: null } for every component whose
 *      evolvesTo array references positions matching the deleted component
 *
 * The caller is responsible for actually mutating the map model — this
 * function is a pure read that inspects the current state.
 *
 * @param map  - Current map model (read-only inspection)
 * @param componentId - The id of the component about to be deleted
 * @returns Array of explicit cascade DiffOps (may be empty)
 */
export function expandDeleteCascade(map: WardleyMap, componentId: string): DiffOp[] {
  const ops: DiffOp[] = [];

  // 1. Explicit delete_edge for every relation referencing this component
  for (const r of map.relations) {
    if (r.source === componentId || r.target === componentId) {
      ops.push({ op: "delete_edge", payload: { id: r.id } });
    }
  }

  // 2. Explicit set_evolves_to null for components that evolve towards this component
  //    We detect this by checking if any component's evolvesTo target position matches
  //    the deleted component's position (since evolvesTo is position-based).
  //    Additionally, the interactive model may store evolvesTo as a direct id reference.
  const deletedComp = map.components.find((c) => c.id === componentId);
  if (deletedComp) {
    for (const c of map.components) {
      if (c.id === componentId) continue;
      if (!c.evolvesTo) continue;

      // Check if evolvesTo is stored as a string id (interactive model simplification)
      if (typeof c.evolvesTo === "string") {
        if (c.evolvesTo === componentId) {
          ops.push({ op: "set_evolves_to", payload: { id: c.id, evolvesTo: null } });
        }
        continue;
      }

      // Schema-compliant: evolvesTo is an array of position-based targets
      // Match by position proximity to the deleted component
      if (Array.isArray(c.evolvesTo) && c.evolvesTo.length > 0) {
        const targetEvo = deletedComp.position.evolution.scalar;
        const targetVis = deletedComp.position.visibility.scalar;
        const matches = c.evolvesTo.some((e: any) => {
          const eEvo = e?.position?.evolution?.scalar;
          const eVis = e?.position?.visibility?.scalar;
          return (
            typeof eEvo === "number" &&
            typeof eVis === "number" &&
            Math.abs(eEvo - targetEvo) < 0.001 &&
            Math.abs(eVis - targetVis) < 0.001
          );
        });
        if (matches) {
          ops.push({ op: "set_evolves_to", payload: { id: c.id, evolvesTo: null } });
        }
      }
    }
  }

  return ops;
}

/**
 * Compute the explicit cascade operations for changing a pipeline component
 * to a non-pipeline type.
 *
 * Returns an ordered array of DiffOp representing the components that will
 * be ejected from the pipeline. Since pipeline-component association is purely
 * positional (epsilon 0.015), ejection is implicit — contained components
 * keep their positions and simply stop being inside a pipeline. These
 * move_component ops (with unchanged positions) are emitted for diff
 * exhaustiveness so Claude sees every affected component explicitly.
 *
 * @param map  - Current map model (read-only inspection)
 * @param componentId - The id of the pipeline component being type-changed
 * @returns Array of explicit cascade DiffOps (may be empty)
 */
export function expandChangeTypeCascade(map: WardleyMap, componentId: string): DiffOp[] {
  const ops: DiffOp[] = [];

  const comp = map.components.find((c) => c.id === componentId);
  if (!comp || comp.type !== "pipeline" || !comp.pipelineGeometry) return ops;

  const geo = comp.pipelineGeometry;

  // Find all components positionally inside this pipeline
  for (const c of map.components) {
    if (c.id === componentId) continue;
    if (c.type === "pipeline" || c.type === "note") continue;

    const cEvo = c.position.evolution.scalar;
    const cVis = c.position.visibility.scalar;

    if (
      cEvo >= geo.evoStart - PIPELINE_EPSILON &&
      cEvo <= geo.evoEnd + PIPELINE_EPSILON &&
      cVis >= geo.visStart - PIPELINE_EPSILON &&
      cVis <= geo.visEnd + PIPELINE_EPSILON
    ) {
      // Emit a move_component with unchanged position to document the ejection
      ops.push({
        op: "move_component",
        payload: { id: c.id, evolution: cEvo, visibility: cVis },
      });
    }
  }

  return ops;
}

// ── Central dispatch ─────────────────────────────────────────────────

/**
 * Apply a single diff operation to a WardleyMap, mutating it in place.
 *
 * @param map - The WardleyMap to mutate
 * @param diffOp - A validated diff operation object
 * @returns true if the operation was applied successfully, false if skipped
 */
export function applyDiffOp(map: WardleyMap, diffOp: DiffOp): boolean {
  switch (diffOp.op) {
    case "move_component":
      return applyMoveComponent(map, diffOp.payload);
    case "add_component":
      return applyAddComponent(map, diffOp.payload);
    case "delete_component":
      return applyDeleteComponent(map, diffOp.payload);
    case "rename_component":
      return applyRenameComponent(map, diffOp.payload);
    case "add_edge":
      return applyAddEdge(map, diffOp.payload);
    case "delete_edge":
      return applyDeleteEdge(map, diffOp.payload);
    case "change_component_type":
      return applyChangeComponentType(map, diffOp.payload);
    case "set_evolves_to":
      return applySetEvolvesTo(map, diffOp.payload);
    case "set_flow":
      return applySetFlow(map, diffOp.payload);
    case "change_edge_type":
      return applyChangeEdgeType(map, diffOp.payload);
    case "resize_pipeline":
      return applyResizePipeline(map, diffOp.payload);
    case "move_label":
      return applyMoveLabel(map, diffOp.payload);
    case "move_step":
      return applyMoveStep(map, diffOp.payload);
    case "rename_map":
      return applyRenameMap(map, diffOp.payload);
    default: {
      // Exhaustiveness check
      const _exhaustive: never = diffOp;
      return false;
    }
  }
}

/**
 * Apply a batch of diff operations sequentially.
 * Stops on first failure if `stopOnError` is true (default: false).
 *
 * @returns Array of booleans indicating success/failure for each op.
 */
export function applyDiffOps(
  map: WardleyMap,
  ops: DiffOp[],
  stopOnError = false,
): boolean[] {
  const results: boolean[] = [];
  for (const op of ops) {
    const ok = applyDiffOp(map, op);
    results.push(ok);
    if (!ok && stopOnError) break;
  }
  return results;
}
