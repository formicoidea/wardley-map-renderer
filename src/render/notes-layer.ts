/**
 * NotesLayer — annotation cards placed on the map (`map.notes`).
 *
 * Each note is a card on its own tinted, bordered background (it sits above the
 * map, not in it), top-left corner at its position: an optional bold title
 * over the text (both may span lines with `\n`). A note with `step` is that
 * step's annotation: it starts with a small sticker of the step's number and
 * its title and border take the step's colour (the colour of the component
 * carrying that step, else the default step red).
 * In interactive mode each card is a `data-kind="note"` hit group whose
 * <text> elements carry `data-field="title" | "text"`.
 *
 * @module render/notes-layer
 */

import type { RenderContext, LayerRenderer } from "./types.js";
import { resolveColor } from "../schema-helpers.js";
import { esc, hitAttrs, STEP_DEFAULT_FILL } from "./svg-primitives.js";

const PAD = 8;
const STICKER_R = 9;
const STICKER_GAP = 7;
const TITLE_SIZE = 14;
const TEXT_SIZE = 12;
const TITLE_LINE = 18;
const TEXT_LINE = 16;
/** Gap between the title block and the text block. */
const BLOCK_GAP = 3;
// ponytail: width estimated from character counts (no font metrics server-side); measure in the browser if cards look off.
const CHAR_W = { title: TITLE_SIZE * 0.6, text: TEXT_SIZE * 0.53 };
const TEXT_COLOR = "#333333";
const FREE_BORDER = "#9ca3af";
const CARD_FILL = "#fffaf5";

/** One <text> block: lines on `lineH` spacing, first baseline at `y`. */
function textBlock(x: number, y: number, lines: string[], lineH: number, attrs: string): string {
  const tspans = lines.map((l, i) => `<tspan x="${x}" dy="${i ? lineH : 0}">${esc(l)}</tspan>`).join("");
  return `<text x="${x}" y="${y}" ${attrs}>${tspans}</text>`;
}

export const renderNotesLayer: LayerRenderer = (ctx: RenderContext): string[] => {
  const font = esc(ctx.resolvedConfig.typography.fontFamily);
  const interactive = ctx.options?.interactive === true;
  return (ctx.map.notes ?? []).map((note) => {
    const x = Math.round(ctx.evoToX(note.position.evolution.scalar));
    const y = Math.round(ctx.visToY(note.position.visibility.scalar));
    const stepColor = note.step === undefined ? undefined
      : resolveColor(ctx.map.components.find((c) => c.step?.number === note.step)?.step?.color ?? STEP_DEFAULT_FILL);
    const titleLines = note.title?.split("\n") ?? [];
    const textLines = note.text.split("\n");
    const textX = x + PAD + (stepColor ? 2 * STICKER_R + STICKER_GAP : 0);
    const titleH = titleLines.length * TITLE_LINE;
    const textTop = y + PAD + (titleH ? titleH + BLOCK_GAP : 0);
    const width = Math.ceil(Math.max(
      ...titleLines.map((l) => l.length * CHAR_W.title),
      ...textLines.map((l) => l.length * CHAR_W.text),
    )) + textX - x + PAD;
    const height = textTop - y + textLines.length * TEXT_LINE + PAD - 2;
    const field = (f: string) => (interactive ? ` data-field="${f}"` : "");

    let svg =
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${CARD_FILL}" fill-opacity="0.95" ` +
      `stroke="${esc(stepColor ?? FREE_BORDER)}" stroke-width="1.2" />`;
    if (stepColor) {
      const cy = y + PAD + (titleH ? TITLE_LINE : TEXT_LINE) / 2;
      svg +=
        `<circle cx="${x + PAD + STICKER_R}" cy="${cy}" r="${STICKER_R}" fill="${esc(stepColor)}" />` +
        `<text x="${x + PAD + STICKER_R}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="${font}" ` +
        `font-size="11" font-weight="bold" fill="#ffffff">${note.step}</text>`;
    }
    if (titleLines.length) {
      svg += textBlock(textX, y + PAD + TITLE_SIZE, titleLines, TITLE_LINE,
        `font-family="${font}" font-size="${TITLE_SIZE}" font-weight="bold" fill="${esc(stepColor ?? TEXT_COLOR)}"${field("title")}`);
    }
    svg += textBlock(textX, textTop + TEXT_SIZE, textLines, TEXT_LINE,
      `font-family="${font}" font-size="${TEXT_SIZE}" fill="${TEXT_COLOR}"${field("text")}`);
    return interactive ? `<g${hitAttrs(note.id, "note")}>${svg}</g>` : svg;
  });
};
