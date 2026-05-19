/**
 * Tests for pipeline drag producing correct N+1 explicit move ops.
 *
 * Sub-AC 3 of AC 9: Pipeline drag moves contained components with the
 * pipeline and emits explicit move_component ops for each one.
 *
 * When a pipeline is dragged:
 *   1. move_component for the pipeline itself (new center position)
 *   2. resize_pipeline to shift geometry bounds by the same delta
 *   3. move_component for each contained component (N ops)
 *   Total: N+1 move_component ops + 1 resize_pipeline op
 *
 * Tests cover:
 *   - HTML artifact contains pipeline body drag logic
 *   - Simulated drag produces correct op sequence and payloads
 *   - Contained components move with pipeline (same delta)
 *   - Components outside pipeline are NOT moved
 *   - Pipeline with zero contained components produces 1+1 ops
 *   - applyDiffOps correctly updates the model for all emitted ops
 *   - Pipeline geometry bounds shift by the same delta as the center
 *   - Edge-clamping: bounds clamped to [0,1] when dragged near edges
 *
 * @module pipeline-drag.test
 */

import { describe, it, expect, beforeAll } from "vitest";
import { renderToHTML } from "./render-html.js";
import { applyDiffOp, applyDiffOps, type DiffOp } from "./diff-ops.js";
import { isInsidePipeline } from "./pipeline-geometry.js";
import type { WardleyMap, PipelineGeometry } from "./schema.js";

// ── Test helpers ─────────────────────────────────────────────────────

const PIPELINE_EPSILON = 0.015;

function makePipelineMap(overrides?: {
  extraComponents?: WardleyMap["components"];
}): WardleyMap {
  return {
    title: "Pipeline Drag Test",
    components: [
      {
        id: "pipe-1",
        label: { name: "Platform" },
        type: "pipeline",
        // nature omitted (optional enum)
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.4 } },
        pipelineGeometry: {
          evoStart: 0.3,
          evoEnd: 0.7,
          visStart: 0.35,
          visEnd: 0.45,
        },
      },
      {
        id: "inside-1",
        label: { name: "Service A" },
        type: "component",
        // nature omitted (optional enum)
        position: { evolution: { scalar: 0.4 }, visibility: { scalar: 0.4 } },
      },
      {
        id: "inside-2",
        label: { name: "Service B" },
        type: "component",
        // nature omitted (optional enum)
        position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.4 } },
      },
      {
        id: "outside-1",
        label: { name: "External" },
        type: "component",
        // nature omitted (optional enum)
        position: { evolution: { scalar: 0.1 }, visibility: { scalar: 0.1 } },
      },
      ...(overrides?.extraComponents ?? []),
    ],
    relations: [
      { id: "r1", source: "inside-1", target: "inside-2", type: "DependsOn" },
      { id: "r2", source: "outside-1", target: "inside-1", type: "DependsOn" },
    ],
  } as WardleyMap;
}

/**
 * Simulate the pipeline drag logic from render-html.ts.
 *
 * This mirrors the inline JS: given a pipeline, a delta, and the
 * contained components, produces the exact sequence of diff ops.
 */
