import { describe, it, expect } from "vitest";
import {
  MoveComponentPayload,
  AddComponentPayload,
  DeleteComponentPayload,
  RenameComponentPayload,
  AddEdgePayload,
  DeleteEdgePayload,
  ChangeComponentTypePayload,
  SetEvolvesToPayload,
  SetFlowPayload,
  ChangeEdgeTypePayload,
  ResizePipelinePayload,
  RenameMapPayload,
  MoveLabelPayload,
  MoveStepPayload,
  DiffOp,
  ComponentDiffOp,
  applyDiffOp,
  applyDiffOps,
  expandDeleteCascade,
  expandChangeTypeCascade,
} from "./diff-ops.js";
import type { WardleyMap } from "./schema.js";

// ── Test helpers ─────────────────────────────────────────────────────

function makeMap(overrides?: Partial<WardleyMap>): WardleyMap {
  return {
    title: "Test Map",
    components: [
      {
        id: "comp-1",
        label: { name: "User" },
        type: "component",
        position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.1 } },
      },
      {
        id: "comp-2",
        label: { name: "Web App" },
        type: "component",
        position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.3 } },
      },
      {
        id: "comp-3",
        label: { name: "Database" },
        type: "component",
        position: { evolution: { scalar: 0.4 }, visibility: { scalar: 0.5 } },
      },
    ],
    relations: [
      { id: "rel-1", source: "comp-1", target: "comp-2", type: "DependsOn" },
      { id: "rel-2", source: "comp-2", target: "comp-3", type: "DependsOn" },
    ],
    ...overrides,
  } as WardleyMap;
}

// ── Zod schema validation tests ──────────────────────────────────────

