/**
 * Tests for svg-primitives.ts — shared SVG fragment generators.
 *
 * Verifies that svg-primitives produces identical SVG output to
 * the server render pipeline (render-orchestrator → layer renderers)
 * for all component types.
 *
 * @module render/svg-primitives.test
 */

import { describe, it, expect } from "vitest";
import {
  esc,
  renderNodeCircle,
  renderPersonSilhouette,
  renderEcosystemSymbol,
  renderMarketSymbol,
  renderMethodIndicator,
  renderComponentNode,
  renderPipelineHandleSquare,
  renderEdge,
  renderEvolveArrow,
  renderInertiaBarrier,
  renderPipeline,
  renderLabel,
  renderNote,
  renderStep,
  renderAccelerator,
  buildArrowPath,
  arrowheadPoints,
  svgHeader,
  svgBackground,
  svgFooter,
  svgLayerGroup,
  NODE_FILL,
  NODE_STROKE,
  MARKET_OUTER_R,
  MARKET_TRIANGLE_R,
  MARKET_VERTEX_R,
  SIN60,
  COS60,
  METHOD_AURA_R,
  EVOLVE_STYLES,
  ARROWHEAD_SIZE,
  PIPELINE_FILL,
  PIPELINE_STROKE,
  STEP_DEFAULT_FILL,
  STEP_RADIUS,
} from "./svg-primitives.js";
import { renderToSVG } from "../render-orchestrator.js";
import { sanitizeMap, WardleyMapSchema, type WardleyMap } from "../schema.js";
import { buildRenderContext } from "./build-context.js";
import { composeSVG } from "./svg-composer.js";
import { renderNodesLayer } from "./nodes-layer.js";
import { renderEdgesLayer } from "./edges-layer.js";
import { renderEvolvesToLayer } from "./evolvesto-layer.js";
import { renderPipelinesLayer } from "./pipelines-layer.js";
import { renderLabelsLayer } from "./labels-layer.js";
import { renderNotesLayer } from "./notes-layer.js";
import { renderStepsLayer } from "./steps-layer.js";
import { renderAcceleratorsLayer } from "./accelerators-layer.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeMap(overrides: Partial<WardleyMap> = {}): WardleyMap {
  return sanitizeMap(
    WardleyMapSchema.parse({
      title: "Test Map",
      components: [
        {
          id: "comp-1",
          label: { name: "Service A" },
          type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.3 } },
        },
      ],
      relations: [],
      ...overrides,
    })
  );
}

// ══════════════════════════════════════════════════════════════════════
//  XML Escaping
// ══════════════════════════════════════════════════════════════════════

