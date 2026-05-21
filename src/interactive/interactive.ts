/**
 * Interactive client-side entry point for the Wardley Map HTML artifact.
 *
 * This file is bundled by esbuild into a single self-contained IIFE that gets
 * inlined into the static template.html via the {{BUNDLE_SCRIPT}} placeholder.
 *
 * It reads the embedded JSON data blocks (#wardley-data, #render-constants,
 * #render-config) and bootstraps all interactive behaviors: drag-and-drop,
 * selection, inline rename, context zone, diff operation buffer, undo, etc.
 *
 * On initial page load, it renders the full SVG client-side from the embedded
 * JSON using shared svg-primitives.ts — ensuring zero renderer drift between
 * server PNG pipeline and client HTML artifact.
 *
 * @module interactive/interactive
 */

import {
  esc,
  renderComponentNode,
  renderEdge,
  renderEvolveArrow,
  renderLabel,
  renderPipeline,
  renderStep,
  renderNote,
  renderAccelerator,
  renderPipelineHandleSquare,
  renderInertiaBarrier,
  svgHeader,
  svgBackground,
  svgPlotArea,
  svgFooter,
  svgLayerGroup,
  COMPONENT_LABEL_BASE_FONT_SIZE,
  type NodeRenderInput,
  type EdgeRenderInput,
  type EvolveRenderInput,
  type LabelRenderInput,
  type PipelineRenderInput,
  type StepRenderInput,
} from "../render/svg-primitives.js";

// ── Types (inlined to avoid importing server-only modules) ──────────

/**
 * Minimal WardleyMap model shape — matches schema.ts WardleyMap.
 * Uses the real schema field names (source/target, nested position).
 */
interface WardleyMap {
  readonly id?: string;
  readonly title?: string;
  readonly components: Component[];
  readonly relations: Relation[];
  readonly steps?: Step[];
  readonly renderConfig?: Record<string, unknown>;
}

interface Component {
  id: string;
  label: { name: string; position?: { dx: number; dy: number } };
  type: string;
  nature: string;
  position: {
    evolution: { scalar: number; range?: { min: number; max: number } };
    visibility: { scalar: number };
  };
  description?: string;
  evolvesTo?: EvolvesTo[];
  pipelineGeometry?: PipelineGeometry;
  color?: string;
  method?: { type: string; preconisation: string };
}

interface EvolvesTo {
  position: {
    evolution: { scalar: number };
    visibility: { scalar: number };
  };
  evolveType: string;
  inertia?: boolean;
}

interface PipelineGeometry {
  evoStart: number;
  evoEnd: number;
  visStart: number;
  visEnd: number;
  handleEvolution?: number;
}

interface Relation {
  id: string;
  consumer: string;
  supplier: string;
  type?: string;
  flow?: { label: string; style?: string };
}

interface Step {
  id: string;
  componentId: string;
  number: number;
  label: string;
}

interface RenderConstants {
  canvasWidth: number;
  canvasHeight: number;
  margins: { top: number; right: number; bottom: number; left: number };
  plot: { left: number; top: number; width: number; height: number };
  evolutionBoundaries: number[];
  nodeRadii: Record<string, number>;
  labelScale: number;
  pipelineEpsilon: number;
}

/** Serialized subset of ResolvedRenderConfig embedded in the HTML artifact */
interface EmbeddedRenderConfig {
  background: { color: string };
  strokeWidth: number;
  typography: { fontFamily: string; labelScale: number };
  nodeRadii: Record<string, number>;
  typeColors: Record<string, string | undefined>;
  evolveStyles: Record<string, { stroke?: string; strokeDasharray?: string } | undefined>;
  excludeComponentTypes: string[];
  showEvolutionXAxis: boolean;
  showValueChainYAxis: boolean;
  showPhaseDividerAndLabel: boolean;
  axisLabels?: {
    xAxis: string;
    yAxis: string;
    phases: string[];
    evolutionStart: string;
    evolutionEnd: string;
    visibilityHigh: string;
    visibilityLow: string;
  };
  methods?: Array<{
    type: string;
    color: string;
    legend: Record<string, string>;
  }>;
}

// ── Accessor helpers (mirror schema.ts evo/vis) ──────────────────────

function evo(c: Component): number { return c.position.evolution.scalar; }
function vis(c: Component): number { return c.position.visibility.scalar; }
function evoTarget(e: EvolvesTo): number { return e.position.evolution.scalar; }
function visTarget(e: EvolvesTo): number { return e.position.visibility.scalar; }

// ── Geometry types ───────────────────────────────────────────────────

interface NodeGeo {
  id: string;
  cx: number;
  cy: number;
  comp: Component;
}

interface EdgeGeo {
  x1: number; y1: number;
  x2: number; y2: number;
  relation: Relation;
}

interface EvolveGeo {
  fromX: number; fromY: number;
  toX: number; toY: number;
  evolveType: string;
  comp: Component;
  inertia?: boolean;
}

interface PipelineGeo {
  x: number; y: number;
  width: number; height: number;
  handleX: number; handleY: number;
  comp: Component;
}

// ── Color resolution (simplified client-side version) ────────────────

