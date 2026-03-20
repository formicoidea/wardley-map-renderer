/**
 * NodesLayer — renders component nodes as circles on the map.
 *
 * Part of the 9-layer modular rendering architecture (Layer 6).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Node appearance varies by component type:
 *   - component:  solid white circle with black stroke (standard)
 *   - user-need:  solid white circle with black stroke (same visual, distinct semantically)
 *   - anchor:     solid white circle with black stroke + person silhouette inside
 *   - pipeline:   no node circle rendered (pipeline has its own rect in pipelines-layer)
 *   - note:       no node circle rendered (notes are text-only in notes-layer)
 *
 * Optional color override is supported via component.color field.
 *
 * @module render/nodes-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { resolveColor, resolveTypeStyle } from "../schema.js";
import type { NodeRadii } from "../schema.js";

// ── Visual constants ─────────────────────────────────────────────────

const NODE_FILL = "#ffffff";
const NODE_STROKE = "#000000";

// Person silhouette constants (relative to node center)
const HEAD_OFFSET_Y = -2;   // head circle center Y offset from node center
const HEAD_RADIUS = 1.5;    // head circle radius
const BODY_STROKE_WIDTH = 1.2;

// Ecosystem symbol constants
const ECO_OUTER_R = 30;    // outer grey circle
const ECO_MID_R = 25;      // middle hatched circle
const ECO_INNER_R = 10;    // inner white circle
const ECO_GREY = "#cccccc";
const ECO_HATCH_STROKE = "#999999";
const ECO_HATCH_SPACING = 4; // spacing between hatch lines

// Market symbol constants
// Equilateral triangle with vertex circles fully inscribed inside the outer circle.
// Outer circle radius matches Method aura radius (16), vertex circles r=3.
const MARKET_OUTER_R = 16; // same as METHOD_AURA_R
const MARKET_VERTEX_R = 3;
// Triangle radius reduced so vertex circles (centered on vertices) stay inside outer circle
const MARKET_TRIANGLE_R = MARKET_OUTER_R - MARKET_VERTEX_R; // 13
// Equilateral triangle inscribed in circle of radius MARKET_TRIANGLE_R:
// top vertex (0, -R), bottom-left (-R*sin60, R*cos60), bottom-right (R*sin60, R*cos60)
const SIN60 = Math.sin(Math.PI / 3); // ≈ 0.866
const COS60 = Math.cos(Math.PI / 3); // 0.5

// Method indicator constants — single circle rendered as aura behind the component node
// Intensity varies by preconisation position in legend:
//   Position 0 (1st key): ring only (stroke, no fill)
//   Position 1 (2nd key): semi-filled (40% opacity)
//   Position 2 (3rd key): solid fill (100% opacity)
const METHOD_AURA_R = 16;    // aura radius (larger than typical node radius)
const METHOD_DEFAULT_COLOR = "#888888"; // fallback for unknown method types

/** Component types that render as a circle node */
const NODE_TYPES = new Set(["component", "user-need", "anchor", "ecosystem", "market"]);

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Render a person silhouette (head + body triangle) inside the anchor circle.
 * The silhouette is centered at (cx, cy) and fits within NODE_RADIUS=5.
 *
 * Head: small circle at (cx, cy-2) r=1.5
 * Body: triangle from (cx, cy-0.5) to bottom-left (cx-2.5, cy+3.5) and bottom-right (cx+2.5, cy+3.5)
 */
function renderPersonSilhouette(cx: number, cy: number, stroke: string): string {
  const hx = cx;
  const hy = cy + HEAD_OFFSET_Y;

  // Body as a filled triangle (torso/legs abstracted as simple triangle)
  const topX = cx;
  const topY = cy - 0.5;
  const leftX = cx - 2.5;
  const leftY = cy + 3.5;
  const rightX = cx + 2.5;
  const rightY = cy + 3.5;

  const head =
    `<circle cx="${hx}" cy="${hy}" r="${HEAD_RADIUS}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${BODY_STROKE_WIDTH}" />`;

  const body =
    `<polyline points="${topX},${topY} ${leftX},${leftY} ${rightX},${rightY} ${topX},${topY}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${BODY_STROKE_WIDTH}" stroke-linejoin="round" />`;

  return head + body;
}

/**
 * Render the ecosystem symbol: 3 concentric circles.
 *   - Outer: r=30, grey fill (#cccccc)
 *   - Middle: r=25, diagonal hatch pattern fill
 *   - Inner: r=10, white fill
 *
 * The hatch pattern uses a unique id per node to avoid SVG id collisions.
 * Returns a `<defs>` block for the pattern + the 3 circles.
 */
