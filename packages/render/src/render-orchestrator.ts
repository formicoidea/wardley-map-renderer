/**
 * Render orchestrator — public API for the modular rendering pipeline.
 *
 * Chains Phase 1 (buildRenderContext) → Phase 2 (composeSVG) using the
 * 9-layer modular renderer from src/render/.
 *
 * Architecture:
 *   Phase 1 — buildRenderContext(map):
 *     Computes all pixel positions from normalized [0-1] coordinates.
 *     Applies pipeline containment, resolves component positions,
 *     pipeline rects, edges, evolution arrows. Pure function, no SVG output.
 *
 *   Phase 2 — composeSVG(ctx, layers):
 *     Generates SVG string by calling each layer renderer in z-order.
 *     9 layers: title → axes → pipelines → edges → evolvesTo → nodes → labels → notes → legend
 *
 * @module render-orchestrator
 */

import {
  sanitizeMap,
  type WardleyMap,
  type LayerToggles,
} from "./schema.js";
import {
  buildRenderContext,
  composeSVG,
  type RenderContext,
  type RenderGeometry,
  type RenderOptions,
  type LayerRegistration,
  LAYER_ORDER,
} from "./render/index.js";

// ── Import all 9 layer renderers ─────────────────────────────────────
import { renderTitleLayer } from "./render/title-layer.js";
import { renderAxesLayer } from "./render/axes-layer.js";
import { renderPipelinesLayer } from "./render/pipelines-layer.js";
import { renderEdgesLayer } from "./render/edges-layer.js";
import { renderEvolvesToLayer } from "./render/evolvesto-layer.js";
import { renderNodesLayer } from "./render/nodes-layer.js";
import { renderLabelsLayer } from "./render/labels-layer.js";
import { renderNotesLayer } from "./render/notes-layer.js";
import { renderLegendLayer } from "./render/legend-layer.js";

// ── Build explicit layer list (no global registry mutation) ──────────

const LAYERS: readonly LayerRegistration[] = [
  { name: "title", order: LAYER_ORDER.title, render: renderTitleLayer },
  { name: "axes", order: LAYER_ORDER.axes, render: renderAxesLayer },
  { name: "pipelines", order: LAYER_ORDER.pipelines, render: renderPipelinesLayer },
  { name: "edges", order: LAYER_ORDER.edges, render: renderEdgesLayer },
  { name: "evolvesTo", order: LAYER_ORDER.evolvesTo, render: renderEvolvesToLayer },
  { name: "nodes", order: LAYER_ORDER.nodes, render: renderNodesLayer },
  { name: "labels", order: LAYER_ORDER.labels, render: renderLabelsLayer },
  { name: "notes", order: LAYER_ORDER.notes, render: renderNotesLayer },
  { name: "legend", order: LAYER_ORDER.legend, render: renderLegendLayer },
];

/**
 * Apply renderConfig.filters.layers to filter the layer list.
 *
 * Rules:
 *  - 'axes' and 'legend' layers are NOT in layerToggles — always included.
 *    Their own dedicated controls (background.* and legend.show) govern visibility.
 *  - The 7 content layers (title, pipelines, edges, evolvesTo, nodes, labels, notes)
 *    are included unless their toggle is explicitly set to false.
 *  - undefined toggle → defaults to visible (true).
 */
function applyLayerToggles(
  layers: readonly LayerRegistration[],
  toggles: LayerToggles | undefined
): readonly LayerRegistration[] {
  if (!toggles) return layers;
  return layers.filter((layer) => {
    // axes and legend have separate controls — always pass through
    if (layer.name === "axes" || layer.name === "legend") return true;
    const key = layer.name as keyof LayerToggles;
    const toggle = toggles[key];
    // Default to visible (true) when toggle is undefined
    return toggle !== false;
  });
}

// ── Public types ────────────────────────────────────────────────────

/** Options for the orchestrator render() function */
export interface OrchestrationOptions {
  /** Output format — "svg" returns SVG string, "png" returns PNG Buffer */
  format?: "svg" | "png";
  /** Skip sanitizeMap (if input is already sanitized) */
  preSanitized?: boolean;
  /** Phase 2 visual styling options */
  renderOptions?: RenderOptions;
}

/** Result of a render call */
export interface RenderResult {
  /** The rendered output — SVG string or PNG Buffer */
  data: string | Buffer;
  /** MIME type of the output */
  contentType: "image/svg+xml" | "image/png";
  /** Format shorthand */
  format: "svg" | "png";
  /** The RenderContext from Phase 1 (available for inspection/testing) */
  context: RenderContext;
}

