/**
 * LegendLayer — renders an automatic legend showing symbols present on the map.
 *
 * Part of the 9-layer modular rendering architecture (Layer 9, z-order 90).
 * Pure function: takes RenderContext, returns SVG fragment strings.
 *
 * Features:
 *   - Data-driven: only shows items actually present on the map
 *   - Auto-positioning: places legend in the least crowded corner
 *   - Manual override: legend.position can force a specific corner
 *   - Togglable: legend.show = false disables rendering
 *
 * @module render/legend-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { esc } from "./svg-composer.js";

// ── Visual constants ──────────────────────────────────────────────────

const LEGEND_PADDING = 12;
const TITLE_HEIGHT = 22;
const LINE_HEIGHT = 20;
const SWATCH_WIDTH = 24;
const SWATCH_GAP = 8;
const MIN_WIDTH = 140;
const FONT_SIZE = 12;
const FONT_COLOR = "#333333";
const BG_FILL = "#f5f5f5";
const BORDER_COLOR = "#cccccc";
const CORNER_MARGIN = 12;

/** Edge style colors (match edges-layer.ts) */
const EDGE_COLOR = "#999999";

/** Evolution arrow colors (match evolvesto-layer.ts:24-28) */
const EVOLVE_COLORS: Record<string, string> = {
  natural: "#dc2626",
  ecosystem: "#2563eb",
  forced: "#9333ea",
  late: "#999999",
};

// ── Legend item definition ─────────────────────────────────────────────

interface LegendItem {
  label: string;
  renderSwatch: (x: number, y: number) => string;
}

// ── Data-driven legend item collection ─────────────────────────────────

/**
 * Inspect the RenderContext to collect only the legend items
 * that correspond to elements actually present on the map.
 */
function collectLegendItems(ctx: RenderContext): LegendItem[] {
  const items: LegendItem[] = [];

  // Component (type === "component" or "user-need")
  const hasComponent = ctx.nodes.some(
    (n) => n.component.type === "component" || n.component.type === "user-need"
  );
  if (hasComponent) {
    items.push({
      label: "Component",
      renderSwatch: (x, y) =>
        `<circle cx="${x + 12}" cy="${y + 10}" r="5" ` +
        `fill="#ffffff" stroke="#000000" stroke-width="1.5" />`,
    });
  }

  // Anchor (type === "anchor")
  const hasAnchor = ctx.nodes.some((n) => n.component.type === "anchor");
  if (hasAnchor) {
    items.push({
      label: "User / Stakeholder",
      renderSwatch: (x, y) => {
        const cx = x + 12;
        const cy = y + 10;
        return (
          `<circle cx="${cx}" cy="${cy}" r="5" ` +
          `fill="#ffffff" stroke="#000000" stroke-width="1.5" />` +
          `<circle cx="${cx}" cy="${cy - 2}" r="1.5" ` +
          `fill="none" stroke="#000000" stroke-width="1" />` +
          `<polyline points="${cx},${cy - 0.5} ${cx - 2.5},${cy + 3.5} ${cx + 2.5},${cy + 3.5} ${cx},${cy - 0.5}" ` +
          `fill="none" stroke="#000000" stroke-width="1" stroke-linejoin="round" />`
        );
      },
    });
  }

  // Pipeline
  if (ctx.pipelines.length > 0) {
    items.push({
      label: "Pipeline",
      renderSwatch: (x, y) => {
        const rx = x + 4;
        const ry = y + 4;
        const rw = 16;
        const rh = 12;
        const handleSize = 5;
        const hx = rx + rw / 2 - handleSize / 2;
        const hy = ry - handleSize / 2;
        return (
          `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" ` +
          `fill="none" stroke="#000000" stroke-width="1" />` +
          `<rect x="${hx}" y="${hy}" width="${handleSize}" height="${handleSize}" ` +
          `fill="#ffffff" stroke="#000000" stroke-width="1" />`
        );
      },
    });
  }

  // Dependency (solid edge)
  const hasSolidEdge = ctx.edges.some(
    (e) => !e.relation.flow?.style || e.relation.flow.style === "solid"
  );
  if (hasSolidEdge) {
    items.push({
      label: "Dependency",
      renderSwatch: (x, y) =>
        `<line x1="${x + 2}" y1="${y + 10}" x2="${x + 22}" y2="${y + 10}" ` +
        `stroke="${EDGE_COLOR}" stroke-width="1.5" />`,
    });
  }

  // Flow (dashed edge)
  const hasDashedEdge = ctx.edges.some(
    (e) => e.relation.flow?.style === "dashed"
  );
  if (hasDashedEdge) {
    items.push({
      label: "Flow",
      renderSwatch: (x, y) =>
        `<line x1="${x + 2}" y1="${y + 10}" x2="${x + 22}" y2="${y + 10}" ` +
        `stroke="${EDGE_COLOR}" stroke-width="1.5" stroke-dasharray="6,4" />`,
    });
  }

  // Flow (bold edge)
  const hasBoldEdge = ctx.edges.some(
    (e) => e.relation.flow?.style === "bold"
  );
  if (hasBoldEdge) {
    items.push({
      label: "Flow (bold)",
      renderSwatch: (x, y) =>
        `<line x1="${x + 2}" y1="${y + 10}" x2="${x + 22}" y2="${y + 10}" ` +
        `stroke="${EDGE_COLOR}" stroke-width="3" />`,
    });
  }

  // Evolution arrows by type
  const evolveTypes = new Set(ctx.evolves.map((e) => e.evolveType));

  if (evolveTypes.has("natural")) {
    items.push({
      label: "Future change",
      renderSwatch: (x, y) => {
        const color = EVOLVE_COLORS.natural;
        return (
          `<line x1="${x + 2}" y1="${y + 10}" x2="${x + 18}" y2="${y + 10}" ` +
          `stroke="${color}" stroke-width="1.5" stroke-dasharray="6,3" />` +
          `<polygon points="${x + 22},${y + 10} ${x + 17},${y + 7} ${x + 17},${y + 13}" fill="${color}" />`
        );
      },
    });
  }

  if (evolveTypes.has("ecosystem")) {
    items.push({
      label: "Change push by ecosystem",
      renderSwatch: (x, y) => {
        const color = EVOLVE_COLORS.ecosystem;
        return (
          `<line x1="${x + 2}" y1="${y + 10}" x2="${x + 18}" y2="${y + 10}" ` +
          `stroke="${color}" stroke-width="1.5" stroke-dasharray="6,3" />` +
          `<polygon points="${x + 22},${y + 10} ${x + 17},${y + 7} ${x + 17},${y + 13}" fill="${color}" />`
        );
      },
    });
  }

  if (evolveTypes.has("late")) {
    items.push({
      label: "Change that's already happening",
      renderSwatch: (x, y) => {
        const color = EVOLVE_COLORS.late;
        return (
          `<line x1="${x + 2}" y1="${y + 10}" x2="${x + 18}" y2="${y + 10}" ` +
          `stroke="${color}" stroke-width="1.5" stroke-dasharray="6,3" />` +
          `<polygon points="${x + 22},${y + 10} ${x + 17},${y + 7} ${x + 17},${y + 13}" fill="${color}" />`
        );
      },
    });
  }

  return items;
}