describe("MoveComponentPayload schema", () => {
  it("accepts valid payload", () => {
    const result = MoveComponentPayload.safeParse({
      id: "comp-1",
      evolution: 0.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects evolution > 1", () => {
    const result = MoveComponentPayload.safeParse({
      id: "comp-1",
      evolution: 1.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects evolution < 0", () => {
    const result = MoveComponentPayload.safeParse({
      id: "comp-1",
      evolution: -0.1,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = MoveComponentPayload.safeParse({
      evolution: 0.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = MoveComponentPayload.safeParse({
      id: "",
      evolution: 0.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });
});

describe("AddComponentPayload schema", () => {
  it("accepts valid payload with defaults", () => {
    const result = AddComponentPayload.safeParse({
      id: "new-comp",
      name: "New Component",
      evolution: 0.5,
      visibility: 0.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("component");
      expect(result.data.nature).toBeUndefined();
    }
  });

  it("accepts explicit type and nature", () => {
    const result = AddComponentPayload.safeParse({
      id: "new-anchor",
      name: "Anchor",
      type: "anchor",
      nature: "activity",
      evolution: 0.9,
      visibility: 0.1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("anchor");
      expect(result.data.nature).toBe("activity");
    }
  });

  it("rejects empty name", () => {
    const result = AddComponentPayload.safeParse({
      id: "x",
      name: "",
      evolution: 0.5,
      visibility: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("DeleteComponentPayload schema", () => {
  it("accepts valid payload", () => {
    const result = DeleteComponentPayload.safeParse({ id: "comp-1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = DeleteComponentPayload.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("RenameComponentPayload schema", () => {
  it("accepts valid payload", () => {
    const result = RenameComponentPayload.safeParse({
      id: "comp-1",
      name: "New Name",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = RenameComponentPayload.safeParse({
      id: "comp-1",
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("AddEdgePayload schema", () => {
  it("accepts valid payload", () => {
    const result = AddEdgePayload.safeParse({
      id: "rel-new",
      source: "comp-1",
      target: "comp-2",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("DependsOn"); // default
    }
  });

  it("accepts explicit type", () => {
    const result = AddEdgePayload.safeParse({
      id: "rel-flow",
      source: "comp-1",
      target: "comp-2",
      type: "Flow",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("Flow");
    }
  });

  it("rejects missing source", () => {
    const result = AddEdgePayload.safeParse({
      id: "rel-x",
      target: "comp-2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing target", () => {
    const result = AddEdgePayload.safeParse({
      id: "rel-x",
      source: "comp-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = AddEdgePayload.safeParse({
      id: "",
      source: "comp-1",
      target: "comp-2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = AddEdgePayload.safeParse({
      id: "rel-x",
      source: "comp-1",
      target: "comp-2",
      type: "InvalidType",
    });
    expect(result.success).toBe(false);
  });
});

describe("DeleteEdgePayload schema", () => {
  it("accepts valid payload", () => {
    const result = DeleteEdgePayload.safeParse({ id: "rel-1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = DeleteEdgePayload.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = DeleteEdgePayload.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });
});

describe("DiffOp discriminated union", () => {
  it("parses move_component", () => {
    const result = DiffOp.safeParse({
      op: "move_component",
      payload: { id: "comp-1", evolution: 0.5, visibility: 0.3 },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.op).toBe("move_component");
  });

  it("parses add_component", () => {
    const result = DiffOp.safeParse({
      op: "add_component",
      payload: { id: "x", name: "X", evolution: 0.5, visibility: 0.5 },
    });
    expect(result.success).toBe(true);
  });

  it("parses delete_component", () => {
    const result = DiffOp.safeParse({
      op: "delete_component",
      payload: { id: "comp-1" },
    });
    expect(result.success).toBe(true);
  });

  it("parses rename_component", () => {
    const result = DiffOp.safeParse({
      op: "rename_component",
      payload: { id: "comp-1", name: "New" },
    });
    expect(result.success).toBe(true);
  });

  it("parses add_edge", () => {
    const result = DiffOp.safeParse({
      op: "add_edge",
      payload: { id: "rel-new", source: "comp-1", target: "comp-2" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.op).toBe("add_edge");
  });

  it("parses delete_edge", () => {
    const result = DiffOp.safeParse({
      op: "delete_edge",
      payload: { id: "rel-1" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.op).toBe("delete_edge");
  });

  it("rejects unknown op type", () => {
    const result = DiffOp.safeParse({
      op: "explode_component",
      payload: { id: "comp-1" },
    });
    expect(result.success).toBe(false);
  });
});

// Backward compat: ComponentDiffOp is an alias for DiffOp
describe("ComponentDiffOp backward compatibility", () => {
  it("parses add_edge via ComponentDiffOp alias", () => {
    const result = ComponentDiffOp.safeParse({
      op: "add_edge",
      payload: { id: "rel-new", source: "comp-1", target: "comp-2" },
    });
    expect(result.success).toBe(true);
  });
});

// ── applyDiffOp tests ────────────────────────────────────────────────

describe("applyDiffOp", () => {
  describe("move_component", () => {
    it("moves a component to new coordinates", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "move_component",
        payload: { id: "comp-1", evolution: 0.9, visibility: 0.2 },
      });
      expect(ok).toBe(true);
      const comp = map.components.find((c) => c.id === "comp-1")!;
      expect(comp.position.evolution.scalar).toBe(0.9);
      expect(comp.position.visibility.scalar).toBe(0.2);
    });

    it("returns false for non-existent component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "move_component",
        payload: { id: "no-such", evolution: 0.5, visibility: 0.5 },
      });
      expect(ok).toBe(false);
    });

    it("does not modify other components", () => {
      const map = makeMap();
      const origComp2 = { ...map.components[1].position.evolution };
      applyDiffOp(map, {
        op: "move_component",
        payload: { id: "comp-1", evolution: 0.1, visibility: 0.1 },
      });
      expect(map.components[1].position.evolution.scalar).toBe(origComp2.scalar);
    });
  });

  describe("add_component", () => {
    it("adds a new component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_component",
        payload: {
          id: "comp-new",
          name: "New Thing",
          type: "component",
            evolution: 0.5,
          visibility: 0.5,
        },
      });
      expect(ok).toBe(true);
      expect(map.components).toHaveLength(4);
      const added = map.components.find((c) => c.id === "comp-new")!;
      expect(added.label.name).toBe("New Thing");
      expect(added.position.evolution.scalar).toBe(0.5);
      expect(added.position.visibility.scalar).toBe(0.5);
      expect(added.type).toBe("component");
      expect(added.nature).toBeUndefined();
    });

    it("rejects duplicate id", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_component",
        payload: {
          id: "comp-1",
          name: "Duplicate",
          type: "component",
            evolution: 0.5,
          visibility: 0.5,
        },
      });
      expect(ok).toBe(false);
      expect(map.components).toHaveLength(3);
    });

    it("adds pipeline type component", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "add_component",
        payload: {
          id: "pipe-1",
          name: "Platform",
          type: "pipeline",
            evolution: 0.5,
          visibility: 0.4,
        },
      });
      const pipe = map.components.find((c) => c.id === "pipe-1")!;
      expect(pipe.type).toBe("pipeline");
    });

    it("adds pipeline with pipelineGeometry", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_component",
        payload: {
          id: "pipe-geo",
          name: "Platform",
          type: "pipeline",
            evolution: 0.5,
          visibility: 0.4,
          pipelineGeometry: {
            evoStart: 0.4,
            evoEnd: 0.6,
            visStart: 0.35,
            visEnd: 0.45,
          },
        },
      });
      expect(ok).toBe(true);
      const pipe = map.components.find((c) => c.id === "pipe-geo")! as any;
      expect(pipe.type).toBe("pipeline");
      expect(pipe.pipelineGeometry).toEqual({
        evoStart: 0.4,
        evoEnd: 0.6,
        visStart: 0.35,
        visEnd: 0.45,
      });
    });

    it("adds pipeline with clamped pipelineGeometry near boundaries", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "add_component",
        payload: {
          id: "pipe-edge",
          name: "Edge Pipeline",
          type: "pipeline",
            evolution: 0.05,
          visibility: 0.02,
          pipelineGeometry: {
            evoStart: 0,
            evoEnd: 0.15,
            visStart: 0,
            visEnd: 0.07,
          },
        },
      });
      const pipe = map.components.find((c) => c.id === "pipe-edge")! as any;
      expect(pipe.pipelineGeometry.evoStart).toBe(0);
      expect(pipe.pipelineGeometry.visStart).toBe(0);
    });

    it("does not add pipelineGeometry for non-pipeline types", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "add_component",
        payload: {
          id: "comp-no-pipe",
          name: "Regular",
          type: "component",
            evolution: 0.5,
          visibility: 0.5,
        },
      });
      const comp = map.components.find((c) => c.id === "comp-no-pipe")! as any;
      expect(comp.pipelineGeometry).toBeUndefined();
    });
  });

  describe("delete_component", () => {
    it("removes a component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "delete_component",
        payload: { id: "comp-3" },
      });
      expect(ok).toBe(true);
      expect(map.components).toHaveLength(2);
      expect(map.components.find((c) => c.id === "comp-3")).toBeUndefined();
    });

    it("cascade-deletes relations referencing deleted component as source", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "delete_component",
        payload: { id: "comp-1" },
      });
      // rel-1 had source=comp-1, should be gone
      expect(map.relations.find((r) => r.id === "rel-1")).toBeUndefined();
      // rel-2 should still exist (comp-2 -> comp-3)
      expect(map.relations.find((r) => r.id === "rel-2")).toBeDefined();
    });

    it("cascade-deletes relations referencing deleted component as target", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "delete_component",
        payload: { id: "comp-3" },
      });
      // rel-2 had target=comp-3, should be gone
      expect(map.relations.find((r) => r.id === "rel-2")).toBeUndefined();
      // rel-1 should still exist (comp-1 -> comp-2)
      expect(map.relations.find((r) => r.id === "rel-1")).toBeDefined();
    });

    it("cascade-deletes multiple relations", () => {
      const map = makeMap();
      // comp-2 is both source (rel-2) and target (rel-1)
      applyDiffOp(map, {
        op: "delete_component",
        payload: { id: "comp-2" },
      });
      expect(map.relations).toHaveLength(0);
    });

    it("returns false for non-existent component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "delete_component",
        payload: { id: "no-such" },
      });
      expect(ok).toBe(false);
      expect(map.components).toHaveLength(3);
    });
  });

  describe("rename_component", () => {
    it("renames a component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "rename_component",
        payload: { id: "comp-1", name: "End User" },
      });
      expect(ok).toBe(true);
      expect(map.components.find((c) => c.id === "comp-1")!.label.name).toBe("End User");
    });

    it("returns false for non-existent component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "rename_component",
        payload: { id: "no-such", name: "X" },
      });
      expect(ok).toBe(false);
    });

    it("does not change other fields", () => {
      const map = makeMap();
      const origPos = { ...map.components[0].position.evolution };
      applyDiffOp(map, {
        op: "rename_component",
        payload: { id: "comp-1", name: "Renamed" },
      });
      expect(map.components[0].position.evolution.scalar).toBe(origPos.scalar);
      expect(map.components[0].type).toBe("component");
    });
  });

  describe("add_edge", () => {
    it("adds a new edge between existing components", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_edge",
        payload: { id: "rel-new", source: "comp-1", target: "comp-3", type: "DependsOn" },
      });
      expect(ok).toBe(true);
      expect(map.relations).toHaveLength(3);
      const added = map.relations.find((r) => r.id === "rel-new")!;
      expect(added.source).toBe("comp-1");
      expect(added.target).toBe("comp-3");
      expect(added.type).toBe("DependsOn");
    });

    it("adds edge with Flow type", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_edge",
        payload: { id: "rel-flow", source: "comp-1", target: "comp-3", type: "Flow" },
      });
      expect(ok).toBe(true);
      const added = map.relations.find((r) => r.id === "rel-flow")!;
      expect(added.type).toBe("Flow");
    });

    it("rejects duplicate edge id", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_edge",
        payload: { id: "rel-1", source: "comp-1", target: "comp-3", type: "DependsOn" },
      });
      expect(ok).toBe(false);
      expect(map.relations).toHaveLength(2);
    });

    it("rejects edge with non-existent source", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_edge",
        payload: { id: "rel-bad", source: "no-such", target: "comp-2", type: "DependsOn" },
      });
      expect(ok).toBe(false);
      expect(map.relations).toHaveLength(2);
    });

    it("rejects edge with non-existent target", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_edge",
        payload: { id: "rel-bad", source: "comp-1", target: "no-such", type: "DependsOn" },
      });
      expect(ok).toBe(false);
      expect(map.relations).toHaveLength(2);
    });

    it("rejects self-link (source === target)", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "add_edge",
        payload: { id: "rel-self", source: "comp-1", target: "comp-1", type: "DependsOn" },
      });
      expect(ok).toBe(false);
      expect(map.relations).toHaveLength(2);
    });

    it("does not modify existing relations", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "add_edge",
        payload: { id: "rel-new", source: "comp-1", target: "comp-3", type: "DependsOn" },
      });
      // Original relations unchanged
      expect(map.relations.find((r) => r.id === "rel-1")!.source).toBe("comp-1");
      expect(map.relations.find((r) => r.id === "rel-2")!.source).toBe("comp-2");
    });
  });

  describe("delete_edge", () => {
    it("removes an existing edge", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "delete_edge",
        payload: { id: "rel-1" },
      });
      expect(ok).toBe(true);
      expect(map.relations).toHaveLength(1);
      expect(map.relations.find((r) => r.id === "rel-1")).toBeUndefined();
    });

    it("returns false for non-existent edge", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "delete_edge",
        payload: { id: "no-such-edge" },
      });
      expect(ok).toBe(false);
      expect(map.relations).toHaveLength(2);
    });

    it("does not affect components", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "delete_edge",
        payload: { id: "rel-1" },
      });
      expect(map.components).toHaveLength(3);
    });

    it("does not affect other relations", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "delete_edge",
        payload: { id: "rel-1" },
      });
      expect(map.relations.find((r) => r.id === "rel-2")).toBeDefined();
    });
  });

  describe("change_component_type", () => {
    it("changes a component's type", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "comp-1", type: "anchor" },
      });
      expect(ok).toBe(true);
      expect(map.components.find((c) => c.id === "comp-1")!.type).toBe("anchor");
    });

    it("returns false for non-existent component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "no-such", type: "anchor" },
      });
      expect(ok).toBe(false);
    });

    it("does not change other fields", () => {
      const map = makeMap();
      const origName = map.components[0].label.name;
      const origEvo = map.components[0].position.evolution.scalar;
      applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "comp-1", type: "market" },
      });
      expect(map.components[0].label.name).toBe(origName);
      expect(map.components[0].position.evolution.scalar).toBe(origEvo);
    });

    it("auto-generates pipelineGeometry when changing to pipeline", () => {
      const map = makeMap();
      const comp = map.components.find((c) => c.id === "comp-1")!;
      const evo = comp.position.evolution.scalar;
      const vis = comp.position.visibility.scalar;

      applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "comp-1", type: "pipeline" },
      });

      expect(comp.type).toBe("pipeline");
      expect(comp.pipelineGeometry).toBeDefined();
      expect(comp.pipelineGeometry!.evoStart).toBeCloseTo(evo - 0.15, 5);
      expect(comp.pipelineGeometry!.evoEnd).toBeCloseTo(evo + 0.15, 5);
      expect(comp.pipelineGeometry!.visStart).toBeCloseTo(vis - 0.05, 5);
      expect(comp.pipelineGeometry!.visEnd).toBeCloseTo(vis + 0.05, 5);
    });

    it("clamps pipelineGeometry to [0,1] for components near edges", () => {
      const map = makeMap();
      // Move component near left edge
      const comp = map.components.find((c) => c.id === "comp-1")!;
      comp.position.evolution.scalar = 0.05;
      comp.position.visibility.scalar = 0.02;

      applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "comp-1", type: "pipeline" },
      });

      expect(comp.pipelineGeometry!.evoStart).toBe(0);
      expect(comp.pipelineGeometry!.evoEnd).toBeCloseTo(0.2, 5);
      expect(comp.pipelineGeometry!.visStart).toBe(0);
      expect(comp.pipelineGeometry!.visEnd).toBeCloseTo(0.07, 5);
    });

    it("does not overwrite existing pipelineGeometry when changing to pipeline", () => {
      const map = makeMap();
      const comp = map.components.find((c) => c.id === "comp-1")!;
      comp.pipelineGeometry = { evoStart: 0.1, evoEnd: 0.9, visStart: 0.2, visEnd: 0.8 };

      applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "comp-1", type: "pipeline" },
      });

      expect(comp.pipelineGeometry!.evoStart).toBe(0.1);
      expect(comp.pipelineGeometry!.evoEnd).toBe(0.9);
    });

    it("removes pipelineGeometry when changing away from pipeline", () => {
      const map = makeMap();
      const comp = map.components.find((c) => c.id === "comp-1")!;
      comp.type = "pipeline";
      comp.pipelineGeometry = { evoStart: 0.1, evoEnd: 0.9, visStart: 0.2, visEnd: 0.8 };

      applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "comp-1", type: "component" },
      });

      expect(comp.type).toBe("component");
      expect(comp.pipelineGeometry).toBeUndefined();
    });

    it("silently ejects contained components when changing pipeline to non-pipeline (positions preserved)", () => {
      const map = makePipelineMap();
      const inside1 = map.components.find((c) => c.id === "inside-1")!;
      const inside2 = map.components.find((c) => c.id === "inside-2")!;
      const origEvo1 = inside1.position.evolution.scalar;
      const origVis1 = inside1.position.visibility.scalar;
      const origEvo2 = inside2.position.evolution.scalar;
      const origVis2 = inside2.position.visibility.scalar;

      applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "pipe-1", type: "component" },
      });

      // Pipeline geometry is removed
      const pipe = map.components.find((c) => c.id === "pipe-1")!;
      expect(pipe.pipelineGeometry).toBeUndefined();

      // Contained components preserve their positions
      expect(inside1.position.evolution.scalar).toBe(origEvo1);
      expect(inside1.position.visibility.scalar).toBe(origVis1);
      expect(inside2.position.evolution.scalar).toBe(origEvo2);
      expect(inside2.position.visibility.scalar).toBe(origVis2);

      // Components still exist on the map
      expect(map.components).toHaveLength(3);
    });

    it("does not affect components outside pipeline bounds when changing type", () => {
      const map = makePipelineMap();
      // Add a component outside the pipeline
      map.components.push({
        id: "outside-1",
        label: { name: "Outside" },
        type: "component",
        position: { evolution: { scalar: 0.95 }, visibility: { scalar: 0.9 } },
      } as any);

      applyDiffOp(map, {
        op: "change_component_type",
        payload: { id: "pipe-1", type: "component" },
      });

      // All components still exist
      expect(map.components).toHaveLength(4);
      const outside = map.components.find((c) => c.id === "outside-1")!;
      expect(outside.position.evolution.scalar).toBe(0.95);
    });
  });

  describe("set_evolves_to", () => {
    it("sets evolvesTo on a component using target's position", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_evolves_to",
        payload: { id: "comp-1", evolvesTo: "comp-2" },
      });
      expect(ok).toBe(true);
      const comp = map.components.find((c) => c.id === "comp-1")!;
      expect(comp.evolvesTo).toHaveLength(1);
      expect(comp.evolvesTo![0].position.evolution.scalar).toBe(0.6);
      expect(comp.evolvesTo![0].position.visibility.scalar).toBe(0.3);
      expect(comp.evolvesTo![0].evolveType).toBe("natural");
    });

    it("clears evolvesTo when null", () => {
      const map = makeMap();
      // First set it
      applyDiffOp(map, {
        op: "set_evolves_to",
        payload: { id: "comp-1", evolvesTo: "comp-2" },
      });
      expect(map.components.find((c) => c.id === "comp-1")!.evolvesTo).toBeDefined();
      // Then clear it
      const ok = applyDiffOp(map, {
        op: "set_evolves_to",
        payload: { id: "comp-1", evolvesTo: null },
      });
      expect(ok).toBe(true);
      expect(map.components.find((c) => c.id === "comp-1")!.evolvesTo).toBeUndefined();
    });

    it("returns false for non-existent source component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_evolves_to",
        payload: { id: "no-such", evolvesTo: "comp-2" },
      });
      expect(ok).toBe(false);
    });

    it("returns false for non-existent target component", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_evolves_to",
        payload: { id: "comp-1", evolvesTo: "no-such" },
      });
      expect(ok).toBe(false);
    });

    it("returns false for self-evolve", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_evolves_to",
        payload: { id: "comp-1", evolvesTo: "comp-1" },
      });
      expect(ok).toBe(false);
    });

    it("clearing evolvesTo on component without it still succeeds", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_evolves_to",
        payload: { id: "comp-1", evolvesTo: null },
      });
      expect(ok).toBe(true);
    });
  });

  describe("set_flow", () => {
    it("sets flow annotation on a relation", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_flow",
        payload: { id: "rel-1", flow: { label: "data", style: "dashed" } },
      });
      expect(ok).toBe(true);
      const rel = map.relations.find((r) => r.id === "rel-1")!;
      expect(rel.flow).toEqual({ label: "data", style: "dashed" });
    });

    it("sets flow with default style", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_flow",
        payload: { id: "rel-1", flow: { label: "money", style: "solid" } },
      });
      expect(ok).toBe(true);
      expect(map.relations.find((r) => r.id === "rel-1")!.flow!.label).toBe("money");
    });

    it("clears flow annotation when null", () => {
      const map = makeMap();
      // Set it first
      applyDiffOp(map, {
        op: "set_flow",
        payload: { id: "rel-1", flow: { label: "data", style: "solid" } },
      });
      // Then clear it
      const ok = applyDiffOp(map, {
        op: "set_flow",
        payload: { id: "rel-1", flow: null },
      });
      expect(ok).toBe(true);
      expect(map.relations.find((r) => r.id === "rel-1")!.flow).toBeUndefined();
    });

    it("returns false for non-existent relation", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "set_flow",
        payload: { id: "no-such", flow: { label: "data", style: "solid" } },
      });
      expect(ok).toBe(false);
    });
  });

  describe("change_edge_type", () => {
    it("changes a relation's type", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "change_edge_type",
        payload: { id: "rel-1", type: "Flow" },
      });
      expect(ok).toBe(true);
      expect(map.relations.find((r) => r.id === "rel-1")!.type).toBe("Flow");
    });

    it("returns false for non-existent relation", () => {
      const map = makeMap();
      const ok = applyDiffOp(map, {
        op: "change_edge_type",
        payload: { id: "no-such", type: "Constraint" },
      });
      expect(ok).toBe(false);
    });

    it("does not affect other relations", () => {
      const map = makeMap();
      applyDiffOp(map, {
        op: "change_edge_type",
        payload: { id: "rel-1", type: "Constraint" },
      });
      expect(map.relations.find((r) => r.id === "rel-2")!.type).toBe("DependsOn");
    });
  });
});

