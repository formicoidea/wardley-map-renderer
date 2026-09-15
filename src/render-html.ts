/**
 * HTML renderer — produces a self-contained HTML artifact with embedded SVG.
 *
 * When `interactive` is true, the SVG includes data-* attributes, hit areas,
 * drag handles, and the HTML wraps the SVG with a command palette panel
 * and diff-based communication channel.
 *
 * The HTML artifact embeds three data sources:
 *   1. Inline SVG — the rendered map (visual + interaction surface)
 *   2. <script id="wardley-data"> — the WardleyMap JSON model
 *   3. <script id="render-constants"> — resolved geometry/config constants
 *
 * CSS variables are derived from the active theme and support dark/light
 * mode via prefers-color-scheme media query.
 *
 * @module render-html
 */

import { sanitizeMap, resolveTheme, type WardleyMap, type ResolvedRenderConfig } from "./schema.js";
import { renderToSVG } from "./render-orchestrator.js";
import type { RenderOptions } from "./render/index.js";
import {
  AXIS_MARGIN_LEFT,
  AXIS_MARGIN_BOTTOM,
  AXIS_MARGIN_TOP,
  EVOLUTION_BOUNDARIES,
} from "./blocks/wardley-map/wardley-map-consts.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Interactive bundle loader ─────────────────────────────────────────
// Loads the pre-built esbuild bundle from dist/interactive-bundle.js.
// Falls back to empty string if the file doesn't exist (graceful degradation).
const __renderHtmlDirname = dirname(fileURLToPath(import.meta.url));
const INTERACTIVE_BUNDLE_PATH = resolve(__renderHtmlDirname, "../dist/interactive-bundle.js");

async function loadInteractiveBundle(): Promise<string> {
  try {
    return readFileSync(INTERACTIVE_BUNDLE_PATH, "utf-8");
  } catch {
    // Bundle not pre-built — try dynamic import of the build script
    try {
      // Dynamic import to avoid rootDir issues — scripts/ is outside src/
      const mod = await (Function('p', 'return import(p)') as (p: string) => Promise<any>)("../scripts/bundle-interactive.js");
      return mod.bundleInteractive();
    } catch {
      return "";
    }
  }
}

function wrapInScriptTag(jsCode: string): string {
  return `<script>\n${jsCode}\n</script>`;
}

// ── Types ──────────────────────────────────────────────────────────────

/** Extended render options for HTML output */
export interface HTMLRenderOptions extends RenderOptions {
  /** Enable interactive SVG elements (data-*, hit areas, handles). Defaults to false. */
  readonly interactive?: boolean;
}

/**
 * Render constants embedded in the HTML artifact for client-side coordinate
 * conversion and interactive geometry computations.
 *
 * These are derived from the resolved RenderConfig and fixed layout margins.
 * The client-side JS uses these to convert pointer events to evolution/visibility
 * [0-1] values without needing the full RenderConfig resolution logic.
 */
export interface RenderConstants {
  /** Canvas width in pixels (viewBox width) */
  readonly canvasWidth: number;
  /** Canvas height in pixels (viewBox height) */
  readonly canvasHeight: number;
  /** Fixed margins in pixels */
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /** Plot area (drawable region inside margins) */
  readonly plot: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  /** Evolution phase boundary ratios [0-1] (interior dividers) */
  readonly evolutionBoundaries: readonly number[];
  /** Node radius defaults (px) */
  readonly nodeRadii: Record<string, number>;
  /** Label scale multiplier */
  readonly labelScale: number;
  /** Pipeline containment epsilon */
  readonly pipelineEpsilon: number;
}

// ── Render constants extraction ────────────────────────────────────────

/** Pipeline containment epsilon — matches pipeline-geometry.ts */
const PIPELINE_EPSILON = 0.015;

/**
 * Extract render constants from a resolved config for embedding in the HTML artifact.
 *
 * These constants allow client-side JS to perform coordinate conversions
 * (pointer → evolution/visibility) and geometry computations without
 * re-resolving the full RenderConfig.
 */
export function extractRenderConstants(resolved: ResolvedRenderConfig): RenderConstants {
  const canvasWidth = resolved.width;
  const canvasHeight = resolved.height;
  const margins = {
    top: AXIS_MARGIN_TOP,
    right: 20,
    bottom: AXIS_MARGIN_BOTTOM,
    left: AXIS_MARGIN_LEFT,
  };
  const plot = {
    left: margins.left,
    top: margins.top,
    width: canvasWidth - margins.left - margins.right,
    height: canvasHeight - margins.top - margins.bottom,
  };

  return {
    canvasWidth,
    canvasHeight,
    margins,
    plot,
    evolutionBoundaries: [...EVOLUTION_BOUNDARIES],
    nodeRadii: { ...resolved.nodeRadii },
    labelScale: resolved.typography.labelScale,
    pipelineEpsilon: PIPELINE_EPSILON,
  };
}

// ── Embeddable render config extraction ─────────────────────────────────

/**
 * Extract the subset of ResolvedRenderConfig needed for client-side rendering.
 *
 * This is serialized as JSON and embedded in the HTML artifact so the
 * client-side interactive TypeScript can render SVG using shared svg-primitives
 * with the same config values as the server pipeline.
 */
export function extractEmbeddableRenderConfig(resolved: ResolvedRenderConfig): Record<string, unknown> {
  return {
    background: { color: resolved.background.color },
    strokeWidth: resolved.strokeWidth,
    typography: {
      fontFamily: resolved.typography.fontFamily,
      labelScale: resolved.typography.labelScale,
      textScale: resolved.typography.textScale ?? 1,
    },
    nodeRadii: { ...resolved.nodeRadii },
    typeColors: { ...resolved.typeColors },
    evolveStyles: { ...resolved.evolveStyles },
    excludeComponentTypes: [...resolved.excludeComponentTypes],
    showEvolutionXAxis: resolved.showEvolutionXAxis,
    showValueChainYAxis: resolved.showValueChainYAxis,
    showPhaseDividerAndLabel: resolved.showPhaseDividerAndLabel,
    axisLabels: resolved.axisLabels,
    methods: resolved.methods,
  };
}

// ── CSS variable generation ────────────────────────────────────────────

/**
 * CSS variable names and values derived from the active theme.
 *
 * Light mode variables are set on :root; dark mode overrides use
 * @media(prefers-color-scheme:dark). The map's own theme colors
 * (from resolvedConfig) are injected as --map-* variables so the
 * SVG and interactive UI share a consistent palette.
 */
export function buildCSSVariables(resolved: ResolvedRenderConfig): {
  light: string;
  dark: string;
} {
  const bg = resolved.background.color;
  // Determine if the theme background is dark by checking luminance
  const isDark = isColorDark(bg);

  // Map theme colors → CSS variables
  const fg = isDark ? "#e8e8e8" : "#1a1a2e";
  const panelBg = isDark ? "#16213e" : "#f8f9fa";
  const panelBorder = isDark ? "#2a2a4a" : "#dee2e6";
  const panelText = isDark ? "#c8c8d8" : "#495057";
  const accent = "#3b82f6";
  const accentHover = "#2563eb";

  const typeColors = resolved.typeColors;
  const componentColor = typeColors.component ?? typeColors._default ?? "#374151";
  const edgeColor = typeColors.edge ?? "#374151";

  const lightVars = [
    `--bg:${bg}`,
    `--fg:${fg}`,
    `--panel-bg:${panelBg}`,
    `--panel-border:${panelBorder}`,
    `--panel-text:${panelText}`,
    `--accent:${accent}`,
    `--accent-hover:${accentHover}`,
    `--map-bg:${bg}`,
    `--map-component:${componentColor}`,
    `--map-edge:${edgeColor}`,
    `--map-font:${resolved.typography.fontFamily}`,
    `--map-stroke-width:${resolved.strokeWidth}`,
    `--map-node-radius:${resolved.nodeRadii._default}px`,
  ].join(";");

  // Dark mode overrides (swap to contrasting values)
  const darkBg = isDark ? bg : "#1a1a2e";
  const darkFg = isDark ? fg : "#e8e8e8";
  const darkPanelBg = isDark ? panelBg : "#16213e";
  const darkPanelBorder = isDark ? panelBorder : "#2a2a4a";
  const darkPanelText = isDark ? panelText : "#c8c8d8";

  const darkVars = [
    `--bg:${darkBg}`,
    `--fg:${darkFg}`,
    `--panel-bg:${darkPanelBg}`,
    `--panel-border:${darkPanelBorder}`,
    `--panel-text:${darkPanelText}`,
  ].join(";");

  return { light: lightVars, dark: darkVars };
}

/**
 * Simple luminance check — returns true if the hex color is "dark"
 * (perceived brightness < 128).
 */