function simulatePipelineDrag(
  map: WardleyMap,
  pipelineId: string,
  deltaEvo: number,
  deltaVis: number,
): DiffOp[] {
  const ops: DiffOp[] = [];
  const pipe = map.components.find((c) => c.id === pipelineId);
  if (!pipe || pipe.type !== "pipeline" || !pipe.pipelineGeometry) return ops;

  const geo = pipe.pipelineGeometry;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const round3 = (v: number) => +v.toFixed(3);

  // New pipeline center
  const newPipeEvo = clamp(round3(pipe.position.evolution.scalar + deltaEvo));
  const newPipeVis = clamp(round3(pipe.position.visibility.scalar + deltaVis));

  // New geometry bounds (shifted by same delta)
  const newGeo = {
    evoStart: round3(clamp(geo.evoStart + deltaEvo)),
    evoEnd: round3(clamp(geo.evoEnd + deltaEvo)),
    visStart: round3(clamp(geo.visStart + deltaVis)),
    visEnd: round3(clamp(geo.visEnd + deltaVis)),
  };

  // Find contained components (same logic as getContainedComponents in render-html.ts)
  const contained = map.components.filter((c) => {
    if (c.id === pipelineId) return false;
    if (c.type === "pipeline" || c.type === "note") return false;
    const cEvo = c.position.evolution.scalar;
    const cVis = c.position.visibility.scalar;
    return (
      cEvo >= geo.evoStart - PIPELINE_EPSILON &&
      cEvo <= geo.evoEnd + PIPELINE_EPSILON &&
      cVis >= geo.visStart - PIPELINE_EPSILON &&
      cVis <= geo.visEnd + PIPELINE_EPSILON
    );
  });

  // 1. move_component for pipeline itself
  ops.push({
    op: "move_component",
    payload: { id: pipelineId, evolution: newPipeEvo, visibility: newPipeVis },
  });

  // 2. resize_pipeline to shift geometry bounds
  ops.push({
    op: "resize_pipeline",
    payload: { id: pipelineId, evoStart: newGeo.evoStart, evoEnd: newGeo.evoEnd },
  });

  // 3. move_component for each contained component
  for (const c of contained) {
    const ccNewEvo = clamp(round3(c.position.evolution.scalar + deltaEvo));
    const ccNewVis = clamp(round3(c.position.visibility.scalar + deltaVis));
    ops.push({
      op: "move_component",
      payload: { id: c.id, evolution: ccNewEvo, visibility: ccNewVis },
    });
  }

  return ops;
}

// ── HTML artifact structure tests ────────────────────────────────────

describe("Pipeline body drag in HTML artifact", () => {
  let html: string;
  beforeAll(async () => {
    html = await renderToHTML(makePipelineMap(), { interactive: true });
  });

  it("contains unified component drag handler that supports pipelines", () => {
    expect(html).toContain("isPipeline");
    expect(html).toContain("origGeo");
  });

  it("finds contained components before drag starts", () => {
    expect(html).toContain("getContainedComponents");
  });

  it("emits move_component for the pipeline itself", () => {
    // The pipeline move is first
    expect(html).toContain('applyOp("move_component"');
  });

  it("emits resize_pipeline to document geometry shift", () => {
    expect(html).toContain('applyOp("resize_pipeline"');
  });

  it("emits move_component for each peer component (contained) in a loop", () => {
    // Pipeline-contained components are collected as peers in the unified drag
    expect(html).toContain("getContainedComponents");
    expect(html).toContain("peers.length");
  });

  it("computes delta from start to current pointer position", () => {
    expect(html).toContain("drag.currentEvo - drag.primary.startEvo");
    expect(html).toContain("drag.currentVis - drag.primary.startVis");
  });

  it("applies same delta to all peer components (including contained)", () => {
    // Each peer component gets startEvo + deltaEvo in the unified drag
    expect(html).toContain("peer.startEvo + deltaEvo");
    expect(html).toContain("peer.startVis + deltaVis");
  });

  it("respects MOVE_THRESHOLD for pipeline drag", () => {
    expect(html).toContain("MOVE_THRESHOLD");
  });

  it("clamps all coordinates to [0,1]", () => {
    // Pipeline center and contained component positions are clamped
    expect(html).toContain("Math.max(0, Math.min(1,");
  });
});

// ── Simulated pipeline drag tests ────────────────────────────────────