// ── Zod schema validation tests for new payloads ─────────────────────

describe("ChangeComponentTypePayload schema", () => {
  it("accepts valid payload", () => {
    const result = ChangeComponentTypePayload.safeParse({ id: "comp-1", type: "anchor" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = ChangeComponentTypePayload.safeParse({ id: "comp-1", type: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = ChangeComponentTypePayload.safeParse({ type: "anchor" });
    expect(result.success).toBe(false);
  });
});

describe("SetEvolvesToPayload schema", () => {
  it("accepts valid payload with target id", () => {
    const result = SetEvolvesToPayload.safeParse({ id: "comp-1", evolvesTo: "comp-2" });
    expect(result.success).toBe(true);
  });

  it("accepts null evolvesTo (clear)", () => {
    const result = SetEvolvesToPayload.safeParse({ id: "comp-1", evolvesTo: null });
    expect(result.success).toBe(true);
  });

  it("rejects empty string evolvesTo", () => {
    const result = SetEvolvesToPayload.safeParse({ id: "comp-1", evolvesTo: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing evolvesTo", () => {
    const result = SetEvolvesToPayload.safeParse({ id: "comp-1" });
    expect(result.success).toBe(false);
  });
});

describe("SetFlowPayload schema", () => {
  it("accepts valid flow object", () => {
    const result = SetFlowPayload.safeParse({ id: "rel-1", flow: { label: "data" } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flow!.style).toBe("solid"); // default
    }
  });

  it("accepts flow with explicit style", () => {
    const result = SetFlowPayload.safeParse({ id: "rel-1", flow: { label: "risk", style: "bold" } });
    expect(result.success).toBe(true);
  });

  it("accepts null flow (clear)", () => {
    const result = SetFlowPayload.safeParse({ id: "rel-1", flow: null });
    expect(result.success).toBe(true);
  });

  it("rejects empty label", () => {
    const result = SetFlowPayload.safeParse({ id: "rel-1", flow: { label: "" } });
    expect(result.success).toBe(false);
  });

  it("rejects invalid style", () => {
    const result = SetFlowPayload.safeParse({ id: "rel-1", flow: { label: "x", style: "dotted" } });
    expect(result.success).toBe(false);
  });
});

describe("ChangeEdgeTypePayload schema", () => {
  it("accepts valid payload", () => {
    const result = ChangeEdgeTypePayload.safeParse({ id: "rel-1", type: "Flow" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = ChangeEdgeTypePayload.safeParse({ id: "rel-1", type: "invalid" });
    expect(result.success).toBe(false);
  });
});

describe("DiffOp discriminated union (new ops)", () => {
  it("parses change_component_type", () => {
    const result = DiffOp.safeParse({
      op: "change_component_type",
      payload: { id: "comp-1", type: "pipeline" },
    });
    expect(result.success).toBe(true);
  });

  it("parses set_evolves_to", () => {
    const result = DiffOp.safeParse({
      op: "set_evolves_to",
      payload: { id: "comp-1", evolvesTo: "comp-2" },
    });
    expect(result.success).toBe(true);
  });

  it("parses set_flow", () => {
    const result = DiffOp.safeParse({
      op: "set_flow",
      payload: { id: "rel-1", flow: { label: "data" } },
    });
    expect(result.success).toBe(true);
  });

  it("parses change_edge_type", () => {
    const result = DiffOp.safeParse({
      op: "change_edge_type",
      payload: { id: "rel-1", type: "Constraint" },
    });
    expect(result.success).toBe(true);
  });
});

// ── applyDiffOps batch tests ─────────────────────────────────────────

describe("applyDiffOps", () => {
  it("applies multiple operations sequentially", () => {
    const map = makeMap();
    const results = applyDiffOps(map, [
      { op: "rename_component", payload: { id: "comp-1", name: "Admin" } },
      { op: "move_component", payload: { id: "comp-2", evolution: 0.9, visibility: 0.1 } },
      { op: "add_component", payload: { id: "comp-4", name: "Cache", type: "component", evolution: 0.7, visibility: 0.6 } },
    ]);
    expect(results).toEqual([true, true, true]);
    expect(map.components).toHaveLength(4);
    expect(map.components.find((c) => c.id === "comp-1")!.label.name).toBe("Admin");
    expect(map.components.find((c) => c.id === "comp-2")!.position.evolution.scalar).toBe(0.9);
  });

  it("continues past failures by default", () => {
    const map = makeMap();
    const results = applyDiffOps(map, [
      { op: "move_component", payload: { id: "no-such", evolution: 0.5, visibility: 0.5 } },
      { op: "rename_component", payload: { id: "comp-1", name: "OK" } },
    ]);
    expect(results).toEqual([false, true]);
    expect(map.components.find((c) => c.id === "comp-1")!.label.name).toBe("OK");
  });

  it("stops on first failure when stopOnError=true", () => {
    const map = makeMap();
    const results = applyDiffOps(
      map,
      [
        { op: "move_component", payload: { id: "no-such", evolution: 0.5, visibility: 0.5 } },
        { op: "rename_component", payload: { id: "comp-1", name: "Should Not Run" } },
      ],
      true,
    );
    expect(results).toEqual([false]);
    expect(map.components.find((c) => c.id === "comp-1")!.label.name).toBe("User");
  });

  it("handles add then delete in sequence", () => {
    const map = makeMap();
    const results = applyDiffOps(map, [
      { op: "add_component", payload: { id: "tmp", name: "Temp", type: "component", evolution: 0.5, visibility: 0.5 } },
      { op: "delete_component", payload: { id: "tmp" } },
    ]);
    expect(results).toEqual([true, true]);
    expect(map.components).toHaveLength(3); // back to original count
  });

  it("applies edge operations in batch", () => {
    const map = makeMap();
    const results = applyDiffOps(map, [
      { op: "add_edge", payload: { id: "rel-new", source: "comp-1", target: "comp-3", type: "DependsOn" } },
      { op: "delete_edge", payload: { id: "rel-1" } },
    ]);
    expect(results).toEqual([true, true]);
    expect(map.relations).toHaveLength(2); // +1 added, -1 deleted
    expect(map.relations.find((r) => r.id === "rel-new")).toBeDefined();
    expect(map.relations.find((r) => r.id === "rel-1")).toBeUndefined();
  });

  it("add_edge fails in batch when source missing (added component later)", () => {
    const map = makeMap();
    // Try to add edge to a component that doesn't exist yet, then add it
    const results = applyDiffOps(map, [
      { op: "add_edge", payload: { id: "rel-bad", source: "comp-new", target: "comp-1", type: "DependsOn" } },
      { op: "add_component", payload: { id: "comp-new", name: "New", type: "component", evolution: 0.5, visibility: 0.5 } },
    ]);
    expect(results).toEqual([false, true]); // edge fails, component succeeds
    expect(map.relations).toHaveLength(2); // unchanged
    expect(map.components).toHaveLength(4); // new component added
  });

  it("add component then add edge in correct order", () => {
    const map = makeMap();
    const results = applyDiffOps(map, [
      { op: "add_component", payload: { id: "comp-new", name: "New", type: "component", evolution: 0.5, visibility: 0.5 } },
      { op: "add_edge", payload: { id: "rel-new", source: "comp-1", target: "comp-new", type: "DependsOn" } },
    ]);
    expect(results).toEqual([true, true]);
    expect(map.relations).toHaveLength(3);
    expect(map.relations.find((r) => r.id === "rel-new")!.target).toBe("comp-new");
  });
});

// ── ResizePipelinePayload schema ──────────────────────────────────────

describe("ResizePipelinePayload schema", () => {
  it("accepts valid payload", () => {
    const result = ResizePipelinePayload.safeParse({
      id: "pipe-1",
      evoStart: 0.2,
      evoEnd: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects evoStart > 1", () => {
    const result = ResizePipelinePayload.safeParse({
      id: "pipe-1",
      evoStart: 1.5,
      evoEnd: 0.8,
    });
    expect(result.success).toBe(false);
  });

  it("rejects evoEnd < 0", () => {
    const result = ResizePipelinePayload.safeParse({
      id: "pipe-1",
      evoStart: 0.2,
      evoEnd: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = ResizePipelinePayload.safeParse({
      evoStart: 0.2,
      evoEnd: 0.8,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = ResizePipelinePayload.safeParse({
      id: "",
      evoStart: 0.2,
      evoEnd: 0.8,
    });
    expect(result.success).toBe(false);
  });
});

// ── RenameMapPayload schema ───────────────────────────────────────────

describe("RenameMapPayload schema", () => {
  it("accepts valid payload", () => {
    const result = RenameMapPayload.safeParse({ title: "New Title" });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = RenameMapPayload.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = RenameMapPayload.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── resize_pipeline apply tests ───────────────────────────────────────

function makePipelineMap(): WardleyMap {
  return {
    title: "Pipeline Test Map",
    components: [
      {
        id: "pipe-1",
        label: { name: "Platform" },
        type: "pipeline",
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.4 } },
        pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.35, visEnd: 0.45 },
      },
      {
        id: "inside-1",
        label: { name: "Inside Component" },
        type: "component",
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.4 } },
      },
      {
        id: "inside-2",
        label: { name: "Inside Component 2" },
        type: "component",
        position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.4 } },
      },
    ],
    relations: [
      { id: "rel-1", source: "inside-1", target: "inside-2", type: "DependsOn" },
    ],
  } as WardleyMap;
}

describe("resize_pipeline apply", () => {
  it("resizes pipeline evoStart and evoEnd", () => {
    const map = makePipelineMap();
    const ok = applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.1, evoEnd: 0.9 },
    });
    expect(ok).toBe(true);
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    expect(pipe.pipelineGeometry!.evoStart).toBe(0.1);
    expect(pipe.pipelineGeometry!.evoEnd).toBe(0.9);
  });

  it("recalculates pipeline center position", () => {
    const map = makePipelineMap();
    applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.1, evoEnd: 0.9 },
    });
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    expect(pipe.position.evolution.scalar).toBe(0.5); // (0.1 + 0.9) / 2
  });

  it("swaps inverted evoStart/evoEnd", () => {
    const map = makePipelineMap();
    applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.9, evoEnd: 0.1 },
    });
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    expect(pipe.pipelineGeometry!.evoStart).toBe(0.1);
    expect(pipe.pipelineGeometry!.evoEnd).toBe(0.9);
  });

  it("returns false for non-existent component", () => {
    const map = makePipelineMap();
    const ok = applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "nonexistent", evoStart: 0.1, evoEnd: 0.9 },
    });
    expect(ok).toBe(false);
  });

  it("returns false for non-pipeline component", () => {
    const map = makePipelineMap();
    const ok = applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "inside-1", evoStart: 0.1, evoEnd: 0.9 },
    });
    expect(ok).toBe(false);
  });

  it("returns false for pipeline without pipelineGeometry", () => {
    const map = makePipelineMap();
    // Remove pipelineGeometry to simulate edge case
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    delete pipe.pipelineGeometry;
    const ok = applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.1, evoEnd: 0.9 },
    });
    expect(ok).toBe(false);
  });

  it("does not modify other components", () => {
    const map = makePipelineMap();
    const origPos = map.components.find((c) => c.id === "inside-1")!.position.evolution.scalar;
    applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.6, evoEnd: 0.9 },
    });
    expect(map.components.find((c) => c.id === "inside-1")!.position.evolution.scalar).toBe(origPos);
  });

  it("preserves visStart and visEnd", () => {
    const map = makePipelineMap();
    applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.3, evoEnd: 0.7 },
    });
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    expect(pipe.pipelineGeometry!.visStart).toBe(0.35);
    expect(pipe.pipelineGeometry!.visEnd).toBe(0.45);
  });
});