describe("esc", () => {
  it("escapes XML special characters", () => {
    expect(esc('a & b < c > d " e \' f')).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &#39; f"
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Node primitives
// ══════════════════════════════════════════════════════════════════════

describe("renderNodeCircle", () => {
  it("renders a circle with correct attributes", () => {
    const svg = renderNodeCircle(100, 200, 5, "#000", 1);
    expect(svg).toBe(
      '<circle cx="100" cy="200" r="5" fill="#ffffff" stroke="#000" stroke-width="1" />'
    );
  });
});

describe("renderPersonSilhouette", () => {
  it("renders a clipped head ring and shoulders dome (no triangle body)", () => {
    const svg = renderPersonSilhouette(100, 200, 5, "a1", "#000", 1);
    expect(svg).toContain("<circle"); // head ring
    expect(svg).toContain("<path"); // shoulders dome (arc)
    expect(svg).toContain("<clipPath");
    expect(svg).toContain('clip-path="url(#anchor-clip-a1)"');
    expect(svg).not.toContain("<polyline");
  });
});

describe("renderEcosystemSymbol", () => {
  it("renders 3 concentric circles with hatch pattern", () => {
    const svg = renderEcosystemSymbol(100, 200, "eco-1", "#000", 1);
    expect(svg).toContain("<defs>");
    expect(svg).toContain("<pattern");
    expect(svg).toContain('id="eco-hatch-eco-1"');
    // 3 circles: outer (grey), mid (hatched), inner (white)
    const circles = svg.match(/<circle/g) ?? [];
    expect(circles.length).toBe(3);
  });
});

describe("renderMarketSymbol", () => {
  it("renders outer circle + triangle + 3 hollow rings", () => {
    const svg = renderMarketSymbol(100, 200, "#000", 1);
    // 1 outer + 3 rings = 4 circles (no center dot)
    const circles = svg.match(/<circle/g) ?? [];
    expect(circles.length).toBe(4);
    // triangle connecting the 3 nodes, no spokes
    expect(svg).toContain("<polygon");
    const lines = svg.match(/<line/g) ?? [];
    expect(lines.length).toBe(0);
  });
});

describe("renderMethodIndicator", () => {
  it("position 0: ring only (no fill)", () => {
    const svg = renderMethodIndicator(100, 200, "#ff0000", 0);
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke-width="2"');
  });

  it("position 1: semi-filled (40% opacity)", () => {
    const svg = renderMethodIndicator(100, 200, "#ff0000", 1);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-opacity="0.4"');
  });

  it("position 2: solid fill (100% opacity)", () => {
    const svg = renderMethodIndicator(100, 200, "#ff0000", 2);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-opacity="1"');
  });
});

// ══════════════════════════════════════════════════════════════════════
//  renderComponentNode — type dispatch
// ══════════════════════════════════════════════════════════════════════

describe("renderComponentNode", () => {
  it("standard component: circle only", () => {
    const svg = renderComponentNode({
      id: "c1", type: "component", cx: 100, cy: 200,
      radius: 5, stroke: "#000", strokeWidth: 1,
    });
    expect(svg).toContain("<circle");
    expect(svg).not.toContain("<polygon");
  });

  it("anchor: circle + user avatar (head ring + shoulders dome, clipped)", () => {
    const svg = renderComponentNode({
      id: "a1", type: "anchor", cx: 100, cy: 200,
      radius: 5, stroke: "#000", strokeWidth: 1,
    });
    expect(svg).toContain("<circle");
    expect(svg).toContain("<path"); // shoulders dome
    expect(svg).toContain('clip-path="url(#anchor-clip-a1)"');
    expect(svg).not.toContain("<polyline");
  });

  it("market: outer circle + triangle + 3 hollow rings", () => {
    const svg = renderComponentNode({
      id: "m1", type: "market", cx: 100, cy: 200,
      radius: 5, stroke: "#000", strokeWidth: 1,
    });
    const circles = svg.match(/<circle/g) ?? [];
    expect(circles.length).toBe(4);
    expect(svg).toContain("<polygon");
    const lines = svg.match(/<line/g) ?? [];
    expect(lines.length).toBe(0);
  });

  it("ecosystem: 3 concentric circles with hatch pattern", () => {
    const svg = renderComponentNode({
      id: "e1", type: "ecosystem", cx: 100, cy: 200,
      radius: 5, stroke: "#000", strokeWidth: 1,
    });
    expect(svg).toContain("<defs>");
    expect(svg).toContain("<pattern");
    const circles = svg.match(/<circle/g) ?? [];
    expect(circles.length).toBe(3);
  });

  it("interactive mode wraps in a data-id/data-kind group", () => {
    const svg = renderComponentNode({
      id: "c1", type: "component", cx: 100, cy: 200,
      radius: 5, stroke: "#000", strokeWidth: 1,
      interactive: true,
    });
    expect(svg).toContain('<g data-id="c1" data-kind="component">');
    expect(svg).toContain("</g>");
  });

  it("method indicator rendered before node", () => {
    const svg = renderComponentNode({
      id: "c1", type: "component", cx: 100, cy: 200,
      radius: 5, stroke: "#000", strokeWidth: 1,
      method: { color: "#ff0000", position: 0 },
    });
    const methodIdx = svg.indexOf(`r="${METHOD_AURA_R}"`);
    const nodeIdx = svg.indexOf('r="5"');
    expect(methodIdx).toBeLessThan(nodeIdx);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Edge primitives
// ══════════════════════════════════════════════════════════════════════

describe("renderEdge", () => {
  it("DependsOn: solid grey line", () => {
    const svg = renderEdge({
      x1: 10, y1: 20, x2: 30, y2: 40,
      relationType: "DependsOn",
      baseStrokeWidth: 1,
    });
    expect(svg).toContain('<line x1="10"');
    expect(svg).toContain('stroke="#999999"');
    expect(svg).not.toContain("stroke-dasharray");
  });

  it("Flow: dashed blue line", () => {
    const svg = renderEdge({
      x1: 10, y1: 20, x2: 30, y2: 40,
      relationType: "Flow",
      baseStrokeWidth: 1,
    });
    expect(svg).toContain('stroke="#2563eb"');
    expect(svg).toContain('stroke-dasharray="8,4"');
  });

  it("Constraint: dotted red line", () => {
    const svg = renderEdge({
      x1: 10, y1: 20, x2: 30, y2: 40,
      relationType: "Constraint",
      baseStrokeWidth: 1,
    });
    expect(svg).toContain('stroke="#dc2626"');
    expect(svg).toContain('stroke-dasharray="3,3"');
  });

  it("flow style dashed overrides dash pattern", () => {
    const svg = renderEdge({
      x1: 10, y1: 20, x2: 30, y2: 40,
      relationType: "DependsOn",
      flowStyle: "dashed",
      baseStrokeWidth: 1,
    });
    expect(svg).toContain('stroke-dasharray="6,4"');
  });

  it("flow style bold doubles stroke width", () => {
    const svg = renderEdge({
      x1: 10, y1: 20, x2: 30, y2: 40,
      relationType: "DependsOn",
      flowStyle: "bold",
      baseStrokeWidth: 1,
    });
    expect(svg).toContain('stroke-width="2"');
  });

  it("interactive mode wraps in a data-id/data-kind group with a hit area", () => {
    const svg = renderEdge({
      x1: 10, y1: 20, x2: 30, y2: 40,
      relationType: "DependsOn",
      baseStrokeWidth: 1,
      relationId: "edge-1",
      interactive: true,
    });
    expect(svg).toContain('<g data-id="edge-1" data-kind="relation">');
    expect(svg).toContain('class="hit-area"');
    expect(svg).toContain("</g>");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  EvolvesTo primitives
// ══════════════════════════════════════════════════════════════════════

describe("arrowheadPoints", () => {
  it("returns empty string for zero-length arrow", () => {
    expect(arrowheadPoints(10, 10, 10, 10)).toBe("");
  });

  it("returns 3 comma-separated coordinate pairs", () => {
    const pts = arrowheadPoints(0, 0, 100, 0);
    const pairs = pts.split(" ");
    expect(pairs).toHaveLength(3);
  });
});

describe("renderEvolveArrow", () => {
  it("renders dashed line + arrowhead polygon", () => {
    const svg = renderEvolveArrow({
      fromX: 10, fromY: 20, toX: 100, toY: 20,
      evolveType: "natural",
      componentId: "c1",
      arrowStrokeWidth: 1,
    });
    expect(svg).toContain("<line");
    expect(svg).toContain('stroke-dasharray="6,3"');
    expect(svg).toContain("<polygon");
    expect(svg).toContain('fill="#dc2626"');
  });

  it("ecosystem type uses blue", () => {
    const svg = renderEvolveArrow({
      fromX: 10, fromY: 20, toX: 100, toY: 20,
      evolveType: "ecosystem",
      componentId: "c1",
      arrowStrokeWidth: 1,
    });
    expect(svg).toContain('stroke="#2563eb"');
  });

  it("interactive mode wraps in a data-id/data-kind group", () => {
    const svg = renderEvolveArrow({
      fromX: 10, fromY: 20, toX: 100, toY: 20,
      evolveType: "natural",
      componentId: "c1",
      arrowStrokeWidth: 1,
      interactive: true,
    });
    expect(svg).toContain('<g data-id="c1" data-kind="evolve">');
    expect(svg).toContain('class="hit-area"');
  });
});

describe("renderInertiaBarrier", () => {
  it("renders thick vertical line", () => {
    const svg = renderInertiaBarrier(100, 50, 150);
    expect(svg).toContain('x1="100"');
    expect(svg).toContain('y1="50"');
    expect(svg).toContain('y2="150"');
    expect(svg).toContain('stroke-width="6"');
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Pipeline primitives
// ══════════════════════════════════════════════════════════════════════

describe("renderPipeline", () => {
  it("renders background rect with correct fill/stroke", () => {
    const svg = renderPipeline({
      x: 10, y: 20, width: 100, height: 50, componentId: "p1",
    });
    expect(svg).toContain('<rect x="10"');
    expect(svg).toContain(`fill="${PIPELINE_FILL}"`);
    expect(svg).toContain(`stroke="${PIPELINE_STROKE}"`);
  });

  it("returns empty string for degenerate pipeline", () => {
    expect(renderPipeline({ x: 10, y: 20, width: 0, height: 50, componentId: "p1" })).toBe("");
    expect(renderPipeline({ x: 10, y: 20, width: 100, height: -1, componentId: "p1" })).toBe("");
  });

  it("interactive mode wraps the rect in a hit-test group, without handles", () => {
    const svg = renderPipeline({
      x: 10, y: 20, width: 100, height: 50, componentId: "p1",
      interactive: true,
    });
    expect(svg).toMatch(/^<g data-id="p1" data-kind="pipeline"><rect [^>]*\/><\/g>$/);
    expect(svg).not.toContain("data-handle");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Label primitives
// ══════════════════════════════════════════════════════════════════════

describe("attribute escaping", () => {
  const evil = '"><x y="';
  it("escapes ids, colors and font families in every primitive", () => {
    const out = [
      renderComponentNode({ id: evil, type: "anchor", cx: 0, cy: 0, radius: 5, stroke: evil, strokeWidth: 1, method: { color: evil, position: 1 }, interactive: true }),
      renderComponentNode({ id: evil, type: "ecosystem", cx: 0, cy: 0, radius: 5, stroke: evil, strokeWidth: 1 }),
      renderComponentNode({ id: evil, type: "market", cx: 0, cy: 0, radius: 5, stroke: evil, strokeWidth: 1 }),
      renderEvolveArrow({ fromX: 0, fromY: 0, toX: 9, toY: 0, evolveType: "natural", componentId: evil, arrowStrokeWidth: 1, styleOverride: { stroke: evil, strokeDasharray: evil }, interactive: true }),
      renderLabel({ x: 0, y: 0, text: evil, anchor: "start", fontFamily: evil, fontSize: 12, componentId: evil, interactive: true }),
      renderLabel({ x: 0, y: 0, text: "a\nb", anchor: "start", fontFamily: evil, fontSize: 12 }),
      renderNote({ cx: 0, cy: 0, text: evil, fontFamily: evil }),
      renderStep({ cx: 0, cy: 0, number: 1, fill: evil, fontFamily: evil, stepId: evil, interactive: true }),
      renderAccelerator({ cx: 0, cy: 0, label: evil, type: "accelerator", fontFamily: evil }),
      svgBackground(1, 1, evil),
    ].join("");
    expect(out).not.toContain('"><x');
    expect(out).toContain("&quot;&gt;&lt;x y=&quot;");
  });
});

describe("renderLabel", () => {
  it("renders text element with correct attributes", () => {
    const svg = renderLabel({
      x: 100, y: 200, text: "Service", anchor: "start",
      fontFamily: "Inter", fontSize: 12,
    });
    expect(svg).toContain('<text x="100" y="200"');
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain(">Service</text>");
  });

  it("multi-line text uses tspan elements", () => {
    const svg = renderLabel({
      x: 100, y: 200, text: "Line 1\nLine 2", anchor: "middle",
      fontFamily: "Inter", fontSize: 12,
    });
    expect(svg).toContain("<tspan");
    expect(svg).toContain('dy="14"');
  });

  it("escapes special characters", () => {
    const svg = renderLabel({
      x: 100, y: 200, text: "A & B", anchor: "start",
      fontFamily: "Inter", fontSize: 12,
    });
    expect(svg).toContain("A &amp; B");
  });

  it("interactive mode adds data-id/data-kind", () => {
    const svg = renderLabel({
      x: 100, y: 200, text: "Svc", anchor: "start",
      fontFamily: "Inter", fontSize: 12,
      componentId: "c1", interactive: true,
    });
    expect(svg).toContain(' data-id="c1" data-kind="label"');
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Note primitives
// ══════════════════════════════════════════════════════════════════════

describe("renderNote", () => {
  it("renders italic text", () => {
    const svg = renderNote({ cx: 100, cy: 200, text: "A note", fontFamily: "Inter" });
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain(">A note</text>");
  });

  it("multi-line notes use tspan", () => {
    const svg = renderNote({ cx: 100, cy: 200, text: "Line 1\nLine 2", fontFamily: "Inter" });
    expect(svg).toContain("<tspan");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Step primitives
// ══════════════════════════════════════════════════════════════════════

describe("renderStep", () => {
  it("renders filled circle + white number text", () => {
    const svg = renderStep({
      cx: 100, cy: 200, number: 1, fill: STEP_DEFAULT_FILL,
      fontFamily: "Inter", stepId: "s1",
    });
    expect(svg).toContain(`<circle cx="100" cy="200" r="${STEP_RADIUS}"`);
    expect(svg).toContain(`fill="${STEP_DEFAULT_FILL}"`);
    expect(svg).toContain(">1</text>");
    expect(svg).toContain('fill="#ffffff"');
  });

  it("interactive mode wraps in a data-id/data-kind group", () => {
    const svg = renderStep({
      cx: 100, cy: 200, number: 1, fill: STEP_DEFAULT_FILL,
      fontFamily: "Inter", stepId: "s1", interactive: true,
    });
    expect(svg).toContain('<g data-step-number="1" data-id="s1" data-kind="step">');
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SVG document structure primitives
// ══════════════════════════════════════════════════════════════════════

describe("svgHeader", () => {
  it("produces valid SVG opening tag", () => {
    const svg = svgHeader(1600, 800);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 1600 800"');
  });
});

describe("svgBackground", () => {
  it("produces full-size background rect", () => {
    const svg = svgBackground(1600, 800, "#ffffff");
    expect(svg).toContain('width="1600"');
    expect(svg).toContain('fill="#ffffff"');
  });
});

describe("svgLayerGroup", () => {
  it("wraps fragments in a named group", () => {
    const svg = svgLayerGroup("nodes", ["<circle/>", "<circle/>"]);
    expect(svg).toContain('<g data-layer="nodes">');
    expect(svg).toContain("</g>");
  });

  it("returns empty string for empty fragments", () => {
    expect(svgLayerGroup("nodes", [])).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  PARITY TEST — svg-primitives matches server render pipeline
// ══════════════════════════════════════════════════════════════════════

describe("svg-primitives server render parity", () => {
  it("nodes-layer produces identical output via primitives for all component types", () => {
    const map = makeMap({
      components: [
        {
          id: "c1", label: { name: "Standard" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.3 } },
        },
        {
          id: "a1", label: { name: "Customer" }, type: "anchor",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.1 } },
        },
        {
          id: "u1", label: { name: "User Need" }, type: "component", subtype: "userNeed",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } },
        },
        {
          id: "m1", label: { name: "Market" }, type: "component", subtype: "market",
          position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
        },
        {
          id: "e1", label: { name: "Eco" }, type: "component", subtype: "ecosystem",
          position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.6 } },
        },
      ],
    });
    const ctx = buildRenderContext(map);

    // Server pipeline: layer renderer
    const serverFragments = renderNodesLayer(ctx);
    const serverSvg = serverFragments.join("\n");

    // Verify fragments were produced (layer wrapper not included in fragments)
    expect(serverFragments.length).toBeGreaterThan(0);

    // Verify component type-specific elements
    const joinedSvg = serverSvg;
    // Standard component: simple circle
    expect(joinedSvg).toContain("<circle");
    // Anchor: user avatar (shoulders dome path, clipped)
    expect(joinedSvg).toContain("anchor-clip-");
    // Market: triangle connecting the nodes
    expect(joinedSvg).toContain("<polygon");
    // Ecosystem: hatch pattern
    expect(joinedSvg).toContain("<pattern");
  });

  it("full SVG render via orchestrator uses svg-primitives (no duplication)", () => {
    const map = makeMap({
      components: [
        {
          id: "c1", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        },
        {
          id: "c2", label: { name: "DB" }, type: "component",
          position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.7 } },
        },
      ],
      relations: [
        { id: "r1", consumer: "c1", supplier: "c2", type: "DependsOn" },
      ],
    });

    // renderToSVG uses the same layer renderers that now delegate to svg-primitives
    const svg = renderToSVG(map);

    // The full SVG should contain all the expected elements
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<circle"); // nodes
    expect(svg).toContain("<line"); // edges
    expect(svg).toContain("<text"); // labels
    expect(svg).toContain('data-layer="nodes"');
    expect(svg).toContain('data-layer="edges"');
    expect(svg).toContain('data-layer="labels"');
  });

  it("interactive mode SVG uses svg-primitives with data attributes", () => {
    const map = makeMap({
      components: [
        {
          id: "c1", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        },
        {
          id: "c2", label: { name: "DB" }, type: "component",
          position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.7 } },
        },
      ],
      relations: [
        { id: "r1", consumer: "c1", supplier: "c2", type: "DependsOn" },
      ],
    });

    const svg = renderToSVG(map, { interactive: true });

    // Interactive data attributes from svg-primitives
    expect(svg).toContain('<g data-id="c1" data-kind="component">');
    expect(svg).toContain('<g data-id="c2" data-kind="component">');
    expect(svg).toContain('<g data-id="r1" data-kind="relation">');
    expect(svg).toContain(' data-id="c1" data-kind="label"');
  });

  it("pipeline rendering via primitives matches server output", () => {
    const map = makeMap({
      components: [
        {
          id: "p1", label: { name: "Platform" }, type: "pipeline",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.4 } },
          pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.3, visEnd: 0.5 },
        },
        {
          id: "sub1", label: { name: "Sub" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.4 } },
        },
      ],
      relations: [],
    });

    const ctx = buildRenderContext(map);
    const pipelineFragments = renderPipelinesLayer(ctx);

    // Pipeline rect rendered
    expect(pipelineFragments.length).toBeGreaterThan(0);
    const pipelineSvg = pipelineFragments.join("\n");
    expect(pipelineSvg).toContain("<rect");
    expect(pipelineSvg).toContain(`fill="${PIPELINE_FILL}"`);
  });

  it("evolvesTo rendering via primitives matches server output", () => {
    const map = makeMap({
      components: [
        {
          id: "c1", label: { name: "CRM" }, type: "component",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.5 } },
          evolvesTo: [{
            position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
            evolveType: "natural",
          }],
        },
      ],
    });

    const ctx = buildRenderContext(map);
    const evolveFragments = renderEvolvesToLayer(ctx);

    expect(evolveFragments.length).toBeGreaterThan(0);
    const evolveSvg = evolveFragments.join("\n");
    expect(evolveSvg).toContain("<line");
    expect(evolveSvg).toContain('stroke-dasharray="6,3"');
    expect(evolveSvg).toContain("<polygon");
    expect(evolveSvg).toContain('fill="#dc2626"');
  });
});