function renderEcosystemSymbol(
  cx: number,
  cy: number,
  nodeId: string,
  stroke: string,
  strokeWidth: number
): string {
  const patternId = `eco-hatch-${nodeId}`;

  // SVG <defs> for the diagonal hatch pattern
  const defs =
    `<defs>` +
    `<pattern id="${patternId}" width="${ECO_HATCH_SPACING}" height="${ECO_HATCH_SPACING}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="${ECO_HATCH_SPACING}" stroke="${ECO_HATCH_STROKE}" stroke-width="1" />` +
    `</pattern>` +
    `</defs>`;

  // Outer circle: grey fill
  const outer =
    `<circle cx="${cx}" cy="${cy}" r="${ECO_OUTER_R}" ` +
    `fill="${ECO_GREY}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  // Middle circle: hatched fill
  const mid =
    `<circle cx="${cx}" cy="${cy}" r="${ECO_MID_R}" ` +
    `fill="url(#${patternId})" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  // Inner circle: white fill
  const inner =
    `<circle cx="${cx}" cy="${cy}" r="${ECO_INNER_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  return defs + outer + mid + inner;
}

/**
 * Render a method indicator: single circle centered on the node as a background aura.
 *
 * The symbol intensity varies by the preconisation's position in the legend:
 *   - Position 0 (1st key): ring only (stroke, no fill)
 *   - Position 1 (2nd key): semi-filled (40% opacity)
 *   - Position 2 (3rd key): solid fill (100% opacity)
 *
 * Color is resolved from `renderConfig.methods[]` by type.
 * Position is determined by matching preconisation against legend keys.
 *
 * @param cx - center x of the parent component node
 * @param cy - center y of the parent component node
 * @param color - resolved CSS color for the method type
 * @param position - 0, 1, or 2 based on preconisation position in legend keys
 */
export function renderMethodIndicator(
  cx: number,
  cy: number,
  color: string,
  position: number
): string {
  if (position === 0) {
    // Ring only: stroke, no fill
    return (
      `<circle cx="${cx}" cy="${cy}" r="${METHOD_AURA_R}" ` +
      `fill="none" stroke="${color}" stroke-width="2" />`
    );
  } else if (position === 1) {
    // Semi-filled: 40% opacity fill + stroke
    return (
      `<circle cx="${cx}" cy="${cy}" r="${METHOD_AURA_R}" ` +
      `fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="1.5" />`
    );
  } else {
    // Solid fill: 100% opacity
    return (
      `<circle cx="${cx}" cy="${cy}" r="${METHOD_AURA_R}" ` +
      `fill="${color}" fill-opacity="1" stroke="${color}" stroke-width="1.5" />`
    );
  }
}

/**
 * Render the market symbol: outer circle (r=16, matching Method aura) with an
 * equilateral triangle inscribed so vertices touch the circle, + 3 small
 * circles (r=3) at each vertex.
 *
 * The equilateral triangle is inscribed in the outer circle (MARKET_TRIANGLE_R = 13).
 * Vertex circles sit at each triangle vertex on the circle boundary.
 */
function renderMarketSymbol(
  cx: number,
  cy: number,
  stroke: string,
  strokeWidth: number
): string {
  // Outer circle
  const outerCircle =
    `<circle cx="${cx}" cy="${cy}" r="${MARKET_OUTER_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  // Triangle vertices (inscribed in circle of radius MARKET_TRIANGLE_R)
  const topX = cx;
  const topY = cy - MARKET_TRIANGLE_R;
  const blX = cx - MARKET_TRIANGLE_R * SIN60;
  const blY = cy + MARKET_TRIANGLE_R * COS60;
  const brX = cx + MARKET_TRIANGLE_R * SIN60;
  const brY = cy + MARKET_TRIANGLE_R * COS60;

  // Inscribed triangle
  const triangle =
    `<polygon points="${topX},${topY} ${blX},${blY} ${brX},${brY}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;

  // Small circles at each vertex
  const c1 =
    `<circle cx="${topX}" cy="${topY}" r="${MARKET_VERTEX_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  const c2 =
    `<circle cx="${blX}" cy="${blY}" r="${MARKET_VERTEX_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  const c3 =
    `<circle cx="${brX}" cy="${brY}" r="${MARKET_VERTEX_R}" ` +
    `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

  return outerCircle + triangle + c1 + c2 + c3;
}

