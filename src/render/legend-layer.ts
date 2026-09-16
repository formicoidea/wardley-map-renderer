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
import { esc, scaledFontSize } from "./compose-core.js";
import { resolveTypeStyle } from "../schema-helpers.js";
import { componentRenderableType } from "../renderable-type.js";
import { SIN60, COS60 } from "./nodes-layer.js";

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

// ── Swatch geometry constants ────────────────────────────────────────

const SWATCH_CX = 12;
const SWATCH_CY = 10;
const MARKET_LEGEND_R = 7;
const ECO_LEGEND_OUTER_R = 8;
const ECO_LEGEND_MID_R = 6;
const ECO_LEGEND_INNER_R = 3;
const INERTIA_STROKE = "#000000";
const ARROW_LEGEND_FILL = "#000000";
const STEP_LEGEND_FILL = "#cc0000";

/** Evolution arrow colors (match evolvesto-layer.ts:24-28) */
const EVOLVE_COLORS: Record<string, string> = {
  natural: "#dc2626",
  ecosystem: "#2563eb",
  forced: "#9333ea",
  late: "#999999",
};

// ── i18n labels ───────────────────────────────────────────────────────

const TITLE_LABELS: Record<string, string> = { en: "Legend", fr: "Légende" };

const TYPE_LABELS: Record<string, Record<string, string>> = {
  en: { component: "Component", "user-need": "User Need", pipeline: "Pipeline", anchor: "User / Stakeholder", note: "Note", market: "Market", ecosystem: "Ecosystem" },
  fr: { component: "Composant", "user-need": "Besoin utilisateur", pipeline: "Pipeline", anchor: "Utilisateur / Partie prenante", note: "Note", market: "Marché", ecosystem: "Écosystème" },
};

const EVOLVE_LABELS: Record<string, Record<string, string>> = {
  en: { natural: "Future change", ecosystem: "Change push by ecosystem", forced: "Forced change", late: "Change that's already happening" },
  fr: { natural: "Changement futur", ecosystem: "Poussée par l'écosystème", forced: "Changement forcé", late: "Changement déjà en cours" },
};

// Method colors and labels are resolved from renderConfig.methods[] — no hardcoded constants

const INERTIA_LABELS: Record<string, string> = { en: "Inertia", fr: "Inertie" };
const ACCELERATOR_LABELS: Record<string, string> = { en: "Accelerator", fr: "Accélérateur" };
const DEACCELERATOR_LABELS: Record<string, string> = { en: "Deaccelerator", fr: "Décélérateur" };
const STEP_LABELS: Record<string, string> = { en: "Step", fr: "Étape" };

/** Canonical display order for component types in the legend */
const TYPE_ORDER = ["component", "user-need", "pipeline", "anchor", "market", "ecosystem", "note"] as const;

// ── Legend item definition ─────────────────────────────────────────────

interface LegendItem {
  label: string;
  renderSwatch: (x: number, y: number) => string;
}

// ── Legend item helpers ──────────────────────────────────────────────────

/** Build an edge-style legend item (line swatch). Default: solid 1.5px stroke. */
function edgeLegendItem(label: string, extra: string = ""): LegendItem {
  const baseAttrs = extra.includes("stroke-width") ? "" : `stroke-width="1.5" `;
  return {
    label,
    renderSwatch: (x, y) =>
      `<line x1="${x + 2}" y1="${y + SWATCH_CY}" x2="${x + 22}" y2="${y + SWATCH_CY}" ` +
      `stroke="${EDGE_COLOR}" ${baseAttrs}${extra} />`,
  };
}

/** Build an accelerator/deaccelerator arrow legend item. direction: 1 = right, -1 = left. */
function arrowLegendItem(label: string, direction: 1 | -1): LegendItem {
  return {
    label,
    renderSwatch: (x, y) => {
      const cx = x + SWATCH_CX;
      const cy = y + SWATCH_CY;
      const d = direction;
      return (
        `<path d="M ${cx - d * 7} ${cy - 4} L ${cx} ${cy - 4} L ${cx} ${cy - 7} L ${cx + d * 7} ${cy} ` +
        `L ${cx} ${cy + 7} L ${cx} ${cy + 4} L ${cx - d * 7} ${cy + 4} Z" ` +
        `fill="${ARROW_LEGEND_FILL}" stroke="${ARROW_LEGEND_FILL}" stroke-width="1" />`
      );
    },
  };
}

// ── Data-driven legend item collection ─────────────────────────────────