// ── rename_map apply tests ────────────────────────────────────────────

describe("rename_map apply", () => {
  it("renames the map", () => {
    const map = makeMap();
    const ok = applyDiffOp(map, {
      op: "rename_map",
      payload: { title: "New Title" },
    });
    expect(ok).toBe(true);
    expect(map.title).toBe("New Title");
  });

  it("renames to any non-empty string", () => {
    const map = makeMap();
    applyDiffOp(map, {
      op: "rename_map",
      payload: { title: "A" },
    });
    expect(map.title).toBe("A");
  });

  it("does not modify components", () => {
    const map = makeMap();
    const compCount = map.components.length;
    applyDiffOp(map, {
      op: "rename_map",
      payload: { title: "Renamed" },
    });
    expect(map.components).toHaveLength(compCount);
  });
});

// ── DiffOp discriminated union with new ops ──────────────────────────

describe("DiffOp union includes new ops", () => {
  it("parses resize_pipeline op", () => {
    const result = DiffOp.safeParse({
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.2, evoEnd: 0.8 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.op).toBe("resize_pipeline");
    }
  });

  it("parses rename_map op", () => {
    const result = DiffOp.safeParse({
      op: "rename_map",
      payload: { title: "Hello" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.op).toBe("rename_map");
    }
  });
});

// ── Batch with new ops ───────────────────────────────────────────────

describe("applyDiffOps with container/map-level ops", () => {
  it("resize_pipeline then rename_map in batch", () => {
    const map = makePipelineMap();
    const results = applyDiffOps(map, [
      { op: "resize_pipeline", payload: { id: "pipe-1", evoStart: 0.3, evoEnd: 0.7 } },
      { op: "rename_map", payload: { title: "Renamed Map" } },
    ]);
    expect(results).toEqual([true, true]);
    expect(map.components.find((c) => c.id === "pipe-1")!.pipelineGeometry!.evoStart).toBe(0.3);
    expect(map.title).toBe("Renamed Map");
  });

  it("resize_pipeline fails for non-pipeline, rename_map succeeds", () => {
    const map = makePipelineMap();
    const results = applyDiffOps(map, [
      { op: "resize_pipeline", payload: { id: "inside-1", evoStart: 0.1, evoEnd: 0.9 } },
      { op: "rename_map", payload: { title: "Still Works" } },
    ]);
    expect(results).toEqual([false, true]);
    expect(map.title).toBe("Still Works");
  });
});

// ── Integration: all 12 op types in a single workflow ─────────────────

describe("integration: full workflow with all op types", () => {
  it("applies every op type sequentially and produces consistent model", () => {
    const map = makePipelineMap();

    // 1. rename_map
    expect(applyDiffOp(map, { op: "rename_map", payload: { title: "Integration Map" } })).toBe(true);
    expect(map.title).toBe("Integration Map");

    // 2. add_component
    expect(applyDiffOp(map, {
      op: "add_component",
      payload: { id: "comp-new", name: "Cache", type: "component", evolution: 0.7, visibility: 0.6 },
    })).toBe(true);
    expect(map.components.find((c) => c.id === "comp-new")).toBeDefined();

    // 3. rename_component
    expect(applyDiffOp(map, { op: "rename_component", payload: { id: "comp-new", name: "Redis Cache" } })).toBe(true);
    expect(map.components.find((c) => c.id === "comp-new")!.label.name).toBe("Redis Cache");

    // 4. move_component
    expect(applyDiffOp(map, { op: "move_component", payload: { id: "comp-new", evolution: 0.8, visibility: 0.5 } })).toBe(true);
    expect(map.components.find((c) => c.id === "comp-new")!.position.evolution.scalar).toBe(0.8);
    expect(map.components.find((c) => c.id === "comp-new")!.position.visibility.scalar).toBe(0.5);

    // 5. change_component_type
    expect(applyDiffOp(map, { op: "change_component_type", payload: { id: "comp-new", type: "market" } })).toBe(true);
    expect(map.components.find((c) => c.id === "comp-new")!.type).toBe("market");

    // 6. add_edge
    expect(applyDiffOp(map, {
      op: "add_edge",
      payload: { id: "rel-new", source: "inside-1", target: "comp-new", type: "DependsOn" },
    })).toBe(true);
    expect(map.relations).toHaveLength(2);

    // 7. change_edge_type
    expect(applyDiffOp(map, { op: "change_edge_type", payload: { id: "rel-new", type: "Flow" } })).toBe(true);
    expect(map.relations.find((r) => r.id === "rel-new")!.type).toBe("Flow");

    // 8. set_flow
    expect(applyDiffOp(map, {
      op: "set_flow",
      payload: { id: "rel-new", flow: { label: "data", style: "dashed" } },
    })).toBe(true);
    expect(map.relations.find((r) => r.id === "rel-new")!.flow).toEqual({ label: "data", style: "dashed" });

    // 9. set_evolves_to
    expect(applyDiffOp(map, { op: "set_evolves_to", payload: { id: "inside-1", evolvesTo: "comp-new" } })).toBe(true);
    expect(map.components.find((c) => c.id === "inside-1")!.evolvesTo).toBeDefined();

    // 10. resize_pipeline
    expect(applyDiffOp(map, { op: "resize_pipeline", payload: { id: "pipe-1", evoStart: 0.1, evoEnd: 0.6 } })).toBe(true);
    expect(map.components.find((c) => c.id === "pipe-1")!.pipelineGeometry!.evoStart).toBe(0.1);
    expect(map.components.find((c) => c.id === "pipe-1")!.pipelineGeometry!.evoEnd).toBe(0.6);
    expect(map.components.find((c) => c.id === "pipe-1")!.position.evolution.scalar).toBe(0.35); // center

    // 11. delete_edge
    expect(applyDiffOp(map, { op: "delete_edge", payload: { id: "rel-new" } })).toBe(true);
    expect(map.relations).toHaveLength(1);

    // 12. delete_component
    expect(applyDiffOp(map, { op: "delete_component", payload: { id: "comp-new" } })).toBe(true);
    expect(map.components.find((c) => c.id === "comp-new")).toBeUndefined();

    // Final model state check: title, 3 original pipeline components, 1 relation
    expect(map.title).toBe("Integration Map");
    expect(map.components).toHaveLength(3);
    expect(map.relations).toHaveLength(1);
    // evolvesTo on inside-1 should still be set (target was comp-new which is gone,
    // but delete_component only cascades relations, not evolvesTo positions)
  });

  it("applies all ops via batch applyDiffOps", () => {
    const map = makeMap();
    const ops: DiffOp[] = [
      { op: "rename_map", payload: { title: "Batch Test" } },
      { op: "add_component", payload: { id: "c4", name: "API", type: "component", evolution: 0.5, visibility: 0.5 } },
      { op: "move_component", payload: { id: "c4", evolution: 0.6, visibility: 0.4 } },
      { op: "rename_component", payload: { id: "c4", name: "REST API" } },
      { op: "change_component_type", payload: { id: "c4", type: "anchor" } },
      { op: "add_edge", payload: { id: "r3", source: "comp-1", target: "c4", type: "DependsOn" } },
      { op: "change_edge_type", payload: { id: "r3", type: "Constraint" } },
      { op: "set_flow", payload: { id: "r3", flow: { label: "auth", style: "bold" } } },
      { op: "set_evolves_to", payload: { id: "comp-2", evolvesTo: "c4" } },
      { op: "delete_edge", payload: { id: "rel-1" } },
      { op: "delete_component", payload: { id: "comp-3" } },
    ];
    const results = applyDiffOps(map, ops);
    expect(results).toEqual(Array(11).fill(true));

    // Verify final state
    expect(map.title).toBe("Batch Test");
    expect(map.components).toHaveLength(3); // 3 original - 1 deleted + 1 added
    expect(map.components.find((c) => c.id === "c4")!.label.name).toBe("REST API");
    expect(map.components.find((c) => c.id === "c4")!.type).toBe("anchor");
    expect(map.components.find((c) => c.id === "c4")!.position.evolution.scalar).toBe(0.6);
    expect(map.relations).toHaveLength(1); // 2 original - 1 deleted(rel-1) - 1 cascade(rel-2, comp-3 deleted) + 1 added(r3)
    expect(map.relations.find((r) => r.id === "r3")!.type).toBe("Constraint");
    expect(map.relations.find((r) => r.id === "r3")!.flow).toEqual({ label: "auth", style: "bold" });
    expect(map.components.find((c) => c.id === "comp-2")!.evolvesTo).toBeDefined();
  });
});

// ── Round-trip consistency (serialize → deserialize → verify) ─────────

describe("round-trip consistency", () => {
  it("model survives JSON round-trip after all mutations", () => {
    const map = makeMap();
    applyDiffOps(map, [
      { op: "rename_map", payload: { title: "Round Trip" } },
      { op: "add_component", payload: { id: "rt-1", name: "Service", type: "component", evolution: 0.333, visibility: 0.667 } },
      { op: "add_edge", payload: { id: "rt-rel", source: "comp-1", target: "rt-1", type: "Flow" } },
      { op: "set_flow", payload: { id: "rt-rel", flow: { label: "events", style: "dashed" } } },
      { op: "move_component", payload: { id: "comp-2", evolution: 0.999, visibility: 0.001 } },
    ]);

    // Serialize and deserialize
    const json = JSON.stringify(map);
    const restored = JSON.parse(json) as WardleyMap;

    // Deep equality
    expect(restored.title).toBe("Round Trip");
    expect(restored.components).toHaveLength(4);
    expect(restored.relations).toHaveLength(3);

    // Specific fields survive round-trip
    const service = restored.components.find((c) => c.id === "rt-1")!;
    expect(service.label.name).toBe("Service");
    expect(service.position.evolution.scalar).toBe(0.333);
    expect(service.position.visibility.scalar).toBe(0.667);

    const movedComp = restored.components.find((c) => c.id === "comp-2")!;
    expect(movedComp.position.evolution.scalar).toBe(0.999);
    expect(movedComp.position.visibility.scalar).toBe(0.001);

    const flowRel = restored.relations.find((r) => r.id === "rt-rel")!;
    expect(flowRel.type).toBe("Flow");
    expect(flowRel.flow).toEqual({ label: "events", style: "dashed" });
  });

  it("ops applied to original and to clone produce identical results", () => {
    const map1 = makeMap();
    const map2 = JSON.parse(JSON.stringify(makeMap())) as WardleyMap;

    const ops: DiffOp[] = [
      { op: "rename_component", payload: { id: "comp-1", name: "Admin" } },
      { op: "move_component", payload: { id: "comp-2", evolution: 0.9, visibility: 0.2 } },
      { op: "add_component", payload: { id: "x", name: "X", type: "component", evolution: 0.5, visibility: 0.5 } },
      { op: "add_edge", payload: { id: "rx", source: "comp-1", target: "x", type: "DependsOn" } },
      { op: "delete_edge", payload: { id: "rel-2" } },
    ];

    applyDiffOps(map1, ops);
    applyDiffOps(map2, ops);

    expect(JSON.stringify(map1)).toBe(JSON.stringify(map2));
  });
});

// ── Cascade integrity ────────────────────────────────────────────────

describe("cascade integrity", () => {
  it("delete_component removes all edges where component is source OR target", () => {
    const map = makeMap();
    // Add extra edges involving comp-2
    applyDiffOps(map, [
      { op: "add_edge", payload: { id: "r3", source: "comp-3", target: "comp-2", type: "DependsOn" } },
      { op: "add_edge", payload: { id: "r4", source: "comp-2", target: "comp-1", type: "Flow" } },
    ]);
    expect(map.relations).toHaveLength(4);

    // Delete comp-2 (source of rel-2, r4; target of rel-1, r3)
    applyDiffOp(map, { op: "delete_component", payload: { id: "comp-2" } });
    expect(map.relations).toHaveLength(0); // all 4 edges reference comp-2
    expect(map.components).toHaveLength(2);
  });

  it("delete_component does not affect unrelated edges", () => {
    const map = makeMap();
    // Add edge between comp-1 and comp-3 (doesn't involve comp-2)
    applyDiffOp(map, {
      op: "add_edge",
      payload: { id: "r-direct", source: "comp-1", target: "comp-3", type: "DependsOn" },
    });
    expect(map.relations).toHaveLength(3);

    // Delete comp-2 — rel-1 (comp-1→comp-2) and rel-2 (comp-2→comp-3) should go
    applyDiffOp(map, { op: "delete_component", payload: { id: "comp-2" } });
    expect(map.relations).toHaveLength(1);
    expect(map.relations[0].id).toBe("r-direct");
  });

  it("set_evolves_to then delete target: evolvesTo array remains (position-based)", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2" } });
    const evolvesBefore = map.components.find((c) => c.id === "comp-1")!.evolvesTo;
    expect(evolvesBefore).toHaveLength(1);

    // Delete comp-2 — evolvesTo is position-based, so it stays
    applyDiffOp(map, { op: "delete_component", payload: { id: "comp-2" } });
    const evolvesAfter = map.components.find((c) => c.id === "comp-1")!.evolvesTo;
    // Position-based evolvesTo array persists (no component reference to cascade)
    expect(evolvesAfter).toHaveLength(1);
  });

  it("set_flow then delete_edge: flow annotation is gone with the edge", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_flow", payload: { id: "rel-1", flow: { label: "data", style: "solid" } } });
    expect(map.relations.find((r) => r.id === "rel-1")!.flow).toBeDefined();

    applyDiffOp(map, { op: "delete_edge", payload: { id: "rel-1" } });
    expect(map.relations.find((r) => r.id === "rel-1")).toBeUndefined();
  });
});