// ── Exported constants for testing ──────────────────────────────────
export { METHOD_AURA_R, METHOD_DEFAULT_COLOR, MARKET_OUTER_R, MARKET_TRIANGLE_R, MARKET_VERTEX_R };

// ── Layer renderer ───────────────────────────────────────────────────

/**
 * Resolve the effective node radius for a given component type.
 * Delegates to `resolveTypeStyle` — the canonical TypeStyleMap per-type-with-fallback lookup.
 * Lookup precedence: nodeRadii[type] → nodeRadii._default
 *
 * NodeRadii is a TypeStyleMap<number>: _default is required, so the result is always a number.
 */
function resolveNodeRadius(
  type: string,
  nodeRadii: NodeRadii
): number {
  // resolveTypeStyle returns T | undefined; NodeRadii guarantees _default is present,
  // so the result is always a number.  The non-null assertion is safe here.
  return resolveTypeStyle<number>(nodeRadii, type) as number;
}

/**
 * Render component nodes as SVG circles.
 *
 * Skips pipeline and note types (they have their own visual layers).
 * Applies optional color override from component.color field.
 *
 * @param ctx - RenderContext with pre-computed node geometry
 * @returns Array of SVG fragment strings
 */
export const renderNodesLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  const parts: string[] = [];
  const { nodeRadii, typeColors, excludeComponentTypes, strokeWidth } = ctx.resolvedConfig;
  const excluded = new Set(excludeComponentTypes);

  for (const node of ctx.nodes) {
    const comp = node.component;

    // Skip non-node types
    if (!NODE_TYPES.has(comp.type)) continue;

    // Skip excluded component types
    if (excluded.has(comp.type)) continue;

    // Resolve per-type radius: nodeRadii[type] → nodeRadii._default
    const r = resolveNodeRadius(comp.type, nodeRadii);

    // Color precedence: component.color > typeColors[type] > typeColors._default > node default
    // typeColors uses the TypeStyleMap pattern: per-type key takes priority, then _default fallback
    const typeColor = typeColors[comp.type] ?? typeColors._default;
    const stroke = comp.color
      ? resolveColor(comp.color)
      : typeColor
        ? resolveColor(typeColor)
        : NODE_STROKE;

    const circle =
      `<circle cx="${node.cx}" cy="${node.cy}" r="${r}" ` +
      `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

    // Method indicator: rendered BEFORE the node so it appears as a background aura.
    // Color from renderConfig.methods[].color, intensity from preconisation position in legend.
    // Unknown types degrade silently: no indicator rendered, component appears normally.
    if (comp.method) {
      const methodCfg = ctx.resolvedConfig.methods.find(m => m.type === comp.method!.type);
      if (methodCfg) {
        const legendKeys = Object.keys(methodCfg.legend);
        const position = legendKeys.indexOf(comp.method.preconisation);
        // Only render if preconisation matches a known legend key (0, 1, or 2)
        if (position >= 0) {
          parts.push(renderMethodIndicator(node.cx, node.cy, methodCfg.color, position));
        }
      }
    }

    if (comp.type === "market") {
      // Market overrides the default circle with its own symbol
      parts.push(renderMarketSymbol(node.cx, node.cy, stroke, strokeWidth));
    } else if (comp.type === "ecosystem") {
      // Ecosystem overrides the default circle with its own 3-concentric-circle symbol
      parts.push(renderEcosystemSymbol(node.cx, node.cy, comp.id, stroke, strokeWidth));
    } else if (comp.type === "anchor") {
      parts.push(circle + renderPersonSilhouette(node.cx, node.cy, stroke));
    } else {
      parts.push(circle);
    }
  }

  // Render pipeline handle squares at same z-level as component nodes
  // (only if "pipeline" type is not excluded)
  if (!excluded.has("pipeline")) {
    for (const p of ctx.pipelines) {
      // Resolve pipeline radius for handle square dimensions
      const pr = resolveNodeRadius("pipeline", nodeRadii);
      const hx = p.handleX - pr;
      const hy = p.handleY - pr;
      parts.push(
        `<rect x="${hx}" y="${hy}" width="${pr * 2}" height="${pr * 2}" ` +
          `fill="${NODE_FILL}" stroke="${NODE_STROKE}" stroke-width="${strokeWidth}" />`
      );
    }
  }

  return parts;
};