/**
 * Inspect the RenderContext to collect only the legend items
 * that correspond to elements actually present on the map.
 *
 * Order: type entries (canonical) → edge styles → evolution arrows.
 */
function collectLegendItems(ctx: RenderContext): LegendItem[] {
  const items: LegendItem[] = [];
  const { typeColors, excludeComponentTypes, locale } = ctx.resolvedConfig;
  const excluded = new Set<string>(excludeComponentTypes);
  const labels = TYPE_LABELS[locale] ?? TYPE_LABELS.en;
  const evolveLabels = EVOLVE_LABELS[locale] ?? EVOLVE_LABELS.en;

  // ── Type entries ──────────────────────────────────────────────────
  // Collect distinct renderable types present on the map (nodes + pipelines).
  // Maps each node's (type, subtype) to the appearance vocabulary so legend
  // entries match the symbols actually drawn (market/ecosystem/user-need...).
  const presentTypes = new Set<string>(
    ctx.nodes.map((n) => componentRenderableType(n.component.type, n.component.subtype))
  );
  // Pipelines may exist even without a "pipeline"-typed node
  if (ctx.pipelines.length > 0) presentTypes.add("pipeline");

  for (const type of TYPE_ORDER) {
    if (!presentTypes.has(type) || excluded.has(type)) continue;
    const color = resolveTypeStyle<string>(typeColors, type) ?? "#000000";
    const label = labels[type] ?? type;

    if (type === "anchor") {
      items.push({
        label,
        renderSwatch: (x, y) => {
          const cx = x + 12;
          const cy = y + 10;
          const r = 5;
          const hr = r * 0.3;
          const hcy = cy - r * 0.3;
          const sw = r * 0.55;
          const sBottom = cy + r * 1.05;
          const ry = sBottom - (cy + r * 0.1);
          return (
            `<defs><clipPath id="anchor-legend-clip">` +
            `<circle cx="${cx}" cy="${cy}" r="${r - 0.75}" /></clipPath></defs>` +
            `<circle cx="${cx}" cy="${cy}" r="${r}" ` +
            `fill="#ffffff" stroke="${color}" stroke-width="1.5" />` +
            `<g clip-path="url(#anchor-legend-clip)">` +
            `<circle cx="${cx}" cy="${hcy}" r="${hr}" ` +
            `fill="none" stroke="${color}" stroke-width="1" />` +
            `<path d="M ${cx - sw} ${sBottom} A ${sw} ${ry} 0 0 1 ${cx + sw} ${sBottom}" ` +
            `fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round" />` +
            `</g>`
          );
        },
      });
    } else if (type === "pipeline") {
      items.push({
        label,
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
            `fill="none" stroke="${color}" stroke-width="1" />` +
            `<rect x="${hx}" y="${hy}" width="${handleSize}" height="${handleSize}" ` +
            `fill="#ffffff" stroke="${color}" stroke-width="1" />`
          );
        },
      });
    } else if (type === "market") {
      // Market swatch: outer circle + 3 bold hollow rings connected by a triangle (scaled down for legend)
      items.push({
        label,
        renderSwatch: (x, y) => {
          const cx = x + SWATCH_CX;
          const cy = y + SWATCH_CY;
          const r = MARKET_LEGEND_R;
          const triR = r * 0.56; // ≈ MARKET_TRIANGLE_R / MARKET_OUTER_R
          const ringR = r * 0.33; // ≈ MARKET_VERTEX_R / MARKET_OUTER_R
          const tTopX = cx;
          const tTopY = cy - triR;
          const tBlX = cx - triR * SIN60;
          const tBlY = cy + triR * COS60;
          const tBrX = cx + triR * SIN60;
          const tBrY = cy + triR * COS60;
          const ring = (rx: number, ry: number) =>
            `<circle cx="${rx}" cy="${ry}" r="${ringR}" ` +
            `fill="#ffffff" stroke="${color}" stroke-width="1.5" />`;
          return (
            `<circle cx="${cx}" cy="${cy}" r="${r}" ` +
            `fill="#ffffff" stroke="${color}" stroke-width="1" />` +
            `<polygon points="${tTopX},${tTopY} ${tBlX},${tBlY} ${tBrX},${tBrY}" ` +
            `fill="none" stroke="${color}" stroke-width="1" stroke-linejoin="round" />` +
            ring(tTopX, tTopY) + ring(tBlX, tBlY) + ring(tBrX, tBrY)
          );
        },
      });
    } else if (type === "ecosystem") {
      // Ecosystem swatch: 3 concentric circles (scaled down for legend)
      items.push({
        label,
        renderSwatch: (x, y) => {
          const cx = x + SWATCH_CX;
          const cy = y + SWATCH_CY;
          return (
            `<circle cx="${cx}" cy="${cy}" r="${ECO_LEGEND_OUTER_R}" ` +
            `fill="#cccccc" stroke="${color}" stroke-width="1" />` +
            `<circle cx="${cx}" cy="${cy}" r="${ECO_LEGEND_MID_R}" ` +
            `fill="#cccccc" stroke="${color}" stroke-width="1" stroke-dasharray="2,1" />` +
            `<circle cx="${cx}" cy="${cy}" r="${ECO_LEGEND_INNER_R}" ` +
            `fill="#ffffff" stroke="${color}" stroke-width="1" />`
          );
        },
      });
    } else {
      // component, user-need, note — all use circle swatch
      items.push({
        label,
        renderSwatch: (x, y) =>
          `<circle cx="${x + 12}" cy="${y + 10}" r="5" ` +
          `fill="#ffffff" stroke="${color}" stroke-width="1.5" />`,
      });
    }
  }

  // ── Edge styles (single-pass detection) ─────────────────────────
  let hasSolidEdge = false, hasDashedEdge = false, hasBoldEdge = false;
  for (const e of ctx.edges) {
    const style = e.relation.flow?.style;
    if (!style || style === "solid") hasSolidEdge = true;
    else if (style === "dashed") hasDashedEdge = true;
    else if (style === "bold") hasBoldEdge = true;
  }

  if (hasSolidEdge) items.push(edgeLegendItem("Dependency"));
  if (hasDashedEdge) items.push(edgeLegendItem("Flow", `stroke-dasharray="6,4"`));
  if (hasBoldEdge) items.push(edgeLegendItem("Flow (bold)", `stroke-width="3"`));

  // ── Evolution arrows ──────────────────────────────────────────────
  const evolveTypes = new Set(ctx.evolves.map((e) => e.evolveType));
  const EVOLVE_ORDER = ["natural", "ecosystem", "forced", "late"] as const;

  for (const etype of EVOLVE_ORDER) {
    if (!evolveTypes.has(etype)) continue;
    const color = EVOLVE_COLORS[etype];
    items.push({
      label: evolveLabels[etype] ?? etype,
      renderSwatch: (x, y) =>
        `<line x1="${x + 2}" y1="${y + 10}" x2="${x + 18}" y2="${y + 10}" ` +
        `stroke="${color}" stroke-width="1.5" stroke-dasharray="6,3" />` +
        `<polygon points="${x + 22},${y + 10} ${x + 17},${y + 7} ${x + 17},${y + 13}" fill="${color}" />`,
    });
  }

  // ── Inertia ─────────────────────────────────────────────────────────
  const hasInertia = ctx.evolves.some((e) => e.inertia);
  if (hasInertia) {
    const inertiaLabel = INERTIA_LABELS[locale] ?? INERTIA_LABELS.en;
    items.push({
      label: inertiaLabel,
      renderSwatch: (x, y) =>
        `<line x1="${x + SWATCH_CX}" y1="${y + 2}" x2="${x + SWATCH_CX}" y2="${y + 18}" ` +
        `stroke="${INERTIA_STROKE}" stroke-width="4" />`,
    });
  }

  // ── Method indicators ───────────────────────────────────────────────
  // Colors and labels resolved from renderConfig.methods[] — textual legend values, not symbols
  const presentMethods = new Set(
    ctx.nodes.map((n) => n.component.method?.category).filter(Boolean) as string[]
  );
  const methodConfigs = ctx.resolvedConfig.methods;
  // Build lookup for configured methods
  const methodConfigMap = new Map(methodConfigs.map((mc) => [mc.type, mc]));
  // Iterate configured methods first (stable order), then any unconfigured present methods
  const orderedMethodTypes = [
    ...methodConfigs.map((mc) => mc.type).filter((t) => presentMethods.has(t)),
    ...[...presentMethods].filter((t) => !methodConfigMap.has(t)),
  ];
  for (const m of orderedMethodTypes) {
    const mc = methodConfigMap.get(m);
    const mColor = mc?.color ?? "#888888";
    // Legend label: capitalize the method type name (e.g., "buying-policy" → "Buying Policy")
    const mLabel = m.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    items.push({
      label: mLabel,
      renderSwatch: (x, y) => {
        // Concentric circles swatch (matches node-level method indicator from AC 4)
        const cx = x + 12;
        const cy = y + 10;
        return (
          `<circle cx="${cx}" cy="${cy}" r="7" fill="${mColor}" />` +
          `<circle cx="${cx}" cy="${cy}" r="4" fill="${mColor}" stroke="#ffffff" stroke-width="1" />` +
          `<circle cx="${cx}" cy="${cy}" r="1.5" fill="#ffffff" />`
        );
      },
    });
  }

  // ── Accelerators / Deaccelerators (component decorators) ────────────
  let hasAccelerator = false, hasDeaccelerator = false;
  for (const n of ctx.nodes) {
    if (n.component.accelerator) hasAccelerator = true;
    if (n.component.deaccelerator) hasDeaccelerator = true;
  }

  if (hasAccelerator) {
    const accelLabel = ACCELERATOR_LABELS[locale] ?? ACCELERATOR_LABELS.en;
    items.push(arrowLegendItem(accelLabel, 1));
  }

  if (hasDeaccelerator) {
    const deaccelLabel = DEACCELERATOR_LABELS[locale] ?? DEACCELERATOR_LABELS.en;
    items.push(arrowLegendItem(deaccelLabel, -1));
  }

  // ── Steps (component decorators) ─────────────────────────────────────
  const hasSteps = ctx.nodes.some((n) => n.component.step != null);
  if (hasSteps) {
    const stepLabel = STEP_LABELS[locale] ?? STEP_LABELS.en;
    items.push({
      label: stepLabel,
      renderSwatch: (x, y) => {
        const cx = x + 12;
        const cy = y + 10;
        return (
          `<circle cx="${cx}" cy="${cy}" r="7" fill="${STEP_LEGEND_FILL}" />` +
          `<text x="${cx}" y="${cy + 4}" text-anchor="middle" ` +
          `font-family="Inter, sans-serif" font-size="9" font-weight="bold" ` +
          `fill="#ffffff">1</text>`
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

    // Score nodes
    for (const node of ctx.nodes) {
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
  // Check if legend is disabled — read from resolvedConfig (always has defaults applied)
  const legend = ctx.resolvedConfig.legend;
  if (!legend.show) return [];

  // Collect data-driven items
  const items = collectLegendItems(ctx);
  if (items.length === 0) return [];

  // Effective font size drives the box: text width scales with it, row/title
  // heights grow with it (never below the 20px swatch row).
  const fontSize = scaledFontSize(ctx, FONT_SIZE, ctx.resolvedConfig.typography.elementScales?.legend);
  const k = fontSize / FONT_SIZE;
  const lineHeight = LINE_HEIGHT * Math.max(1, k);
  const titleHeight = TITLE_HEIGHT * Math.max(1, k);

  // Approximate text width: longest label × ~7px per char at 12px Inter
  const maxLabelLen = Math.max(...items.map((it) => it.label.length));
  const textWidth = maxLabelLen * 7 * k;
  const legendW = Math.max(MIN_WIDTH, LEGEND_PADDING * 2 + SWATCH_WIDTH + SWATCH_GAP + textWidth);
  const legendH = LEGEND_PADDING * 2 + titleHeight + items.length * lineHeight;

  // Determine position — read from resolvedConfig (baseline default: "bottom-right")
  const position = legend.position;
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

  // Title (i18n)
  const titleText = TITLE_LABELS[ctx.resolvedConfig.locale] ?? TITLE_LABELS.en;
  parts.push(
    `<text x="${cx + LEGEND_PADDING}" y="${cy + LEGEND_PADDING + fontSize}" ` +
    `font-family="Inter, sans-serif" font-size="${fontSize}" font-weight="bold" ` +
    `fill="${FONT_COLOR}">${esc(titleText)}</text>`
  );

  // Legend rows (offset by title height)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowX = cx + LEGEND_PADDING;
    const rowY = cy + LEGEND_PADDING + titleHeight + i * lineHeight;

    // Swatch (fixed 20px, vertically centred in the row)
    parts.push(item.renderSwatch(rowX, rowY + (lineHeight - LINE_HEIGHT) / 2));

    // Label text: baseline at row centre + ~1/3 font size (14 for 12px in a 20px row)
    const textX = rowX + SWATCH_WIDTH + SWATCH_GAP;
    const textY = rowY + lineHeight / 2 + fontSize / 3;
    parts.push(
      `<text x="${textX}" y="${textY}" ` +
      `font-family="Inter, sans-serif" font-size="${fontSize}" ` +
      `fill="${FONT_COLOR}">${esc(item.label)}</text>`
    );
  }

  return parts;
};
