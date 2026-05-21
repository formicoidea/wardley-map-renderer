/**
 * SVG Primitives — shared SVG fragment generators for Wardley Map rendering.
 *
 * This module is the **single source of truth** for SVG fragment generation,
 * consumed by both:
 *   - Server-side layer renderers (nodes-layer, edges-layer, etc.) for PNG/SVG pipeline
 *   - Client-side interactive TypeScript for structural re-renders in the HTML artifact
 *
 * All functions are pure: they take geometry/config values and return SVG strings.
 * No dependencies on Node.js APIs — safe for browser bundling via esbuild.
 *
 * Zero renderer drift: any change here automatically propagates to both pipelines.
 *
 * @module render/svg-primitives
 */

// ── XML Escaping ────────────────────────────────────────────────────

/** Escape text for XML/SVG attribute/content safety */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ══════════════════════════════════════════════════════════════════════
//  NODES
// ══════════════════════════════════════════════════════════════════════

// ── Visual constants (mirrored from nodes-layer.ts) ──────────────────

const NODE_FILL = "#ffffff";
const NODE_STROKE = "#000000";

// Person silhouette (anchor avatar) — ratios relative to the node radius
const PERSON_HEAD_R = 0.30; // head radius
const PERSON_HEAD_CY = 0.30; // head center offset above the node center
const PERSON_SHOULDER_W = 0.55; // shoulders half-width
const PERSON_SHOULDER_TOP = 0.10; // shoulders dome apex offset below center
const PERSON_SHOULDER_BOTTOM = 1.05; // shoulders bottom offset (clipped by the circle)
const PERSON_SW_MULT = 1.2; // silhouette stroke = strokeWidth × this

// Ecosystem symbol constants
const ECO_OUTER_R = 30;
const ECO_MID_R = 25;
const ECO_INNER_R = 10;
const ECO_GREY = "#cccccc";
const ECO_HATCH_STROKE = "#999999";
const ECO_HATCH_SPACING = 4;

// Market symbol constants
const MARKET_OUTER_R = 16;
const MARKET_VERTEX_R = 5; // ring (hollow node) radius
const MARKET_TRIANGLE_R = 9; // distance from center to each node
const MARKET_RING_SW_MULT = 2.4; // ring stroke = strokeWidth × this (bold rings)
const MARKET_TRI_SW_MULT = 1.6; // triangle edge stroke = strokeWidth × this
const SIN60 = Math.sin(Math.PI / 3);
const COS60 = Math.cos(Math.PI / 3);

// Method indicator constants
const METHOD_AURA_R = 16;

// Re-export constants needed by other modules (e.g. legend-layer)
export {
  NODE_FILL, NODE_STROKE,
  ECO_OUTER_R, ECO_MID_R, ECO_INNER_R, ECO_GREY, ECO_HATCH_STROKE, ECO_HATCH_SPACING,
  MARKET_OUTER_R, MARKET_VERTEX_R, MARKET_TRIANGLE_R,
  SIN60, COS60,
  METHOD_AURA_R,
};

// ── Node SVG generators ──────────────────────────────────────────────

/**
 * Render a standard circle node (component, user-need).
 */
export function renderNodeCircle(
  cx: number,
  cy: number,
  r: number,
  stroke: string,
  strokeWidth: number,
): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
  );
}

/**
 * Render a "user in a circle" avatar inside the anchor circle: a head ring and
 * a shoulders dome (thin outline), clipped to the node circle so the bust is cut
 * cleanly at the edge. Scales with the node radius `r`. `id` makes the clipPath
 * unique per node.
 */
