/**
 * Smoke test for computeGeometry (Phase 1).
 * Run: pnpm tsx src/test-compute-geometry.ts
 */
import { computeGeometry } from "./render.js";
import { WardleyMapSchema } from "./schema.js";

// ── Basic map with 3 components and 2 relations ──────────────────
const map = WardleyMapSchema.parse({
  title: "Test Map",
  components: [
    { id: "c1", label: "User", type: "user-need", evolution: 0.9, visibility: 0.1 },
    { id: "c2", label: "Platform", type: "component", evolution: 0.5, visibility: 0.5 },
    { id: "c3", label: "Infra", type: "component", evolution: 0.8, visibility: 0.8 },
  ],
  relations: [
    { source: "c1", target: "c2" },
    { source: "c2", target: "c3" },
  ],
});

const geo = computeGeometry(map);

// ── Assertions ────────────────────────────────────────────────────
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

console.log("=== computeGeometry smoke tests ===\n");

// Canvas dimensions from default gridSize
assert(geo.ctx.width === 1600, "canvas width = 1600");
assert(geo.ctx.height === 800, "canvas height = 800 (from gridSize default)");

// Plot bounds with fixed margins
assert(geo.ctx.plotLeft === 48, "plotLeft = 48 (AXIS_MARGIN_LEFT)");
assert(geo.ctx.plotTop === 24, "plotTop = 24 (AXIS_MARGIN_TOP)");
assert(geo.ctx.plotRight === 1580, "plotRight = 1580 (width - 20)");
assert(geo.ctx.plotBottom === 752, "plotBottom = 752 (height - 48)");
assert(geo.ctx.plotWidth === 1532, "plotWidth = 1532");
assert(geo.ctx.plotHeight === 728, "plotHeight = 728");

// Title
assert(geo.title === "Test Map", "title text preserved");

// Axes visibility defaults
assert(geo.showValueChainAxis === true, "showValueChainAxis defaults to true");
assert(geo.showEvolutionAxis === true, "showEvolutionAxis defaults to true");

// Nodes (3 components, none are pipelines → 3 nodes)
assert(geo.nodes.length === 3, "3 non-pipeline nodes");

// Check node positions (evo * plotWidth + plotLeft, vis * plotHeight + plotTop)
const userNode = geo.nodes.find((n) => n.id === "c1");
assert(userNode !== undefined, "User node found");
const expectedCx = 48 + 0.9 * 1532;  // plotLeft + evo * plotWidth
const expectedCy = 24 + 0.1 * 728;   // plotTop + vis * plotHeight
assert(Math.abs(userNode!.cx - expectedCx) < 0.01, `User cx = ${expectedCx}`);
assert(Math.abs(userNode!.cy - expectedCy) < 0.01, `User cy = ${expectedCy}`);

// Edges
assert(geo.edges.length === 2, "2 edge segments");
assert(geo.edgeSegmentsForCollision.length === 2, "2 collision edge segments");

// Labels (initial, before collision avoidance)
assert(geo.initialLabels.length === 3, "3 initial labels");

// Evolution arrows (none in this map)
assert(geo.evolveArrows.length === 0, "0 evolution arrows (no evolvesTo)");

// Pipelines (none in this map)
assert(geo.pipelines.length === 0, "0 pipelines");

// ── Map with pipeline ──────────────────────────────────────────────
console.log("\n=== Pipeline geometry test ===\n");

const pipelineMap = WardleyMapSchema.parse({
  title: "Pipeline Test",
  components: [
    {
      id: "p1",
      label: "Data Pipeline",
      type: "pipeline",
      evolution: 0.5,
      visibility: 0.5,
      pipelineGeometry: {
        evoStart: 0.3,
        evoEnd: 0.7,
        visStart: 0.4,
        visEnd: 0.6,
      },
    },
    { id: "c1", label: "Database", type: "component", evolution: 0.4, visibility: 0.5 },
    { id: "c2", label: "Cache", type: "component", evolution: 0.6, visibility: 0.5 },
  ],
  relations: [{ source: "c1", target: "c2" }],
});

const pGeo = computeGeometry(pipelineMap);
assert(pGeo.pipelines.length === 1, "1 pipeline rectangle");
assert(pGeo.nodes.length === 2, "2 non-pipeline nodes (pipeline excluded)");
assert(pGeo.pipelines[0].label === "Data Pipeline", "pipeline label correct");

// ── Map with evolvesTo ─────────────────────────────────────────────
console.log("\n=== EvolvesTo geometry test ===\n");

const evolveMap = WardleyMapSchema.parse({
  title: "Evolve Test",
  components: [
    {
      id: "c1",
      label: "Custom CRM",
      type: "component",
      evolution: 0.3,
      visibility: 0.5,
      evolvesTo: [
        { evolution: 0.7, visibility: 0.5, evolveType: "natural" },
        { evolution: 0.9, visibility: 0.4, evolveType: "forced" },
      ],
    },
  ],
  relations: [],
});

const eGeo = computeGeometry(evolveMap);
assert(eGeo.evolveArrows.length === 2, "2 evolution arrows");
assert(eGeo.evolveArrows[0].evolveType === "natural", "first arrow is natural");
assert(eGeo.evolveArrows[1].evolveType === "forced", "second arrow is forced");

// ── Map with axes disabled ─────────────────────────────────────────
console.log("\n=== Axes visibility test ===\n");

const noAxesMap = WardleyMapSchema.parse({
  title: "No Axes",
  components: [
    { id: "c1", label: "A", type: "component", evolution: 0.5, visibility: 0.5 },
  ],
  relations: [],
  axes: { valueChain: false, evolution: false },
});

const naGeo = computeGeometry(noAxesMap);
assert(naGeo.showValueChainAxis === false, "valueChain axis disabled");
assert(naGeo.showEvolutionAxis === false, "evolution axis disabled");

console.log("\n=== All tests passed! ===");