// ── Dispatcher exhaustiveness ────────────────────────────────────────

describe("dispatcher exhaustiveness", () => {
  it("dispatches all 12 op types without throwing", () => {
    const pipeMap = makePipelineMap();
    const allOps: DiffOp[] = [
      { op: "rename_map", payload: { title: "Exhaustive" } },
      { op: "add_component", payload: { id: "ex-1", name: "Ex", type: "component", evolution: 0.5, visibility: 0.5 } },
      { op: "move_component", payload: { id: "ex-1", evolution: 0.6, visibility: 0.4 } },
      { op: "rename_component", payload: { id: "ex-1", name: "Exhaustive Component" } },
      { op: "change_component_type", payload: { id: "ex-1", type: "anchor" } },
      { op: "set_evolves_to", payload: { id: "inside-1", evolvesTo: "ex-1" } },
      { op: "add_edge", payload: { id: "ex-rel", source: "inside-1", target: "ex-1", type: "DependsOn" } },
      { op: "change_edge_type", payload: { id: "ex-rel", type: "Flow" } },
      { op: "set_flow", payload: { id: "ex-rel", flow: { label: "signal", style: "bold" } } },
      { op: "resize_pipeline", payload: { id: "pipe-1", evoStart: 0.15, evoEnd: 0.85 } },
      { op: "delete_edge", payload: { id: "ex-rel" } },
      { op: "delete_component", payload: { id: "ex-1" } },
    ];

    const results = applyDiffOps(pipeMap, allOps);
    expect(results).toEqual(Array(12).fill(true));
  });

  it("unknown op type fails Zod parse (never reaches dispatcher)", () => {
    const result = DiffOp.safeParse({ op: "unknown_op", payload: {} });
    expect(result.success).toBe(false);
  });

  it("each of the 12 op types is accepted by DiffOp discriminated union", () => {
    const opSamples: Array<{ op: string; payload: Record<string, unknown> }> = [
      { op: "move_component", payload: { id: "a", evolution: 0.5, visibility: 0.5 } },
      { op: "add_component", payload: { id: "a", name: "A", evolution: 0.5, visibility: 0.5 } },
      { op: "delete_component", payload: { id: "a" } },
      { op: "rename_component", payload: { id: "a", name: "B" } },
      { op: "add_edge", payload: { id: "e", source: "a", target: "b" } },
      { op: "delete_edge", payload: { id: "e" } },
      { op: "change_component_type", payload: { id: "a", type: "anchor" } },
      { op: "set_evolves_to", payload: { id: "a", evolvesTo: "b" } },
      { op: "set_flow", payload: { id: "e", flow: { label: "x" } } },
      { op: "change_edge_type", payload: { id: "e", type: "Flow" } },
      { op: "resize_pipeline", payload: { id: "p", evoStart: 0.2, evoEnd: 0.8 } },
      { op: "rename_map", payload: { title: "T" } },
    ];
    for (const sample of opSamples) {
      const result = DiffOp.safeParse(sample);
      expect(result.success).toBe(true);
    }
    expect(opSamples).toHaveLength(12);
  });
});