export function renderPersonSilhouette(
  cx: number,
  cy: number,
  r: number,
  id: string,
  stroke: string,
  strokeWidth: number,
): string {
  const silSW = strokeWidth * PERSON_SW_MULT;
  const hr = r * PERSON_HEAD_R;
  const hcy = cy - r * PERSON_HEAD_CY;
  const sw = r * PERSON_SHOULDER_W;
  const sBottom = cy + r * PERSON_SHOULDER_BOTTOM;
  const sTopY = cy + r * PERSON_SHOULDER_TOP;
  const ry = sBottom - sTopY;

  const clipId = `anchor-clip-${id}`;
  const clip =
    `<defs><clipPath id="${clipId}">` +
    `<circle cx="${cx}" cy="${cy}" r="${r - strokeWidth / 2}" />` +
    `</clipPath></defs>`;

  const head =
    `<circle cx="${cx}" cy="${hcy}" r="${hr}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${silSW}" />`;

  // Shoulders as an upward-bulging arc (dome); endpoints sit below the circle
  // and are clipped, matching the reference avatar's clipped bust.
  const shoulders =
    `<path d="M ${cx - sw} ${sBottom} A ${sw} ${ry} 0 0 1 ${cx + sw} ${sBottom}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${silSW}" stroke-linecap="round" />`;

  return `${clip}<g clip-path="url(#${clipId})">${head}${shoulders}</g>`;
}

/**
 * Render the ecosystem symbol: 3 concentric circles with diagonal hatch pattern.
 */
