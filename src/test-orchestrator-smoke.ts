/**
 * Smoke test for the render orchestrator (modular pipeline).
 * Validates: render(), renderToSVG(), renderToPNG(), computeMapGeometry()
 */
import { render, renderToSVG, renderToPNG, computeMapGeometry } from "./render-orchestrator.js";
import { WardleyMapSchema } from "./schema.js";

const testMap = WardleyMapSchema.parse({
  title: "Test Map",
  components: [
    { id: "user", label: "User", type: "user-need", evolution: 0.5, visibility: 0.9 },
    { id: "web", label: "Web App", type: "component", evolution: 0.6, visibility: 0.6 },
    { id: "db", label: "Database", type: "component", evolution: 0.8, visibility: 0.3 },
  ],
  relations: [
    { source: "user", target: "web" },
    { source: "web", target: "db" },
  ],
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

console.log("=== renderToSVG (synchronous) ===");
const svg = renderToSVG(testMap);
assert(svg.includes("<svg"), "SVG has <svg> tag");
assert(svg.includes("Test Map"), "SVG contains title");
assert((svg.match(/<circle/g) || []).length === 3, "SVG has 3 circles (nodes)");
assert((svg.match(/<line /g) || []).length >= 2, "SVG has at least 2 lines (edges)");
assert(svg.includes("Evolution"), "SVG has Evolution axis label");
assert(svg.includes("Value Chain"), "SVG has Value Chain axis label");

console.log("\n=== computeMapGeometry (Phase 1 only) ===");
const ctx = computeMapGeometry(testMap);
assert(ctx.nodes.length === 3, "3 nodes computed");
assert(ctx.edges.length === 2, "2 edges computed");
assert(ctx.pipelines.length === 0, "0 pipelines (none in test map)");
assert(ctx.canvasWidth === 1600, "Canvas width from default gridSize");
assert(ctx.canvasHeight === 800, "Canvas height from default gridSize");
assert(ctx.plot.left > 0, "Plot has left margin");
assert(ctx.plot.top > 0, "Plot has top margin");

console.log("\n=== render() async (SVG format) ===");
const svgResult = await render(testMap);
assert(svgResult.format === "svg", "Format is svg");
assert(svgResult.contentType === "image/svg+xml", "Content-type is svg");
assert(typeof svgResult.data === "string", "Data is string");
assert(svgResult.context.nodes.length === 3, "Context attached with 3 nodes");

console.log("\n=== render() async (PNG format) ===");
const pngResult = await render(testMap, { format: "png" });
assert(pngResult.format === "png", "Format is png");
assert(pngResult.contentType === "image/png", "Content-type is png");
assert(Buffer.isBuffer(pngResult.data), "Data is Buffer");
assert((pngResult.data as Buffer).length > 1000, "PNG has substantial size");

console.log("\n=== renderToPNG ===");
const pngBuf = await renderToPNG(testMap);
assert(Buffer.isBuffer(pngBuf), "Returns Buffer");
assert(pngBuf.length > 1000, "PNG has substantial size");

console.log("\n=== Pipeline support ===");
const pipelineMap = WardleyMapSchema.parse({
  title: "Pipeline Test",
  components: [
    { id: "user", label: "User", type: "user-need", evolution: 0.5, visibility: 0.9 },
    {
      id: "pipe", label: "Platform", type: "pipeline",
      evolution: 0.5, visibility: 0.5,
      pipelineGeometry: { evoStart: 0.3, evoEnd: 0.8, visStart: 0.4, visEnd: 0.6 },
    },
    { id: "svc", label: "Service", type: "component", evolution: 0.5, visibility: 0.5 },
  ],
  relations: [
    { source: "user", target: "svc" },
  ],
});
const pipeCtx = computeMapGeometry(pipelineMap);
assert(pipeCtx.pipelines.length === 1, "1 pipeline detected");

console.log("\n=== preSanitized option ===");
const preSanResult = await render(testMap, { preSanitized: true });
assert(preSanResult.format === "svg", "preSanitized render works");
assert((preSanResult.data as string).includes("<svg"), "preSanitized SVG valid");

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
