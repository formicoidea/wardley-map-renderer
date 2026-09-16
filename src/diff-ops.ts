/**
 * Zod schemas for the interactive editor's diff ops (server side): payload
 * schemas + the `DiffOp` discriminated union, e.g. for an MCP server to
 * validate ops before calling `applyDiffOp` — the pure, zod-free engine in
 * `./diff-ops-apply.ts` (which is what browser bundles import).
 *
 * Coordinates are normalized [0, 1]; `move_label` / `label.position` dx,dy are
 * SVG user units (px) relative to the node centre (see render/labels-layer.ts).
 *
 * @module diff-ops
 */

import { z } from "zod";
import {
  ComponentTypeEnum,
  EvolutionRangeSchema,
  EvolvesToSchema,
  LabelPositionSchema,
  MethodSchema,
  NatureEnum,
  RelationTypeEnum,
  StepDecoratorSchema,
  SubtypeEnum,
} from "./schema.js";
import type { DiffOp as DiffOpType } from "./diff-ops-apply.js";

// ── Shared field schemas ─────────────────────────────────────────────

const EvolutionValue = z.number().min(0).max(1);
const VisibilityValue = z.number().min(0).max(1);
const Id = z.string().min(1);
const IdPayload = z.object({ id: Id });
/** Same rule as the engine: hex (#rgb … #rrggbbaa) or a Tailwind-style name ("red-600"). */
const Color = z.string().regex(/^(#[0-9a-f]{3,8}|[a-z]+-\d{2,3})$/i, "Must be a hex color or a Tailwind-style name");

// ── Payloads ─────────────────────────────────────────────────────────

export const MoveComponentPayload = z.object({
  id: Id,
  evolution: EvolutionValue,
  visibility: VisibilityValue,
});
export type MoveComponentPayload = z.infer<typeof MoveComponentPayload>;

const PipelineGeometryPayload = z.object({
  evoStart: EvolutionValue,
  evoEnd: EvolutionValue,
  visStart: VisibilityValue,
  visEnd: VisibilityValue,
});

export const AddComponentPayload = z.object({
  /** Optional: generated with `uniqueId(map, name)` when omitted. */
  id: Id.optional(),
  name: z.string().min(1),
  type: ComponentTypeEnum.default("component"),
  subtype: SubtypeEnum.optional(),
  nature: NatureEnum.optional(),
  evolution: EvolutionValue,
  visibility: VisibilityValue,
  pipelineGeometry: PipelineGeometryPayload.optional(),
});
export type AddComponentPayload = z.infer<typeof AddComponentPayload>;

export const DeleteComponentPayload = IdPayload;
export type DeleteComponentPayload = z.infer<typeof DeleteComponentPayload>;

export const RenameComponentPayload = z.object({ id: Id, name: z.string().min(1) });
export type RenameComponentPayload = z.infer<typeof RenameComponentPayload>;

export const AddEdgePayload = z.object({
  /** Optional: when omitted the engine derives it deterministically (see diff-ops-apply `add_edge`). */
  id: Id.optional(),
  consumer: Id,
  supplier: Id,
  type: RelationTypeEnum.default("DependsOn"),
});
export type AddEdgePayload = z.infer<typeof AddEdgePayload>;

export const DeleteEdgePayload = IdPayload;
export type DeleteEdgePayload = z.infer<typeof DeleteEdgePayload>;

export const ReverseEdgePayload = IdPayload;
export type ReverseEdgePayload = z.infer<typeof ReverseEdgePayload>;

export const ChangeComponentTypePayload = z.object({
  id: Id,
  type: ComponentTypeEnum,
  /** Set/cleared together with the type. */
  subtype: SubtypeEnum.optional(),
});
export type ChangeComponentTypePayload = z.infer<typeof ChangeComponentTypePayload>;

/** Replaces the first evolve arrow's target (evolveType/inertia and other arrows kept); null clears all. */
export const SetEvolvesToPayload = z.union([
  z.object({
    /** The component that evolves */
    id: Id,
    /** Target component id (its current position is copied), or null to clear */
    evolvesTo: Id.nullable(),
  }),
  z.object({
    id: Id,
    /** Explicit target point (the editor's evolve tool keeps the source visibility: horizontal arrow) */
    position: z.object({ evolution: EvolutionValue, visibility: VisibilityValue }),
  }),
]);
export type SetEvolvesToPayload = z.infer<typeof SetEvolvesToPayload>;

const FlowPayload = z.object({
  label: z.string().min(1),
  style: z.enum(["solid", "dashed", "bold"]).default("solid"),
});

export const SetFlowPayload = z.object({ id: Id, flow: FlowPayload.nullable() });
export type SetFlowPayload = z.infer<typeof SetFlowPayload>;

export const ChangeEdgeTypePayload = z.object({ id: Id, type: RelationTypeEnum });
export type ChangeEdgeTypePayload = z.infer<typeof ChangeEdgeTypePayload>;

export const ResizePipelinePayload = z
  .object({
    id: Id,
    evoStart: EvolutionValue.optional(),
    evoEnd: EvolutionValue.optional(),
    visStart: VisibilityValue.optional(),
    visEnd: VisibilityValue.optional(),
    /** Handle (top-border square) evolution, clamped into [evoStart, evoEnd] */
    handleEvolution: EvolutionValue.optional(),
  })
  .refine(
    (p) => [p.evoStart, p.evoEnd, p.visStart, p.visEnd, p.handleEvolution].some((v) => v !== undefined),
    { message: "resize_pipeline needs at least one of evoStart, evoEnd, visStart, visEnd, handleEvolution" },
  );
export type ResizePipelinePayload = z.infer<typeof ResizePipelinePayload>;

export const MovePipelinePayload = z.object({
  id: Id,
  /** Evolution delta (clamped so the pipeline stays inside [0, 1]) */
  dEvo: z.number().min(-1).max(1),
  /** Visibility delta (clamped so the pipeline stays inside [0, 1]) */
  dVis: z.number().min(-1).max(1),
});
export type MovePipelinePayload = z.infer<typeof MovePipelinePayload>;

export const DeletePipelinePayload = IdPayload;
export type DeletePipelinePayload = z.infer<typeof DeletePipelinePayload>;

export const MoveLabelPayload = z.object({
  id: Id,
  /** Horizontal offset from the node centre, SVG user units (px) */
  dx: z.number(),
  /** Vertical offset from the node centre, SVG user units (px) */
  dy: z.number(),
});
export type MoveLabelPayload = z.infer<typeof MoveLabelPayload>;

export const MoveStepPayload = z.object({
  /** Id of the component carrying the step decorator */
  id: z.string(),
  evolution: EvolutionValue,
  visibility: VisibilityValue,
});
export type MoveStepPayload = z.infer<typeof MoveStepPayload>;

export const RenameMapPayload = z.object({ title: z.string().min(1) });
export type RenameMapPayload = z.infer<typeof RenameMapPayload>;

// set_field: one object per allowed path so each value is validated exactly.
const field = <P extends string, V extends z.ZodTypeAny>(path: P, value: V) =>
  z.object({ target: Id, path: z.literal(path), value });

export const SetFieldPayload = z.union([
  field("label.name", z.string().min(1)),
  field("label.position", LabelPositionSchema.nullable()),
  field("description", z.string().nullable()),
  field("color", Color.nullable()),
  field("type", z.union([ComponentTypeEnum, RelationTypeEnum])),
  field("subtype", SubtypeEnum.nullable()),
  field("nature", NatureEnum.nullable()),
  field("method", MethodSchema.nullable()),
  field("inertia", z.boolean().nullable()),
  field("accelerator", z.boolean().nullable()),
  field("deaccelerator", z.boolean().nullable()),
  field("step", StepDecoratorSchema.extend({ color: Color.optional() }).nullable()),
  field("evolvesTo", z.array(EvolvesToSchema).nullable()),
  field("position.evolution.range", EvolutionRangeSchema.nullable()),
  field("flow", FlowPayload.nullable()),
]);
export type SetFieldPayload = z.infer<typeof SetFieldPayload>;

// ── Discriminated union of all diff ops ──────────────────────────────

const op = <N extends string, P extends z.ZodTypeAny>(name: N, payload: P) =>
  z.object({ op: z.literal(name), payload });

export const MoveComponentOp = op("move_component", MoveComponentPayload);
export const AddComponentOp = op("add_component", AddComponentPayload);
export const DeleteComponentOp = op("delete_component", DeleteComponentPayload);
export const RenameComponentOp = op("rename_component", RenameComponentPayload);
export const AddEdgeOp = op("add_edge", AddEdgePayload);
export const DeleteEdgeOp = op("delete_edge", DeleteEdgePayload);
export const ReverseEdgeOp = op("reverse_edge", ReverseEdgePayload);
export const ChangeComponentTypeOp = op("change_component_type", ChangeComponentTypePayload);
export const SetEvolvesToOp = op("set_evolves_to", SetEvolvesToPayload);
export const SetFlowOp = op("set_flow", SetFlowPayload);
export const ChangeEdgeTypeOp = op("change_edge_type", ChangeEdgeTypePayload);
export const ResizePipelineOp = op("resize_pipeline", ResizePipelinePayload);
export const MovePipelineOp = op("move_pipeline", MovePipelinePayload);
export const DeletePipelineOp = op("delete_pipeline", DeletePipelinePayload);
export const MoveLabelOp = op("move_label", MoveLabelPayload);
export const MoveStepOp = op("move_step", MoveStepPayload);
export const RenameMapOp = op("rename_map", RenameMapPayload);
export const SetFieldOp = op("set_field", SetFieldPayload);

export const DiffOp = z.discriminatedUnion("op", [
  MoveComponentOp,
  AddComponentOp,
  DeleteComponentOp,
  RenameComponentOp,
  AddEdgeOp,
  DeleteEdgeOp,
  ReverseEdgeOp,
  ChangeComponentTypeOp,
  SetEvolvesToOp,
  SetFlowOp,
  ChangeEdgeTypeOp,
  ResizePipelineOp,
  MovePipelineOp,
  DeletePipelineOp,
  MoveLabelOp,
  MoveStepOp,
  RenameMapOp,
  SetFieldOp,
]);

/** The engine's op type (source of truth, zod-free). */
export type DiffOp = DiffOpType;

// Compile-time guard: every zod-parsed op is a valid engine op.
const _zodMatchesEngine = (x: z.infer<typeof DiffOp>): DiffOpType => x;
void _zodMatchesEngine;