// ── Idempotency and edge cases ───────────────────────────────────────

describe("idempotency and edge cases", () => {
  it("move_component to same position is idempotent", () => {
    const map = makeMap();
    const comp = map.components.find((c) => c.id === "comp-1")!;
    const origEvo = comp.position.evolution.scalar;
    const origVis = comp.position.visibility.scalar;
    const ok = applyDiffOp(map, {
      op: "move_component",
      payload: { id: "comp-1", evolution: origEvo, visibility: origVis },
    });
    expect(ok).toBe(true);
    expect(comp.position.evolution.scalar).toBe(origEvo);
    expect(comp.position.visibility.scalar).toBe(origVis);
  });

  it("rename_component to same name is idempotent", () => {
    const map = makeMap();
    const ok = applyDiffOp(map, {
      op: "rename_component",
      payload: { id: "comp-1", name: "User" },
    });
    expect(ok).toBe(true);
    expect(map.components.find((c) => c.id === "comp-1")!.label.name).toBe("User");
  });

  it("double delete_component returns false on second call", () => {
    const map = makeMap();
    expect(applyDiffOp(map, { op: "delete_component", payload: { id: "comp-3" } })).toBe(true);
    expect(applyDiffOp(map, { op: "delete_component", payload: { id: "comp-3" } })).toBe(false);
  });

  it("double delete_edge returns false on second call", () => {
    const map = makeMap();
    expect(applyDiffOp(map, { op: "delete_edge", payload: { id: "rel-1" } })).toBe(true);
    expect(applyDiffOp(map, { op: "delete_edge", payload: { id: "rel-1" } })).toBe(false);
  });

  it("add_component then add_component with same id fails", () => {
    const map = makeMap();
    expect(applyDiffOp(map, {
      op: "add_component",
      payload: { id: "dup", name: "First", type: "component", evolution: 0.5, visibility: 0.5 },
    })).toBe(true);
    expect(applyDiffOp(map, {
      op: "add_component",
      payload: { id: "dup", name: "Second", type: "component", evolution: 0.6, visibility: 0.6 },
    })).toBe(false);
    expect(map.components.filter((c) => c.id === "dup")).toHaveLength(1);
    expect(map.components.find((c) => c.id === "dup")!.label.name).toBe("First");
  });

  it("set_evolves_to overwrite replaces previous value", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2" } });
    const firstTarget = map.components.find((c) => c.id === "comp-1")!.evolvesTo![0];
    expect(firstTarget.position.evolution.scalar).toBe(0.6); // comp-2's evolution

    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-3" } });
    const secondTarget = map.components.find((c) => c.id === "comp-1")!.evolvesTo![0];
    expect(secondTarget.position.evolution.scalar).toBe(0.4); // comp-3's evolution
    expect(map.components.find((c) => c.id === "comp-1")!.evolvesTo).toHaveLength(1);
  });

  it("resize_pipeline with equal evoStart and evoEnd produces zero-width pipeline", () => {
    const map = makePipelineMap();
    const ok = applyDiffOp(map, {
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.5, evoEnd: 0.5 },
    });
    expect(ok).toBe(true);
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    expect(pipe.pipelineGeometry!.evoStart).toBe(0.5);
    expect(pipe.pipelineGeometry!.evoEnd).toBe(0.5);
    expect(pipe.position.evolution.scalar).toBe(0.5); // center
  });
});

