/**
 * Tests for pipeline-geometry module.
 *
 * Covers:
 * - Pipeline containment detection (isInsidePipeline)
 * - Pipeline resolution with sub-component identification
 * - handleEvolution positioning (explicit and default)
 * - Pixel-space rectangle conversion
 * - Sub-component clamping within pipeline bounds
 * - Full applyPipelineContainment integration
 */
import { describe, it, expect } from "vitest";
import {
  isInsidePipeline,
  resolvePipelines,
  buildPipelineMembership,
  resolveHandleEvolution,
  pipelineCenter,
  recomputeGeometryFromCenter,
  pipelineToRect,
  pipelinesToRects,
  clampEvolutionToPipeline,
  clampVisibilityToPipeline,
  applyPipelineContainment,
  type ResolvedPipeline,
  type CoordConverters,
} from "./pipeline-geometry.js";
import { evo, vis, type Component, type PipelineGeometry, type WardleyMap } from "./schema.js";

// ── Test fixtures ──────────────────────────────────────────────────

const PIPE_GEO: PipelineGeometry = {
  evoStart: 0.2,
  evoEnd: 0.7,
  visStart: 0.4,
  visEnd: 0.6,
  handleEvolution: 0.3,
};

const PIPE_GEO_NO_HANDLE: PipelineGeometry = {
  evoStart: 0.2,
  evoEnd: 0.8,
  visStart: 0.3,
  visEnd: 0.7,
};

function makeComp(overrides: { id: string; label: string; evolution?: number; visibility?: number; type?: Component["type"]; pipelineGeometry?: PipelineGeometry }): Component {
  const { id, label, evolution = 0.5, visibility = 0.5, type = "component", ...rest } = overrides;
  return {
    id,
    label: { name: label },
    type,
    position: {
      evolution: { scalar: evolution },
      visibility: { scalar: visibility },
    },
    ...rest,
  } as Component;
}

function makePipeline(
  id: string,
  label: string,
  geo: PipelineGeometry
): Component {
  // Pipeline position represents center of geometry bounds
  return {
    id,
    label: { name: label },
    type: "pipeline",
    position: {
      evolution: { scalar: (geo.evoStart + geo.evoEnd) / 2 },
      visibility: { scalar: (geo.visStart + geo.visEnd) / 2 },
    },
    pipelineGeometry: geo,
  } as Component;
}

/** Simple linear converters for testing: evo*1000, vis*500 */
const testConv: CoordConverters = {
  evoToX: (e) => 50 + e * 1000,
  visToY: (v) => 20 + v * 500,
};

// ── isInsidePipeline ───────────────────────────────────────────────

describe("isInsidePipeline", () => {
  it("detects component clearly inside pipeline", () => {
    const comp = makeComp({ id: "a", label: "A", evolution: 0.4, visibility: 0.5 });
    expect(isInsidePipeline(comp, PIPE_GEO)).toBe(true);
  });

  it("detects component on the left boundary (within epsilon)", () => {
    const comp = makeComp({ id: "a", label: "A", evolution: 0.19, visibility: 0.5 });
    expect(isInsidePipeline(comp, PIPE_GEO)).toBe(true);
  });

  it("rejects component clearly outside pipeline (left)", () => {
    const comp = makeComp({ id: "a", label: "A", evolution: 0.1, visibility: 0.5 });
    expect(isInsidePipeline(comp, PIPE_GEO)).toBe(false);
  });

  it("rejects component clearly outside pipeline (above)", () => {
    const comp = makeComp({ id: "a", label: "A", evolution: 0.4, visibility: 0.2 });
    expect(isInsidePipeline(comp, PIPE_GEO)).toBe(false);
  });

  it("rejects component clearly outside pipeline (right)", () => {
    const comp = makeComp({ id: "a", label: "A", evolution: 0.9, visibility: 0.5 });
    expect(isInsidePipeline(comp, PIPE_GEO)).toBe(false);
  });

  it("accepts component exactly on boundary with default epsilon", () => {
    const comp = makeComp({ id: "a", label: "A", evolution: 0.2, visibility: 0.4 });
    expect(isInsidePipeline(comp, PIPE_GEO)).toBe(true);
  });

  it("respects custom epsilon", () => {
    const comp = makeComp({ id: "a", label: "A", evolution: 0.15, visibility: 0.5 });
    // Default epsilon 0.015 → 0.2 - 0.015 = 0.185, 0.15 < 0.185 → false
    expect(isInsidePipeline(comp, PIPE_GEO, 0.015)).toBe(false);
    // Large epsilon → true
    expect(isInsidePipeline(comp, PIPE_GEO, 0.1)).toBe(true);
  });
});