// ── Auto-placement (density scoring) ───────────────────────────────────

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Find the least crowded corner of the plot area for the legend box.
 *
 * Scores each corner by counting nearby elements:
 *   - Nodes (excl. notes): +10 each
 *   - Edge endpoints/midpoints inside: +3 each
 *   - Pipelines overlapping: +8 each
 *
 * Returns the corner with the lowest score.
 */
function findBestCorner(
  ctx: RenderContext,
  legendW: number,
  legendH: number
): Corner {
  const { plot } = ctx;
  const corners: Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

  // Build candidate rectangles for each corner
  function cornerRect(corner: Corner) {
    switch (corner) {
      case "top-left":
        return {
          left: plot.left + CORNER_MARGIN,
          top: plot.top + CORNER_MARGIN,
          right: plot.left + CORNER_MARGIN + legendW,
          bottom: plot.top + CORNER_MARGIN + legendH,
        };
      case "top-right":
        return {
          left: plot.right - CORNER_MARGIN - legendW,
          top: plot.top + CORNER_MARGIN,
          right: plot.right - CORNER_MARGIN,
          bottom: plot.top + CORNER_MARGIN + legendH,
        };
      case "bottom-left":
        return {
          left: plot.left + CORNER_MARGIN,
          top: plot.bottom - CORNER_MARGIN - legendH,
          right: plot.left + CORNER_MARGIN + legendW,
          bottom: plot.bottom - CORNER_MARGIN,
        };
      case "bottom-right":
        return {
          left: plot.right - CORNER_MARGIN - legendW,
          top: plot.bottom - CORNER_MARGIN - legendH,
          right: plot.right - CORNER_MARGIN,
          bottom: plot.bottom - CORNER_MARGIN,
        };
    }
  }

  function pointInRect(
    px: number,
    py: number,
    r: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }

  function rectsOverlap(
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  let bestCorner: Corner = "bottom-right";
  let bestScore = Infinity;

  for (const corner of corners) {
    const rect = cornerRect(corner);
    let score = 0;

    // Score nodes (exclude notes)
    for (const node of ctx.nodes) {
      if (node.component.type === "note") continue;
      if (pointInRect(node.cx, node.cy, rect)) {
        score += 10;
      }
    }

    // Score edge endpoints and midpoints
    for (const edge of ctx.edges) {
      if (pointInRect(edge.x1, edge.y1, rect)) score += 3;
      if (pointInRect(edge.x2, edge.y2, rect)) score += 3;
      const mx = (edge.x1 + edge.x2) / 2;
      const my = (edge.y1 + edge.y2) / 2;
      if (pointInRect(mx, my, rect)) score += 3;
    }

    // Score pipeline overlaps
    for (const pip of ctx.pipelines) {
      const pipRect = {
        left: pip.x,
        top: pip.y,
        right: pip.x + pip.width,
        bottom: pip.y + pip.height,
      };
      if (rectsOverlap(rect, pipRect)) {
        score += 8;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestCorner = corner;
    }
  }

  return bestCorner;
}

/**
 * Compute the (x, y) position of the legend box for a given corner.
 */
function cornerToPosition(
  corner: Corner,
  ctx: RenderContext,
  legendW: number,
  legendH: number
): { x: number; y: number } {
  const { plot } = ctx;
  switch (corner) {
    case "top-left":
      return { x: plot.left + CORNER_MARGIN, y: plot.top + CORNER_MARGIN };
    case "top-right":
      return { x: plot.right - CORNER_MARGIN - legendW, y: plot.top + CORNER_MARGIN };
    case "bottom-left":
      return { x: plot.left + CORNER_MARGIN, y: plot.bottom - CORNER_MARGIN - legendH };
    case "bottom-right":
      return { x: plot.right - CORNER_MARGIN - legendW, y: plot.bottom - CORNER_MARGIN - legendH };
  }
}

// ── Layer renderer ────────────────────────────────────────────────────

/**
 * Render the automatic legend layer.
 *
 * Scans the RenderContext for present visual elements, computes
 * the optimal corner placement, and generates an SVG group with
 * a bordered box containing swatch + label rows.
 *
 * @param ctx - RenderContext with map data and pre-computed geometry
 * @returns Array of SVG fragment strings (empty if legend is hidden)
 */
export const renderLegendLayer: LayerRenderer = (
  ctx: RenderContext
): string[] => {
  // Check if legend is disabled (now sourced from renderConfig)
  const legend = ctx.map.renderConfig?.legend;
  if (legend && !legend.show) return [];

  // Collect data-driven items
  const items = collectLegendItems(ctx);
  if (items.length === 0) return [];

  // Compute legend box dimensions
  // Approximate text width: longest label × ~7px per char at 12px Inter
  const maxLabelLen = Math.max(...items.map((it) => it.label.length));
  const textWidth = maxLabelLen * 7;
  const legendW = Math.max(MIN_WIDTH, LEGEND_PADDING * 2 + SWATCH_WIDTH + SWATCH_GAP + textWidth);
  const legendH = LEGEND_PADDING * 2 + TITLE_HEIGHT + items.length * LINE_HEIGHT;

  // Determine position
  const position = legend?.position ?? "bottom-right";
  let legendX: number;
  let legendY: number;

  if (typeof position === "object" && "x" in position) {
    legendX = position.x;
    legendY = position.y;
  } else if (position === "auto") {
    const corner = findBestCorner(ctx, legendW, legendH);
    ({ x: legendX, y: legendY } = cornerToPosition(corner, ctx, legendW, legendH));
  } else {
    ({ x: legendX, y: legendY } = cornerToPosition(position as Corner, ctx, legendW, legendH));
  }

  // Clamp within canvas bounds
  const cx = Math.max(0, Math.min(legendX, ctx.canvasWidth - legendW));
  const cy = Math.max(0, Math.min(legendY, ctx.canvasHeight - legendH));

  // Build SVG
  const parts: string[] = [];

  // Background box (sharp corners, light gray)
  parts.push(
    `<rect x="${cx}" y="${cy}" width="${legendW}" height="${legendH}" ` +
    `fill="${BG_FILL}" opacity="0.95" />`
  );

  // Title "Legend"
  parts.push(
    `<text x="${cx + LEGEND_PADDING}" y="${cy + LEGEND_PADDING + 12}" ` +
    `font-family="Inter, sans-serif" font-size="${FONT_SIZE}" font-weight="bold" ` +
    `fill="${FONT_COLOR}">Legend</text>`
  );

  // Legend rows (offset by title height)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowX = cx + LEGEND_PADDING;
    const rowY = cy + LEGEND_PADDING + TITLE_HEIGHT + i * LINE_HEIGHT;

    // Swatch
    parts.push(item.renderSwatch(rowX, rowY));

    // Label text
    const textX = rowX + SWATCH_WIDTH + SWATCH_GAP;
    const textY = rowY + 14; // baseline offset for 12px font
    parts.push(
      `<text x="${textX}" y="${textY}" ` +
      `font-family="Inter, sans-serif" font-size="${FONT_SIZE}" ` +
      `fill="${FONT_COLOR}">${esc(item.label)}</text>`
    );
  }

  return parts;
};