export function renderEcosystemSymbol(
  cx: number,
  cy: number,
  nodeId: string,
  stroke: string,
  strokeWidth: number,
): string {
  const patternId = `eco-hatch-${nodeId}`;

  const defs =
    `<defs>` +
    `<pattern id="${patternId}" width="${ECO_HATCH_SPACING}" height="${ECO_HATCH_SPACING}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="${ECO_HATCH_SPACING}" stroke="${ECO_HATCH_STROKE}" stroke-width="1" />` +
    `</pattern>` +
    `</defs>`;

  const outer =
    `<circle cx="${cx}" cy="${cy}" r="${ECO_OUTER_R}" ` +
    `fill="${ECO_GREY}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  const mid =
    `<circle cx="${cx}" cy="${cy}" r="${ECO_MID_R}" ` +
    `fill="url(#${patternId})" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  const inner =
    `<circle cx="${cx}" cy="${cy}" r="${ECO_INNER_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  return defs + outer + mid + inner;
}

/**
 * Render the market symbol: outer circle containing 3 bold hollow rings
 * (the nodes), connected to one another by a triangle. The rings have a white
 * fill and sit on top of the triangle, so the triangle reads as edges between
 * the nodes.
 */
export function renderMarketSymbol(
  cx: number,
  cy: number,
  stroke: string,
  strokeWidth: number,
): string {
  const outerCircle =
    `<circle cx="${cx}" cy="${cy}" r="${MARKET_OUTER_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  const topX = cx;
  const topY = cy - MARKET_TRIANGLE_R;
  const blX = cx - MARKET_TRIANGLE_R * SIN60;
  const blY = cy + MARKET_TRIANGLE_R * COS60;
  const brX = cx + MARKET_TRIANGLE_R * SIN60;
  const brY = cy + MARKET_TRIANGLE_R * COS60;

  // Triangle connecting the three nodes (drawn behind the rings).
  const triSW = strokeWidth * MARKET_TRI_SW_MULT;
  const triangle =
    `<polygon points="${topX},${topY} ${blX},${blY} ${brX},${brY}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${triSW}" stroke-linejoin="round" />`;

  // Three bold hollow rings (white fill so the triangle is hidden behind them).
  const ringSW = strokeWidth * MARKET_RING_SW_MULT;
  const ring = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="${MARKET_VERTEX_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${ringSW}" />`;

  return outerCircle + triangle + ring(topX, topY) + ring(blX, blY) + ring(brX, brY);
}

/**
 * Render a method indicator: single circle centered on the node as a background aura.
 *
 * Intensity varies by position in the legend:
 *   - Position 0 (1st key): ring only (stroke, no fill)
 *   - Position 1 (2nd key): semi-filled (40% opacity)
 *   - Position 2 (3rd key): solid fill (100% opacity)
 */
export function renderMethodIndicator(
  cx: number,
  cy: number,
  color: string,
  position: number,
): string {
  if (position === 0) {
    return (
      `<circle cx="${cx}" cy="${cy}" r="${METHOD_AURA_R}" ` +
      `fill="none" stroke="${color}" stroke-width="2" />`
    );
  } else if (position === 1) {
    return (
      `<circle cx="${cx}" cy="${cy}" r="${METHOD_AURA_R}" ` +
      `fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="1.5" />`
    );
  } else {
    return (
      `<circle cx="${cx}" cy="${cy}" r="${METHOD_AURA_R}" ` +
      `fill="${color}" fill-opacity="1" stroke="${color}" stroke-width="1.5" />`
    );
  }
}

/**
 * Render a pipeline handle square at the same z-level as component nodes.
 */
export function renderPipelineHandleSquare(
  hx: number,
  hy: number,
  pr: number,
  strokeWidth: number,
): string {
  const x = hx - pr;
  const y = hy - pr;
  return (
    `<rect x="${x}" y="${y}" width="${pr * 2}" height="${pr * 2}" ` +
    `fill="${NODE_FILL}" stroke="${NODE_STROKE}" stroke-width="${strokeWidth}" />`
  );
}

// ── Component node assembly (type-dispatched) ────────────────────────

/** Component type information needed for node rendering */
export interface NodeRenderInput {
  readonly id: string;
  readonly type: string;
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly stroke: string;
  readonly strokeWidth: number;
  /** Method indicator data (optional) */
  readonly method?: {
    readonly color: string;
    readonly position: number;
  };
  /** Whether to wrap in interactive <g> with data-component-id */
  readonly interactive?: boolean;
}

/**
 * Render a complete component node with type-appropriate symbol,
 * optional method indicator, and optional interactive wrapper.
 *
 * This is the high-level entry point that dispatches to the appropriate
 * symbol renderer based on component type.
 */
export function renderComponentNode(input: NodeRenderInput): string {
  const { id, type, cx, cy, radius, stroke, strokeWidth, method, interactive } = input;

  // Method aura (rendered BEFORE the node so it appears as background)
  let methodSvg = "";
  if (method) {
    methodSvg = renderMethodIndicator(cx, cy, method.color, method.position);
  }

  // Type-dispatched node visual
  let nodeSvg: string;
  if (type === "market") {
    nodeSvg = renderMarketSymbol(cx, cy, stroke, strokeWidth);
  } else if (type === "ecosystem") {
    nodeSvg = renderEcosystemSymbol(cx, cy, id, stroke, strokeWidth);
  } else if (type === "anchor") {
    nodeSvg = renderNodeCircle(cx, cy, radius, stroke, strokeWidth) +
      renderPersonSilhouette(cx, cy, radius, id, stroke, strokeWidth);
  } else {
    nodeSvg = renderNodeCircle(cx, cy, radius, stroke, strokeWidth);
  }

  // Interactive mode wrapping
  if (interactive) {
    return `<g data-component-id="${id}">${methodSvg}${nodeSvg}</g>`;
  } else {
    // Separate method and node SVG with newline to match server layer output format
    return methodSvg ? methodSvg + "\n" + nodeSvg : nodeSvg;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  EDGES
// ══════════════════════════════════════════════════════════════════════

/** Relation type visual style (matching edges-layer.ts) */
export type RelationType = "DependsOn" | "Flow" | "Constraint";

interface RelationVisualStyle {
  readonly color: string;
  readonly dashArray: string;
}

const RELATION_TYPE_STYLES: Record<RelationType, RelationVisualStyle> = {
  DependsOn: { color: "#999999", dashArray: "" },
  Flow:      { color: "#2563eb", dashArray: "8,4" },
  Constraint:{ color: "#dc2626", dashArray: "3,3" },
};

/** Width of the invisible hit area for edge click detection in interactive mode */
const EDGE_HIT_AREA_WIDTH = 16;

/** Edge rendering input */
export interface EdgeRenderInput {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly relationType: string;
  readonly flowStyle?: "solid" | "dashed" | "bold";
  readonly baseStrokeWidth: number;
  readonly relationId?: string;
  readonly interactive?: boolean;
}

/**
 * Render an edge line between two components.
 * Applies relation type styling and optional flow style overrides.
 */
export function renderEdge(input: EdgeRenderInput): string {
  const {
    x1, y1, x2, y2,
    relationType,
    flowStyle = "solid",
    baseStrokeWidth,
    relationId,
    interactive,
  } = input;

  const typeStyle = RELATION_TYPE_STYLES[relationType as RelationType] ?? RELATION_TYPE_STYLES.DependsOn;
  let strokeWidth = baseStrokeWidth;
  let dashArray = typeStyle.dashArray;

  // Flow metadata can override line style
  switch (flowStyle) {
    case "dashed":
      dashArray = "6,4";
      break;
    case "bold":
      strokeWidth = baseStrokeWidth * 2;
      break;
    // "solid" keeps the type's default dash pattern
  }

  const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";

  const lineEl =
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
    `stroke="${typeStyle.color}" stroke-width="${strokeWidth}"${dashAttr} />`;

  if (interactive && relationId) {
    const hitArea =
      `<line class="hit-area" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
      `stroke="transparent" stroke-width="${EDGE_HIT_AREA_WIDTH}" />`;
    return `<g data-edge-id="${relationId}">${hitArea}${lineEl}</g>`;
  }

  return lineEl;
}