// ── resolvePipelines ───────────────────────────────────────────────

describe("resolvePipelines", () => {
  it("returns empty array when no pipelines exist", () => {
    const map: WardleyMap = {
      title: "No pipes",
      components: [makeComp({ id: "a", label: "A" })],
      relations: [],
    };
    expect(resolvePipelines(map)).toEqual([]);
  });

  it("resolves pipeline with sub-components", () => {
    const pipe = makePipeline("pipe1", "My Pipeline", PIPE_GEO);
    const inside = makeComp({ id: "c1", label: "Inside", evolution: 0.4, visibility: 0.5 });
    const outside = makeComp({ id: "c2", label: "Outside", evolution: 0.9, visibility: 0.1 });
    const map: WardleyMap = {
      title: "With pipe",
      components: [pipe, inside, outside],
      relations: [],
    };

    const resolved = resolvePipelines(map);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].component.id).toBe("pipe1");
    expect(resolved[0].childIds).toContain("c1");
    expect(resolved[0].childIds).not.toContain("c2");
  });

  it("ignores pipeline without pipelineGeometry", () => {
    const badPipe: Component = {
      id: "pipe-bad",
      label: { name: "Bad Pipeline" },
      type: "pipeline",
      position: {
        evolution: { scalar: 0.5 },
        visibility: { scalar: 0.5 },
      },
    } as Component;
    const map: WardleyMap = {
      title: "Bad pipe",
      components: [badPipe, makeComp({ id: "c1", label: "C1" })],
      relations: [],
    };
    expect(resolvePipelines(map)).toEqual([]);
  });

  it("does not include notes as sub-components", () => {
    const pipe = makePipeline("pipe1", "Pipeline", PIPE_GEO);
    const note: Component = {
      id: "note1",
      label: { name: "A note" },
      type: "note",
      position: {
        evolution: { scalar: 0.4 },
        visibility: { scalar: 0.5 },
      },
    } as Component;
    const map: WardleyMap = {
      title: "Pipe with note",
      components: [pipe, note],
      relations: [],
    };
    const resolved = resolvePipelines(map);
    expect(resolved[0].childIds).not.toContain("note1");
  });
});

// ── buildPipelineMembership ────────────────────────────────────────

describe("buildPipelineMembership", () => {
  it("builds correct membership map", () => {
    const pipelines: ResolvedPipeline[] = [
      {
        component: makePipeline("p1", "P1", PIPE_GEO),
        geometry: PIPE_GEO,
        childIds: ["c1", "c2"],
      },
    ];
    const mem = buildPipelineMembership(pipelines);
    expect(mem.get("c1")).toBe("p1");
    expect(mem.get("c2")).toBe("p1");
    expect(mem.has("p1")).toBe(false);
  });

  it("first pipeline wins for overlapping containment", () => {
    const geo2: PipelineGeometry = { ...PIPE_GEO, evoStart: 0.3 };
    const pipelines: ResolvedPipeline[] = [
      {
        component: makePipeline("p1", "P1", PIPE_GEO),
        geometry: PIPE_GEO,
        childIds: ["c1"],
      },
      {
        component: makePipeline("p2", "P2", geo2),
        geometry: geo2,
        childIds: ["c1"],
      },
    ];
    const mem = buildPipelineMembership(pipelines);
    expect(mem.get("c1")).toBe("p1");
  });
});

// ── resolveHandleEvolution ─────────────────────────────────────────

describe("resolveHandleEvolution", () => {
  it("returns explicit handleEvolution when set", () => {
    expect(resolveHandleEvolution(PIPE_GEO)).toBe(0.3);
  });

  it("returns midpoint when handleEvolution is undefined", () => {
    expect(resolveHandleEvolution(PIPE_GEO_NO_HANDLE)).toBeCloseTo(0.5);
  });

  it("returns midpoint when handleEvolution is missing from object", () => {
    const geo: PipelineGeometry = {
      evoStart: 0.1,
      evoEnd: 0.9,
      visStart: 0.2,
      visEnd: 0.8,
    };
    expect(resolveHandleEvolution(geo)).toBeCloseTo(0.5);
  });
});

// ── pipelineCenter ─────────────────────────────────────────────────