const COLOR_MAP: Record<string, string> = {
  "red-600": "#dc2626", "blue-600": "#2563eb", "green-600": "#16a34a",
  "yellow-600": "#ca8a04", "purple-600": "#9333ea", "pink-600": "#db2777",
  "indigo-600": "#4f46e5", "gray-600": "#4b5563", "orange-600": "#ea580c",
  "teal-600": "#0d9488", "cyan-600": "#0891b2",
};

function resolveColor(color: string | undefined): string {
  if (!color) return "#000000";
  if (color.startsWith("#")) return color;
  return COLOR_MAP[color] ?? "#000000";
}

// ── Bootstrap ───────────────────────────────────────────────────────

(function () {
  "use strict";

  // ── Parse embedded data blocks ──────────────────────────────────
  const dataEl = document.getElementById("wardley-data");
  const constsEl = document.getElementById("render-constants");
  const configEl = document.getElementById("render-config");

  const mapModel: WardleyMap | null = dataEl
    ? JSON.parse(dataEl.textContent ?? "{}")
    : null;
  const renderConstants: RenderConstants | null = constsEl
    ? JSON.parse(constsEl.textContent ?? "{}")
    : null;
  const renderConfig: EmbeddedRenderConfig | null = configEl
    ? JSON.parse(configEl.textContent ?? "{}")
    : null;

  if (!mapModel || !renderConstants) return;

  // Non-null aliases for use inside closures (TS doesn't narrow across function boundaries)
  const model = mapModel as WardleyMap;

  // ── Initial snapshot for Reset ──────────────────────────────────
  const initialSnapshot: WardleyMap = JSON.parse(JSON.stringify(model));

  // ── Coordinate conversion ─────────────────────────────────────
  const K = renderConstants;
  const plot = K.plot;

  function evoToX(evolution: number): number {
    return plot.left + evolution * plot.width;
  }

  function visToY(visibility: number): number {
    return plot.top + visibility * plot.height;
  }

  // ── Geometry computation (client-side Phase 1) ─────────────────

  function computeGeometry(map: WardleyMap): {
    nodes: NodeGeo[];
    edges: EdgeGeo[];
    evolves: EvolveGeo[];
    pipelines: PipelineGeo[];
  } {
    // 1. Resolve pipelines
    const pipelines: PipelineGeo[] = [];
    const pipelineHandleMap = new Map<string, PipelineGeo>();

    for (const comp of map.components) {
      if (comp.type !== "pipeline" || !comp.pipelineGeometry) continue;
      const geo = comp.pipelineGeometry;
      const x1 = evoToX(geo.evoStart);
      const x2 = evoToX(geo.evoEnd);
      const y1 = visToY(geo.visStart);
      const y2 = visToY(geo.visEnd);
      const handleEvo = geo.handleEvolution ?? (geo.evoStart + geo.evoEnd) / 2;
      const pg: PipelineGeo = {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        handleX: evoToX(handleEvo),
        handleY: Math.min(y1, y2),
        comp,
      };
      pipelines.push(pg);
      pipelineHandleMap.set(comp.id, pg);
    }

    // 2. Node positions — pipeline components use handle position
    const nodes: NodeGeo[] = map.components.map((comp) => {
      const pl = pipelineHandleMap.get(comp.id);
      if (pl) {
        return { id: comp.id, cx: pl.handleX, cy: pl.handleY, comp };
      }
      return {
        id: comp.id,
        cx: evoToX(evo(comp)),
        cy: visToY(vis(comp)),
        comp,
      };
    });

    // 3. Node lookup for edge resolution
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // 4. Edges
    const edges: EdgeGeo[] = [];
    for (const rel of map.relations) {
      const src = nodeById.get(rel.consumer);
      const tgt = nodeById.get(rel.supplier);
      if (!src || !tgt) continue;
      edges.push({
        x1: src.cx, y1: src.cy,
        x2: tgt.cx, y2: tgt.cy,
        relation: rel,
      });
    }

    // 5. EvolvesTo arrows
    const evolves: EvolveGeo[] = [];
    for (const comp of map.components) {
      if (!comp.evolvesTo || comp.evolvesTo.length === 0) continue;
      const fromX = evoToX(evo(comp));
      const fromY = visToY(vis(comp));
      for (const e of comp.evolvesTo) {
        evolves.push({
          fromX, fromY,
          toX: evoToX(evoTarget(e)),
          toY: visToY(visTarget(e)),
          evolveType: e.evolveType ?? "natural",
          comp,
          inertia: e.inertia,
        });
      }
    }

    return { nodes, edges, evolves, pipelines };
  }

  // ── Full SVG render from model ─────────────────────────────────

  /** Component types that render as a circle node */
  const NODE_TYPES = new Set(["component", "user-need", "anchor", "ecosystem", "market"]);
  /** Component types that get a text label */
  const LABEL_TYPES = new Set(["component", "user-need", "anchor", "pipeline", "market", "ecosystem"]);
  const NODE_RADIUS_DEFAULT = 5;

  function resolveNodeRadius(type: string): number {
    const radii = renderConfig?.nodeRadii ?? K.nodeRadii;
    return radii[type] ?? radii._default ?? NODE_RADIUS_DEFAULT;
  }

  /**
   * Render the full SVG from the model using shared svg-primitives.
   * Produces output identical to the server-side composeSVG pipeline.
   */
  function renderFullSVG(map: WardleyMap): string {
    const cfg = renderConfig;
    const bgColor = cfg?.background?.color ?? "#ffffff";
    const strokeWidth = cfg?.strokeWidth ?? 1;
    const fontFamily = cfg?.typography?.fontFamily ?? "Inter, sans-serif";
    const labelScale = cfg?.typography?.labelScale ?? K.labelScale ?? 1;
    const fontSize = Math.round(COMPONENT_LABEL_BASE_FONT_SIZE * labelScale);
    const typeColors = cfg?.typeColors ?? {};
    const evolveStyles = cfg?.evolveStyles ?? {};
    const excluded = new Set(cfg?.excludeComponentTypes ?? []);
    const methods = cfg?.methods ?? [];

    const { nodes, edges, evolves, pipelines } = computeGeometry(map);

    const parts: string[] = [];

    // SVG header + background
    parts.push(svgHeader(K.canvasWidth, K.canvasHeight));
    parts.push(svgBackground(K.canvasWidth, K.canvasHeight, bgColor));

    // Interactive plot-area rect for coordinate conversion
    parts.push(svgPlotArea(plot.left, plot.top, plot.width, plot.height));

    // ── Layer: axes (phase dividers, axis arrows, labels) ─────
    {
      const axParts: string[] = [];
      const showEvo = cfg?.showEvolutionXAxis !== false;
      const showVC = cfg?.showValueChainYAxis !== false;
      const showPhase = cfg?.showPhaseDividerAndLabel !== false;
      const labels = cfg?.axisLabels ?? {
        xAxis: "Evolution", yAxis: "Value Chain",
        phases: ["Genesis", "Custom Built", "Product (+rental)", "Commodity (+utility)"],
        evolutionStart: "Uncharted", evolutionEnd: "Industrialised",
        visibilityHigh: "Visible", visibilityLow: "Invisible",
      };
      const AXIS_COLOR = "#374151";
      const DIVIDER_COLOR = "#d1d5db";
      const LABEL_COLOR = "#6b7280";
      const plotRight = plot.left + plot.width;
      const plotBottom = plot.top + plot.height;

      // Arrowhead marker
      axParts.push(
        `<defs><marker id="axis-arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">` +
        `<path d="M0,0 L10,5 L0,10 Z" fill="${AXIS_COLOR}" /></marker></defs>`
      );

      // X-axis arrow
      if (showEvo) {
        axParts.push(`<line x1="${plot.left}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="${AXIS_COLOR}" stroke-width="1.5" marker-end="url(#axis-arrow)" />`);
      }
      // Y-axis arrow
      if (showVC) {
        axParts.push(`<line x1="${plot.left}" y1="${plotBottom}" x2="${plot.left}" y2="${plot.top}" stroke="${AXIS_COLOR}" stroke-width="1.5" marker-end="url(#axis-arrow)" />`);
      }
      // Phase dividers
      if (showPhase) {
        const boundaries = K.evolutionBoundaries || [0.17, 0.37, 0.7];
        for (const ratio of boundaries) {
          const x = evoToX(ratio);
          axParts.push(`<line x1="${x}" y1="${plot.top}" x2="${x}" y2="${plotBottom}" stroke="${DIVIDER_COLOR}" stroke-width="1" stroke-dasharray="4,4" />`);
        }
      }
      // Phase labels
      if (showPhase && labels.phases) {
        const boundaries = [0, ...(K.evolutionBoundaries || [0.17, 0.37, 0.7])];
        for (let i = 0; i < labels.phases.length && i < boundaries.length; i++) {
          const lx = evoToX(boundaries[i]) + 4;
          axParts.push(`<text x="${lx}" y="${plotBottom + 16}" text-anchor="start" font-family="Inter, sans-serif" font-size="10" fill="${LABEL_COLOR}">${esc(labels.phases[i])}</text>`);
        }
      }
      // X-axis label
      if (showEvo) {
        axParts.push(`<text x="${plotRight - 16}" y="${plotBottom + 16}" text-anchor="end" font-family="Inter, sans-serif" font-size="11" fill="${AXIS_COLOR}">${esc(labels.xAxis)}</text>`);
      }
      // Evolution direction indicators
      if (showEvo) {
        axParts.push(`<text x="${plot.left + 12}" y="${plot.top + 14}" font-family="Inter, sans-serif" font-size="9" fill="${LABEL_COLOR}">${esc(labels.evolutionStart)}</text>`);
        axParts.push(`<text x="${plotRight - 4}" y="${plot.top + 14}" text-anchor="end" font-family="Inter, sans-serif" font-size="9" fill="${LABEL_COLOR}">${esc(labels.evolutionEnd)}</text>`);
      }
      // Y-axis label (rotated)
      if (showVC) {
        const yCenter = plot.top + plot.height / 2;
        const labelX = plot.left - 8;
        axParts.push(`<text x="${labelX}" y="${yCenter}" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="${AXIS_COLOR}" transform="rotate(-90, ${labelX}, ${yCenter})">${esc(labels.yAxis)}</text>`);
      }
      // Visibility direction indicators (rotated)
      if (showVC) {
        const visX = plot.left - 6;
        const visTopY = plot.top + 40;
        axParts.push(`<text x="${visX}" y="${visTopY}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="${LABEL_COLOR}" transform="rotate(-90, ${visX}, ${visTopY})">${esc(labels.visibilityHigh)}</text>`);
        const visBotY = plotBottom - 30;
        axParts.push(`<text x="${visX}" y="${visBotY}" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="${LABEL_COLOR}" transform="rotate(-90, ${visX}, ${visBotY})">${esc(labels.visibilityLow)}</text>`);
      }
      if (axParts.length > 0) {
        parts.push(svgLayerGroup("axes", axParts));
      }
    }

    // ── Layer: pipelines ──────────────────────────────────────
    if (!excluded.has("pipeline")) {
      const pipelineFrags: string[] = [];
      for (const p of pipelines) {
        const svg = renderPipeline({
          x: p.x, y: p.y,
          width: p.width, height: p.height,
          componentId: p.comp.id,
          interactive: true,
        });
        if (svg) pipelineFrags.push(svg);
      }
      if (pipelineFrags.length > 0) {
        parts.push(svgLayerGroup("pipelines", pipelineFrags));
      }
    }

    // ── Layer: edges ──────────────────────────────────────────
    {
      const edgeFrags: string[] = [];
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const srcComp = nodeById.get(edge.relation.consumer)?.comp;
        const tgtComp = nodeById.get(edge.relation.supplier)?.comp;
        if (srcComp && excluded.has(srcComp.type)) continue;
        if (tgtComp && excluded.has(tgtComp.type)) continue;
        edgeFrags.push(renderEdge({
          x1: edge.x1, y1: edge.y1,
          x2: edge.x2, y2: edge.y2,
          relationType: edge.relation.type ?? "DependsOn",
          flowStyle: (edge.relation.flow?.style as "solid" | "dashed" | "bold" | undefined) ?? "solid",
          baseStrokeWidth: strokeWidth,
          relationId: edge.relation.id,
          interactive: true,
        }));
      }
      if (edgeFrags.length > 0) {
        parts.push(svgLayerGroup("edges", edgeFrags));
      }
    }

    // ── Layer: evolvesTo ──────────────────────────────────────
    {
      const evolveFrags: string[] = [];
      for (const ev of evolves) {
        const configDefault = evolveStyles._default as { stroke?: string; strokeDasharray?: string } | undefined;
        const override = evolveStyles[ev.evolveType as keyof typeof evolveStyles] as { stroke?: string; strokeDasharray?: string } | undefined;
        evolveFrags.push(renderEvolveArrow({
          fromX: ev.fromX, fromY: ev.fromY,
          toX: ev.toX, toY: ev.toY,
          evolveType: ev.evolveType,
          componentId: ev.comp.id,
          arrowStrokeWidth: strokeWidth,
          styleOverride: override,
          styleDefault: configDefault,
          interactive: true,
        }));
      }
      // Inertia barriers
      const INERTIA_HALF_HEIGHT = 15;
      for (const ev of evolves) {
        if (!ev.inertia) continue;
        const fromEvo = evo(ev.comp);
        const evolvesArr = ev.comp.evolvesTo ?? [];
        const matchedTarget = evolvesArr.find(
          (e) => evoToX(evoTarget(e)) === ev.toX && visToY(visTarget(e)) === ev.toY
        );
        if (!matchedTarget) continue;
        const toEvo = evoTarget(matchedTarget);
        const minEvo = Math.min(fromEvo, toEvo);
        const maxEvo = Math.max(fromEvo, toEvo);
        for (const boundary of K.evolutionBoundaries) {
          if (boundary > minEvo && boundary < maxEvo) {
            const bx = evoToX(boundary);
            const t = (boundary - fromEvo) / (toEvo - fromEvo);
            const yAtBoundary = ev.fromY + t * (ev.toY - ev.fromY);
            evolveFrags.push(renderInertiaBarrier(bx, yAtBoundary - INERTIA_HALF_HEIGHT, yAtBoundary + INERTIA_HALF_HEIGHT));
          }
        }
      }
      if (evolveFrags.length > 0) {
        parts.push(svgLayerGroup("evolvesTo", evolveFrags));
      }
    }

    // ── Layer: nodes ──────────────────────────────────────────
    {
      const nodeFrags: string[] = [];
      for (const node of nodes) {
        const comp = node.comp;
        if (!NODE_TYPES.has(comp.type)) continue;
        if (excluded.has(comp.type)) continue;

        const r = resolveNodeRadius(comp.type);
        const typeColor = typeColors[comp.type] ?? typeColors._default;
        const stroke = comp.color
          ? resolveColor(comp.color)
          : typeColor
            ? resolveColor(typeColor)
            : "#000000";

        // Method indicator
        let method: { color: string; position: number } | undefined;
        if (comp.method && methods.length > 0) {
          const methodCfg = methods.find(m => m.type === comp.method!.type);
          if (methodCfg) {
            const legendKeys = Object.keys(methodCfg.legend);
            const position = legendKeys.indexOf(comp.method.preconisation);
            if (position >= 0) {
              method = { color: methodCfg.color, position };
            }
          }
        }

        nodeFrags.push(renderComponentNode({
          id: comp.id,
          type: comp.type,
          cx: node.cx,
          cy: node.cy,
          radius: r,
          stroke,
          strokeWidth,
          method,
          interactive: true,
        }));
      }

      // Pipeline handle squares
      if (!excluded.has("pipeline")) {
        for (const p of pipelines) {
          const pr = resolveNodeRadius("pipeline");
          nodeFrags.push(renderPipelineHandleSquare(p.handleX, p.handleY, pr, strokeWidth));
        }
      }

      if (nodeFrags.length > 0) {
        parts.push(svgLayerGroup("nodes", nodeFrags));
      }
    }

    // ── Layer: steps ──────────────────────────────────────────
    if (map.steps && map.steps.length > 0) {
      const stepFrags: string[] = [];
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      for (const step of map.steps) {
        const node = nodeById.get(step.componentId);
        if (!node) continue;
        stepFrags.push(renderStep({
          cx: node.cx,
          cy: node.cy,
          number: step.number,
          fill: "#cc0000",
          fontFamily,
          stepId: step.id,
          interactive: true,
        }));
      }
      if (stepFrags.length > 0) {
        parts.push(svgLayerGroup("steps", stepFrags));
      }
    }

    // ── Layer: labels ─────────────────────────────────────────
    {
      const labelFrags: string[] = [];
      for (const node of nodes) {
        const comp = node.comp;
        if (!LABEL_TYPES.has(comp.type)) continue;
        if (excluded.has(comp.type)) continue;

        const hasCustomPos = comp.label.position != null;
        let dx: number;
        let dy: number;
        let anchor: "start" | "middle" | "end" = "middle";

        if (comp.type === "pipeline") {
          dx = comp.label.position?.dx ?? (NODE_RADIUS_DEFAULT + 4);
          dy = comp.label.position?.dy ?? 4;
          anchor = "middle";
        } else {
          dx = comp.label.position?.dx ?? NODE_RADIUS_DEFAULT + 4;
          dy = comp.label.position?.dy ?? 4;
          anchor = dx < 0 ? "end" : anchor;
          anchor = dx > 0 ? "start" : anchor;
        }

        labelFrags.push(renderLabel({
          x: node.cx + dx,
          y: node.cy + dy,
          text: comp.label.name,
          anchor,
          fontFamily,
          fontSize,
          componentId: comp.id,
          interactive: true,
        }));
      }
      if (labelFrags.length > 0) {
        parts.push(svgLayerGroup("labels", labelFrags));
      }
    }

    // ── Layer: notes ──────────────────────────────────────────
    if (!excluded.has("note")) {
      const noteFrags: string[] = [];
      for (const node of nodes) {
        const comp = node.comp;
        if (comp.type !== "note") continue;
        const text = comp.description?.trim() || comp.label.name;
        noteFrags.push(renderNote({ cx: node.cx, cy: node.cy, text, fontFamily }));
      }
      if (noteFrags.length > 0) {
        parts.push(svgLayerGroup("notes", noteFrags));
      }
    }

    // SVG footer
    parts.push(svgFooter());

    return parts.join("\n");
  }

  // ── DOM references ────────────────────────────────────────────
  const svgWrapper = document.getElementById("svg-wrapper");
  if (!svgWrapper) return;

  // ── Initial client-side render ────────────────────────────────
  // Render the full SVG from embedded JSON — replaces any server-rendered
  // SVG content with a client-rendered version using shared svg-primitives.
  const svgHTML = renderFullSVG(model);
  svgWrapper.innerHTML = svgHTML;

  const svgEl = svgWrapper.querySelector("svg");
  if (!svgEl) return;

  // ── Build element index from data-* attributes ────────────────

  function rebuildElementIndex(): void {
    componentEls = {};
    svgEl!.querySelectorAll("[data-component-id]").forEach((el) => {
      const id = el.getAttribute("data-component-id");
      if (id) componentEls[id] = el;
    });

    edgeEls = {};
    svgEl!.querySelectorAll("[data-edge-id]").forEach((el) => {
      const id = el.getAttribute("data-edge-id");
      if (id) edgeEls[id] = el;
    });

    pipelineEls = {};
    svgEl!.querySelectorAll("[data-pipeline-id]").forEach((el) => {
      const id = el.getAttribute("data-pipeline-id");
      if (id) pipelineEls[id] = el;
    });
  }

  let componentEls: Record<string, Element> = {};
  let edgeEls: Record<string, Element> = {};
  let pipelineEls: Record<string, Element> = {};
  const plotAreaEl = svgEl.querySelector("[data-plot-area]");

  rebuildElementIndex();

  // ── Coordinate conversion (pointer → map coords) ──────────────

  function pointerToMapCoords(
    clientX: number,
    clientY: number
  ): { evolution: number; visibility: number } | null {
    if (!plotAreaEl) return null;
    const rect = plotAreaEl.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return {
      evolution: Math.max(0, Math.min(1, x)),
      visibility: Math.max(0, Math.min(1, y)),
    };
  }

  // ── Expose svg-primitives for structural re-renders ────────────
  const _svgPrimitives = {
    esc,
    renderComponentNode,
    renderEdge,
    renderEvolveArrow,
    renderLabel,
    renderPipeline,
    renderStep,
    renderNote,
    renderAccelerator,
  };

  // ── Diff operation buffer ─────────────────────────────────────
  const diffOps: unknown[] = [];

  // ── Selection state ───────────────────────────────────────────
  let selectedIds: Set<string> = new Set();

  /** Current single-selection for context zone */
  const selection: { type: string | null; id: string | null } = { type: null, id: null };

  // ── Undo stack ────────────────────────────────────────────────
  const undoStack: string[] = [];

  // ── Snapshot helper ────────────────────────────────────────────
  function pushSnapshot(): void {
    undoStack.push(JSON.stringify(model));
  }

  // ── Apply diff operation helper ────────────────────────────────
  /**
   * Record a diff operation in the buffer and apply the mutation.
   * @param op  - The operation type string (e.g. "change_component_type")
   * @param payload - The operation payload
   * @param mutate - Function that mutates the model in-place
   */
  function applyOp(
    op: string,
    payload: Record<string, unknown>,
    mutate: (m: WardleyMap) => void
  ): void {
    diffOps.push({ op, payload });
    mutate(model);
    updateCounters();
  }

  // ── Pipeline containment helpers ───────────────────────────────

  function isInsidePipelineBounds(
    comp: Component,
    geo: PipelineGeometry
  ): boolean {
    const eps = K.pipelineEpsilon;
    const e = evo(comp);
    const v = vis(comp);
    return (
      e >= geo.evoStart - eps &&
      e <= geo.evoEnd + eps &&
      v >= geo.visStart - eps &&
      v <= geo.visEnd + eps
    );
  }

  function getContainedComponents(
    pipelineId: string,
    geo: PipelineGeometry
  ): Component[] {
    const result: Component[] = [];
    for (const c of model.components) {
      if (c.id === pipelineId) continue;
      if (c.type === "pipeline" || c.type === "note") continue;
      if (isInsidePipelineBounds(c, geo)) {
        result.push(c);
      }
    }
    return result;
  }

  // ── Structural re-render function ─────────────────────────────
  /**
   * Re-render the full SVG from the current model state.
   * Called after structural changes (add/delete component, type changes, etc.)
   */
  function reRenderSVG(): void {
    const html = renderFullSVG(model);
    svgWrapper!.innerHTML = html;
    rubberBandLine = null; // destroyed by innerHTML replacement
    rebuildElementIndex();
  }

  // ── Counter / status UI ────────────────────────────────────────
  function updateCounters(): void {
    const opsCountEl = document.getElementById("ops-count");
    if (opsCountEl) {
      opsCountEl.textContent = String(diffOps.length);
    }
  }

  // ── Context zone DOM references ────────────────────────────────
  const ctxComponentPanel = document.getElementById("ctx-component");
  const ctxCompName = document.getElementById("ctx-comp-name");
  const ctxCompType = document.getElementById("ctx-comp-type") as HTMLSelectElement | null;
  const ctxCompDelete = document.getElementById("ctx-comp-delete");
  const ctxEdgePanel = document.getElementById("ctx-edge");
  const ctxPipelinePanel = document.getElementById("ctx-pipeline");

  // ── Context zone update ────────────────────────────────────────
  function updateContextZone(): void {
    // Hide all panels first
    if (ctxComponentPanel) ctxComponentPanel.style.display = "none";
    if (ctxEdgePanel) ctxEdgePanel.style.display = "none";
    if (ctxPipelinePanel) ctxPipelinePanel.style.display = "none";

    if (!selection.id || !selection.type) return;

    if (selection.type === "component") {
      const comp = model.components.find((c) => c.id === selection.id);
      if (!comp) return;

      if (ctxComponentPanel) ctxComponentPanel.style.display = "";
      if (ctxCompName) {
        ctxCompName.textContent = comp.label?.name ?? comp.id;
      }
      if (ctxCompType) {
        ctxCompType.value = comp.type || "component";
      }
    }
  }

  // ── Selection helper ───────────────────────────────────────────
  function selectComponent(id: string): void {
    selection.type = "component";
    selection.id = id;
    selectedIds = new Set([id]);
    updateContextZone();
  }

  function clearSelection(): void {
    selection.type = null;
    selection.id = null;
    selectedIds.clear();
    updateContextZone();
  }

  // ── Change component type handler ──────────────────────────────
  if (ctxCompType) {
    ctxCompType.addEventListener("change", () => {
      const newType = ctxCompType.value;
      if (!selection.id || selection.type !== "component") return;
      const id = selection.id;
      const comp = model.components.find((c) => c.id === id);
      if (!comp) return;

      // Save undo snapshot before mutation
      pushSnapshot();

      // If changing FROM pipeline to non-pipeline, eject contained components
      const wasPipeline = comp.type === "pipeline" && comp.pipelineGeometry;
      if (wasPipeline && newType !== "pipeline") {
        const contained = getContainedComponents(id, comp.pipelineGeometry!);
        for (const ejected of contained) {
          applyOp(
            "move_component",
            {
              id: ejected.id,
              evolution: evo(ejected),
              visibility: vis(ejected),
            },
            () => {} // No mutation needed — positions preserved
          );
        }
      }

      // Apply the type change
      applyOp("change_component_type", { id, type: newType }, (m) => {
        const c = m.components.find((x) => x.id === id);
        if (c) {
          c.type = newType;
          if (newType !== "pipeline") {
            delete (c as any).pipelineGeometry;
          }
        }
      });

      // Full structural re-render — shape changes require new SVG elements
      reRenderSVG();
      updateContextZone();
    });
  }

  // ── Placement mode state ──────────────────────────────────────
  type PlacementMode = null | "component" | "edge-src" | "edge-dst" | "evolves-src" | "evolves-dst";
  let placementMode: PlacementMode = null;
  let edgeSrcId: string | null = null;
  let evolvesSrcId: string | null = null;

  const btnAddEdge = document.getElementById("btn-add-edge");
  const btnAddEvolves = document.getElementById("btn-add-evolves");
  const btnAddComponent = document.getElementById("btn-add-component");

  /** Highlight the selected source node with a glow effect during edge/evolves placement */
  function highlightPlacementSource(componentId: string | null): void {
    clearPlacementSourceHighlight();
    if (!componentId) return;
    const el = componentEls[componentId];
    if (el) el.classList.add("wm-placement-source");
  }

  /** Remove placement source highlight from all nodes */
  function clearPlacementSourceHighlight(): void {
    svgEl!.querySelectorAll(".wm-placement-source").forEach((el) => {
      el.classList.remove("wm-placement-source");
    });
  }

  /** Clear all mode UI: button highlights, cursor, source glow, rubber-band */
  function clearModeUI(): void {
    if (btnAddComponent) btnAddComponent.style.borderColor = "";
    if (btnAddEdge) btnAddEdge.style.borderColor = "";
    if (btnAddEvolves) btnAddEvolves.style.borderColor = "";
    svgEl!.style.cursor = "";
    clearPlacementSourceHighlight();
    hideRubberBand();
  }

  // ── Rubber-band line for edge/evolves placement ──────────────────
  let rubberBandLine: SVGLineElement | null = null;

  /** Convert client (mouse) coordinates to SVG user-space coordinates */
  function clientToSVG(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgEl as unknown as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const svgPt = pt.matrixTransform(ctm.inverse());
      return { x: svgPt.x, y: svgPt.y };
    }
    // Fallback: use bounding rect
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: ((clientX - rect.left) / rect.width) * (vb.width || K.canvasWidth),
      y: ((clientY - rect.top) / rect.height) * (vb.height || K.canvasHeight),
    };
  }

  /** Get center coordinates of a component in SVG space */
  function getComponentCenter(componentId: string): { x: number; y: number } | null {
    const comp = model.components.find((c) => c.id === componentId);
    if (!comp) return null;
    return { x: evoToX(evo(comp)), y: visToY(vis(comp)) };
  }

  /** Create or return the rubber-band SVG line element */
  function ensureRubberBand(): SVGLineElement {
    if (rubberBandLine) return rubberBandLine;
    const ns = "http://www.w3.org/2000/svg";
    rubberBandLine = document.createElementNS(ns, "line");
    rubberBandLine.setAttribute("class", "wm-rubber-band");
    rubberBandLine.setAttribute("stroke-width", "1.5");
    rubberBandLine.setAttribute("stroke-dasharray", "6 4");
    rubberBandLine.setAttribute("pointer-events", "none");
    rubberBandLine.style.display = "none";
    (svgEl as Element).appendChild(rubberBandLine);
    return rubberBandLine;
  }

  /** Show rubber-band line from source position to cursor position */
  function updateRubberBand(srcX: number, srcY: number, cursorX: number, cursorY: number): void {
    const line = ensureRubberBand();
    line.setAttribute("x1", String(srcX));
    line.setAttribute("y1", String(srcY));
    line.setAttribute("x2", String(cursorX));
    line.setAttribute("y2", String(cursorY));
    line.style.display = "";
  }

  /** Hide the rubber-band line */
  function hideRubberBand(): void {
    if (rubberBandLine) rubberBandLine.style.display = "none";
  }

  // ── Mousemove handler for rubber-band during placement ───────────
  svgEl.addEventListener("mousemove", (e: MouseEvent) => {
    if (placementMode !== "edge-dst" && placementMode !== "evolves-dst") {
      if (rubberBandLine && rubberBandLine.style.display !== "none") hideRubberBand();
      return;
    }
    const srcId = placementMode === "edge-dst" ? edgeSrcId : evolvesSrcId;
    if (!srcId) return;
    const src = getComponentCenter(srcId);
    if (!src) return;
    const cursor = clientToSVG(e.clientX, e.clientY);
    updateRubberBand(src.x, src.y, cursor.x, cursor.y);
  });

  /** Exit placement mode completely */
  function exitPlacementMode(): void {
    placementMode = null;
    edgeSrcId = null;
    evolvesSrcId = null;
    clearModeUI();
  }

  // ── Global bar: + Edge button ──────────────────────────────────
  if (btnAddEdge) {
    btnAddEdge.addEventListener("click", () => {
      if (placementMode === "edge-src" || placementMode === "edge-dst") {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      exitPlacementMode();
      placementMode = "edge-src";
      btnAddEdge.style.borderColor = "var(--accent)";
      svgEl.style.cursor = "crosshair";
      updateContextZone();
    });
  }

  // ── Global bar: + EvolvesTo button ────────────────────────────
  if (btnAddEvolves) {
    btnAddEvolves.addEventListener("click", () => {
      if (placementMode === "evolves-src" || placementMode === "evolves-dst") {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      exitPlacementMode();
      placementMode = "evolves-src";
      btnAddEvolves.style.borderColor = "var(--accent)";
      svgEl.style.cursor = "crosshair";
      updateContextZone();
    });
  }

  // ── Click handler for placement modes + component selection ────
  svgEl.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as Element;
    const compGroup = target.closest("[data-component-id]");

    // ── Edge source selection ──────────────────────────────────
    if (placementMode === "edge-src") {
      if (!compGroup) {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      edgeSrcId = compGroup.getAttribute("data-component-id");
      placementMode = "edge-dst";
      highlightPlacementSource(edgeSrcId);
      updateContextZone();
      return;
    }

    // ── Edge target selection ──────────────────────────────────
    if (placementMode === "edge-dst") {
      if (!compGroup) {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      const edgeDstId = compGroup.getAttribute("data-component-id");
      if (edgeDstId === edgeSrcId) return; // can't self-link
      const newEdgeId = "rel_" + Date.now();
      pushSnapshot();
      applyOp("add_edge", {
        id: newEdgeId,
        consumer: edgeSrcId,
        supplier: edgeDstId,
        type: "dependency",
      }, (m) => {
        m.relations.push({
          id: newEdgeId,
          consumer: edgeSrcId!,
          supplier: edgeDstId!,
          type: "dependency",
        });
      });
      reRenderSVG();
      clearPlacementSourceHighlight();
      edgeSrcId = null;
      placementMode = "edge-src";
      updateContextZone();
      return;
    }

    // ── EvolvesTo source selection ─────────────────────────────
    if (placementMode === "evolves-src") {
      if (!compGroup) {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      evolvesSrcId = compGroup.getAttribute("data-component-id");
      placementMode = "evolves-dst";
      highlightPlacementSource(evolvesSrcId);
      updateContextZone();
      return;
    }

    // ── EvolvesTo target selection ─────────────────────────────
    if (placementMode === "evolves-dst") {
      if (!compGroup) {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      const evolvesDstId = compGroup.getAttribute("data-component-id");
      if (evolvesDstId === evolvesSrcId) return; // can't self-evolve
      pushSnapshot();
      applyOp("set_evolves_to", {
        id: evolvesSrcId,
        evolvesTo: evolvesDstId,
      }, (m) => {
        const comp = m.components.find((c) => c.id === evolvesSrcId);
        if (comp) (comp as any).evolvesTo = evolvesDstId;
      });
      reRenderSVG();
      clearPlacementSourceHighlight();
      evolvesSrcId = null;
      placementMode = "evolves-src";
      updateContextZone();
      return;
    }

    // ── Normal selection (no placement mode) ───────────────────
    if (placementMode) return; // other placement modes handled above

    if (compGroup) {
      const compId = compGroup.getAttribute("data-component-id");
      if (compId) {
        selectComponent(compId);
        return;
      }
    }
    // Click on empty area clears selection
    clearSelection();
  });

  // ── Public API (for window.claude.complete()) ─────────────────
  (window as any).wardley = {
    getModel: () => model,
    getDiffOps: () => diffOps,
    getConstants: () => renderConstants,
    getRenderConfig: () => renderConfig,
    getSvgPrimitives: () => _svgPrimitives,
    reRender: reRenderSVG,
    computeGeometry: () => computeGeometry(model),
    selectComponent,
    clearSelection,
    applyOp,
    getContainedComponents,
    isInsidePipelineBounds,
    exitPlacementMode,
    highlightPlacementSource,
  };

  // ── Expose __wardleyRender for the inline script's structural re-renders ──
  // The inline script in render-html.ts checks window.__wardleyRender before
  // falling back to fetch/patch. By providing it here, structural changes
  // (add_component, add_edge, delete, type changes, undo, reset) get
  // client-side full SVG re-renders with zero server round-trip.
  (window as any).__wardleyRender = function (mapModel: WardleyMap): string {
    return renderFullSVG(mapModel);
  };

  console.log(
    "[wardley-interactive] Rendered",
    model.components.length,
    "components client-side"
  );
})();