// Re-export edge style constants for external use
export { RELATION_TYPE_STYLES };

// ══════════════════════════════════════════════════════════════════════
//  EVOLVES-TO ARROWS
// ══════════════════════════════════════════════════════════════════════

/** Evolve type visual styles (matching evolvesto-layer.ts) */
export type EvolveType = "natural" | "ecosystem" | "forced" | "late";

const EVOLVE_STYLES: Record<EvolveType, { stroke: string; dasharray: string }> = {
  natural:   { stroke: "#dc2626", dasharray: "6,3" },
  ecosystem: { stroke: "#2563eb", dasharray: "6,3" },
  forced:    { stroke: "#9333ea", dasharray: "6,3" },
  late:      { stroke: "#999999", dasharray: "6,3" },
};

const ARROWHEAD_SIZE = 8;
const EVOLVE_HIT_AREA_WIDTH = 16;

// Re-export evolve styles for external use
export { EVOLVE_STYLES, ARROWHEAD_SIZE };

/**
 * Generate arrowhead polygon points string for an arrow from (fromX,fromY) to (toX,toY).
 */
export function arrowheadPoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number = ARROWHEAD_SIZE,
): string {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return "";

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const half = size / 2;
  const baseX = toX - ux * size;
  const baseY = toY - uy * size;

  const p1x = baseX + px * half;
  const p1y = baseY + py * half;
  const p2x = baseX - px * half;
  const p2y = baseY - py * half;

  return `${toX},${toY} ${p1x},${p1y} ${p2x},${p2y}`;
}

/** EvolvesTo arrow rendering input */
export interface EvolveRenderInput {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly evolveType: string;
  readonly componentId: string;
  readonly arrowStrokeWidth: number;
  /** Optional style overrides from resolvedConfig.evolveStyles */
  readonly styleOverride?: {
    readonly stroke?: string;
    readonly strokeDasharray?: string;
  };
  /** Optional _default fallback from resolvedConfig.evolveStyles */
  readonly styleDefault?: {
    readonly stroke?: string;
    readonly strokeDasharray?: string;
  };
  readonly interactive?: boolean;
}

/**
 * Render an evolvesTo arrow as a dashed line with arrowhead.
 */