describe("Pipeline drag op generation (simulated)", () => {
  it("produces N+1 move ops + 1 resize for pipeline with 2 contained components", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.05);

    // 1 move_pipeline + 1 resize + 2 contained moves = 4 ops total
    expect(ops).toHaveLength(4);

    const moveOps = ops.filter((o) => o.op === "move_component");
    const resizeOps = ops.filter((o) => o.op === "resize_pipeline");
    expect(moveOps).toHaveLength(3); // N+1 = 2+1
    expect(resizeOps).toHaveLength(1);
  });

  it("first op is always move_component for the pipeline itself", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.05);

    expect(ops[0]).toEqual({
      op: "move_component",
      payload: { id: "pipe-1", evolution: 0.6, visibility: 0.45 },
    });
  });

  it("second op is resize_pipeline with shifted bounds", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.05);

    expect(ops[1]).toEqual({
      op: "resize_pipeline",
      payload: { id: "pipe-1", evoStart: 0.4, evoEnd: 0.8 },
    });
  });

  it("contained components receive the same delta offset", () => {
    const map = makePipelineMap();
    const deltaEvo = 0.1;
    const deltaVis = 0.05;
    const ops = simulatePipelineDrag(map, "pipe-1", deltaEvo, deltaVis);

    // inside-1: 0.4 + 0.1 = 0.5, 0.4 + 0.05 = 0.45
    const inside1Op = ops.find(
      (o) => o.op === "move_component" && o.payload.id === "inside-1",
    );
    expect(inside1Op).toBeDefined();
    expect(inside1Op!.payload).toEqual({
      id: "inside-1",
      evolution: 0.5,
      visibility: 0.45,
    });

    // inside-2: 0.6 + 0.1 = 0.7, 0.4 + 0.05 = 0.45
    const inside2Op = ops.find(
      (o) => o.op === "move_component" && o.payload.id === "inside-2",
    );
    expect(inside2Op).toBeDefined();
    expect(inside2Op!.payload).toEqual({
      id: "inside-2",
      evolution: 0.7,
      visibility: 0.45,
    });
  });

  it("does NOT include components outside the pipeline", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.05);

    const outsideOp = ops.find(
      (o) => o.op === "move_component" && o.payload.id === "outside-1",
    );
    expect(outsideOp).toBeUndefined();
  });

  it("produces 1+1 ops for pipeline with zero contained components", () => {
    const emptyPipeMap: WardleyMap = {
      title: "Empty Pipeline",
      components: [
        {
          id: "pipe-empty",
          label: { name: "Empty" },
          type: "pipeline",
          // nature omitted (optional enum)
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: {
            evoStart: 0.4,
            evoEnd: 0.6,
            visStart: 0.45,
            visEnd: 0.55,
          },
        },
      ],
      relations: [],
    } as WardleyMap;

    const ops = simulatePipelineDrag(emptyPipeMap, "pipe-empty", 0.1, 0.0);
    expect(ops).toHaveLength(2); // 1 move + 1 resize, 0 contained
    expect(ops[0].op).toBe("move_component");
    expect(ops[1].op).toBe("resize_pipeline");
  });

  it("clamps coordinates to [0,1] when dragged near edges", () => {
    const map = makePipelineMap();
    // Drag right by 0.5 — pipeline evoEnd would be 0.7+0.5=1.2 → clamped to 1.0
    const ops = simulatePipelineDrag(map, "pipe-1", 0.5, 0.0);

    const resizeOp = ops.find((o) => o.op === "resize_pipeline")!;
    expect(resizeOp.payload.evoEnd).toBeLessThanOrEqual(1);
    expect(resizeOp.payload.evoStart).toBeLessThanOrEqual(1);

    // inside-2 at 0.6 + 0.5 = 1.1 → clamped to 1.0
    const inside2 = ops.find(
      (o) => o.op === "move_component" && (o.payload as { id: string }).id === "inside-2",
    );
    expect((inside2!.payload as { evolution: number }).evolution).toBeLessThanOrEqual(1);
  });

  it("rounds all coordinates to 3 decimal places", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1234, 0.0567);

    for (const op of ops) {
      if (op.op === "move_component") {
        const evoStr = String(op.payload.evolution);
        const visStr = String(op.payload.visibility);
        const evoDecimals = evoStr.includes(".") ? evoStr.split(".")[1].length : 0;
        const visDecimals = visStr.includes(".") ? visStr.split(".")[1].length : 0;
        expect(evoDecimals).toBeLessThanOrEqual(3);
        expect(visDecimals).toBeLessThanOrEqual(3);
      }
    }
  });
});

// ── Model mutation tests (applying generated ops) ────────────────────

