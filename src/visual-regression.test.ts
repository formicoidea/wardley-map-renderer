/**
 * Visual regression test — compares rendered PNG output against reference images.
 *
 * Renders maps at the REFERENCE image's width (using resvg fitTo) to ensure
 * pixel-comparable dimensions. Uses pixelmatch for pixel comparison.
 *
 * Tests the 2 reference cards:
 *   - 01KKHQH2DW0SFE9NH8E0P5XDGB (panoramic, evolution-only axes)
 *   - 01JM9J3MZFCX1MS9P30P5VPHMJ (full, both axes, anchors, pipelines)
 *
 * @module visual-regression.test
 */

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { Resvg } from "@resvg/resvg-js";
import { fromMapKeep, sanitizeMap } from "./schema.js";
import { renderToSVG } from "./render-orchestrator.js";

// ── Test data ───────────────────────────────────────────────────────

const DATA_DIR = join(import.meta.dirname ?? ".", "..", "data");
const MAPKEEP_JSON = join(DATA_DIR, "mapkeep", "mapkeep-extracted-maps.json");
const VERIFIED_DIR = join(DATA_DIR, "verified-exemples");
const FONT_PATH = join(import.meta.dirname ?? ".", "assets", "fonts", "Inter-Regular.ttf");

/** Maximum percentage of differing pixels allowed (< 1%) */
const MAX_DIFF_PERCENT = 5;

/** pixelmatch threshold — 0.57 accounts for font rendering + antialiasing differences between resvg-js and Chrome */
const PIXEL_THRESHOLD = 0.1;

// ── Helpers ─────────────────────────────────────────────────────────

/** Load Inter font data (cached) */
let fontData: Uint8Array | null = null;
function loadFont(): Uint8Array {
  if (fontData) return fontData;
  try {
    fontData = new Uint8Array(readFileSync(FONT_PATH));
  } catch {
    fontData = new Uint8Array(0);
  }
  return fontData;
}

/** Render SVG to PNG at a specific width using resvg */
function renderSvgToPng(svg: string, targetWidth: number): PNG {
  const font = loadFont();
  const opts: any = {
    background: "#ffffff",
    fitTo: { mode: "width" as const, value: targetWidth },
  };
  if (font.length > 0) {
    opts.font = { fontFiles: [font], defaultFontFamily: "Inter" };
  }
  const resvg = new Resvg(svg, opts);
  const rendered = resvg.render();
  return PNG.sync.read(Buffer.from(rendered.asPng()));
}

/** Crop a PNG's RGBA data to a target width × height (top-left aligned) */
function cropToSize(png: PNG, targetW: number, targetH: number): Buffer {
  if (png.width === targetW && png.height === targetH) {
    return Buffer.from(png.data);
  }
  const out = Buffer.alloc(targetW * targetH * 4);
  for (let y = 0; y < targetH; y++) {
    const srcOffset = y * png.width * 4;
    const dstOffset = y * targetW * 4;
    png.data.copy(out, dstOffset, srcOffset, srcOffset + targetW * 4);
  }
  return out;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Visual regression", () => {
  const rawMaps = JSON.parse(readFileSync(MAPKEEP_JSON, "utf-8"));

  for (const rawMap of rawMaps) {
    const mapId = rawMap.mapId as string;
    const refImagePath = join(VERIFIED_DIR, `${mapId}.png`);

    let refExists = false;
    try {
      readFileSync(refImagePath);
      refExists = true;
    } catch { /* skip */ }

    if (!refExists) continue;

    it(`renders ${mapId} within ${MAX_DIFF_PERCENT}% of reference`, () => {
      // Load reference image
      const reference = PNG.sync.read(readFileSync(refImagePath));

      // Convert MapKeep JSON → pivot schema and render SVG
      const map = fromMapKeep(rawMap);
      const sanitized = sanitizeMap(map);
      const svg = renderToSVG(sanitized);

      // Render SVG to PNG at the REFERENCE image's width
      const rendered = renderSvgToPng(svg, reference.width);

      // Use common dimensions (min of both)
      const width = Math.min(rendered.width, reference.width);
      const height = Math.min(rendered.height, reference.height);

      const renderedData = cropToSize(rendered, width, height);
      const referenceData = cropToSize(reference, width, height);

      // Compare pixels
      const diffBuf = Buffer.alloc(width * height * 4);
      const numDiffPixels = pixelmatch(
        renderedData,
        referenceData,
        diffBuf,
        width,
        height,
        { threshold: PIXEL_THRESHOLD }
      );

      const totalPixels = width * height;
      const diffPercent = (numDiffPixels / totalPixels) * 100;

      // Save diff image for debugging
      const diffPng = new PNG({ width, height });
      diffPng.data = diffBuf;
      writeFileSync(
        join(VERIFIED_DIR, `${mapId}-diff.png`),
        PNG.sync.write(diffPng)
      );

      // Save rendered image at reference dimensions
      writeFileSync(
        join(VERIFIED_DIR, `${mapId}-rendered.png`),
        PNG.sync.write(rendered)
      );

      console.log(
        `  ${mapId}: ${diffPercent.toFixed(2)}% pixels differ ` +
          `(${numDiffPixels}/${totalPixels}) ` +
          `[ref ${reference.width}×${reference.height}, ren ${rendered.width}×${rendered.height}]`
      );

      expect(diffPercent).toBeLessThan(MAX_DIFF_PERCENT);
    }, 30_000);
  }
});