function isColorDark(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Perceived brightness (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// ── Main public API ────────────────────────────────────────────────────

/**
 * Render a WardleyMap to a self-contained HTML string.
 *
 * The HTML document embeds the SVG inline, supports dark/light mode
 * via prefers-color-scheme, and when interactive=true includes
 * drag-and-drop, a command palette, and diff communication.
 */
export async function renderToHTML(
  inputMap: WardleyMap,
  options?: HTMLRenderOptions
): Promise<string> {
  const map = sanitizeMap(inputMap);
  const { interactive = false, ...renderOptions } = options ?? {};

  // Resolve theme to get concrete config values
  const resolvedConfig = resolveTheme(map.renderConfig);

  // Phase 1+2: Generate SVG via existing pipeline
  // Pass interactive flag through so composeSVG adds data-plot-area rect
  const svg = renderToSVG(map, { ...renderOptions, interactive });

  // Extract render constants for client-side use
  const renderConstants = extractRenderConstants(resolvedConfig);

  // Serialize data for embedding
  const mapJSON = JSON.stringify(map);
  const constantsJSON = JSON.stringify(renderConstants);

  // Serialize resolved render config subset for client-side rendering
  const renderConfigJSON = JSON.stringify(extractEmbeddableRenderConfig(resolvedConfig));

  // Build CSS variables from theme
  const cssVars = buildCSSVariables(resolvedConfig);

  // Extract title from map if available
  const title = map.title ?? "Wardley Map";

  // Load the interactive esbuild bundle (shared svg-primitives renderer)
  // This bundle provides client-side renderFullSVG() for initial render
  // and exposes window.__wardleyRender for structural re-renders.
  let bundleScript = "";
  if (interactive) {
    try {
      const bundleCode = await loadInteractiveBundle();
      bundleScript = wrapInScriptTag(bundleCode);
    } catch {
      // Bundle unavailable — interactive.ts features (client-side render,
      // structural re-render) degrade gracefully to fetch/patch fallback
      bundleScript = "";
    }
  }

  return buildHTMLDocument({
    svgContent: svg,
    mapJSON,
    constantsJSON,
    renderConfigJSON,
    cssVars,
    title,
    interactive,
    bundleScript,
  });
}

// ── HTML document assembly ─────────────────────────────────────────────

interface HTMLDocumentParams {
  svgContent: string;
  mapJSON: string;
  constantsJSON: string;
  renderConfigJSON: string;
  cssVars: { light: string; dark: string };
  title: string;
  interactive: boolean;
  bundleScript: string;
}

/**
 * Build the complete self-contained HTML document.
 *
 * Structure:
 *   <head>
 *     - CSS reset + layout + CSS variables (light/dark)
 *   <body>
 *     - #map-container > #svg-wrapper > inline SVG
 *     - <script id="wardley-data" type="application/json"> — map model
 *     - <script id="render-constants" type="application/json"> — geometry constants
 *     - <script> — interactive bootstrapper (when interactive=true)
 */
function buildHTMLDocument(params: HTMLDocumentParams): string {
  const { svgContent, mapJSON, constantsJSON, renderConfigJSON, cssVars, title, interactive, bundleScript } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--map-font,Inter,system-ui,sans-serif);background:var(--bg);color:var(--fg)}
:root{${cssVars.light}}
@media(prefers-color-scheme:dark){
  :root{${cssVars.dark}}
}
#map-container{width:100%;height:100%;display:flex;flex-direction:column}
${interactive ? `#global-bar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--panel-bg);border-bottom:1px solid var(--panel-border);flex-shrink:0;font-size:13px;color:var(--panel-text);z-index:10}
#global-bar button{padding:4px 10px;border:1px solid var(--panel-border);border-radius:4px;background:var(--panel-bg);color:var(--panel-text);cursor:pointer;font-size:12px;font-family:inherit;line-height:1.4;white-space:nowrap;transition:background .15s,border-color .15s}
#global-bar button:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--panel-bg))}
#global-bar button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
#global-bar button.primary:hover{background:var(--accent-hover)}
#global-bar button:disabled{opacity:.4;cursor:default;border-color:var(--panel-border);background:var(--panel-bg)}
#global-bar .separator{width:1px;height:20px;background:var(--panel-border);flex-shrink:0}
#global-bar .counter{font-variant-numeric:tabular-nums;opacity:.8}
#global-bar .spacer{flex:1}
#context-zone{display:none;align-items:center;gap:8px;padding:4px 12px;background:color-mix(in srgb,var(--accent) 8%,var(--panel-bg));border-bottom:1px solid var(--panel-border);flex-shrink:0;font-size:12px;color:var(--panel-text);z-index:9;min-height:32px}
#context-zone.visible{display:flex}
#context-zone .ctx-label{font-weight:600;color:var(--accent);margin-right:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
#context-zone .ctx-group{display:flex;align-items:center;gap:6px}
#context-zone button{padding:3px 8px;border:1px solid var(--panel-border);border-radius:3px;background:var(--panel-bg);color:var(--panel-text);cursor:pointer;font-size:11px;font-family:inherit;line-height:1.4;white-space:nowrap;transition:background .15s,border-color .15s}
#context-zone button:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--panel-bg))}
#context-zone button.danger{color:#ef4444;border-color:#ef4444}
#context-zone button.danger:hover{background:color-mix(in srgb,#ef4444 10%,var(--panel-bg))}
#context-zone input[type="text"]{padding:3px 6px;border:1px solid var(--panel-border);border-radius:3px;background:var(--panel-bg);color:var(--panel-text);font-size:11px;font-family:inherit;width:140px}
#context-zone select{padding:3px 6px;border:1px solid var(--panel-border);border-radius:3px;background:var(--panel-bg);color:var(--panel-text);font-size:11px;font-family:inherit}
#context-zone .ctx-sep{width:1px;height:18px;background:var(--panel-border);flex-shrink:0}
#context-zone .ctx-hint{opacity:.6;font-style:italic}
.ctx-panel{display:none}.ctx-panel.active{display:contents}` : ""}
#svg-wrapper{flex:1;overflow:auto;position:relative}
#svg-wrapper svg{width:100%;height:auto;display:block}
.wm-selected{filter:drop-shadow(0 0 3px var(--accent,#3b82f6)) drop-shadow(0 0 6px var(--accent,#3b82f6))}
.wm-selected>circle,.wm-selected>ellipse{stroke:var(--accent,#3b82f6)!important;stroke-width:2.5!important}
.wm-selected>rect{stroke:var(--accent,#3b82f6)!important;stroke-width:2!important}
.wm-selected>line,.wm-selected>path:not(.hit-area){stroke:var(--accent,#3b82f6)!important;stroke-width:2.5!important}
[data-pipeline-id].wm-selected>rect:first-of-type{fill:color-mix(in srgb,var(--accent,#3b82f6) 8%,transparent)!important;stroke:var(--accent,#3b82f6)!important;stroke-width:2!important}
[data-label-for].wm-selected,[data-label-for].wm-selected *{fill:var(--accent,#3b82f6)!important}
[data-step-id].wm-selected>circle{stroke:var(--accent,#3b82f6)!important;stroke-width:2.5!important;fill:color-mix(in srgb,var(--accent,#3b82f6) 15%,transparent)!important}
[data-step-id].wm-selected>text{fill:var(--accent,#3b82f6)!important}
[data-evolves-from].wm-selected>line,[data-evolves-from].wm-selected>path{stroke:var(--accent,#3b82f6)!important;stroke-width:2.5!important}
[data-component-id],[data-pipeline-id],[data-step-id]{cursor:${interactive ? "grab" : "default"}}
[data-label-for]{cursor:${interactive ? "grab" : "default"}}
[data-edge-id] .hit-area,[data-evolves-from] .hit-area{cursor:pointer}
[data-handle]{display:none;pointer-events:none}
.wm-selected>[data-handle]{display:block;pointer-events:auto}
.wm-inline-rename{background:var(--panel-bg,#fff);color:var(--panel-text,#222);border:1.5px solid var(--accent,#3b82f6);border-radius:3px;padding:2px 4px;font-family:var(--map-font,Inter,system-ui,sans-serif);font-size:12px;outline:none;width:100%;box-sizing:border-box}
.wm-placement-source{filter:drop-shadow(0 0 6px var(--accent,#3b82f6)) drop-shadow(0 0 12px var(--accent,#3b82f6))}
.wm-placement-source>circle,.wm-placement-source>ellipse{stroke:var(--accent,#3b82f6)!important;stroke-width:2.5!important;fill:rgba(59,130,246,0.15)!important}
.wm-placement-source>rect{stroke:var(--accent,#3b82f6)!important;stroke-width:2.5!important}
.wm-rubber-band{stroke:var(--accent,#3b82f6);opacity:0.7;transition:opacity 0.1s ease}
</style>
</head>
<body>
<div id="map-container">
${interactive ? `  <div id="global-bar">
    <button id="btn-add-component" title="Add component">+ Component</button>
    <button id="btn-add-edge" title="Add edge">+ Edge</button>
    <button id="btn-add-evolves" title="Add evolvesTo link">+ EvolvesTo</button>
    <div class="separator"></div>
    <span class="counter" id="counter-display"></span>
    <div class="separator"></div>
    <button id="btn-undo" title="Undo last operation (Ctrl+Z)" disabled>Undo</button>
    <button id="btn-reset" title="Reset all changes">Reset</button>
    <div class="spacer"></div>
    <button id="btn-copy" title="Copy diff to clipboard" disabled>Copy</button>
    <button id="btn-apply" class="primary" title="Send diff to Claude" disabled>Update Claude</button>
  </div>
  <div id="context-zone">
    <div id="ctx-component" class="ctx-panel">
      <span class="ctx-label" id="ctx-comp-name"></span>
      <div class="ctx-sep"></div>
      <div class="ctx-group">
        <input type="text" id="ctx-comp-rename" placeholder="Rename..." title="Rename component">
        <button id="ctx-comp-rename-btn">Rename</button>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-group">
        <select id="ctx-comp-type" title="Component type">
          <option value="component">component</option>
          <option value="build">build</option>
          <option value="buy">buy</option>
          <option value="outsource">outsource</option>
          <option value="dataProduct">dataProduct</option>
          <option value="market">market</option>
        </select>
      </div>
      <div class="ctx-sep"></div>
      <button id="ctx-comp-delete" class="danger" title="Delete component">Delete</button>
    </div>
    <div id="ctx-edge" class="ctx-panel">
      <span class="ctx-label" id="ctx-edge-label"></span>
      <div class="ctx-sep"></div>
      <div class="ctx-group">
        <select id="ctx-edge-type" title="Edge type">
          <option value="dependency">dependency</option>
          <option value="flow">flow</option>
          <option value="constraint">constraint</option>
        </select>
      </div>
      <div class="ctx-sep"></div>
      <button id="ctx-edge-delete" class="danger" title="Delete edge">Delete</button>
    </div>
    <div id="ctx-pipeline" class="ctx-panel">
      <span class="ctx-label" id="ctx-pipe-name"></span>
      <div class="ctx-sep"></div>
      <span class="ctx-hint" id="ctx-pipe-range"></span>
      <div class="ctx-sep"></div>
      <button id="ctx-pipe-delete" class="danger" title="Delete pipeline">Delete</button>
    </div>
    <div id="ctx-add-component" class="ctx-panel">
      <span class="ctx-hint">Add component — pick type &amp; label, then click on the map</span>
      <div class="ctx-sep"></div>
      <div class="ctx-group">
        <select id="ctx-add-type" title="Component type">
          <option value="component">component</option>
          <option value="user-need">user-need</option>
          <option value="pipeline">pipeline</option>
          <option value="note">note</option>
          <option value="anchor">anchor</option>
          <option value="market">market</option>
          <option value="ecosystem">ecosystem</option>
        </select>
      </div>
      <div class="ctx-group">
        <input type="text" id="ctx-add-label" placeholder="Label..." title="Component label" value="New Component">
      </div>
      <div class="ctx-sep"></div>
      <button id="ctx-add-cancel">Cancel</button>
    </div>
    <div id="ctx-placement" class="ctx-panel">
      <span class="ctx-hint" id="ctx-placement-hint"></span>
      <div class="ctx-sep"></div>
      <button id="ctx-placement-cancel">Cancel</button>
    </div>
  </div>` : ""}
  <div id="svg-wrapper">
    ${svgContent}
  </div>
</div>
<script id="wardley-data" type="application/json">
${mapJSON}
</script>
<script id="render-constants" type="application/json">
${constantsJSON}
</script>
<script id="render-config" type="application/json">
${renderConfigJSON}
</script>
${bundleScript}
<script>
(function(){
  "use strict";
  // ── Parse embedded data blocks ──────────────────────────────────
  var dataEl = document.getElementById("wardley-data");
  var constsEl = document.getElementById("render-constants");
  var mapModel = dataEl ? JSON.parse(dataEl.textContent) : null;
  var renderConstants = constsEl ? JSON.parse(constsEl.textContent) : null;
  var interactive = ${interactive ? "true" : "false"};
  if(!interactive || !mapModel || !renderConstants) return;

  // ── Initial snapshot — frozen copy of the embedded JSON for Reset ──
  var initialSnapshot = JSON.parse(JSON.stringify(mapModel));

  // ── DOM references ──────────────────────────────────────────────
  var svgWrapper = document.getElementById("svg-wrapper");
  var svgEl = svgWrapper ? svgWrapper.querySelector("svg") : null;
  if(!svgEl) return;

  // ── Build element index from data-* attributes ──────────────────
  // Index components by ID for O(1) lookup during interactions
  var componentEls = {};
  svgEl.querySelectorAll("[data-component-id]").forEach(function(el){
    componentEls[el.getAttribute("data-component-id")] = el;
  });

  // Index edges by ID
  var edgeEls = {};
  svgEl.querySelectorAll("[data-edge-id]").forEach(function(el){
    edgeEls[el.getAttribute("data-edge-id")] = el;
  });

  // Index pipeline groups
  var pipelineEls = {};
  svgEl.querySelectorAll("[data-pipeline-id]").forEach(function(el){
    pipelineEls[el.getAttribute("data-pipeline-id")] = el;
  });

  // Cache the plot-area rect element for coordinate conversion
  var plotAreaEl = svgEl.querySelector("[data-plot-area]");

  // ── Coordinate conversion utilities ─────────────────────────────
  // Convert a pointer event (clientX/Y) to evolution/visibility [0-1]
  // using the plot-area element's bounding rect on the responsive SVG.
  var K = renderConstants;

  function pointerToMapCoords(clientX, clientY) {
    // Use plotAreaEl if available, otherwise fall back to constants + SVG rect
    var rect;
    if (plotAreaEl) {
      rect = plotAreaEl.getBoundingClientRect();
    } else {
      // Fallback: compute from SVG element and constants
      var svgRect = svgEl.getBoundingClientRect();
      var scaleX = svgRect.width / K.canvasWidth;
      var scaleY = svgRect.height / K.canvasHeight;
      rect = {
        left: svgRect.left + K.plot.left * scaleX,
        top: svgRect.top + K.plot.top * scaleY,
        width: K.plot.width * scaleX,
        height: K.plot.height * scaleY,
      };
    }
    var evolution = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    var visibility = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { evolution: evolution, visibility: visibility };
  }

  function mapCoordsToPixel(evolution, visibility) {
    return {
      x: K.plot.left + evolution * K.plot.width,
      y: K.plot.top + visibility * K.plot.height,
    };
  }

  // ── Build component lookup from model ───────────────────────────
  var componentsById = {};
  (mapModel.components || []).forEach(function(c) {
    componentsById[c.id] = c;
  });

  // ── Build relation lookup from model ────────────────────────────
  var relationsById = {};
  (mapModel.relations || []).forEach(function(r) {
    if (r.id) relationsById[r.id] = r;
  });

  // ── Deep clone utility ──────────────────────────────────────────
  // Structured-clone-safe deep clone via JSON round-trip.
  // Used before every mutation to preserve immutable snapshots.
  function cloneModel(model) {
    return JSON.parse(JSON.stringify(model));
  }

  // ── Undo history (snapshot-based) ───────────────────────────────
  var undoStack = [];
  var MAX_UNDO = 50;

  function pushUndo() {
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    undoStack.push(cloneModel(mapModel));
  }

  function popUndo() {
    if (undoStack.length === 0) return null;
    return undoStack.pop();
  }

  // ── Diff buffer (operation log) ────────────────────────────────
  // Accumulates diff operations for communication with Claude.
  // Each entry is a self-contained op object with type + payload.
  // The buffer is append-only between flushes, serving as an op log.
  var diffBuffer = [];

  function addDiff(op) {
    diffBuffer.push(op);
  }

  function flushDiffs() {
    var ops = diffBuffer.slice();
    diffBuffer.length = 0;
    return ops;
  }

  function getDiffCount() {
    return diffBuffer.length;
  }

  // ── Index rebuild helpers ──────────────────────────────────────
  // After model mutations, rebuild the lookup indices from scratch.
  function rebuildComponentIndex() {
    componentsById = {};
    (mapModel.components || []).forEach(function(c) {
      componentsById[c.id] = c;
    });
  }

  function rebuildRelationIndex() {
    relationsById = {};
    (mapModel.relations || []).forEach(function(r) {
      if (r.id) relationsById[r.id] = r;
    });
  }

  function rebuildIndices() {
    rebuildComponentIndex();
    rebuildRelationIndex();
  }

  // ── Full SVG re-render from model state ───────────────────────
  // After any model mutation (move, resize, rename, add, delete, undo),
  // call reRenderSVG() to replace the SVG content with a fresh render
  // that accurately reflects the current mapModel. This ensures edges,
  // labels, evolves-to arrows, and all visual elements stay in sync.
  //
  // Strategy:
  //   1. If window.__wardleyRender(model) is provided by the host, use it
  //   Client-side DOM patching: updates SVG element attributes directly
  //   from the mutated mapModel without needing server-side renderToSVG().
  //   Works offline, in file:// protocol, and in Insomnia previews.

  // ── Per-element SVG patching functions ───────────────────────────

  function patchComponentNode(compId) {
    var comp = componentsById[compId];
    if (!comp) return;
    var gEl = componentEls[compId];
    if (!gEl) return;
    var px = mapCoordsToPixel(comp.position.evolution.scalar, comp.position.visibility.scalar);
    var circle = gEl.querySelector("circle");
    if (!circle) return;
    var curX = parseFloat(circle.getAttribute("cx"));
    var curY = parseFloat(circle.getAttribute("cy"));
    var dx = px.x - curX;
    var dy = px.y - curY;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;
    // Shift all circles (main + aura/ecosystem rings)
    gEl.querySelectorAll("circle").forEach(function(c) {
      c.setAttribute("cx", String(parseFloat(c.getAttribute("cx")) + dx));
      c.setAttribute("cy", String(parseFloat(c.getAttribute("cy")) + dy));
    });
    // Shift ellipses
    gEl.querySelectorAll("ellipse").forEach(function(el) {
      el.setAttribute("cx", String(parseFloat(el.getAttribute("cx")) + dx));
      el.setAttribute("cy", String(parseFloat(el.getAttribute("cy")) + dy));
    });
    // Shift polylines/polygons (anchor silhouette, market triangle)
    gEl.querySelectorAll("polyline, polygon").forEach(function(el) {
      var pts = el.getAttribute("points");
      if (!pts) return;
      var shifted = pts.trim().split(/\s+/).map(function(pair) {
        var xy = pair.split(",");
        return (parseFloat(xy[0]) + dx) + "," + (parseFloat(xy[1]) + dy);
      }).join(" ");
      el.setAttribute("points", shifted);
    });
    // Shift rects (method badges etc.)
    gEl.querySelectorAll("rect").forEach(function(r) {
      r.setAttribute("x", String(parseFloat(r.getAttribute("x")) + dx));
      r.setAttribute("y", String(parseFloat(r.getAttribute("y")) + dy));
    });
    // Shift text elements inside the component group
    gEl.querySelectorAll("text").forEach(function(t) {
      t.setAttribute("x", String(parseFloat(t.getAttribute("x") || "0") + dx));
      t.setAttribute("y", String(parseFloat(t.getAttribute("y") || "0") + dy));
    });
    // Shift lines inside the component group (e.g. inertia markers)
    gEl.querySelectorAll("line").forEach(function(l) {
      l.setAttribute("x1", String(parseFloat(l.getAttribute("x1")) + dx));
      l.setAttribute("y1", String(parseFloat(l.getAttribute("y1")) + dy));
      l.setAttribute("x2", String(parseFloat(l.getAttribute("x2")) + dx));
      l.setAttribute("y2", String(parseFloat(l.getAttribute("y2")) + dy));
    });
  }

  function patchLabel(compId) {
    var comp = componentsById[compId];
    if (!comp) return;
    var labelEl = svgEl.querySelector("[data-label-for='" + compId + "']");
    if (!labelEl) return;
    var px = mapCoordsToPixel(comp.position.evolution.scalar, comp.position.visibility.scalar);
    var defaultDx = (K.nodeRadii[comp.type] || K.nodeRadii._default || 5) + 4;
    var dxOff = (comp.label && comp.label.position && comp.label.position.dx != null) ? comp.label.position.dx : defaultDx;
    var dyOff = (comp.label && comp.label.position && comp.label.position.dy != null) ? comp.label.position.dy : 4;
    var lx = px.x + dxOff;
    var ly = px.y + dyOff;
    labelEl.setAttribute("x", String(lx));
    labelEl.setAttribute("y", String(ly));
    // Update tspan x coords for multiline labels
    labelEl.querySelectorAll("tspan").forEach(function(ts) {
      ts.setAttribute("x", String(lx));
    });
  }

  function patchLabelText(compId) {
    var comp = componentsById[compId];
    if (!comp) return;
    var labelEl = svgEl.querySelector("[data-label-for='" + compId + "']");
    if (!labelEl) return;
    // Simple update — set text content (handles single-line)
    var tspans = labelEl.querySelectorAll("tspan");
    if (tspans.length === 0) {
      labelEl.textContent = comp.label.name;
    }
    // For multiline (tspans), update the first tspan
    else if (tspans.length > 0) {
      tspans[0].textContent = comp.label.name;
    }
  }

  function patchEdge(relId) {
    var rel = relationsById[relId];
    if (!rel) return;
    var gEl = edgeEls[relId];
    if (!gEl) return;
    var srcComp = componentsById[rel.consumer];
    var tgtComp = componentsById[rel.supplier];
    if (!srcComp || !tgtComp) return;
    var srcPx = mapCoordsToPixel(srcComp.position.evolution.scalar, srcComp.position.visibility.scalar);
    var tgtPx = mapCoordsToPixel(tgtComp.position.evolution.scalar, tgtComp.position.visibility.scalar);
    // Update all <line> elements (visible line + hit area)
    gEl.querySelectorAll("line").forEach(function(line) {
      line.setAttribute("x1", String(srcPx.x));
      line.setAttribute("y1", String(srcPx.y));
      line.setAttribute("x2", String(tgtPx.x));
      line.setAttribute("y2", String(tgtPx.y));
    });
  }

  // Port of arrowheadPoints() from evolvesto-layer.ts
  function computeArrowheadPoints(fromX, fromY, toX, toY, size) {
    var dx = toX - fromX;
    var dy = toY - fromY;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return "";
    var ux = dx / len, uy = dy / len;
    var px = -uy, py = ux;
    var half = size / 2;
    var baseX = toX - ux * size;
    var baseY = toY - uy * size;
    return toX + "," + toY + " " + (baseX + px * half) + "," + (baseY + py * half) + " " + (baseX - px * half) + "," + (baseY - py * half);
  }

  function patchEvolvesTo(fromCompId) {
    var comp = componentsById[fromCompId];
    if (!comp || !comp.evolvesTo || !Array.isArray(comp.evolvesTo) || comp.evolvesTo.length === 0) return;
    var gEl = svgEl.querySelector("[data-evolves-from='" + fromCompId + "']");
    if (!gEl) return;
    var fromPx = mapCoordsToPixel(comp.position.evolution.scalar, comp.position.visibility.scalar);
    // evolvesTo[0] contains the target position
    var evo = comp.evolvesTo[0];
    if (!evo || !evo.position) return;
    var toPx = mapCoordsToPixel(evo.position.evolution.scalar, evo.position.visibility.scalar);
    // Update lines (visible + hit area)
    gEl.querySelectorAll("line").forEach(function(line) {
      line.setAttribute("x1", String(fromPx.x));
      line.setAttribute("y1", String(fromPx.y));
      line.setAttribute("x2", String(toPx.x));
      line.setAttribute("y2", String(toPx.y));
    });
    // Update arrowhead polygon
    var polygon = gEl.querySelector("polygon");
    if (polygon) {
      var pts = computeArrowheadPoints(fromPx.x, fromPx.y, toPx.x, toPx.y, 8);
      if (pts) polygon.setAttribute("points", pts);
    }
  }

  function patchStep(stepId) {
    var steps = mapModel.steps || [];
    var step = null;
    for (var si = 0; si < steps.length; si++) {
      if (steps[si].id === stepId) { step = steps[si]; break; }
    }
    if (!step) return;
    var gEl = svgEl.querySelector("[data-step-id='" + stepId + "']");
    if (!gEl) return;
    var px = mapCoordsToPixel(step.position.evolution.scalar, step.position.visibility.scalar);
    var circle = gEl.querySelector("circle");
    if (circle) {
      circle.setAttribute("cx", String(px.x));
      circle.setAttribute("cy", String(px.y));
    }
    var text = gEl.querySelector("text");
    if (text) {
      text.setAttribute("x", String(px.x));
      text.setAttribute("y", String(px.y));
    }
  }

  // ── Orchestrator: patch all SVG elements from current model state ──

  function patchSVGFromModel() {
    var comps = mapModel.components || [];
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      patchComponentNode(c.id);
      patchLabel(c.id);
      if (c.type === "pipeline" && c.pipelineGeometry) {
        updatePipelineSVG(c.id, c.pipelineGeometry);
      }
    }
    var rels = mapModel.relations || [];
    for (var j = 0; j < rels.length; j++) {
      if (rels[j].id) patchEdge(rels[j].id);
    }
    for (var k = 0; k < comps.length; k++) {
      if (comps[k].evolvesTo) patchEvolvesTo(comps[k].id);
    }
    var steps = mapModel.steps || [];
    for (var s = 0; s < steps.length; s++) {
      patchStep(steps[s].id);
    }

    // Remove stale DOM elements for deleted components, edges, evolvesTo, pipelines, labels
    removeStaleElements();
  }

  // ── Stale element removal ──────────────────────────────────────
  // After model mutations (delete_component, delete_edge, set_evolves_to null),
  // DOM elements may remain for entities no longer in the model.
  // This function removes them and cleans up the element indices.
  function removeStaleElements() {
    var comps = mapModel.components || [];
    var rels = mapModel.relations || [];

    // Build fast lookup sets from current model
    var compIds = {};
    var compWithEvolvesTo = {};
    for (var i = 0; i < comps.length; i++) {
      compIds[comps[i].id] = true;
      if (comps[i].evolvesTo) compWithEvolvesTo[comps[i].id] = true;
    }
    var relIds = {};
    for (var j = 0; j < rels.length; j++) {
      if (rels[j].id) relIds[rels[j].id] = true;
    }

    // Remove stale component elements
    var compKey;
    for (compKey in componentEls) {
      if (!compIds[compKey]) {
        var cEl = componentEls[compKey];
        if (cEl && cEl.parentNode) cEl.parentNode.removeChild(cEl);
        delete componentEls[compKey];
      }
    }

    // Remove stale edge elements
    var edgeKey;
    for (edgeKey in edgeEls) {
      if (!relIds[edgeKey]) {
        var eEl = edgeEls[edgeKey];
        if (eEl && eEl.parentNode) eEl.parentNode.removeChild(eEl);
        delete edgeEls[edgeKey];
      }
    }

    // Remove stale pipeline elements
    var pipKey;
    for (pipKey in pipelineEls) {
      if (!compIds[pipKey]) {
        var pEl = pipelineEls[pipKey];
        if (pEl && pEl.parentNode) pEl.parentNode.removeChild(pEl);
        delete pipelineEls[pipKey];
      }
    }

    // Remove stale evolvesTo arrow elements
    svgEl.querySelectorAll("[data-evolves-from]").forEach(function(el) {
      var fromId = el.getAttribute("data-evolves-from");
      if (!compWithEvolvesTo[fromId]) {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });

    // Remove stale label elements
    svgEl.querySelectorAll("[data-label-for]").forEach(function(el) {
      var labelFor = el.getAttribute("data-label-for");
      if (!compIds[labelFor]) {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });
  }

  // ── Re-render dispatcher ─────────────────────────────────────────
  //
  // For positional changes (drag, resize, rename): patchSVGFromModel()
  // For structural changes (add/delete): try fetch, fall back to patch
  var reRenderPending = false;

  function reRenderSVG(structural) {
    if (!structural) {
      patchSVGFromModel();
      return;
    }

    // Structural change: try host-provided render first
    if (window.__wardleyRender && typeof window.__wardleyRender === "function") {
      try {
        var newSvg = window.__wardleyRender(mapModel);
        if (typeof newSvg === "string" && newSvg.indexOf("<svg") !== -1) {
          replaceSVGContent(newSvg);
          return;
        }
      } catch(ignored) {}
    }

    // Try fetch to origin server (works when API is running)
    if (typeof fetch !== "undefined" && location.protocol !== "file:") {
      if (reRenderPending) { patchSVGFromModel(); return; }
      reRenderPending = true;
      var modelJSON = JSON.stringify(mapModel);
      fetch(location.origin + "/v1/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/html",
        },
        body: modelJSON,
      })
      .then(function(resp) {
        reRenderPending = false;
        if (!resp.ok) { patchSVGFromModel(); return; }
        return resp.text();
      })
      .then(function(html) {
        if (!html) return;
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, "text/html");
        var wrapper = doc.getElementById("svg-wrapper");
        if (wrapper) {
          var svgContent = wrapper.innerHTML;
          if (svgContent && svgContent.indexOf("<svg") !== -1) {
            replaceSVGContent(svgContent);
            return;
          }
        }
        // Fetch succeeded but no valid SVG — fall back to patch
        patchSVGFromModel();
      })
      .catch(function() {
        reRenderPending = false;
        patchSVGFromModel();
      });
    } else {
      // Offline or file:// — best-effort DOM patch
      patchSVGFromModel();
    }
  }

  // Resolve a DOM element by selection type and id after re-render
  function _findElBySelection(type, id) {
    if (type === "component") return componentEls[id] || null;
    if (type === "edge") return edgeEls[id] || null;
    if (type === "pipeline") return pipelineEls[id] || null;
    if (type === "label") return svgEl.querySelector("[data-label-for='" + id + "']") || null;
    if (type === "step") {
      return svgEl.querySelector("[data-step-id='" + id + "']") || null;
    }
    if (type === "evolves") return svgEl.querySelector("[data-evolves-from='" + id + "']") || null;
    return null;
  }

  // Replace SVG children in-place (preserves the <svg> element and its event listeners).
  // Parses the new SVG HTML, extracts children, and swaps them into the existing svgEl.
  function replaceSVGContent(svgHTML) {
    // Remember current selection for restoration
    var prevSelection = selection.type ? { type: selection.type, id: selection.id } : null;

    // Preserve legend layer (complex server-rendered, not yet ported to client-side)
    var legendEl = svgEl.querySelector('[data-layer="legend"]');
    if (legendEl) legendEl = legendEl.cloneNode(true);

    // Parse the new SVG markup into a temporary container
    var tmp = document.createElement("div");
    tmp.innerHTML = svgHTML;
    var newSvg = tmp.querySelector("svg");
    if (!newSvg) return;

    // Clear existing children and adopt new ones, preserving the svgEl reference
    // (and all event listeners attached to it)
    while (svgEl.lastChild) svgEl.removeChild(svgEl.lastChild);
    while (newSvg.firstChild) svgEl.appendChild(newSvg.firstChild);

    // Re-insert preserved legend layer
    if (legendEl) svgEl.appendChild(legendEl);
    rubberBandLine = null; // destroyed by DOM replacement

    // Copy over any changed attributes from the new SVG (e.g., viewBox)
    for (var ai = 0; ai < newSvg.attributes.length; ai++) {
      var attr = newSvg.attributes[ai];
      svgEl.setAttribute(attr.name, attr.value);
    }

    // Rebuild all DOM element indices
    componentEls = {};
    svgEl.querySelectorAll("[data-component-id]").forEach(function(el) {
      componentEls[el.getAttribute("data-component-id")] = el;
    });
    edgeEls = {};
    svgEl.querySelectorAll("[data-edge-id]").forEach(function(el) {
      edgeEls[el.getAttribute("data-edge-id")] = el;
    });
    pipelineEls = {};
    svgEl.querySelectorAll("[data-pipeline-id]").forEach(function(el) {
      pipelineEls[el.getAttribute("data-pipeline-id")] = el;
    });
    plotAreaEl = svgEl.querySelector("[data-plot-area]");

    // Update shared namespace DOM references
    window.__wardley.plotAreaEl = plotAreaEl;
    window.__wardley.componentEls = componentEls;
    window.__wardley.edgeEls = edgeEls;
    window.__wardley.pipelineEls = pipelineEls;

    // Restore selection visual state
    if (prevSelection && prevSelection.id) {
      var targetEl = _findElBySelection(prevSelection.type, prevSelection.id);
      if (targetEl) {
        targetEl.classList.add("wm-selected");
      }
      // Also restore multi-selection highlights
      selectedIds.forEach(function(sid) {
        var meta = selectedMeta[sid];
        var el = meta ? _findElBySelection(meta.type, sid) : (componentEls[sid] || edgeEls[sid] || pipelineEls[sid]);
        if (el) {
          el.classList.add("wm-selected");
          if (meta) meta.el = el; // update stale DOM reference
        }
      });
    }
  }

  // ── Apply operation ───────────────────────────────────────────
  // Central mutation entry point: deep-clones the model before
  // applying any change, records the op in the diff buffer.
  //
  // Usage: applyOp("move_component", { id, evolution, visibility }, function(m) { ... })
  //
  // The mutator callback receives the deep-cloned mapModel and must
  // mutate it in place. Each undo snapshot is an independent copy
  // taken BEFORE the clone+mutation, so undo restores correctly.
  //
  // Returns true if the operation was applied, false if skipped.
  function applyOp(opType, payload, mutator) {
    // 1. Snapshot current state for undo (deep clone)
    pushUndo();

    // 2. Deep-clone the model and replace the live reference
    mapModel = cloneModel(mapModel);

    // 3. Apply the mutation on the fresh clone
    try {
      mutator(mapModel);
    } catch (e) {
      // Roll back on error — restore from undo stack
      mapModel = popUndo();
      rebuildIndices();
      return false;
    }

    // 4. Rebuild lookup indices from mutated model
    rebuildIndices();

    // 5. Record the operation in the diff buffer (op log)
    addDiff({ op: opType, payload: payload });

    // 6. Update the shared namespace
    window.__wardley.mapModel = mapModel;
    window.__wardley.componentsById = componentsById;
    window.__wardley.relationsById = relationsById;

    return true;
  }

  // ── Undo via snapshot restore ─────────────────────────────────
  // Pops the last snapshot and restores it as the current model.
  // Records an "undo" entry in the diff buffer so Claude sees it.
  function performUndo() {
    var snapshot = popUndo();
    if (!snapshot) return false;
    mapModel = snapshot;
    rebuildIndices();
    // Clear selection — undone entities may no longer exist
    clearSelection();
    // Record undo in the op log (no additional undo snapshot pushed)
    addDiff({ op: "undo", payload: {} });
    window.__wardley.mapModel = mapModel;
    window.__wardley.componentsById = componentsById;
    window.__wardley.relationsById = relationsById;
    return true;
  }

  // ── Selection state ─────────────────────────────────────────────
  // Primary selection (last-clicked entity for context zone)
  var selection = {
    type: null,    // "component" | "edge" | "pipeline" | "step" | "label" | "evolves" | null
    id: null,      // selected element ID
    el: null,      // selected DOM element
  };

  // Multi-selection Set: tracks all selected entity IDs (components + edges + pipelines)
  var selectedIds = new Set();

  // Map from id → { type, el } for all currently selected entities
  var selectedMeta = {};

  function _removeFromSelected(id) {
    var meta = selectedMeta[id];
    if (meta && meta.el) {
      meta.el.classList.remove("wm-selected");
    }
    selectedIds.delete(id);
    delete selectedMeta[id];
  }

  function clearSelection() {
    // Remove wm-selected from all selected elements
    selectedIds.forEach(function(id) {
      var meta = selectedMeta[id];
      if (meta && meta.el) {
        meta.el.classList.remove("wm-selected");
      }
    });
    selectedIds.clear();
    selectedMeta = {};
    selection.type = null;
    selection.id = null;
    selection.el = null;
  }

  function _addToSelected(id, type, el) {
    selectedIds.add(id);
    selectedMeta[id] = { type: type, el: el };
    if (el) el.classList.add("wm-selected");
    // Update primary selection to most recently added
    selection.type = type;
    selection.id = id;
    selection.el = el;
  }

  function selectComponent(id, shiftKey) {
    var el = componentEls[id];
    if (shiftKey) {
      // Shift+click: toggle this component in/out of selection set
      if (selectedIds.has(id)) {
        _removeFromSelected(id);
        // If we removed the primary selection, update it to another selected item or null
        if (selection.id === id) {
          var remaining = Array.from(selectedIds);
          if (remaining.length > 0) {
            var lastId = remaining[remaining.length - 1];
            var lastMeta = selectedMeta[lastId];
            selection.type = lastMeta.type;
            selection.id = lastId;
            selection.el = lastMeta.el;
          } else {
            selection.type = null;
            selection.id = null;
            selection.el = null;
          }
        }
      } else if (el) {
        _addToSelected(id, "component", el);
      }
    } else {
      // Normal click: single-select this component only
      clearSelection();
      if (el) {
        _addToSelected(id, "component", el);
      }
    }
  }

  function isSelected(id) {
    return selectedIds.has(id);
  }

  function getSelectedIds() {
    return Array.from(selectedIds);
  }

  function getSelectedByType(type) {
    var result = [];
    selectedIds.forEach(function(id) {
      var meta = selectedMeta[id];
      if (meta && meta.type === type) result.push(id);
    });
    return result;
  }

  // ── Global bar wiring ───────────────────────────────────────────
  var btnAddComponent = document.getElementById("btn-add-component");
  var btnAddEdge = document.getElementById("btn-add-edge");
  var btnAddEvolves = document.getElementById("btn-add-evolves");
  var btnCopy = document.getElementById("btn-copy");
  var btnApply = document.getElementById("btn-apply");
  var counterDisplay = document.getElementById("counter-display");

  function countComponents() {
    return (mapModel.components || []).length;
  }
  function countEdges() {
    return (mapModel.relations || []).length;
  }
  function updateCounters() {
    if (counterDisplay) {
      counterDisplay.textContent = countComponents() + " components, " + countEdges() + " edges";
    }
  }
  function updateApplyCopyState() {
    var hasDiffs = diffBuffer.length > 0;
    if (btnCopy) btnCopy.disabled = !hasDiffs;
    if (btnApply) btnApply.disabled = !hasDiffs;
  }

  // Override addDiff to also update button state
  var _origAddDiff = addDiff;
  addDiff = function(op) {
    _origAddDiff(op);
    updateApplyCopyState();
  };

  // Override flushDiffs to also update button state
  var _origFlush = flushDiffs;
  flushDiffs = function() {
    var result = _origFlush();
    updateApplyCopyState();
    return result;
  };

  // Copy: raw JSON array of diff ops to clipboard (non-destructive read)
  if (btnCopy) {
    btnCopy.addEventListener("click", function() {
      if (diffBuffer.length === 0) return;
      var json = JSON.stringify(diffBuffer, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).catch(function() {});
      }
    });
  }

  // Apply: send to Claude via window.claude.complete() with feature detection
  if (btnApply) {
    btnApply.addEventListener("click", function() {
      var ops = flushDiffs();
      if (ops.length === 0) return;
      var mapTitle = document.title && document.title !== "Wardley Map" ? document.title : "";
      var prefix = mapTitle
        ? "Apply these diff operations to Wardley Map " + JSON.stringify(mapTitle) + ":"
        : "Apply these Wardley Map diff operations:";
      var message = prefix + String.fromCharCode(10) + JSON.stringify(ops, null, 2);
      if (window.claude && typeof window.claude.complete === "function") {
        window.claude.complete(message);
      } else {
        // Fallback: copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(JSON.stringify(ops, null, 2)).catch(function() {});
        }
      }
    });
  }

  // ── Undo button wiring ───────────────────────────────────────────
  var btnUndo = document.getElementById("btn-undo");
  var btnReset = document.getElementById("btn-reset");

  function updateUndoState() {
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  }

  // Override pushUndo to also update undo button state
  var _origPushUndo = pushUndo;
  pushUndo = function() {
    _origPushUndo();
    updateUndoState();
  };

  // Override popUndo to also update undo button state
  var _origPopUndo = popUndo;
  popUndo = function() {
    var result = _origPopUndo();
    updateUndoState();
    return result;
  };

  if (btnUndo) {
    btnUndo.addEventListener("click", function() {
      if (performUndo()) {
        reRenderSVG(true);
        updateCounters();
        updateUndoState();
        hideContextZone();
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", function() {
      // Confirm reset if there are pending diffs
      if (diffBuffer.length > 0 || undoStack.length > 0) {
        if (!confirm("Discard all unsent changes?")) return;
      }
      // Restore model from initial embedded JSON snapshot
      mapModel = JSON.parse(JSON.stringify(initialSnapshot));
      rebuildIndices();
      // Clear undo history and diff buffer
      undoStack.length = 0;
      diffBuffer.length = 0;
      // Clear selection state
      clearSelection();
      hideContextZone();
      // Sync shared namespace
      window.__wardley.mapModel = mapModel;
      window.__wardley.componentsById = componentsById;
      window.__wardley.relationsById = relationsById;
      // Update all UI state
      updateCounters();
      updateUndoState();
      updateApplyCopyState();
      // Re-render SVG if available, otherwise reload as fallback
      if (typeof reRenderSVG === "function") {
        reRenderSVG(true);
      } else {
        location.reload();
      }
    });
  }

  // Keyboard shortcut: Ctrl+Z / Cmd+Z for undo
  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (performUndo()) {
        reRenderSVG(true);
        updateCounters();
        updateUndoState();
        hideContextZone();
      }
    }
  });

  // Add-component: enter placement mode (click on map to place)
  var placementMode = null; // null | "component" | "edge-src" | "edge-dst" | "evolves-src" | "evolves-dst"
  var edgeSrcId = null;
  var evolvesSrcId = null;

  /** Clear all mode button highlights and reset cursor */
  function clearModeUI() {
    if (btnAddComponent) btnAddComponent.style.borderColor = "";
    if (btnAddEdge) btnAddEdge.style.borderColor = "";
    if (btnAddEvolves) btnAddEvolves.style.borderColor = "";
    svgEl.style.cursor = "";
    clearPlacementSourceHighlight();
    hideRubberBand();
  }

  // ── Rubber-band line for edge/evolves placement ──────────────────
  var rubberBandLine = null;

  /** Convert client (mouse) coordinates to SVG user-space coordinates */
  function clientToSVG(clientX, clientY) {
    var pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var ctm = svgEl.getScreenCTM();
    if (ctm) {
      var svgPt = pt.matrixTransform(ctm.inverse());
      return { x: svgPt.x, y: svgPt.y };
    }
    var rect = svgEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * K.canvasWidth,
      y: (clientY - rect.top) / rect.height * K.canvasHeight
    };
  }

  /** Get center coordinates of a component in SVG space */
  function getComponentCenter(componentId) {
    var comp = componentsById[componentId];
    if (!comp) return null;
    return mapCoordsToPixel(comp.position.evolution.scalar, comp.position.visibility.scalar);
  }

  /** Create or return the rubber-band SVG line element */
  function ensureRubberBand() {
    if (rubberBandLine) return rubberBandLine;
    var ns = "http://www.w3.org/2000/svg";
    rubberBandLine = document.createElementNS(ns, "line");
    rubberBandLine.setAttribute("class", "wm-rubber-band");
    rubberBandLine.setAttribute("stroke-width", "1.5");
    rubberBandLine.setAttribute("stroke-dasharray", "6 4");
    rubberBandLine.setAttribute("pointer-events", "none");
    rubberBandLine.style.display = "none";
    svgEl.appendChild(rubberBandLine);
    return rubberBandLine;
  }

  /** Show rubber-band line from source position to cursor position */
  function updateRubberBand(srcX, srcY, cursorX, cursorY) {
    var line = ensureRubberBand();
    line.setAttribute("x1", String(srcX));
    line.setAttribute("y1", String(srcY));
    line.setAttribute("x2", String(cursorX));
    line.setAttribute("y2", String(cursorY));
    line.style.display = "";
  }

  /** Hide the rubber-band line */
  function hideRubberBand() {
    if (rubberBandLine) rubberBandLine.style.display = "none";
  }

  // ── Mousemove handler for rubber-band during placement ───────────
  svgEl.addEventListener("mousemove", function(e) {
    if (placementMode !== "edge-dst" && placementMode !== "evolves-dst") {
      if (rubberBandLine && rubberBandLine.style.display !== "none") hideRubberBand();
      return;
    }
    var srcId = placementMode === "edge-dst" ? edgeSrcId : evolvesSrcId;
    if (!srcId) return;
    var src = getComponentCenter(srcId);
    if (!src) return;
    var cursor = clientToSVG(e.clientX, e.clientY);
    updateRubberBand(src.x, src.y, cursor.x, cursor.y);
  });

  /** Highlight the selected source node with a glow effect during edge/evolves placement */
  function highlightPlacementSource(componentId) {
    clearPlacementSourceHighlight();
    if (!componentId) return;
    var el = componentEls[componentId];
    if (el) el.classList.add("wm-placement-source");
  }

  /** Remove placement source highlight from all nodes */
  function clearPlacementSourceHighlight() {
    var highlighted = svgEl.querySelectorAll(".wm-placement-source");
    for (var i = 0; i < highlighted.length; i++) {
      highlighted[i].classList.remove("wm-placement-source");
    }
  }

  /** Exit placement mode completely */
  function exitPlacementMode() {
    placementMode = null;
    edgeSrcId = null;
    evolvesSrcId = null;
    clearModeUI();
  }

  if (btnAddComponent) {
    btnAddComponent.addEventListener("click", function() {
      if (placementMode === "component") {
        exitPlacementMode();
        return;
      }
      exitPlacementMode();
      placementMode = "component";
      btnAddComponent.style.borderColor = "var(--accent)";
      svgEl.style.cursor = "crosshair";
    });
  }

  if (btnAddEdge) {
    btnAddEdge.addEventListener("click", function() {
      if (placementMode === "edge-src" || placementMode === "edge-dst") {
        exitPlacementMode();
        return;
      }
      exitPlacementMode();
      placementMode = "edge-src";
      btnAddEdge.style.borderColor = "var(--accent)";
      svgEl.style.cursor = "crosshair";
    });
  }

  if (btnAddEvolves) {
    btnAddEvolves.addEventListener("click", function() {
      if (placementMode === "evolves-src" || placementMode === "evolves-dst") {
        exitPlacementMode();
        return;
      }
      exitPlacementMode();
      placementMode = "evolves-src";
      btnAddEvolves.style.borderColor = "var(--accent)";
      svgEl.style.cursor = "crosshair";
    });
  }

  // ── SVG click handler for placement modes ─────────────────────────
  // Modes persist until the user clicks on an empty area (no component).
  // - component mode: click on empty area places a new component, mode persists
  //                   click on empty area outside plot = cancel mode
  // - edge-src/edge-dst: click component to pick src→dst, mode loops to edge-src
  // - evolves-src/evolves-dst: click component to set evolvesTo, mode loops
  // - click on empty area in any mode = exit the mode
  svgEl.addEventListener("click", function(e) {
    if (!placementMode) return;

    // Find the closest interactive element from click target
    var target = e.target;
    var compEl = target.closest ? target.closest("[data-component-id]") : null;

    // ── Component placement mode ──────────────────────────────────
    if (placementMode === "component") {
      // Click must be on the plot area (empty space), not on existing component
      if (compEl) return; // ignore clicks on existing components
      var coords = pointerToMapCoords(e.clientX, e.clientY);
      if (!coords) return;
      var newId = "comp_" + Date.now();
      var newLabel = (ctxAddLabel && ctxAddLabel.value.trim()) || "New Component";
      var newType = (ctxAddType && ctxAddType.value) || "component";
      var evo = +coords.evolution.toFixed(3);
      var vis = +coords.visibility.toFixed(3);
      var newComp = {
        id: newId,
        label: newLabel,
        position: { evolution: { scalar: evo }, visibility: vis },
        type: newType
      };
      // Pipeline default geometry: +/-0.1 evolution, +/-0.05 visibility, clamped to [0,1]
      var pipeGeo = null;
      if (newType === "pipeline") {
        pipeGeo = {
          evoStart: +Math.max(0, evo - 0.1).toFixed(3),
          evoEnd: +Math.min(1, evo + 0.1).toFixed(3),
          visStart: +Math.max(0, vis - 0.05).toFixed(3),
          visEnd: +Math.min(1, vis + 0.05).toFixed(3)
        };
        newComp.pipelineGeometry = pipeGeo;
      }
      applyOp("add_component", newComp, function(m) {
        if (!m.components) m.components = [];
        var c = {
          id: newId,
          label: newLabel,
          position: { evolution: { scalar: evo }, visibility: vis },
          type: newType
        };
        if (pipeGeo) c.pipelineGeometry = pipeGeo;
        m.components.push(c);
      });
      reRenderSVG(true);
      updateCounters();
      updateContextZone();
      // Mode persists — stay in "component" mode for next placement
      return;
    }

    // ── Edge source selection ─────────────────────────────────────
    if (placementMode === "edge-src") {
      if (!compEl) {
        // Click on empty area → exit mode
        exitPlacementMode();
        updateContextZone();
        return;
      }
      edgeSrcId = compEl.getAttribute("data-component-id");
      placementMode = "edge-dst";
      highlightPlacementSource(edgeSrcId);
      updateContextZone();
      return;
    }

    // ── Edge target selection ─────────────────────────────────────
    if (placementMode === "edge-dst") {
      if (!compEl) {
        // Click on empty area → exit mode
        exitPlacementMode();
        updateContextZone();
        return;
      }
      var edgeDstId = compEl.getAttribute("data-component-id");
      if (edgeDstId === edgeSrcId) return; // can't self-link
      var newEdgeId = "rel_" + Date.now();
      applyOp("add_edge", {
        id: newEdgeId,
        consumer: edgeSrcId,
        supplier: edgeDstId,
        type: "dependency"
      }, function(m) {
        if (!m.relations) m.relations = [];
        m.relations.push({
          id: newEdgeId,
          consumer: edgeSrcId,
          supplier: edgeDstId,
          type: "dependency"
        });
      });
      reRenderSVG(true);
      updateCounters();
      // Mode persists — loop back to edge-src for next edge
      clearPlacementSourceHighlight();
      edgeSrcId = null;
      placementMode = "edge-src";
      updateContextZone();
      return;
    }

    // ── EvolvesTo source selection ────────────────────────────────
    if (placementMode === "evolves-src") {
      if (!compEl) {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      evolvesSrcId = compEl.getAttribute("data-component-id");
      placementMode = "evolves-dst";
      highlightPlacementSource(evolvesSrcId);
      updateContextZone();
      return;
    }

    // ── EvolvesTo target selection ────────────────────────────────
    if (placementMode === "evolves-dst") {
      if (!compEl) {
        exitPlacementMode();
        updateContextZone();
        return;
      }
      var evolvesDstId = compEl.getAttribute("data-component-id");
      if (evolvesDstId === evolvesSrcId) return; // can't self-evolve
      applyOp("set_evolves_to", {
        id: evolvesSrcId,
        evolvesTo: evolvesDstId
      }, function(m) {
        var comp = (m.components || []).find(function(c) { return c.id === evolvesSrcId; });
        if (comp) comp.evolvesTo = evolvesDstId;
      });
      reRenderSVG(true);
      updateCounters();
      // Mode persists — loop back to evolves-src for next link
      clearPlacementSourceHighlight();
      evolvesSrcId = null;
      placementMode = "evolves-src";
      updateContextZone();
      return;
    }
  });

  // ── SVG click handler for selection (non-placement mode) ──────────
  // Delegated handler: clicking on components, edges, pipelines selects them.
  // Shift+click toggles membership in the selection set.
  // Clicking empty space clears selection.
  svgEl.addEventListener("click", function(e) {
    if (placementMode) return; // handled by placement handler above

    var target = e.target;
    var closest = target.closest ? target.closest.bind(target) : function() { return null; };

    // Check for label (before component — labels overlap component groups)
    var labelEl = closest("[data-label-for]");
    if (labelEl) {
      var labelCompId = labelEl.getAttribute("data-label-for");
      if (labelCompId) {
        selectGeneric(labelCompId, "label", labelEl, e.shiftKey);
        return;
      }
    }

    // Check for step
    var stepEl = closest("[data-step-id]");
    if (stepEl) {
      var stepId = stepEl.getAttribute("data-step-id");
      if (stepId) {
        selectGeneric(stepId, "step", stepEl, e.shiftKey);
        return;
      }
    }

    // Check for component
    var compEl = closest("[data-component-id]");
    if (compEl) {
      var compId = compEl.getAttribute("data-component-id");
      if (compId) {
        selectComponent(compId, e.shiftKey);
        return;
      }
    }

    // Check for edge (dependency)
    var edgeEl = closest("[data-edge-id]");
    if (edgeEl) {
      var edgeId = edgeEl.getAttribute("data-edge-id");
      if (edgeId) {
        selectEdge(edgeId, e.shiftKey);
        return;
      }
    }

    // Check for evolves-from edge
    var evolvesEl = closest("[data-evolves-from]");
    if (evolvesEl) {
      var evolvesId = evolvesEl.getAttribute("data-evolves-from");
      if (evolvesId) {
        selectGeneric(evolvesId, "evolves", evolvesEl, e.shiftKey);
        return;
      }
    }

    // Check for pipeline
    var pipeEl = closest("[data-pipeline-id]");
    if (pipeEl) {
      var pipeId = pipeEl.getAttribute("data-pipeline-id");
      if (pipeId) {
        selectPipeline(pipeId, e.shiftKey);
        return;
      }
    }

    // Click on empty space — clear selection
    if (!e.shiftKey) {
      clearSelection();
    }
  });

  // Initialize counter display
  updateCounters();

  // ── Contextual zone ───────────────────────────────────────────────
  // Shows/hides context-specific controls based on selection or mode.
  var contextZone = document.getElementById("context-zone");
  var ctxPanels = {
    component: document.getElementById("ctx-component"),
    edge: document.getElementById("ctx-edge"),
    pipeline: document.getElementById("ctx-pipeline"),
    addComponent: document.getElementById("ctx-add-component"),
    placement: document.getElementById("ctx-placement"),
  };

  // Context zone DOM refs
  var ctxCompName = document.getElementById("ctx-comp-name");
  var ctxCompRename = document.getElementById("ctx-comp-rename");
  var ctxCompRenameBtn = document.getElementById("ctx-comp-rename-btn");
  var ctxCompType = document.getElementById("ctx-comp-type");
  var ctxCompDelete = document.getElementById("ctx-comp-delete");
  var ctxEdgeLabel = document.getElementById("ctx-edge-label");
  var ctxEdgeType = document.getElementById("ctx-edge-type");
  var ctxEdgeDelete = document.getElementById("ctx-edge-delete");
  var ctxPipeName = document.getElementById("ctx-pipe-name");
  var ctxPipeRange = document.getElementById("ctx-pipe-range");
  var ctxPipeDelete = document.getElementById("ctx-pipe-delete");
  var ctxAddType = document.getElementById("ctx-add-type");
  var ctxAddLabel = document.getElementById("ctx-add-label");
  var ctxAddCancel = document.getElementById("ctx-add-cancel");
  var ctxPlacementHint = document.getElementById("ctx-placement-hint");
  var ctxPlacementCancel = document.getElementById("ctx-placement-cancel");

  /** Hide all context panels and the zone itself */
  function hideContextZone() {
    if (!contextZone) return;
    contextZone.classList.remove("visible");
    Object.keys(ctxPanels).forEach(function(k) {
      if (ctxPanels[k]) ctxPanels[k].classList.remove("active");
    });
  }

  /** Show a specific context panel by key */
  function showContextPanel(panelKey) {
    if (!contextZone) return;
    // Deactivate all
    Object.keys(ctxPanels).forEach(function(k) {
      if (ctxPanels[k]) ctxPanels[k].classList.remove("active");
    });
    // Activate the target panel
    if (ctxPanels[panelKey]) {
      ctxPanels[panelKey].classList.add("active");
      contextZone.classList.add("visible");
    }
  }

  /** Update context zone to reflect the current selection state */
  function updateContextZone() {
    // Priority: placement mode > selection > hidden
    var pm = placementMode;
    if (pm) {
      if (pm === "component") {
        showContextPanel("addComponent");
        return;
      }
      showContextPanel("placement");
      if (ctxPlacementHint) {
        if (pm === "edge-src") {
          ctxPlacementHint.textContent = "Click a source component for the new edge (click empty area to exit mode)";
        } else if (pm === "edge-dst") {
          ctxPlacementHint.textContent = "Click a target component for the new edge (click empty area to exit mode)";
        } else if (pm === "evolves-src") {
          ctxPlacementHint.textContent = "Click a source component for evolvesTo (click empty area to exit mode)";
        } else if (pm === "evolves-dst") {
          ctxPlacementHint.textContent = "Click a target component for evolvesTo (click empty area to exit mode)";
        }
      }
      return;
    }

    if (!selection.type || !selection.id) {
      hideContextZone();
      return;
    }

    if (selection.type === "component") {
      var comp = componentsById[selection.id];
      if (!comp) { hideContextZone(); return; }
      showContextPanel("component");
      if (ctxCompName) ctxCompName.textContent = (comp.label && comp.label.name) || comp.id;
      if (ctxCompRename) ctxCompRename.value = (comp.label && comp.label.name) || "";
      if (ctxCompType) ctxCompType.value = comp.type || "component";
    } else if (selection.type === "edge") {
      var rel = relationsById[selection.id];
      if (!rel) { hideContextZone(); return; }
      showContextPanel("edge");
      var srcLabel = componentsById[rel.consumer] ? ((componentsById[rel.consumer].label && componentsById[rel.consumer].label.name) || rel.consumer) : rel.consumer;
      var dstLabel = componentsById[rel.supplier] ? ((componentsById[rel.supplier].label && componentsById[rel.supplier].label.name) || rel.supplier) : rel.supplier;
      if (ctxEdgeLabel) ctxEdgeLabel.textContent = srcLabel + " → " + dstLabel;
      if (ctxEdgeType) ctxEdgeType.value = rel.type || "dependency";
    } else if (selection.type === "pipeline") {
      var pcomp = componentsById[selection.id];
      if (!pcomp) { hideContextZone(); return; }
      showContextPanel("pipeline");
      if (ctxPipeName) ctxPipeName.textContent = ((pcomp.label && pcomp.label.name) || pcomp.id) + " (pipeline)";
      if (ctxPipeRange && pcomp.pipelineGeometry) {
        var pg = pcomp.pipelineGeometry;
        ctxPipeRange.textContent = "evo " + (pg.evoStart != null ? pg.evoStart.toFixed(3) : "?") + " → " + (pg.evoEnd != null ? pg.evoEnd.toFixed(3) : "?") + " | vis " + (pg.visStart != null ? pg.visStart.toFixed(3) : "?") + " → " + (pg.visEnd != null ? pg.visEnd.toFixed(3) : "?");
      }
    }
  }

  // ── Context zone action handlers ──────────────────────────────────

  // Rename component
  if (ctxCompRenameBtn && ctxCompRename) {
    ctxCompRenameBtn.addEventListener("click", function() {
      var newLabel = ctxCompRename.value.trim();
      if (!newLabel || !selection.id || selection.type !== "component") return;
      var id = selection.id;
      applyOp("rename_component", { id: id, label: newLabel }, function(m) {
        var comp = (m.components || []).find(function(c) { return c.id === id; });
        if (comp && comp.label) comp.label.name = newLabel;
      });
      reRenderSVG();
      updateContextZone();
      updateCounters();
    });
    // Enter key triggers rename
    ctxCompRename.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        ctxCompRenameBtn.click();
      }
    });
  }

  // Change component type
  if (ctxCompType) {
    ctxCompType.addEventListener("change", function() {
      var newType = ctxCompType.value;
      if (!selection.id || selection.type !== "component") return;
      var id = selection.id;
      var comp = (mapModel.components || []).find(function(c) { return c.id === id; });
      if (!comp) return;

      // If changing FROM pipeline to non-pipeline, eject contained components
      var wasPipeline = comp.type === "pipeline" && comp.pipelineGeometry;
      if (wasPipeline && newType !== "pipeline") {
        var contained = getContainedComponents(id, comp.pipelineGeometry);
        // Emit explicit move_component ops for each ejected component (position unchanged)
        for (var ci = 0; ci < contained.length; ci++) {
          var ejected = contained[ci];
          applyOp("move_component", {
            id: ejected.id,
            evolution: ejected.position.evolution.scalar,
            visibility: ejected.position.visibility.scalar
          }, function() {}); // No mutation needed — positions preserved
        }
      }

      applyOp("change_component_type", { id: id, type: newType }, function(m) {
        var c = (m.components || []).find(function(x) { return x.id === id; });
        if (c) {
          c.type = newType;
          if (newType !== "pipeline") {
            delete c.pipelineGeometry;
          }
        }
      });
      reRenderSVG(true);
      updateContextZone();
    });
  }

  // Delete component (cascade: explicit removeEdge + setEvolvesTo null ops)
  if (ctxCompDelete) {
    ctxCompDelete.addEventListener("click", function() {
      if (!selection.id || selection.type !== "component") return;
      var id = selection.id;

      // Compute explicit cascade ops BEFORE mutating the model.
      // Every cascaded state change gets its own op in the diff buffer
      // so Claude sees the full picture with zero inference required.
      var cascadeEdgeIds = [];
      var cascadeEvolvesFromIds = [];
      var deletedComp = null;
      (mapModel.relations || []).forEach(function(r) {
        if (r.consumer === id || r.supplier === id) {
          cascadeEdgeIds.push(r.id);
        }
      });
      (mapModel.components || []).forEach(function(c) {
        if (c.id === id) { deletedComp = c; }
      });
      if (deletedComp) {
        var targetEvo = deletedComp.position.evolution.scalar;
        var targetVis = deletedComp.position.visibility.scalar;
        (mapModel.components || []).forEach(function(c) {
          if (c.id === id) return;
          if (!c.evolvesTo) return;
          // Interactive model: evolvesTo may be string id or position array
          if (typeof c.evolvesTo === "string") {
            if (c.evolvesTo === id) cascadeEvolvesFromIds.push(c.id);
            return;
          }
          if (Array.isArray(c.evolvesTo) && c.evolvesTo.length > 0) {
            var matches = c.evolvesTo.some(function(e) {
              var eEvo = e && e.position && e.position.evolution && e.position.evolution.scalar;
              var eVis = e && e.position && e.position.visibility && e.position.visibility.scalar;
              return typeof eEvo === "number" && typeof eVis === "number" &&
                Math.abs(eEvo - targetEvo) < 0.001 && Math.abs(eVis - targetVis) < 0.001;
            });
            if (matches) cascadeEvolvesFromIds.push(c.id);
          }
        });
      }

      // Single undo snapshot, then apply all mutations atomically.
      // Push explicit cascade ops to diff buffer first, then delete_component.
      pushUndo();
      mapModel = cloneModel(mapModel);

      // 1. Remove cascaded edges and emit explicit delete_edge ops
      cascadeEdgeIds.forEach(function(edgeId) {
        mapModel.relations = (mapModel.relations || []).filter(function(r) { return r.id !== edgeId; });
        addDiff({ op: "delete_edge", payload: { id: edgeId } });
      });

      // 2. Clear cascaded evolvesTo refs and emit explicit set_evolves_to null ops
      cascadeEvolvesFromIds.forEach(function(srcId) {
        var c = (mapModel.components || []).find(function(comp) { return comp.id === srcId; });
        if (c) delete c.evolvesTo;
        addDiff({ op: "set_evolves_to", payload: { id: srcId, evolvesTo: null } });
      });

      // 3. Remove the component itself
      mapModel.components = (mapModel.components || []).filter(function(c) { return c.id !== id; });
      addDiff({ op: "delete_component", payload: { id: id } });

      // Rebuild indices and update namespace
      rebuildIndices();
      window.__wardley.mapModel = mapModel;
      window.__wardley.componentsById = componentsById;
      window.__wardley.relationsById = relationsById;

      reRenderSVG(true);
      clearSelection();
      hideContextZone();
      updateCounters();
    });
  }

  // Change edge type
  if (ctxEdgeType) {
    ctxEdgeType.addEventListener("change", function() {
      var newType = ctxEdgeType.value;
      if (!selection.id || selection.type !== "edge") return;
      var id = selection.id;
      applyOp("change_edge_type", { id: id, type: newType }, function(m) {
        var rel = (m.relations || []).find(function(r) { return r.id === id; });
        if (rel) rel.type = newType;
      });
      reRenderSVG(true);
    });
  }

  // Delete edge
  if (ctxEdgeDelete) {
    ctxEdgeDelete.addEventListener("click", function() {
      if (!selection.id || selection.type !== "edge") return;
      var id = selection.id;
      applyOp("delete_edge", { id: id }, function(m) {
        m.relations = (m.relations || []).filter(function(r) { return r.id !== id; });
      });
      reRenderSVG(true);
      clearSelection();
      hideContextZone();
      updateCounters();
    });
  }

  // Delete pipeline
  if (ctxPipeDelete) {
    ctxPipeDelete.addEventListener("click", function() {
      if (!selection.id || selection.type !== "pipeline") return;
      var id = selection.id;
      applyOp("delete_pipeline", { id: id }, function(m) {
        var comp = (m.components || []).find(function(c) { return c.id === id; });
        if (comp && comp.pipelineGeometry) delete comp.pipelineGeometry;
      });
      reRenderSVG(true);
      clearSelection();
      hideContextZone();
      updateCounters();
    });
  }

  // Cancel placement mode
  if (ctxAddCancel) {
    ctxAddCancel.addEventListener("click", function() {
      exitPlacementMode();
      hideContextZone();
    });
  }

  if (ctxPlacementCancel) {
    ctxPlacementCancel.addEventListener("click", function() {
      exitPlacementMode();
      hideContextZone();
    });
  }

  // ── Wire selection changes to context zone ────────────────────────
  // Wrap clearSelection and selectComponent to trigger context updates
  var _origClearSelection = clearSelection;
  clearSelection = function() {
    _origClearSelection();
    updateContextZone();
  };

  var _origSelectComponent = selectComponent;
  selectComponent = function(id, shiftKey) {
    _origSelectComponent(id, shiftKey);
    updateContextZone();
  };

  // Edge selection
  function selectEdge(id, shiftKey) {
    var el = edgeEls[id];
    if (shiftKey) {
      if (selectedIds.has(id)) {
        _removeFromSelected(id);
        if (selection.id === id) {
          var remaining = Array.from(selectedIds);
          if (remaining.length > 0) {
            var lastId = remaining[remaining.length - 1];
            var lastMeta = selectedMeta[lastId];
            selection.type = lastMeta.type;
            selection.id = lastId;
            selection.el = lastMeta.el;
          } else {
            selection.type = null;
            selection.id = null;
            selection.el = null;
          }
        }
      } else if (el) {
        _addToSelected(id, "edge", el);
      }
    } else {
      clearSelection();
      if (el) {
        _addToSelected(id, "edge", el);
      }
    }
    updateContextZone();
  }

  // Pipeline selection
  function selectPipeline(id, shiftKey) {
    var el = pipelineEls[id];
    if (shiftKey) {
      if (selectedIds.has(id)) {
        _removeFromSelected(id);
        if (selection.id === id) {
          var remaining = Array.from(selectedIds);
          if (remaining.length > 0) {
            var lastId = remaining[remaining.length - 1];
            var lastMeta = selectedMeta[lastId];
            selection.type = lastMeta.type;
            selection.id = lastId;
            selection.el = lastMeta.el;
          } else {
            selection.type = null;
            selection.id = null;
            selection.el = null;
          }
        }
      } else if (el) {
        _addToSelected(id, "pipeline", el);
      }
    } else {
      clearSelection();
      if (el) {
        _addToSelected(id, "pipeline", el);
      }
    }
    updateContextZone();
  }

  // Generic selection for labels, steps, evolves-from edges
  function selectGeneric(id, type, el, shiftKey) {
    if (shiftKey) {
      if (selectedIds.has(id)) {
        _removeFromSelected(id);
        if (selection.id === id) {
          var remaining = Array.from(selectedIds);
          if (remaining.length > 0) {
            var lastId = remaining[remaining.length - 1];
            var lastMeta = selectedMeta[lastId];
            selection.type = lastMeta.type;
            selection.id = lastId;
            selection.el = lastMeta.el;
          } else {
            selection.type = null;
            selection.id = null;
            selection.el = null;
          }
        }
      } else if (el) {
        _addToSelected(id, type, el);
      }
    } else {
      clearSelection();
      if (el) {
        _addToSelected(id, type, el);
      }
    }
    updateContextZone();
  }

  // ── Wire placement mode changes to context zone ──────────────────
  // Wrap btnAddComponent/btnAddEdge click handlers to trigger context updates
  // (The original handlers already set placementMode — just need updateContextZone after)
  if (btnAddComponent) {
    var _origACHandler = btnAddComponent.onclick;
    btnAddComponent.addEventListener("click", function() { updateContextZone(); });
  }
  if (btnAddEdge) {
    btnAddEdge.addEventListener("click", function() { updateContextZone(); });
  }
  if (btnAddEvolves) {
    btnAddEvolves.addEventListener("click", function() { updateContextZone(); });
  }

  // Escape key: cancel placement or clear selection
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
      if (placementMode) {
        exitPlacementMode();
        hideContextZone();
      } else if (selection.type) {
        clearSelection();
      }
    }
  });

  // ── Pipeline resize handle drag ─────────────────────────────────
  // When a pipeline is selected, its 4 handles (left, right, top, bottom)
  // become visible and draggable. Each handle is axis-constrained:
  //   left/right  → evolution axis (evoStart/evoEnd)
  //   top/bottom  → visibility axis (visStart/visEnd)
  //
  // During drag, the SVG rect and handles are updated visually.
  // On mouseup, a resize_pipeline diff op is emitted with the new geometry.

  var pipelineDrag = null; // { pipelineId, handle, origGeo, currentGeo }

  function getPipelineRect(gEl) {
    // The first <rect> child without data-handle is the pipeline background rect
    return gEl ? gEl.querySelector("rect:not([data-handle])") : null;
  }

  function updatePipelineSVG(pipelineId, geo) {
    // Convert geo (evoStart/evoEnd/visStart/visEnd in 0-1) to pixel coords
    var topLeft = mapCoordsToPixel(geo.evoStart, geo.visStart);
    var bottomRight = mapCoordsToPixel(geo.evoEnd, geo.visEnd);
    var x = topLeft.x;
    var y = topLeft.y;
    var w = bottomRight.x - topLeft.x;
    var h = bottomRight.y - topLeft.y;
    if (w < 1) w = 1;
    if (h < 1) h = 1;

    var gEl = pipelineEls[pipelineId];
    if (!gEl) return;
    var rectEl = getPipelineRect(gEl);
    if (rectEl) {
      rectEl.setAttribute("x", String(x));
      rectEl.setAttribute("y", String(y));
      rectEl.setAttribute("width", String(w));
      rectEl.setAttribute("height", String(h));
    }

    // Update handle positions
    var HALF = 7; // HANDLE_HALF from pipelines-layer
    var cx = x + w / 2;
    var cy = y + h / 2;
    var handles = gEl.querySelectorAll("[data-handle]");
    handles.forEach(function(hEl) {
      var side = hEl.getAttribute("data-handle");
      if (side === "left") {
        hEl.setAttribute("x", String(x - HALF));
        hEl.setAttribute("y", String(cy - HALF));
      } else if (side === "right") {
        hEl.setAttribute("x", String(x + w - HALF));
        hEl.setAttribute("y", String(cy - HALF));
      } else if (side === "top") {
        hEl.setAttribute("x", String(cx - HALF));
        hEl.setAttribute("y", String(y - HALF));
      } else if (side === "bottom") {
        hEl.setAttribute("x", String(cx - HALF));
        hEl.setAttribute("y", String(y + h - HALF));
      }
    });
  }

  // Mousedown on a handle starts the drag
  svgEl.addEventListener("mousedown", function(e) {
    var target = e.target;
    if (!target.hasAttribute || !target.hasAttribute("data-handle")) return;
    var handle = target.getAttribute("data-handle");
    var gEl = target.closest("[data-pipeline-id]");
    if (!gEl) return;
    var pipelineId = gEl.getAttribute("data-pipeline-id");
    var comp = componentsById[pipelineId];
    if (!comp || !comp.pipelineGeometry) return;

    e.preventDefault();
    e.stopPropagation();

    var geo = comp.pipelineGeometry;
    pipelineDrag = {
      pipelineId: pipelineId,
      handle: handle,
      origGeo: { evoStart: geo.evoStart, evoEnd: geo.evoEnd, visStart: geo.visStart, visEnd: geo.visEnd },
      currentGeo: { evoStart: geo.evoStart, evoEnd: geo.evoEnd, visStart: geo.visStart, visEnd: geo.visEnd },
    };

    svgEl.style.cursor = (handle === "left" || handle === "right") ? "ew-resize" : "ns-resize";
  });

  // Mousemove updates the visual rect during drag
  document.addEventListener("mousemove", function(e) {
    if (!pipelineDrag) return;
    e.preventDefault();

    var coords = pointerToMapCoords(e.clientX, e.clientY);
    var geo = pipelineDrag.currentGeo;
    var orig = pipelineDrag.origGeo;
    var handle = pipelineDrag.handle;

    // Axis-constrained: only update the relevant axis
    if (handle === "left") {
      geo.evoStart = Math.max(0, Math.min(coords.evolution, orig.evoEnd - 0.01));
    } else if (handle === "right") {
      geo.evoEnd = Math.min(1, Math.max(coords.evolution, orig.evoStart + 0.01));
    } else if (handle === "top") {
      geo.visStart = Math.max(0, Math.min(coords.visibility, orig.visEnd - 0.01));
    } else if (handle === "bottom") {
      geo.visEnd = Math.min(1, Math.max(coords.visibility, orig.visStart + 0.01));
    }

    // Round to 3 decimals
    geo.evoStart = +geo.evoStart.toFixed(3);
    geo.evoEnd = +geo.evoEnd.toFixed(3);
    geo.visStart = +geo.visStart.toFixed(3);
    geo.visEnd = +geo.visEnd.toFixed(3);

    // Update the SVG visually
    updatePipelineSVG(pipelineDrag.pipelineId, geo);
  });

  // ── Pipeline containment check (mirrors pipeline-geometry.ts) ──────
  // Returns true if a component falls within a pipeline's bounding box
  // using the positional epsilon tolerance.
  function isInsidePipelineBounds(comp, geo) {
    var eps = K.pipelineEpsilon;
    var evo = comp.position.evolution.scalar;
    var vis = comp.position.visibility.scalar;
    return (
      evo >= geo.evoStart - eps &&
      evo <= geo.evoEnd + eps &&
      vis >= geo.visStart - eps &&
      vis <= geo.visEnd + eps
    );
  }

  // Returns all non-pipeline, non-note components inside the given bounds.
  function getContainedComponents(pipelineId, geo) {
    var result = [];
    var comps = mapModel.components || [];
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      if (c.id === pipelineId) continue;
      if (c.type === "pipeline" || c.type === "note") continue;
      if (isInsidePipelineBounds(c, geo)) {
        result.push(c);
      }
    }
    return result;
  }

  // Mouseup commits the resize as a diff operation.
  // On commit, detects components that were inside the old bounds but are
  // now outside the new bounds and emits explicit move_component diffs
  // for each ejected component (at their current position) so Claude
  // sees the ejection without needing to infer it.
  document.addEventListener("mouseup", function(e) {
    if (!pipelineDrag) return;

    var drag = pipelineDrag;
    pipelineDrag = null;
    svgEl.style.cursor = "";

    var geo = drag.currentGeo;
    var orig = drag.origGeo;

    // Skip if nothing changed
    if (geo.evoStart === orig.evoStart && geo.evoEnd === orig.evoEnd &&
        geo.visStart === orig.visStart && geo.visEnd === orig.visEnd) return;

    var pipelineId = drag.pipelineId;
    var newGeo = { evoStart: geo.evoStart, evoEnd: geo.evoEnd, visStart: geo.visStart, visEnd: geo.visEnd };

    // 1. Detect components inside the OLD bounds BEFORE the resize
    var previouslyContained = getContainedComponents(pipelineId, orig);

    // 2. Apply the resize operation
    applyOp("resize_pipeline", {
      id: pipelineId,
      pipelineGeometry: newGeo,
    }, function(m) {
      var comp = (m.components || []).find(function(c) { return c.id === pipelineId; });
      if (comp && comp.pipelineGeometry) {
        comp.pipelineGeometry.evoStart = newGeo.evoStart;
        comp.pipelineGeometry.evoEnd = newGeo.evoEnd;
        comp.pipelineGeometry.visStart = newGeo.visStart;
        comp.pipelineGeometry.visEnd = newGeo.visEnd;
      }
    });

    // 3. Detect ejected components: were inside old bounds, now outside new bounds.
    // Since association is purely positional (epsilon 0.015), no model mutation
    // is needed — we emit move_component diffs at their current position to make
    // the ejection explicit in the diff buffer with zero inference by Claude.
    for (var i = 0; i < previouslyContained.length; i++) {
      var child = previouslyContained[i];
      // Re-fetch from the (now-mutated) model to get the current reference
      var current = componentsById[child.id];
      if (!current) continue;
      if (!isInsidePipelineBounds(current, newGeo)) {
        // Component was inside old bounds, now outside new bounds → ejected
        addDiff({
          op: "move_component",
          payload: {
            id: current.id,
            evolution: current.position.evolution.scalar,
            visibility: current.position.visibility.scalar,
          },
        });
      }
    }

    // Full SVG re-render from updated model
    reRenderSVG();
    // Update context zone to show new range
    updateContextZone();
  });

  // ── Inline rename via foreignObject ──────────────────────────────
  // Double-click a component node to overlay a text input directly on
  // the SVG. The input is wrapped in a <foreignObject> so it renders
  // as native HTML inside the SVG coordinate space.
  //
  // Enter or blur commits the rename (if changed). Escape cancels.
  // Only one inline rename can be active at a time.

  var activeRenameCleanup = null; // function to tear down current rename overlay

  function cancelInlineRename() {
    if (activeRenameCleanup) {
      activeRenameCleanup();
      activeRenameCleanup = null;
    }
  }

  /**
   * Start an inline rename for the given component ID.
   * Creates a foreignObject + input overlay on the SVG at the component's position.
   */
  function inlineRename(compId) {
    // Cancel any existing rename first
    cancelInlineRename();

    var comp = componentsById[compId];
    if (!comp) return;

    var gEl = componentEls[compId];
    if (!gEl) return;

    // Find the node's center (from the circle or first child element)
    var circleEl = gEl.querySelector("circle") || gEl.querySelector("rect");
    var cx, cy;
    if (circleEl && circleEl.tagName === "circle") {
      cx = parseFloat(circleEl.getAttribute("cx") || "0");
      cy = parseFloat(circleEl.getAttribute("cy") || "0");
    } else if (circleEl && circleEl.tagName === "rect") {
      cx = parseFloat(circleEl.getAttribute("x") || "0") + parseFloat(circleEl.getAttribute("width") || "0") / 2;
      cy = parseFloat(circleEl.getAttribute("y") || "0") + parseFloat(circleEl.getAttribute("height") || "0") / 2;
    } else {
      // Fallback: compute from model coords
      var px = mapCoordsToPixel(
        comp.position ? comp.position.evolution : 0,
        comp.position ? comp.position.visibility : 0
      );
      cx = px.x;
      cy = px.y;
    }

    // Position the foreignObject to the right of the node, matching label offset
    var foWidth = 180;
    var foHeight = 24;
    var foX = cx + 8;
    var foY = cy - foHeight / 2;

    // Create the foreignObject element in SVG namespace
    var ns = "http://www.w3.org/2000/svg";
    var fo = document.createElementNS(ns, "foreignObject");
    fo.setAttribute("x", String(foX));
    fo.setAttribute("y", String(foY));
    fo.setAttribute("width", String(foWidth));
    fo.setAttribute("height", String(foHeight));
    fo.setAttribute("data-inline-rename", compId);

    // Create the HTML input inside the foreignObject
    var input = document.createElement("input");
    input.type = "text";
    input.className = "wm-inline-rename";
    input.value = comp.label ? (comp.label.name || "") : "";
    fo.appendChild(input);

    // Append to SVG (on top of everything)
    svgEl.appendChild(fo);

    // Focus and select all text
    input.focus();
    input.select();

    var committed = false;

    function commit() {
      if (committed) return;
      committed = true;
      var newLabel = input.value.trim();
      var oldLabel = comp.label ? (comp.label.name || "") : "";
      cleanup();
      if (newLabel && newLabel !== oldLabel) {
        applyOp("rename_component", { id: compId, label: newLabel }, function(m) {
          var c = (m.components || []).find(function(cc) { return cc.id === compId; });
          if (c && c.label) c.label.name = newLabel;
        });
        reRenderSVG();
        updateContextZone();
        updateCounters();
      }
    }

    function cancel() {
      if (committed) return;
      committed = true;
      cleanup();
    }

    function cleanup() {
      input.removeEventListener("blur", onBlur);
      input.removeEventListener("keydown", onKeydown);
      if (fo.parentNode) fo.parentNode.removeChild(fo);
      activeRenameCleanup = null;
    }

    function onBlur() {
      // Use setTimeout to allow click events to fire first (e.g. on another component)
      setTimeout(function() { if (!committed) commit(); }, 0);
    }

    function onKeydown(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    }

    input.addEventListener("blur", onBlur);
    input.addEventListener("keydown", onKeydown);

    // Prevent the input's pointer events from triggering SVG drag etc.
    fo.addEventListener("mousedown", function(e) { e.stopPropagation(); });
    fo.addEventListener("pointerdown", function(e) { e.stopPropagation(); });

    activeRenameCleanup = cleanup;
  }

  // Double-click on a component node triggers inline rename
  svgEl.addEventListener("dblclick", function(e) {
    var target = e.target;
    // Walk up to find the closest [data-component-id] group
    var gEl = target.closest ? target.closest("[data-component-id]") : null;
    if (!gEl) return;
    var compId = gEl.getAttribute("data-component-id");
    if (!compId) return;
    e.preventDefault();
    e.stopPropagation();
    inlineRename(compId);
  });

  // ── Label drag-and-drop ─────────────────────────────────────────
  // Pointerdown on a label text element (data-label-for) starts a
  // label drag. During pointermove the label is visually translated.
  // At pointerup, the new dx/dy pixel offset relative to the node
  // center is computed and emitted as a move_label diff-op.
  var LABEL_DRAG_THRESHOLD = 2; // px — minimum displacement to commit
  var labelDrag = null;

  svgEl.addEventListener("pointerdown", function(e) {
    if (e.button !== 0) return;
    if (placementMode) return;
    var target = e.target;

    // Detect label hit: <text data-label-for="..."> or a <tspan> inside one
    var labelEl = null;
    if (target.hasAttribute && target.hasAttribute("data-label-for")) {
      labelEl = target;
    } else if (target.closest) {
      labelEl = target.closest("[data-label-for]");
    }
    if (!labelEl) return;

    var compId = labelEl.getAttribute("data-label-for");
    var comp = componentsById[compId];
    if (!comp) return;

    e.preventDefault();
    e.stopPropagation();

    // Compute the node center in SVG pixel space
    var nodePx = mapCoordsToPixel(
      comp.position.evolution.scalar,
      comp.position.visibility.scalar
    );

    // Current label pixel position (from the text element attributes)
    var lblX = parseFloat(labelEl.getAttribute("x")) || 0;
    var lblY = parseFloat(labelEl.getAttribute("y")) || 0;

    labelDrag = {
      labelEl: labelEl,
      compId: compId,
      nodeCx: nodePx.x,
      nodeCy: nodePx.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLblX: lblX,
      origLblY: lblY,
    };

    svgEl.style.cursor = "move";
    svgEl.setPointerCapture(e.pointerId);
  });

  svgEl.addEventListener("pointermove", function(e) {
    if (!labelDrag) return;
    // Compute pixel delta using SVG scale factor
    var svgRect = svgEl.getBoundingClientRect();
    var scaleX = K.canvasWidth / svgRect.width;
    var scaleY = K.canvasHeight / svgRect.height;
    var dxPx = (e.clientX - labelDrag.startClientX) * scaleX;
    var dyPx = (e.clientY - labelDrag.startClientY) * scaleY;

    // Visually translate the label element
    labelDrag.labelEl.setAttribute("transform", "translate(" + dxPx + "," + dyPx + ")");
  });

  svgEl.addEventListener("pointerup", function(e) {
    if (!labelDrag) return;
    var drag = labelDrag;
    labelDrag = null;
    svgEl.style.cursor = "";

    // Remove visual transform
    drag.labelEl.removeAttribute("transform");

    // Compute pixel delta
    var svgRect = svgEl.getBoundingClientRect();
    var scaleX = K.canvasWidth / svgRect.width;
    var scaleY = K.canvasHeight / svgRect.height;
    var dxPx = (e.clientX - drag.startClientX) * scaleX;
    var dyPx = (e.clientY - drag.startClientY) * scaleY;

    // Skip if displacement too small
    if (Math.abs(dxPx) < LABEL_DRAG_THRESHOLD && Math.abs(dyPx) < LABEL_DRAG_THRESHOLD) return;

    // New label position: original label pixel coords + delta, minus node center = dx/dy offset
    var newDx = +(drag.origLblX + dxPx - drag.nodeCx).toFixed(1);
    var newDy = +(drag.origLblY + dyPx - drag.nodeCy).toFixed(1);

    applyOp("move_label", {
      id: drag.compId,
      dx: newDx,
      dy: newDy,
    }, function(m) {
      var comp = (m.components || []).find(function(c) { return c.id === drag.compId; });
      if (comp) {
        if (!comp.label.position) comp.label.position = {};
        comp.label.position.dx = newDx;
        comp.label.position.dy = newDy;
      }
    });

    reRenderSVG();
    updateCounters();
    updateContextZone();
  });

  // ── Step drag-and-drop ──────────────────────────────────────────
  // Pointerdown on a step sticker (data-step-id) starts a drag.
  // During pointermove the step <g> is visually translated. At
  // pointerup, the new evolution/visibility position is computed and
  // emitted as a move_step diff-op.
  var stepDrag = null;

  svgEl.addEventListener("pointerdown", function(e) {
    if (e.button !== 0) return;
    if (placementMode) return;
    var target = e.target;

    // Detect step hit: element with data-step-id or child of one
    var stepEl = null;
    if (target.hasAttribute && target.hasAttribute("data-step-id")) {
      stepEl = target;
    } else if (target.closest) {
      stepEl = target.closest("[data-step-id]");
    }
    if (!stepEl) return;

    var stepId = stepEl.getAttribute("data-step-id");
    if (!stepId) return;

    // Find the step in the model
    var steps = mapModel.steps || [];
    var step = null;
    for (var si = 0; si < steps.length; si++) {
      if (steps[si].id === stepId) { step = steps[si]; break; }
    }
    if (!step) return;

    e.preventDefault();
    e.stopPropagation();

    var startPx = mapCoordsToPixel(
      step.position.evolution.scalar,
      step.position.visibility.scalar
    );

    stepDrag = {
      stepEl: stepEl,
      stepId: stepId,
      startEvo: step.position.evolution.scalar,
      startVis: step.position.visibility.scalar,
      startPxX: startPx.x,
      startPxY: startPx.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };

    svgEl.style.cursor = "grabbing";
    svgEl.setPointerCapture(e.pointerId);
  });

  svgEl.addEventListener("pointermove", function(e) {
    if (!stepDrag) return;
    // Compute pixel delta using SVG scale factor
    var svgRect = svgEl.getBoundingClientRect();
    var scaleX = K.canvasWidth / svgRect.width;
    var scaleY = K.canvasHeight / svgRect.height;
    var dxPx = (e.clientX - stepDrag.startClientX) * scaleX;
    var dyPx = (e.clientY - stepDrag.startClientY) * scaleY;

    // Visually translate the step group
    stepDrag.stepEl.setAttribute("transform", "translate(" + dxPx + "," + dyPx + ")");
  });

  svgEl.addEventListener("pointerup", function(e) {
    if (!stepDrag) return;
    var drag = stepDrag;
    stepDrag = null;
    svgEl.style.cursor = "";

    // Remove visual transform
    drag.stepEl.removeAttribute("transform");

    // Compute new map coordinates from pointer position
    var coords = pointerToMapCoords(e.clientX, e.clientY);
    var newEvo = +Math.max(0, Math.min(1, coords.evolution)).toFixed(3);
    var newVis = +Math.max(0, Math.min(1, coords.visibility)).toFixed(3);

    // Skip if displacement too small
    var dEvo = Math.abs(newEvo - drag.startEvo);
    var dVis = Math.abs(newVis - drag.startVis);
    if (dEvo < 0.01 && dVis < 0.01) return;

    applyOp("move_step", {
      id: drag.stepId,
      evolution: newEvo,
      visibility: newVis,
    }, function(m) {
      var steps = m.steps || [];
      for (var si = 0; si < steps.length; si++) {
        if (steps[si].id === drag.stepId) {
          steps[si].position.evolution.scalar = newEvo;
          steps[si].position.visibility.scalar = newVis;
          break;
        }
      }
    });

    reRenderSVG();
    updateCounters();
    updateContextZone();
  });

  // ── Component drag-and-drop (multi-select aware) ────────────────
  // Pointerdown on a component node starts a drag. If the dragged
  // component is part of a multi-selection, ALL selected components
  // move together preserving their relative positions. During
  // pointermove, SVG <g> elements are visually repositioned via
  // transforms. At pointerup, if the total displacement exceeds
  // MOVE_THRESHOLD (0.01 in map coords), move_component ops are
  // emitted for each dragged component. Otherwise the drag is
  // cancelled (treated as a click).
  var MOVE_THRESHOLD = 0.01;
  var componentDrag = null;

  svgEl.addEventListener("pointerdown", function(e) {
    // Only drag on left button
    if (e.button !== 0) return;
    // Don't start drag if in a placement mode
    if (placementMode) return;
    // Don't start if label drag is active
    if (labelDrag) return;
    // Don't start if step drag is active
    if (stepDrag) return;
    // Don't drag if target is a pipeline resize handle
    var target = e.target;
    if (target.hasAttribute && target.hasAttribute("data-handle")) return;
    // Don't start component drag on label elements
    if (target.hasAttribute && target.hasAttribute("data-label-for")) return;
    if (target.closest && target.closest("[data-label-for]")) return;
    // Don't start component drag on step elements
    if (target.hasAttribute && target.hasAttribute("data-step-id")) return;
    if (target.closest && target.closest("[data-step-id]")) return;

    // Find the closest component or pipeline group
    var gEl = target.closest ? target.closest("[data-component-id]") : null;
    var compId = gEl ? gEl.getAttribute("data-component-id") : null;
    var isPipelineDrag = false;

    // If no component found, check for pipeline body click
    if (!compId) {
      gEl = target.closest ? target.closest("[data-pipeline-id]") : null;
      compId = gEl ? gEl.getAttribute("data-pipeline-id") : null;
      isPipelineDrag = true;
    }

    if (!gEl || !compId) return;
    var comp = componentsById[compId];
    if (!comp) return;

    // For pipeline body clicks, skip if clicking a component inside the pipeline
    if (isPipelineDrag) {
      if (!comp.pipelineGeometry) return;
      if (target.closest && target.closest("[data-component-id]")) return;
    }

    e.preventDefault();
    e.stopPropagation();

    var startEvo = comp.position.evolution.scalar;
    var startVis = comp.position.visibility.scalar;
    var startPx = mapCoordsToPixel(startEvo, startVis);

    // Build list of peer elements to drag along
    var peers = [];

    // For pipelines, include all contained components as peers
    if (comp.type === "pipeline" && comp.pipelineGeometry) {
      var contained = getContainedComponents(compId, comp.pipelineGeometry);
      for (var ci = 0; ci < contained.length; ci++) {
        var cc = contained[ci];
        var ccEl = componentEls[cc.id];
        if (!ccEl) continue;
        peers.push({
          id: cc.id,
          gEl: ccEl,
          startEvo: cc.position.evolution.scalar,
          startVis: cc.position.visibility.scalar,
          offsetEvo: cc.position.evolution.scalar - startEvo,
          offsetVis: cc.position.visibility.scalar - startVis,
        });
      }
    }

    // For multi-selection, also include other selected components as peers
    if (selectedIds.has(compId) && selectedIds.size > 1) {
      selectedIds.forEach(function(sid) {
        if (sid === compId) return;
        // Skip if already added as contained component
        for (var pi = 0; pi < peers.length; pi++) {
          if (peers[pi].id === sid) return;
        }
        var meta = selectedMeta[sid];
        if (!meta || meta.type !== "component") return;
        var peerComp = componentsById[sid];
        if (!peerComp) return;
        var peerEl = componentEls[sid] || pipelineEls[sid];
        if (!peerEl) return;
        peers.push({
          id: sid,
          gEl: peerEl,
          startEvo: peerComp.position.evolution.scalar,
          startVis: peerComp.position.visibility.scalar,
          offsetEvo: peerComp.position.evolution.scalar - startEvo,
          offsetVis: peerComp.position.visibility.scalar - startVis,
        });
      });
    }

    componentDrag = {
      primary: { id: compId, gEl: gEl, startEvo: startEvo, startVis: startVis },
      peers: peers,
      currentEvo: startEvo,
      currentVis: startVis,
      startPxX: startPx.x,
      startPxY: startPx.y,
      isPipeline: comp.type === "pipeline",
      origGeo: comp.pipelineGeometry ? {
        evoStart: comp.pipelineGeometry.evoStart,
        evoEnd: comp.pipelineGeometry.evoEnd,
        visStart: comp.pipelineGeometry.visStart,
        visEnd: comp.pipelineGeometry.visEnd,
      } : null,
    };

    svgEl.style.cursor = "grabbing";
    svgEl.setPointerCapture(e.pointerId);
  });

  svgEl.addEventListener("pointermove", function(e) {
    if (!componentDrag) return;
    var coords = pointerToMapCoords(e.clientX, e.clientY);
    componentDrag.currentEvo = coords.evolution;
    componentDrag.currentVis = coords.visibility;

    // Compute pixel delta from primary component's start
    var newPx = mapCoordsToPixel(coords.evolution, coords.visibility);
    var dx = newPx.x - componentDrag.startPxX;
    var dy = newPx.y - componentDrag.startPxY;

    // Visually translate primary component
    componentDrag.primary.gEl.setAttribute("transform", "translate(" + dx + "," + dy + ")");

    // Visually translate all peer components by the same pixel delta
    for (var pi = 0; pi < componentDrag.peers.length; pi++) {
      componentDrag.peers[pi].gEl.setAttribute("transform", "translate(" + dx + "," + dy + ")");
    }
  });

  svgEl.addEventListener("pointerup", function(e) {
    if (!componentDrag) return;
    var drag = componentDrag;
    componentDrag = null;
    svgEl.style.cursor = "";

    // Remove visual transforms from primary and all peers
    drag.primary.gEl.removeAttribute("transform");
    for (var ri = 0; ri < drag.peers.length; ri++) {
      drag.peers[ri].gEl.removeAttribute("transform");
    }

    var dEvo = Math.abs(drag.currentEvo - drag.primary.startEvo);
    var dVis = Math.abs(drag.currentVis - drag.primary.startVis);

    // Only emit move if displacement exceeds threshold
    if (dEvo < MOVE_THRESHOLD && dVis < MOVE_THRESHOLD) return;

    // Compute delta in map coordinates
    var deltaEvo = drag.currentEvo - drag.primary.startEvo;
    var deltaVis = drag.currentVis - drag.primary.startVis;

    // Helper to apply move for one component (model-only, no DOM patching)
    function applyComponentMove(id, newEvo, newVis) {
      newEvo = +newEvo.toFixed(3);
      newVis = +newVis.toFixed(3);
      // Clamp to 0-1
      newEvo = Math.max(0, Math.min(1, newEvo));
      newVis = Math.max(0, Math.min(1, newVis));

      applyOp("move_component", {
        id: id,
        evolution: newEvo,
        visibility: newVis,
      }, function(m) {
        var comp = (m.components || []).find(function(c) { return c.id === id; });
        if (comp) {
          comp.position.evolution.scalar = newEvo;
          comp.position.visibility.scalar = newVis;
        }
      });
    }

    // Move primary component
    applyComponentMove(
      drag.primary.id,
      drag.primary.startEvo + deltaEvo,
      drag.primary.startVis + deltaVis
    );

    // For pipelines, also emit resize_pipeline to shift the geometry bounds
    if (drag.isPipeline && drag.origGeo) {
      var origGeo = drag.origGeo;
      var newGeo = {
        evoStart: +Math.max(0, Math.min(1, origGeo.evoStart + deltaEvo)).toFixed(3),
        evoEnd:   +Math.max(0, Math.min(1, origGeo.evoEnd + deltaEvo)).toFixed(3),
        visStart: +Math.max(0, Math.min(1, origGeo.visStart + deltaVis)).toFixed(3),
        visEnd:   +Math.max(0, Math.min(1, origGeo.visEnd + deltaVis)).toFixed(3),
      };
      applyOp("resize_pipeline", {
        id: drag.primary.id,
        pipelineGeometry: newGeo,
      }, function(m) {
        var comp = (m.components || []).find(function(c) { return c.id === drag.primary.id; });
        if (comp && comp.pipelineGeometry) {
          comp.pipelineGeometry.evoStart = newGeo.evoStart;
          comp.pipelineGeometry.evoEnd = newGeo.evoEnd;
          comp.pipelineGeometry.visStart = newGeo.visStart;
          comp.pipelineGeometry.visEnd = newGeo.visEnd;
        }
      });
    }

    // Move all peer components preserving relative positions
    for (var mi = 0; mi < drag.peers.length; mi++) {
      var peer = drag.peers[mi];
      applyComponentMove(
        peer.id,
        peer.startEvo + deltaEvo,
        peer.startVis + deltaVis
      );
    }

    // Full SVG re-render from updated model
    reRenderSVG();
    updateCounters();
    updateContextZone();
  });

  // Cancel drag on pointer capture loss
  svgEl.addEventListener("lostpointercapture", function() {
    // Cancel step drag if active
    if (stepDrag) {
      stepDrag.stepEl.removeAttribute("transform");
      stepDrag = null;
      svgEl.style.cursor = "";
      return;
    }
    if (!componentDrag) return;
    componentDrag.primary.gEl.removeAttribute("transform");
    for (var li = 0; li < componentDrag.peers.length; li++) {
      componentDrag.peers[li].gEl.removeAttribute("transform");
    }
    componentDrag = null;
    svgEl.style.cursor = "";
  });

  // ── Expose app state on window for later modules ────────────────
  // Subsequent ACs (drag-and-drop, command palette, diff channel)
  // attach to this namespace.
  window.__wardley = {
    // Data
    mapModel: mapModel,
    renderConstants: K,
    componentsById: componentsById,
    relationsById: relationsById,
    // DOM references
    svgEl: svgEl,
    svgWrapper: svgWrapper,
    plotAreaEl: plotAreaEl,
    componentEls: componentEls,
    edgeEls: edgeEls,
    pipelineEls: pipelineEls,
    // Coordinate utils
    pointerToMapCoords: pointerToMapCoords,
    mapCoordsToPixel: mapCoordsToPixel,
    // Selection (primary + multi-select Set)
    selection: selection,
    selectedIds: selectedIds,
    selectedMeta: selectedMeta,
    clearSelection: clearSelection,
    selectComponent: selectComponent,
    selectEdge: selectEdge,
    selectPipeline: selectPipeline,
    isSelected: isSelected,
    getSelectedIds: getSelectedIds,
    getSelectedByType: getSelectedByType,
    // Context zone
    updateContextZone: updateContextZone,
    hideContextZone: hideContextZone,
    showContextPanel: showContextPanel,
    // Deep clone
    cloneModel: cloneModel,
    // Undo
    pushUndo: pushUndo,
    popUndo: popUndo,
    performUndo: performUndo,
    undoStack: undoStack,
    updateUndoState: updateUndoState,
    // Diff buffer (op log)
    addDiff: addDiff,
    flushDiffs: flushDiffs,
    getDiffCount: getDiffCount,
    diffBuffer: diffBuffer,
    // Central mutation API
    applyOp: applyOp,
    rebuildIndices: rebuildIndices,
    // SVG re-render
    reRenderSVG: reRenderSVG,
    patchSVGFromModel: patchSVGFromModel,
    replaceSVGContent: replaceSVGContent,
    // UI state
    updateCounters: updateCounters,
    updateApplyCopyState: updateApplyCopyState,
    placementMode: function(v) { if(v!==undefined) placementMode=v; return placementMode; },
    edgeSrcId: function(v) { if(v!==undefined) edgeSrcId=v; return edgeSrcId; },
    evolvesSrcId: function(v) { if(v!==undefined) evolvesSrcId=v; return evolvesSrcId; },
    exitPlacementMode: exitPlacementMode,
    // Pipeline resize + containment
    updatePipelineSVG: updatePipelineSVG,
    isInsidePipelineBounds: isInsidePipelineBounds,
    getContainedComponents: getContainedComponents,
    // Component drag (unified — handles regular components and pipelines)
    MOVE_THRESHOLD: MOVE_THRESHOLD,
    componentDrag: function() { return componentDrag; },
    stepDrag: function() { return stepDrag; },
    // Inline rename
    inlineRename: inlineRename,
    cancelInlineRename: cancelInlineRename,
    // Reset — restore model from initial embedded JSON snapshot
    initialSnapshot: initialSnapshot,
    reset: function() {
      mapModel = JSON.parse(JSON.stringify(initialSnapshot));
      rebuildIndices();
      undoStack.length = 0;
      diffBuffer.length = 0;
      clearSelection();
      hideContextZone();
      updateCounters();
      updateUndoState();
      updateApplyCopyState();
      window.__wardley.mapModel = mapModel;
      window.__wardley.componentsById = componentsById;
      window.__wardley.relationsById = relationsById;
      if (typeof reRenderSVG === "function") reRenderSVG(true);
    },
  };
})();
</script>
</body>
</html>`;
}

// ── HTML escaping ──────────────────────────────────────────────────────

/** Escape HTML special characters in text content */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