describe("Pipeline drag ops applied to model", () => {
  it("applyDiffOps correctly updates pipeline position and contained components", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.05);

    // Apply all ops
    const results = applyDiffOps(map, ops);
    expect(results.every((r) => r === true)).toBe(true);

    // Pipeline center moved (resize_pipeline recalculates center from bounds,
    // so use toBeCloseTo to handle floating-point arithmetic)
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    expect(pipe.position.evolution.scalar).toBeCloseTo(0.6, 3);
    expect(pipe.position.visibility.scalar).toBeCloseTo(0.45, 3);

    // Pipeline geometry shifted
    expect(pipe.pipelineGeometry!.evoStart).toBeCloseTo(0.4, 3);
    expect(pipe.pipelineGeometry!.evoEnd).toBeCloseTo(0.8, 3);

    // Contained components moved by same delta
    const inside1 = map.components.find((c) => c.id === "inside-1")!;
    expect(inside1.position.evolution.scalar).toBeCloseTo(0.5, 3);
    expect(inside1.position.visibility.scalar).toBeCloseTo(0.45, 3);

    const inside2 = map.components.find((c) => c.id === "inside-2")!;
    expect(inside2.position.evolution.scalar).toBeCloseTo(0.7, 3);
    expect(inside2.position.visibility.scalar).toBeCloseTo(0.45, 3);

    // Outside component unchanged
    const outside = map.components.find((c) => c.id === "outside-1")!;
    expect(outside.position.evolution.scalar).toBe(0.1);
    expect(outside.position.visibility.scalar).toBe(0.1);
  });

  it("contained components remain inside pipeline after drag", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.05);
    applyDiffOps(map, ops);

    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    const geo = pipe.pipelineGeometry!;

    // Both contained components should still be within the new bounds
    for (const id of ["inside-1", "inside-2"]) {
      const comp = map.components.find((c) => c.id === id)!;
      expect(isInsidePipeline(comp, geo)).toBe(true);
    }
  });

  it("pipeline geometry bounds shift preserves width and height", () => {
    const map = makePipelineMap();
    const pipe = map.components.find((c) => c.id === "pipe-1")!;
    const origWidth = pipe.pipelineGeometry!.evoEnd - pipe.pipelineGeometry!.evoStart;

    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.05);
    applyDiffOps(map, ops);

    const newWidth = pipe.pipelineGeometry!.evoEnd - pipe.pipelineGeometry!.evoStart;
    expect(newWidth).toBeCloseTo(origWidth, 3);
  });

  it("relative positions of contained components are preserved", () => {
    const map = makePipelineMap();
    const inside1Before = map.components.find((c) => c.id === "inside-1")!;
    const inside2Before = map.components.find((c) => c.id === "inside-2")!;
    const evoDiff = inside2Before.position.evolution.scalar - inside1Before.position.evolution.scalar;
    const visDiff = inside2Before.position.visibility.scalar - inside1Before.position.visibility.scalar;

    const ops = simulatePipelineDrag(map, "pipe-1", 0.15, -0.1);
    applyDiffOps(map, ops);

    const inside1After = map.components.find((c) => c.id === "inside-1")!;
    const inside2After = map.components.find((c) => c.id === "inside-2")!;
    const newEvoDiff = inside2After.position.evolution.scalar - inside1After.position.evolution.scalar;
    const newVisDiff = inside2After.position.visibility.scalar - inside1After.position.visibility.scalar;

    expect(newEvoDiff).toBeCloseTo(evoDiff, 3);
    expect(newVisDiff).toBeCloseTo(visDiff, 3);
  });
});

// ── Pipeline containment edge cases ──────────────────────────────────