describe("pipelineCenter", () => {
  it("returns center of pipeline geometry bounds", () => {
    const center = pipelineCenter(PIPE_GEO);
    // evoStart=0.2, evoEnd=0.7 → center=0.45
    // visStart=0.4, visEnd=0.6 → center=0.5
    expect(center.evolution).toBeCloseTo(0.45);
    expect(center.visibility).toBeCloseTo(0.5);
  });

  it("returns center for symmetric geometry", () => {
    const geo: PipelineGeometry = {
      evoStart: 0.3,
      evoEnd: 0.7,
      visStart: 0.2,
      visEnd: 0.8,
    };
    const center = pipelineCenter(geo);
    expect(center.evolution).toBeCloseTo(0.5);
    expect(center.visibility).toBeCloseTo(0.5);
  });

  it("pipeline position matches pipelineCenter output", () => {
    const pipe = makePipeline("p1", "P1", PIPE_GEO);
    const center = pipelineCenter(PIPE_GEO);
    expect(evo(pipe)).toBeCloseTo(center.evolution);
    expect(vis(pipe)).toBeCloseTo(center.visibility);
  });
});

// ── recomputeGeometryFromCenter ────────────────────────────────────

describe("recomputeGeometryFromCenter", () => {
  it("preserves dimensions when center is unchanged", () => {
    const center = pipelineCenter(PIPE_GEO);
    const result = recomputeGeometryFromCenter(PIPE_GEO, center);
    expect(result.evoStart).toBeCloseTo(PIPE_GEO.evoStart);
    expect(result.evoEnd).toBeCloseTo(PIPE_GEO.evoEnd);
    expect(result.visStart).toBeCloseTo(PIPE_GEO.visStart);
    expect(result.visEnd).toBeCloseTo(PIPE_GEO.visEnd);
  });

  it("shifts bounds when center moves", () => {
    // PIPE_GEO: evo 0.2-0.7 (width 0.5), vis 0.4-0.6 (height 0.2)
    const result = recomputeGeometryFromCenter(PIPE_GEO, {
      evolution: 0.5,
      visibility: 0.5,
    });
    // halfEvo = 0.25, halfVis = 0.1
    expect(result.evoStart).toBeCloseTo(0.25);
    expect(result.evoEnd).toBeCloseTo(0.75);
    expect(result.visStart).toBeCloseTo(0.4);
    expect(result.visEnd).toBeCloseTo(0.6);
  });

  it("clamps bounds to [0,1] range", () => {
    const result = recomputeGeometryFromCenter(PIPE_GEO, {
      evolution: 0.0,
      visibility: 0.0,
    });
    expect(result.evoStart).toBe(0);
    expect(result.evoEnd).toBeCloseTo(0.25); // halfEvo=0.25, 0+0.25
    expect(result.visStart).toBe(0);
    expect(result.visEnd).toBeCloseTo(0.1); // halfVis=0.1, 0+0.1
  });

  it("preserves handleEvolution from original geometry", () => {
    const result = recomputeGeometryFromCenter(PIPE_GEO, {
      evolution: 0.5,
      visibility: 0.5,
    });
    expect(result.handleEvolution).toBe(PIPE_GEO.handleEvolution);
  });
});

// ── pipelineToRect ─────────────────────────────────────────────────

describe("pipelineToRect", () => {
  it("converts pipeline geometry to pixel rect", () => {
    const pipe: ResolvedPipeline = {
      component: makePipeline("p1", "P1", PIPE_GEO),
      geometry: PIPE_GEO,
      childIds: [],
    };

    const rect = pipelineToRect(pipe, testConv);

    // evoStart=0.2 → 50+200=250, evoEnd=0.7 → 50+700=750
    expect(rect.x).toBe(250);
    expect(rect.width).toBe(500);

    // visStart=0.4 → 20+200=220, visEnd=0.6 → 20+300=320
    expect(rect.y).toBe(220);
    expect(rect.height).toBe(100);

    // handleEvolution=0.3 → 50+300=350
    expect(rect.handleX).toBe(350);
    expect(rect.handleY).toBe(220); // top of pipeline
    expect(rect.id).toBe("p1");
  });

  it("uses default handle position when not specified", () => {
    const pipe: ResolvedPipeline = {
      component: makePipeline("p2", "P2", PIPE_GEO_NO_HANDLE),
      geometry: PIPE_GEO_NO_HANDLE,
      childIds: [],
    };

    const rect = pipelineToRect(pipe, testConv);
    // midpoint of 0.2-0.8 = 0.5 → 50+500=550
    expect(rect.handleX).toBe(550);
  });
});