export function renderEvolveArrow(input: EvolveRenderInput): string {
  const {
    fromX, fromY, toX, toY,
    evolveType,
    componentId,
    arrowStrokeWidth,
    styleOverride,
    styleDefault,
    interactive,
  } = input;

  const defaults = EVOLVE_STYLES[evolveType as EvolveType] ?? EVOLVE_STYLES.natural;

  // Resolution order: per-type override > _default > hardcoded defaults
  const style = {
    stroke: styleOverride?.stroke ?? styleDefault?.stroke ?? defaults.stroke,
    dasharray: styleOverride?.strokeDasharray ?? styleDefault?.strokeDasharray ?? defaults.dasharray,
  };

  const lineSvg =
    `<line x1="${fromX}" y1="${fromY}" ` +
    `x2="${toX}" y2="${toY}" ` +
    `stroke="${style.stroke}" stroke-width="${arrowStrokeWidth}" ` +
    `stroke-dasharray="${style.dasharray}" />`;

  const pts = arrowheadPoints(fromX, fromY, toX, toY, ARROWHEAD_SIZE);
  const arrowSvg = pts
    ? `<polygon points="${pts}" fill="${style.stroke}" />`
    : "";

  if (interactive) {
    const hitArea =
      `<line class="hit-area" x1="${fromX}" y1="${fromY}" ` +
      `x2="${toX}" y2="${toY}" ` +
      `stroke="transparent" stroke-width="${EVOLVE_HIT_AREA_WIDTH}" />`;
    return `<g data-evolves-from="${componentId}">${hitArea}${lineSvg}${arrowSvg}</g>`;
  }

  return lineSvg + (arrowSvg ? "\n" + arrowSvg : "");
}

/**
 * Render an inertia barrier (thick vertical line at a phase boundary).
 */
export function renderInertiaBarrier(
  x: number,
  y1: number,
  y2: number,
): string {
  const INERTIA_STROKE_WIDTH = 6;
  const INERTIA_COLOR = "#000000";
  return (
    `<line x1="${x}" y1="${y1}" ` +
    `x2="${x}" y2="${y2}" ` +
    `stroke="${INERTIA_COLOR}" stroke-width="${INERTIA_STROKE_WIDTH}" />`
  );
}

// ══════════════════════════════════════════════════════════════════════
//  PIPELINES
// ══════════════════════════════════════════════════════════════════════

const PIPELINE_FILL = "rgba(255, 255, 255, 0.35)";
const PIPELINE_STROKE = "#999999";
const PIPELINE_STROKE_WIDTH = 1;
const PIPELINE_RX = 0;
const PIPELINE_HANDLE_HALF = 7;

// Re-export pipeline constants
export { PIPELINE_FILL, PIPELINE_STROKE, PIPELINE_STROKE_WIDTH, PIPELINE_RX, PIPELINE_HANDLE_HALF };

/** Pipeline rendering input */
export interface PipelineRenderInput {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly componentId: string;
  readonly interactive?: boolean;
}

/**
 * Render a pipeline background rectangle with optional interactive resize handles.
 */
