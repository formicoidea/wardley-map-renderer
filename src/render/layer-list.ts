/**
 * The canonical ordered layer list + layer-toggle filter (zod-free).
 * Shared by render-orchestrator.ts (server) and browser-render.ts.
 *
 * @module render/layer-list
 */

import type { LayerToggles } from "../schema.js";
import type { LayerRegistration } from "./types.js";
import { LAYER_ORDER } from "./registry.js";
import { renderTitleLayer } from "./title-layer.js";
import { renderAxesLayer } from "./axes-layer.js";
import { renderPipelinesLayer } from "./pipelines-layer.js";
import { renderEdgesLayer } from "./edges-layer.js";
import { renderEvolvesToLayer } from "./evolvesto-layer.js";
import { renderNodesLayer } from "./nodes-layer.js";
import { renderStepsLayer } from "./steps-layer.js";
import { renderAcceleratorsLayer } from "./accelerators-layer.js";
import { renderLabelsLayer } from "./labels-layer.js";
import { renderNotesLayer } from "./notes-layer.js";
import { renderLegendLayer } from "./legend-layer.js";

// ── Build explicit layer list (no global registry mutation) ──────────

export const LAYERS: readonly LayerRegistration[] = [
  { name: "title", order: LAYER_ORDER.title, render: renderTitleLayer },
  { name: "axes", order: LAYER_ORDER.axes, render: renderAxesLayer },
  { name: "pipelines", order: LAYER_ORDER.pipelines, render: renderPipelinesLayer },
  { name: "edges", order: LAYER_ORDER.edges, render: renderEdgesLayer },
  { name: "evolvesTo", order: LAYER_ORDER.evolvesTo, render: renderEvolvesToLayer },
  { name: "nodes", order: LAYER_ORDER.nodes, render: renderNodesLayer },
  { name: "steps", order: LAYER_ORDER.steps, render: renderStepsLayer },
  { name: "accelerators", order: LAYER_ORDER.accelerators, render: renderAcceleratorsLayer },
  { name: "labels", order: LAYER_ORDER.labels, render: renderLabelsLayer },
  { name: "notes", order: LAYER_ORDER.notes, render: renderNotesLayer },
  { name: "legend", order: LAYER_ORDER.legend, render: renderLegendLayer },
];

/**
 * Apply renderConfig.filters.layers to filter the layer list.
 *
 * Rules:
 *  - axes and legend layers are NOT in layerToggles — always included.
 *    Their own dedicated controls (background.* and legend.show) govern visibility.
 *  - The content layers are included unless their toggle is explicitly set to false.
 *  - undefined toggle → defaults to visible (true).
 */
export function applyLayerToggles(
  layers: readonly LayerRegistration[],
  toggles: LayerToggles | undefined
): readonly LayerRegistration[] {
  if (!toggles) return layers;
  return layers.filter((layer) => {
    // axes and legend have separate controls — always pass through
    if (layer.name === "axes" || layer.name === "legend") return true;
    const key = layer.name as keyof LayerToggles;
    // Default to visible (true) when toggle is undefined
    return toggles[key] !== false;
  });
}