// ── pipelinesToRects ───────────────────────────────────────────────

describe("pipelinesToRects", () => {
  it("converts multiple pipelines", () => {
    const pipes: ResolvedPipeline[] = [
      {
        component: makePipeline("p1", "P1", PIPE_GEO),
        geometry: PIPE_GEO,
        childIds: [],
      },
      {
        component: makePipeline("p2", "P2", PIPE_GEO_NO_HANDLE),
        geometry: PIPE_GEO_NO_HANDLE,
        childIds: [],
      },
    ];
    const rects = pipelinesToRects(pipes, testConv);
    expect(rects).toHaveLength(2);
    expect(rects[0].id).toBe("p1");
    expect(rects[1].id).toBe("p2");
  });
});

// ── clampEvolutionToPipeline ───────────────────────────────────────

describe("clampEvolutionToPipeline", () => {
  it("leaves value inside range unchanged", () => {
    expect(clampEvolutionToPipeline(0.5, PIPE_GEO)).toBe(0.5);
  });

  it("clamps value below range to evoStart + padding", () => {
    expect(clampEvolutionToPipeline(0.1, PIPE_GEO)).toBeCloseTo(0.205);
  });

  it("clamps value above range to evoEnd - padding", () => {
    expect(clampEvolutionToPipeline(0.9, PIPE_GEO)).toBeCloseTo(0.695);
  });

  it("respects custom padding", () => {
    expect(clampEvolutionToPipeline(0.1, PIPE_GEO, 0.01)).toBeCloseTo(0.21);
  });
});

// ── clampVisibilityToPipeline ──────────────────────────────────────

describe("clampVisibilityToPipeline", () => {
  it("leaves value inside range unchanged", () => {
    expect(clampVisibilityToPipeline(0.5, PIPE_GEO)).toBe(0.5);
  });

  it("clamps value below range", () => {
    expect(clampVisibilityToPipeline(0.2, PIPE_GEO)).toBeCloseTo(0.405);
  });

  it("clamps value above range", () => {
    expect(clampVisibilityToPipeline(0.9, PIPE_GEO)).toBeCloseTo(0.595);
  });
});

// ── applyPipelineContainment ───────────────────────────────────────

describe("applyPipelineContainment", () => {
  const pipeGeo: PipelineGeometry = {
    evoStart: 0.2,
    evoEnd: 0.7,
    visStart: 0.4,
    visEnd: 0.6,
    handleEvolution: 0.3,
  };

  const pipe = makePipeline("pipe1", "Pipeline", pipeGeo);

  it("returns map unchanged when no pipelines exist", () => {
    const map: WardleyMap = {
      title: "No pipes",
      components: [makeComp({ id: "c1", label: "C1" })],
      relations: [],
    };
    const result = applyPipelineContainment(map);
    expect(result).toBe(map); // Same reference — no mutation needed
  });

  it("clamps sub-components to pipeline bounds", () => {
    // Component is inside pipeline bbox but at the edge
    const inside = makeComp({
      id: "c1",
      label: "Inside",
      evolution: 0.4,
      visibility: 0.5,
    });
    const map: WardleyMap = {
      title: "Containment test",
      components: [pipe, inside],
      relations: [],
    };

    const result = applyPipelineContainment(map);
    const c1 = result.components.find((c) => c.id === "c1")!;
    // Should remain at 0.4 (already inside bounds)
    expect(evo(c1)).toBe(0.4);
    expect(vis(c1)).toBe(0.5);
  });

  it("does not mutate the input map", () => {
    const inside = makeComp({
      id: "c1",
      label: "Inside",
      evolution: 0.4,
      visibility: 0.5,
    });
    const map: WardleyMap = {
      title: "Immutability test",
      components: [pipe, inside],
      relations: [],
    };

    const result = applyPipelineContainment(map);
    expect(result).not.toBe(map);
    // Original unchanged
    expect(evo(map.components[1])).toBe(0.4);
  });

  it("leaves components outside pipelines unchanged", () => {
    const outside = makeComp({
      id: "c2",
      label: "Outside",
      evolution: 0.9,
      visibility: 0.1,
    });
    const map: WardleyMap = {
      title: "Outside test",
      components: [pipe, outside],
      relations: [],
    };

    const result = applyPipelineContainment(map);
    const c2 = result.components.find((c) => c.id === "c2")!;
    expect(evo(c2)).toBe(0.9);
    expect(vis(c2)).toBe(0.1);
  });
});

