/**
 * NodesLayer — renders component nodes as circles on the map.
 *
 * Part of the 8-layer modular rendering architecture (Layer 6).
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
import { resolveColor } from "../schema.js";

// ── Visual constants ─────────────────────────────────────────────────

const NODE_RADIUS = 7;
const NODE_FILL = "#ffffff";
const NODE_STROKE = "#000000";
const NODE_STROKE_WIDTH = 1.5;

// Person silhouette constants (relative to node center)
const HEAD_OFFSET_Y = -2;   // head circle center Y offset from node center
const HEAD_RADIUS = 1.5;    // head circle radius
const BODY_STROKE_WIDTH = 1.2;

/** Component types that render as a circle node */
const NODE_TYPES = new Set(["component", "user-need", "anchor"]);

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

// ── Layer renderer ───────────────────────────────────────────────────

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

  for (const node of ctx.nodes) {
    const comp = node.component;

    // Skip non-node types
    if (!NODE_TYPES.has(comp.type)) continue;

    // Use color override if present, otherwise default stroke
    const stroke = comp.color ? resolveColor(comp.color) : NODE_STROKE;

    const circle =
      `<circle cx="${node.cx}" cy="${node.cy}" r="${NODE_RADIUS}" ` +
      `fill="${NODE_FILL}" stroke="${stroke}" stroke-width="${NODE_STROKE_WIDTH}" />`;

    if (comp.type === "anchor") {
      parts.push(circle + renderPersonSilhouette(node.cx, node.cy, stroke));
    } else {
      parts.push(circle);
    }
  }

  // Render pipeline handle squares at same z-level as component nodes
  for (const p of ctx.pipelines) {
    const hx = p.handleX - NODE_RADIUS;
    const hy = p.handleY - NODE_RADIUS;
    parts.push(
      `<rect x="${hx}" y="${hy}" width="${NODE_RADIUS * 2}" height="${NODE_RADIUS * 2}" ` +
        `fill="${NODE_FILL}" stroke="${NODE_STROKE}" stroke-width="${NODE_STROKE_WIDTH}" />`
    );
  }

  return parts;
};