export function renderPipeline(input: PipelineRenderInput): string {
  const { x, y, width, height, componentId, interactive } = input;

  // Skip degenerate pipelines
  if (width <= 0 || height <= 0) return "";

  const rectSvg =
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" ` +
    `rx="${PIPELINE_RX}" ry="${PIPELINE_RX}" ` +
    `fill="${PIPELINE_FILL}" stroke="${PIPELINE_STROKE}" ` +
    `stroke-width="${PIPELINE_STROKE_WIDTH}" />`;

  if (interactive) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const handlesSvg =
      `<rect data-handle="left" x="${x - PIPELINE_HANDLE_HALF}" y="${cy - PIPELINE_HANDLE_HALF}" ` +
      `width="${PIPELINE_HANDLE_HALF * 2}" height="${PIPELINE_HANDLE_HALF * 2}" ` +
      `fill="#fff" stroke="#666" stroke-width="1" style="cursor:ew-resize" />` +
      `<rect data-handle="right" x="${x + width - PIPELINE_HANDLE_HALF}" y="${cy - PIPELINE_HANDLE_HALF}" ` +
      `width="${PIPELINE_HANDLE_HALF * 2}" height="${PIPELINE_HANDLE_HALF * 2}" ` +
      `fill="#fff" stroke="#666" stroke-width="1" style="cursor:ew-resize" />` +
      `<rect data-handle="top" x="${cx - PIPELINE_HANDLE_HALF}" y="${y - PIPELINE_HANDLE_HALF}" ` +
      `width="${PIPELINE_HANDLE_HALF * 2}" height="${PIPELINE_HANDLE_HALF * 2}" ` +
      `fill="#fff" stroke="#666" stroke-width="1" style="cursor:ns-resize" />` +
      `<rect data-handle="bottom" x="${cx - PIPELINE_HANDLE_HALF}" y="${y + height - PIPELINE_HANDLE_HALF}" ` +
      `width="${PIPELINE_HANDLE_HALF * 2}" height="${PIPELINE_HANDLE_HALF * 2}" ` +
      `fill="#fff" stroke="#666" stroke-width="1" style="cursor:ns-resize" />`;
    return `<g data-pipeline-id="${componentId}">${rectSvg}${handlesSvg}</g>`;
  }

  return rectSvg;
}

// ══════════════════════════════════════════════════════════════════════
//  LABELS
// ══════════════════════════════════════════════════════════════════════

const COMPONENT_LABEL_BASE_FONT_SIZE = 12;
const COMPONENT_LABEL_COLOR = "#333333";

/** Label rendering input */
export interface LabelRenderInput {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly anchor: "start" | "middle" | "end";
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly componentId?: string;
  readonly interactive?: boolean;
}

/**
 * Render a component label as an SVG text element.
 * Supports multi-line text (split on newlines → tspan elements).
 */
export function renderLabel(input: LabelRenderInput): string {
  const { x, y, text, anchor, fontFamily, fontSize, componentId, interactive } = input;

  const labelAttr = interactive && componentId
    ? ` data-label-for="${componentId}" style="cursor:move"`
    : "";

  if (text.includes("\n")) {
    const lines = text.split("\n");
    const firstLine = esc(lines[0]);
    const restLines = lines
      .slice(1)
      .map((line) => `<tspan x="${x}" dy="14">${esc(line)}</tspan>`)
      .join("");
    return (
      `<text x="${x}" y="${y}" text-anchor="${anchor}" ` +
      `font-family="${fontFamily}" font-size="${fontSize}" ` +
      `fill="${COMPONENT_LABEL_COLOR}"${labelAttr}>${firstLine}${restLines}</text>`
    );
  }

  return (
    `<text x="${x}" y="${y}" text-anchor="${anchor}" ` +
    `font-family="${fontFamily}" font-size="${fontSize}" ` +
    `fill="${COMPONENT_LABEL_COLOR}"${labelAttr}>${esc(text)}</text>`
  );
}

// Re-export label constants
export { COMPONENT_LABEL_BASE_FONT_SIZE, COMPONENT_LABEL_COLOR };

// ══════════════════════════════════════════════════════════════════════
//  NOTES
// ══════════════════════════════════════════════════════════════════════

const NOTE_FONT_SIZE = 11;
const NOTE_LINE_HEIGHT = 15;
const NOTE_COLOR = "#666666";
const NOTE_FONT_STYLE = "italic";

export { NOTE_FONT_SIZE, NOTE_LINE_HEIGHT, NOTE_COLOR, NOTE_FONT_STYLE };

/** Note rendering input */
export interface NoteRenderInput {
  readonly cx: number;
  readonly cy: number;
  readonly text: string;
  readonly fontFamily: string;
}