// ── expandDeleteCascade ──────────────────────────────────────────────

describe("expandDeleteCascade", () => {
  it("returns explicit delete_edge ops for edges where component is source", () => {
    const map = makeMap();
    const ops = expandDeleteCascade(map, "comp-1");
    const edgeOps = ops.filter((o) => o.op === "delete_edge");
    // comp-1 is source of rel-1
    expect(edgeOps).toHaveLength(1);
    expect(edgeOps[0].payload).toEqual({ id: "rel-1" });
  });

  it("returns explicit delete_edge ops for edges where component is target", () => {
    const map = makeMap();
    const ops = expandDeleteCascade(map, "comp-3");
    const edgeOps = ops.filter((o) => o.op === "delete_edge");
    // comp-3 is target of rel-2
    expect(edgeOps).toHaveLength(1);
    expect(edgeOps[0].payload).toEqual({ id: "rel-2" });
  });

  it("returns delete_edge ops for both source and target edges", () => {
    const map = makeMap();
    const ops = expandDeleteCascade(map, "comp-2");
    const edgeOps = ops.filter((o) => o.op === "delete_edge");
    // comp-2 is target of rel-1 and source of rel-2
    expect(edgeOps).toHaveLength(2);
    const edgeIds = edgeOps.map((o) => o.payload.id);
    expect(edgeIds).toContain("rel-1");
    expect(edgeIds).toContain("rel-2");
  });

  it("returns empty array when component has no edges and no evolvesTo refs", () => {
    const map = makeMap();
    map.components.push({
      id: "isolated",
      label: { name: "Isolated" },
      type: "component",
      position: { evolution: { scalar: 0.1 }, visibility: { scalar: 0.9 } },
    } as any);
    const ops = expandDeleteCascade(map, "isolated");
    expect(ops).toHaveLength(0);
  });

  it("returns set_evolves_to null for position-based evolvesTo matching deleted component", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2" } });
    expect(map.components.find((c) => c.id === "comp-1")!.evolvesTo).toHaveLength(1);

    const ops = expandDeleteCascade(map, "comp-2");
    const evolvesOps = ops.filter((o) => o.op === "set_evolves_to");
    expect(evolvesOps).toHaveLength(1);
    expect(evolvesOps[0].payload).toEqual({ id: "comp-1", evolvesTo: null });
  });

  it("returns both delete_edge and set_evolves_to ops together", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2" } });

    const ops = expandDeleteCascade(map, "comp-2");
    const edgeOps = ops.filter((o) => o.op === "delete_edge");
    const evolvesOps = ops.filter((o) => o.op === "set_evolves_to");
    expect(edgeOps).toHaveLength(2);
    expect(evolvesOps).toHaveLength(1);
    // delete_edge ops come before set_evolves_to ops
    const firstEvolvesIdx = ops.findIndex((o) => o.op === "set_evolves_to");
    const lastEdgeIdx = ops.length - 1 - [...ops].reverse().findIndex((o) => o.op === "delete_edge");
    expect(lastEdgeIdx).toBeLessThan(firstEvolvesIdx);
  });

  it("does not return set_evolves_to for the deleted component itself", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-2", evolvesTo: "comp-3" } });
    const ops = expandDeleteCascade(map, "comp-2");
    const evolvesOps = ops.filter((o) => o.op === "set_evolves_to");
    expect(evolvesOps).toHaveLength(0);
  });

  it("returns empty cascade for non-existent component", () => {
    const map = makeMap();
    const ops = expandDeleteCascade(map, "non-existent");
    expect(ops.filter((o) => o.op === "set_evolves_to")).toHaveLength(0);
  });

  it("handles multiple components evolving to the same target", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-3" } });
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-2", evolvesTo: "comp-3" } });

    const ops = expandDeleteCascade(map, "comp-3");
    const evolvesOps = ops.filter((o) => o.op === "set_evolves_to");
    expect(evolvesOps).toHaveLength(2);
    const srcIds = evolvesOps.map((o) => (o.payload as any).id);
    expect(srcIds).toContain("comp-1");
    expect(srcIds).toContain("comp-2");
  });

  it("is a pure read — does not mutate the map", () => {
    const map = makeMap();
    applyDiffOp(map, { op: "set_evolves_to", payload: { id: "comp-1", evolvesTo: "comp-2" } });
    const before = JSON.stringify(map);
    expandDeleteCascade(map, "comp-2");
    expect(JSON.stringify(map)).toBe(before);
  });
});

// ── expandChangeTypeCascade ──────────────────────────────────────────

describe("expandChangeTypeCascade", () => {
  it("returns move_component ops for contained components when pipeline changes type", () => {
    const map = makePipelineMap();
    const ops = expandChangeTypeCascade(map, "pipe-1");
    // inside-1 (evo=0.5, vis=0.4) and inside-2 (evo=0.3, vis=0.4) are inside pipeline
    expect(ops).toHaveLength(2);
    expect(ops.every((op) => op.op === "move_component")).toBe(true);
    const ids = ops.map((op) => (op as any).payload.id);
    expect(ids).toContain("inside-1");
    expect(ids).toContain("inside-2");
  });

  it("preserves original positions in the emitted move_component ops", () => {
    const map = makePipelineMap();
    const ops = expandChangeTypeCascade(map, "pipe-1");
    const inside1Op = ops.find((op) => (op as any).payload.id === "inside-1")!;
    expect((inside1Op as any).payload.evolution).toBe(0.5);
    expect((inside1Op as any).payload.visibility).toBe(0.4);
  });

  it("returns empty array for non-pipeline component", () => {
    const map = makePipelineMap();
    const ops = expandChangeTypeCascade(map, "inside-1");
    expect(ops).toHaveLength(0);
  });

  it("returns empty array for non-existent component", () => {
    const map = makePipelineMap();
    const ops = expandChangeTypeCascade(map, "no-such");
    expect(ops).toHaveLength(0);
  });

  it("excludes components outside pipeline bounds", () => {
    const map = makePipelineMap();
    map.components.push({
      id: "outside-1",
      label: { name: "Outside" },
      type: "component",
      position: { evolution: { scalar: 0.95 }, visibility: { scalar: 0.9 } },
    } as any);
    const ops = expandChangeTypeCascade(map, "pipe-1");
    const ids = ops.map((op) => (op as any).payload.id);
    expect(ids).not.toContain("outside-1");
  });

  it("excludes nested pipelines from ejection", () => {
    const map = makePipelineMap();
    map.components.push({
      id: "nested-pipe",
      label: { name: "Nested" },
      type: "pipeline",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.4 } },
      pipelineGeometry: { evoStart: 0.4, evoEnd: 0.6, visStart: 0.35, visEnd: 0.45 },
    } as any);
    const ops = expandChangeTypeCascade(map, "pipe-1");
    const ids = ops.map((op) => (op as any).payload.id);
    expect(ids).not.toContain("nested-pipe");
  });

  it("respects epsilon 0.015 for boundary containment", () => {
    const map = makePipelineMap();
    // Component just inside boundary (within epsilon)
    map.components.push({
      id: "boundary-in",
      label: { name: "Boundary In" },
      type: "component",
      position: { evolution: { scalar: 0.19 }, visibility: { scalar: 0.4 } }, // 0.19 >= 0.2 - 0.015
    } as any);
    // Component just outside boundary (beyond epsilon)
    map.components.push({
      id: "boundary-out",
      label: { name: "Boundary Out" },
      type: "component",
      position: { evolution: { scalar: 0.17 }, visibility: { scalar: 0.4 } }, // 0.17 < 0.2 - 0.015
    } as any);
    const ops = expandChangeTypeCascade(map, "pipe-1");
    const ids = ops.map((op) => (op as any).payload.id);
    expect(ids).toContain("boundary-in");
    expect(ids).not.toContain("boundary-out");
  });

  it("is a pure read — does not mutate the map", () => {
    const map = makePipelineMap();
    const before = JSON.stringify(map);
    expandChangeTypeCascade(map, "pipe-1");
    expect(JSON.stringify(map)).toBe(before);
  });

  it("returns empty array when pipeline has no pipelineGeometry", () => {
    const map = makePipelineMap();
    delete (map.components.find((c) => c.id === "pipe-1")! as any).pipelineGeometry;
    const ops = expandChangeTypeCascade(map, "pipe-1");
    expect(ops).toHaveLength(0);
  });
});