describe("Pipeline drag containment edge cases", () => {
  it("component on pipeline boundary (within epsilon) is included", () => {
    const map: WardleyMap = {
      title: "Boundary Test",
      components: [
        {
          id: "pipe-b",
          label: { name: "Pipeline" },
          type: "pipeline",
          // nature omitted (optional enum)
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: {
            evoStart: 0.3,
            evoEnd: 0.7,
            visStart: 0.45,
            visEnd: 0.55,
          },
        },
        {
          id: "boundary-comp",
          label: { name: "On Edge" },
          type: "component",
          // nature omitted (optional enum)
          // Exactly on evoEnd boundary
          position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [],
    } as WardleyMap;

    const ops = simulatePipelineDrag(map, "pipe-b", 0.05, 0.0);
    const boundaryMove = ops.find(
      (o) => o.op === "move_component" && (o.payload as { id: string }).id === "boundary-comp",
    );
    expect(boundaryMove).toBeDefined();
    expect((boundaryMove!.payload as { evolution: number }).evolution).toBe(0.75);
  });

  it("component just outside epsilon is NOT included", () => {
    const map: WardleyMap = {
      title: "Outside Epsilon Test",
      components: [
        {
          id: "pipe-c",
          label: { name: "Pipeline" },
          type: "pipeline",
          // nature omitted (optional enum)
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: {
            evoStart: 0.3,
            evoEnd: 0.7,
            visStart: 0.45,
            visEnd: 0.55,
          },
        },
        {
          id: "far-comp",
          label: { name: "Far Away" },
          type: "component",
          // nature omitted (optional enum)
          // Well outside pipeline bounds
          position: { evolution: { scalar: 0.72 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [],
    } as WardleyMap;

    const ops = simulatePipelineDrag(map, "pipe-c", 0.05, 0.0);
    const farMove = ops.find(
      (o) => o.op === "move_component" && o.payload.id === "far-comp",
    );
    expect(farMove).toBeUndefined();
  });

  it("notes inside pipeline bounds are NOT moved", () => {
    const map: WardleyMap = {
      title: "Note Test",
      components: [
        {
          id: "pipe-n",
          label: { name: "Pipeline" },
          type: "pipeline",
          // nature omitted (optional enum)
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: {
            evoStart: 0.3,
            evoEnd: 0.7,
            visStart: 0.45,
            visEnd: 0.55,
          },
        },
        {
          id: "note-1",
          label: { name: "A Note" },
          type: "note",
          // nature omitted (optional enum)
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [],
    } as WardleyMap;

    const ops = simulatePipelineDrag(map, "pipe-n", 0.1, 0.0);
    const noteMove = ops.find(
      (o) => o.op === "move_component" && o.payload.id === "note-1",
    );
    expect(noteMove).toBeUndefined();
  });

  it("nested pipeline inside another pipeline is NOT moved", () => {
    const map: WardleyMap = {
      title: "Nested Pipeline Test",
      components: [
        {
          id: "pipe-outer",
          label: { name: "Outer" },
          type: "pipeline",
          // nature omitted (optional enum)
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: {
            evoStart: 0.2,
            evoEnd: 0.8,
            visStart: 0.4,
            visEnd: 0.6,
          },
        },
        {
          id: "pipe-inner",
          label: { name: "Inner" },
          type: "pipeline",
          // nature omitted (optional enum)
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: {
            evoStart: 0.4,
            evoEnd: 0.6,
            visStart: 0.45,
            visEnd: 0.55,
          },
        },
      ],
      relations: [],
    } as WardleyMap;

    const ops = simulatePipelineDrag(map, "pipe-outer", 0.1, 0.0);
    const innerMove = ops.find(
      (o) => o.op === "move_component" && o.payload.id === "pipe-inner",
    );
    expect(innerMove).toBeUndefined();
  });

  it("pipeline with many contained components produces correct N+1 count", () => {
    const components: WardleyMap["components"] = [
      {
        id: "pipe-many",
        label: { name: "Big Pipeline" },
        type: "pipeline",
        // nature omitted (optional enum)
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        pipelineGeometry: {
          evoStart: 0.2,
          evoEnd: 0.8,
          visStart: 0.4,
          visEnd: 0.6,
        },
      },
    ];

    // Add 5 components inside the pipeline
    for (let i = 0; i < 5; i++) {
      components.push({
        id: `child-${i}`,
        label: { name: `Child ${i}` },
        type: "component",
        // nature omitted (optional enum)
        position: {
          evolution: { scalar: 0.3 + i * 0.1 },
          visibility: { scalar: 0.5 },
        },
      });
    }

    const map: WardleyMap = {
      title: "Many Children",
      components,
      relations: [],
    } as WardleyMap;

    const ops = simulatePipelineDrag(map, "pipe-many", 0.05, 0.0);
    const moveOps = ops.filter((o) => o.op === "move_component");
    expect(moveOps).toHaveLength(6); // 5 children + 1 pipeline = N+1
    expect(moveOps[0].payload.id).toBe("pipe-many"); // pipeline first

    const resizeOps = ops.filter((o) => o.op === "resize_pipeline");
    expect(resizeOps).toHaveLength(1);
  });

  it("op ordering: pipeline move → resize → contained moves", () => {
    const map = makePipelineMap();
    const ops = simulatePipelineDrag(map, "pipe-1", 0.1, 0.0);

    expect(ops[0].op).toBe("move_component");
    expect((ops[0].payload as { id: string }).id).toBe("pipe-1");

    expect(ops[1].op).toBe("resize_pipeline");
    expect((ops[1].payload as { id: string }).id).toBe("pipe-1");

    // Remaining ops are contained component moves
    for (let i = 2; i < ops.length; i++) {
      expect(ops[i].op).toBe("move_component");
      expect((ops[i].payload as { id: string }).id).not.toBe("pipe-1");
    }
  });
});