/**
 * Render a note component as styled italic text.
 * Supports multi-line text via tspan elements.
 */
export function renderNote(input: NoteRenderInput): string {
  const { cx, cy, text, fontFamily } = input;
  const lines = text.split("\n");

  if (lines.length === 1) {
    return (
      `<text x="${cx}" y="${cy}" text-anchor="start" ` +
      `font-family="${fontFamily}" font-size="${NOTE_FONT_SIZE}" ` +
      `font-style="${NOTE_FONT_STYLE}" fill="${NOTE_COLOR}">${esc(lines[0])}</text>`
    );
  }

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${cx}" dy="${i === 0 ? 0 : NOTE_LINE_HEIGHT}">${esc(line)}</tspan>`,
    )
    .join("");

  return (
    `<text x="${cx}" y="${cy}" text-anchor="start" ` +
    `font-family="${fontFamily}" font-size="${NOTE_FONT_SIZE}" ` +
    `font-style="${NOTE_FONT_STYLE}" fill="${NOTE_COLOR}">${tspans}</text>`
  );
}

// ══════════════════════════════════════════════════════════════════════
//  STEPS
// ══════════════════════════════════════════════════════════════════════

const STEP_DEFAULT_FILL = "#cc0000";
const STEP_RADIUS = 14;
const STEP_FONT_SIZE = 13;
const STEP_TEXT_COLOR = "#ffffff";

export { STEP_DEFAULT_FILL, STEP_RADIUS, STEP_FONT_SIZE, STEP_TEXT_COLOR };

/** Step rendering input */
export interface StepRenderInput {
  readonly cx: number;
  readonly cy: number;
  readonly number: number;
  readonly fill: string;
  readonly fontFamily: string;
  readonly stepId: string;
  readonly interactive?: boolean;
}

/**
 * Render a step sticker as a filled circle with a white centered number.
 */