// ── Main orchestrator ───────────────────────────────────────────────

/**
 * Main orchestrator: render a WardleyMap to SVG or PNG.
 *
 * Pipeline:
 *   1. sanitizeMap() — clamp coordinates, deduplicate relations
 *   2. Phase 1: buildRenderContext() — pixel positions, pipeline containment
 *   3. Phase 2: composeSVG() — assemble SVG string from 9 layers
 *   4. (optional) SVG→PNG rasterisation via resvg-js
 */
export async function render(
  inputMap: WardleyMap,
  options: OrchestrationOptions = {}
): Promise<RenderResult> {
  const { format = "svg", preSanitized = false, renderOptions } = options;

  // Step 1: Sanitize
  const map = preSanitized ? inputMap : sanitizeMap(inputMap);

  // Step 2: Phase 1 — Geometry computation
  const ctx = buildRenderContext(map, renderOptions);

  // Step 3: Phase 2 — SVG generation via layers (filtered by filters.layers)
  const activeLayers = applyLayerToggles(LAYERS, map.renderConfig?.filters?.layers);
  const svg = composeSVG(ctx, activeLayers);

  // Step 4: Optional PNG rasterisation
  if (format === "png") {
    const pngBuffer = await rasterizeSVG(svg, ctx.canvasWidth, ctx.resolvedConfig.background.color);
    return {
      data: pngBuffer,
      contentType: "image/png",
      format: "png",
      context: ctx,
    };
  }

  return {
    data: svg,
    contentType: "image/svg+xml",
    format: "svg",
    context: ctx,
  };
}

// ── Convenience functions ───────────────────────────────────────────

/**
 * Render to SVG string only (synchronous).
 */
export function renderToSVG(
  inputMap: WardleyMap,
  renderOptions?: RenderOptions
): string {
  const map = sanitizeMap(inputMap);
  const ctx = buildRenderContext(map, renderOptions);
  const activeLayers = applyLayerToggles(LAYERS, map.renderConfig?.filters?.layers);
  return composeSVG(ctx, activeLayers);
}

/**
 * Render to PNG Buffer (async due to font loading + rasterisation).
 */
export async function renderToPNG(
  inputMap: WardleyMap,
  renderOptions?: RenderOptions
): Promise<Buffer> {
  const map = sanitizeMap(inputMap);
  const ctx = buildRenderContext(map, renderOptions);
  const activeLayers = applyLayerToggles(LAYERS, map.renderConfig?.filters?.layers);
  const svg = composeSVG(ctx, activeLayers);
  return rasterizeSVG(svg, ctx.canvasWidth, ctx.resolvedConfig.background.color);
}

/**
 * Execute Phase 1 only — compute geometry without rendering SVG.
 */
export function computeMapGeometry(
  inputMap: WardleyMap,
  renderOptions?: RenderOptions
): RenderContext {
  const map = sanitizeMap(inputMap);
  return buildRenderContext(map, renderOptions);
}

// ── PNG rasterisation (lazy font loading) ───────────────────────────

let interFontData: Uint8Array | null = null;

async function loadInterFont(): Promise<Uint8Array> {
  if (interFontData) return interFontData;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const fontPath = path.join(
    import.meta.dirname ?? ".",
    "..",
    "assets",
    "fonts",
    "Inter-Regular.ttf"
  );

  try {
    interFontData = new Uint8Array(await fs.readFile(fontPath));
  } catch {
    console.warn(
      `[render] Inter font not found at ${fontPath}, using default sans-serif`
    );
    interFontData = new Uint8Array(0);
  }
  return interFontData;
}

async function rasterizeSVG(svg: string, width: number, backgroundColor?: string): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const fontData = await loadInterFont();

  const opts: any = {
    background: backgroundColor ?? "#ffffff",
    fitTo: { mode: "width" as const, value: width },
  };

  if (fontData.length > 0) {
    opts.font = {
      fontFiles: [fontData],
      defaultFontFamily: "Inter",
    };
  }

  const resvg = new Resvg(svg, opts);
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

// ── Re-exports for convenience ──────────────────────────────────────

export type {
  RenderContext,
  RenderGeometry,
  RenderOptions,
  LayerRegistration,
} from "./render/index.js";