// ── MoveLabelPayload Zod validation tests ────────────────────────────

describe("MoveLabelPayload schema", () => {
  it("accepts valid payload", () => {
    const result = MoveLabelPayload.safeParse({
      id: "comp-1",
      dx: 0.05,
      dy: -0.03,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("comp-1");
      expect(result.data.dx).toBe(0.05);
      expect(result.data.dy).toBe(-0.03);
    }
  });

  it("accepts zero offsets", () => {
    const result = MoveLabelPayload.safeParse({
      id: "comp-1",
      dx: 0,
      dy: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts negative offsets", () => {
    const result = MoveLabelPayload.safeParse({
      id: "comp-2",
      dx: -0.1,
      dy: -0.2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = MoveLabelPayload.safeParse({
      dx: 0.05,
      dy: -0.03,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = MoveLabelPayload.safeParse({
      id: "",
      dx: 0.05,
      dy: -0.03,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing dx", () => {
    const result = MoveLabelPayload.safeParse({
      id: "comp-1",
      dy: -0.03,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing dy", () => {
    const result = MoveLabelPayload.safeParse({
      id: "comp-1",
      dx: 0.05,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric dx", () => {
    const result = MoveLabelPayload.safeParse({
      id: "comp-1",
      dx: "abc",
      dy: 0.03,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string id", () => {
    const result = MoveLabelPayload.safeParse({
      id: 123,
      dx: 0.05,
      dy: -0.03,
    });
    expect(result.success).toBe(false);
  });
});

// ── applyMoveLabel mutation tests ────────────────────────────────────

describe("applyDiffOp — move_label", () => {
  it("sets label.position on existing component", () => {
    const map = makeMap();
    const ok = applyDiffOp(map, {
      op: "move_label",
      payload: { id: "comp-1", dx: 0.05, dy: -0.03 },
    });
    expect(ok).toBe(true);
    const comp = map.components.find((c) => c.id === "comp-1")!;
    expect(comp.label.position).toEqual({ dx: 0.05, dy: -0.03 });
  });

  it("returns false for non-existent component", () => {
    const map = makeMap();
    const ok = applyDiffOp(map, {
      op: "move_label",
      payload: { id: "no-such", dx: 0.1, dy: 0.2 },
    });
    expect(ok).toBe(false);
  });

  it("does not modify other components", () => {
    const map = makeMap();
    applyDiffOp(map, {
      op: "move_label",
      payload: { id: "comp-1", dx: 0.05, dy: -0.03 },
    });
    // comp-2 should not have a label.position set
    expect(map.components[1].label.position).toBeUndefined();
  });

  it("overwrites existing label.position", () => {
    const map = makeMap();
    // Set initial position
    applyDiffOp(map, {
      op: "move_label",
      payload: { id: "comp-1", dx: 0.1, dy: 0.1 },
    });
    // Overwrite
    applyDiffOp(map, {
      op: "move_label",
      payload: { id: "comp-1", dx: -0.2, dy: 0.3 },
    });
    const comp = map.components.find((c) => c.id === "comp-1")!;
    expect(comp.label.position).toEqual({ dx: -0.2, dy: 0.3 });
  });

  it("sets zero offsets correctly", () => {
    const map = makeMap();
    const ok = applyDiffOp(map, {
      op: "move_label",
      payload: { id: "comp-2", dx: 0, dy: 0 },
    });
    expect(ok).toBe(true);
    const comp = map.components.find((c) => c.id === "comp-2")!;
    expect(comp.label.position).toEqual({ dx: 0, dy: 0 });
  });
});

// ── MoveStepPayload Zod validation tests ─────────────────────────────

describe("MoveStepPayload schema", () => {
  it("accepts valid payload", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: 0.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("step-1");
      expect(result.data.evolution).toBe(0.5);
      expect(result.data.visibility).toBe(0.3);
    }
  });

  it("accepts boundary values (0 and 1)", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: 0,
      visibility: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = MoveStepPayload.safeParse({
      evolution: 0.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string id", () => {
    const result = MoveStepPayload.safeParse({
      id: 1,
      evolution: 0.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects evolution > 1", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: 1.5,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects evolution < 0", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: -0.1,
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects visibility > 1", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: 0.5,
      visibility: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects visibility < 0", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: 0.5,
      visibility: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing evolution", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing visibility", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric evolution", () => {
    const result = MoveStepPayload.safeParse({
      id: "step-1",
      evolution: "abc",
      visibility: 0.3,
    });
    expect(result.success).toBe(false);
  });
});

// ── applyMoveStep mutation tests ─────────────────────────────────────

// Steps are component DECORATORS now: each step-bearing component has id == step id
// (move_step targets the decorated component by id and moves it).
function makeMapWithSteps(): WardleyMap {
  return {
    title: "Test Map",
    components: [
      {
        id: "step-1",
        label: { name: "S1" },
        type: "component",
        position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.4 } },
        step: { number: 1 },
      },
      {
        id: "step-2",
        label: { name: "S2" },
        type: "component",
        position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.7 } },
        step: { number: 2 },
      },
    ],
    relations: [],
  } as WardleyMap;
}

describe("applyDiffOp — move_step", () => {
  it("moves a step to new coordinates by id", () => {
    const map = makeMapWithSteps();
    const ok = applyDiffOp(map, {
      op: "move_step",
      payload: { id: "step-1", evolution: 0.9, visibility: 0.2 },
    });
    expect(ok).toBe(true);
    const step = map.components.find((c: any) => c.id === "step-1")!;
    expect(step.position.evolution.scalar).toBe(0.9);
    expect(step.position.visibility.scalar).toBe(0.2);
  });

  it("returns false for non-existent step id", () => {
    const map = makeMapWithSteps();
    const ok = applyDiffOp(map, {
      op: "move_step",
      payload: { id: "no-such-step", evolution: 0.5, visibility: 0.5 },
    });
    expect(ok).toBe(false);
  });

  it("returns false when map has no steps", () => {
    const map = makeMap(); // no steps array
    const ok = applyDiffOp(map, {
      op: "move_step",
      payload: { id: "step-1", evolution: 0.5, visibility: 0.5 },
    });
    expect(ok).toBe(false);
  });

  it("does not modify other steps", () => {
    const map = makeMapWithSteps();
    applyDiffOp(map, {
      op: "move_step",
      payload: { id: "step-1", evolution: 0.1, visibility: 0.1 },
    });
    const step2 = map.components.find((c: any) => c.id === "step-2")!;
    expect(step2.position.evolution.scalar).toBe(0.6);
    expect(step2.position.visibility.scalar).toBe(0.7);
  });

  it("overwrites existing position", () => {
    const map = makeMapWithSteps();
    applyDiffOp(map, {
      op: "move_step",
      payload: { id: "step-1", evolution: 0.1, visibility: 0.1 },
    });
    applyDiffOp(map, {
      op: "move_step",
      payload: { id: "step-1", evolution: 0.8, visibility: 0.9 },
    });
    const step = map.components.find((c: any) => c.id === "step-1")!;
    expect(step.position.evolution.scalar).toBe(0.8);
    expect(step.position.visibility.scalar).toBe(0.9);
  });
});