export function renderStep(input: StepRenderInput): string {
  const { cx, cy, number, fill, fontFamily, stepId, interactive } = input;

  const circleSvg =
    `<circle cx="${cx}" cy="${cy}" r="${STEP_RADIUS}" ` +
    `fill="${fill}" stroke="none" />`;

  const textSvg =
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="${fontFamily}" font-size="${STEP_FONT_SIZE}" ` +
    `font-weight="bold" fill="${STEP_TEXT_COLOR}">${number}</text>`;

  if (interactive) {
    return `<g data-step-id="${stepId}" data-step-number="${number}">${circleSvg}${textSvg}</g>`;
  }

  return circleSvg + "\n" + textSvg;
}

// ══════════════════════════════════════════════════════════════════════
//  ACCELERATORS
// ══════════════════════════════════════════════════════════════════════

const ARROW_HALF_H = 10;
const ARROW_W = 30;
const SHAFT_HALF_H = 4;
const HEAD_START_RATIO = 0.55;
const ARROW_STROKE = "#000000";
const ARROW_FILL = "#000000";
const ACC_LABEL_FONT_SIZE = 12;
const ACC_LABEL_GAP = 6;
// Gap between the node edge and the near edge of the arrow, so the arrow sits
// beside the node instead of overlapping its center.
const ACC_GAP = 6;
// Fallback node radius when the caller does not provide one (matches the method aura).
const ACC_DEFAULT_NODE_R = 16;

export { ARROW_W, ARROW_HALF_H };

/**
 * Build a rightward-pointing arrow SVG path string centered at (0, 0).
 */
export function buildArrowPath(): string {
  const hw = ARROW_W / 2;
  const headX = -hw + ARROW_W * HEAD_START_RATIO;

  const points = [
    `M ${-hw} ${-SHAFT_HALF_H}`,
    `L ${headX} ${-SHAFT_HALF_H}`,
    `L ${headX} ${-ARROW_HALF_H}`,
    `L ${hw} 0`,
    `L ${headX} ${ARROW_HALF_H}`,
    `L ${headX} ${SHAFT_HALF_H}`,
    `L ${-hw} ${SHAFT_HALF_H}`,
    `Z`,
  ];

  return points.join(" ");
}

/** Accelerator rendering input */
export interface AcceleratorRenderInput {
  readonly cx: number;
  readonly cy: number;
  readonly label: string;
  readonly type: "accelerator" | "deaccelerator";
  readonly fontFamily: string;
  /** Radius of the node this arrow decorates, used to offset the arrow to its side */
  readonly nodeRadius?: number;
}

/**
 * Render an accelerator/deaccelerator arrow with label.
 *
 * The arrow is offset horizontally so it sits beside the node instead of
 * overlapping its center: to the right (pointing right) for an accelerator,
 * to the left (pointing left) for a deaccelerator. The near edge of the arrow
 * starts at `nodeRadius + ACC_GAP` from the node center.
 */
export function renderAccelerator(input: AcceleratorRenderInput): string {
  const { cx, cy, label, type, fontFamily } = input;
  const nodeRadius = input.nodeRadius ?? ACC_DEFAULT_NODE_R;
  const isDeaccelerator = type === "deaccelerator";
  const rotation = isDeaccelerator ? 180 : 0;
  const arrowD = buildArrowPath();

  // Distance from the node center to the arrow center: clear the node radius +
  // a gap, then half the arrow so the near edge lands exactly at that gap.
  const offset = nodeRadius + ACC_GAP + ARROW_W / 2;
  const arrowCx = isDeaccelerator ? cx - offset : cx + offset;

  const arrowSvg =
    `<path d="${arrowD}" ` +
    `transform="translate(${arrowCx}, ${cy})${rotation ? ` rotate(${rotation})` : ""}" ` +
    `fill="${ARROW_FILL}" stroke="${ARROW_STROKE}" stroke-width="1" />`;

  const labelX = isDeaccelerator
    ? arrowCx - ARROW_W / 2 - ACC_LABEL_GAP
    : arrowCx + ARROW_W / 2 + ACC_LABEL_GAP;
  const textAnchor = isDeaccelerator ? "end" : "start";

  const labelSvg =
    `<text x="${labelX}" y="${cy}" text-anchor="${textAnchor}" ` +
    `dominant-baseline="central" ` +
    `font-family="${fontFamily}" font-size="${ACC_LABEL_FONT_SIZE}" ` +
    `fill="${ARROW_STROKE}">${esc(label)}</text>`;

  return arrowSvg + "\n" + labelSvg;
}

// ══════════════════════════════════════════════════════════════════════
//  SVG DOCUMENT STRUCTURE
// ══════════════════════════════════════════════════════════════════════

/**
 * Generate the SVG opening tag with proper namespace and viewBox.
 */
export function svgHeader(canvasWidth: number, canvasHeight: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${canvasWidth}" height="${canvasHeight}" ` +
    `viewBox="0 0 ${canvasWidth} ${canvasHeight}">`
  );
}

/**
 * Generate the SVG background rect.
 */
export function svgBackground(canvasWidth: number, canvasHeight: number, bgColor: string): string {
  return `<rect width="${canvasWidth}" height="${canvasHeight}" fill="${bgColor}" />`;
}

/**
 * Generate the invisible plot-area rect for interactive coordinate conversion.
 */
export function svgPlotArea(
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  return `<rect data-plot-area x="${left}" y="${top}" width="${width}" height="${height}" fill="none" pointer-events="none" />`;
}

/**
 * Generate the SVG closing tag.
 */
export function svgFooter(): string {
  return "</svg>";
}

/**
 * Wrap SVG fragments in a named layer group.
 */
export function svgLayerGroup(layerName: string, fragments: string[]): string {
  if (fragments.length === 0) return "";
  return `<g data-layer="${esc(layerName)}">\n${fragments.join("\n")}\n</g>`;
}