// ── Integration: real MapKeep-style pipeline data ──────────────────

describe("integration: MapKeep pipeline data", () => {
  it("handles App Interface design pipeline with 2 sub-components", () => {
    const pipeGeo: PipelineGeometry = {
      evoStart: 0.196,
      evoEnd: 0.735,
      visStart: 0.664,
      visEnd: 0.704,
      handleEvolution: 0.245,
    };
    const pipe = makePipeline("pipe-app", "App Interface design", pipeGeo);

    const saas = makeComp({
      id: "saas",
      label: "Saas interface",
      evolution: 0.721,
      visibility: 0.688,
    });
    const adaptive = makeComp({
      id: "adaptive",
      label: "Contextual Adaptative interface",
      evolution: 0.2,
      visibility: 0.687,
    });
    const outsider = makeComp({
      id: "outsider",
      label: "Outsider",
      evolution: 0.1,
      visibility: 0.1,
    });

    const map: WardleyMap = {
      title: "MapKeep Integration",
      components: [pipe, saas, adaptive, outsider],
      relations: [],
    };

    const pipelines = resolvePipelines(map);
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].childIds).toContain("saas");
    expect(pipelines[0].childIds).toContain("adaptive");
    expect(pipelines[0].childIds).not.toContain("outsider");

    // Handle should be at explicit position 0.245
    expect(resolveHandleEvolution(pipelines[0].geometry)).toBe(0.245);
  });

  it("pipeline position represents center of geometry bounds", () => {
    const pipeGeo: PipelineGeometry = {
      evoStart: 0.2,
      evoEnd: 0.8,
      visStart: 0.3,
      visEnd: 0.7,
    };
    const pipe = makePipeline("pipe-center", "Center Test", pipeGeo);
    const center = pipelineCenter(pipeGeo);

    // Pipeline position should be center of geometry
    expect(evo(pipe)).toBeCloseTo(center.evolution); // 0.5
    expect(vis(pipe)).toBeCloseTo(center.visibility); // 0.5

    // Position and geometry coexist
    expect(pipe.pipelineGeometry).toBeDefined();
    expect(pipe.pipelineGeometry!.evoStart).toBe(0.2);
    expect(pipe.pipelineGeometry!.evoEnd).toBe(0.8);
  });

  it("handles Feedback for the model pipeline with 3 sub-components", () => {
    const pipeGeo: PipelineGeometry = {
      evoStart: 0.279,
      evoEnd: 0.627,
      visStart: 0.565,
      visEnd: 0.605,
      handleEvolution: 0.591,
    };
    const pipe = makePipeline("pipe-fb", "Feedback for the model", pipeGeo);

    const rlhf = makeComp({
      id: "rlhf",
      label: "RLHF",
      evolution: 0.606,
      visibility: 0.589,
    });
    const usersFb = makeComp({
      id: "users-fb",
      label: "Users feedback",
      evolution: 0.281,
      visibility: 0.591,
    });
    const distil = makeComp({
      id: "distil",
      label: "Distillation",
      evolution: 0.454,
      visibility: 0.59,
    });

    const map: WardleyMap = {
      title: "Feedback Pipeline",
      components: [pipe, rlhf, usersFb, distil],
      relations: [],
    };

    const pipelines = resolvePipelines(map);
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].childIds).toHaveLength(3);
    expect(pipelines[0].childIds).toContain("rlhf");
    expect(pipelines[0].childIds).toContain("users-fb");
    expect(pipelines[0].childIds).toContain("distil");

    // Handle at right side of pipeline (0.591)
    expect(resolveHandleEvolution(pipelines[0].geometry)).toBe(0.591);

    // All sub-components should stay contained after clamping
    const result = applyPipelineContainment(map);
    for (const comp of result.components.filter((c) => c.type !== "pipeline")) {
      if (pipelines[0].childIds.includes(comp.id)) {
        expect(evo(comp)).toBeGreaterThanOrEqual(pipeGeo.evoStart);
        expect(evo(comp)).toBeLessThanOrEqual(pipeGeo.evoEnd);
        expect(vis(comp)).toBeGreaterThanOrEqual(pipeGeo.visStart);
        expect(vis(comp)).toBeLessThanOrEqual(pipeGeo.visEnd);
      }
    }
  });
});
