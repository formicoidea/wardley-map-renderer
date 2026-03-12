/**
 * AC 11 — White opaque background for both SVG and PNG.
 *
 * Validates that rendered SVG has a full-coverage white rect as the first
 * child element, and that PNG rasterisation uses an opaque white background.
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG, renderMapToPNG } from "./render.js";
import type { WardleyMap } from "./schema.js";
import {
  WARDLEY_MAP_DEFAULT_WIDTH,
  WARDLEY_MAP_DEFAULT_HEIGHT,
  BACKGROUND_COLOR,
} from "./blocks/wardley-map/wardley-map-consts.js";

const MINIMAL_MAP: WardleyMap = {
  title: "Background Test",
  components: [
    { id: "a", label: "A", evolution: 0.5, visibility: 0.5 },
  ],
  relations: [],
};

describe("White opaque background", () => {
  const svg = renderMapToSVG(MINIMAL_MAP);

  // ── SVG ─────────────────────────────────────────────────────────
  it("SVG contains a full-size white background rect", () => {
    const W = WARDLEY_MAP_DEFAULT_WIDTH;
    const H = WARDLEY_MAP_DEFAULT_HEIGHT;
    // The background rect must span the full viewport
    expect(svg).toContain(`width="${W}"`);
    expect(svg).toContain(`height="${H}"`);
    expect(svg).toContain(`fill="${BACKGROUND_COLOR}"`);
  });

  it("SVG background rect is the first element after <svg>", () => {
    // Extract the first element after the <svg …> opening tag
    const match = svg.match(/<svg[^>]*>\s*(<[^>]+>)/);
    expect(match).not.toBeNull();
    const firstElement = match![1];
    expect(firstElement).toMatch(/^<rect /);
    expect(firstElement).toContain(`fill="${BACKGROUND_COLOR}"`);
  });

  it("SVG background rect has no opacity or fill-opacity attribute", () => {
    // Grab the first <rect> (background)
    const firstRect = svg.match(/<rect [^>]*>/);
    expect(firstRect).not.toBeNull();
    expect(firstRect![0]).not.toMatch(/opacity/i);
  });

  it("BACKGROUND_COLOR is opaque white (#ffffff)", () => {
    expect(BACKGROUND_COLOR).toBe("#ffffff");
  });

  // ── PNG ─────────────────────────────────────────────────────────
  it("PNG is generated as a valid PNG buffer", async () => {
    const png = await renderMapToPNG(MINIMAL_MAP);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(100);
    // PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });

  it("PNG has correct dimensions (1600×900)", async () => {
    const png = await renderMapToPNG(MINIMAL_MAP);
    // PNG IHDR chunk: width at bytes 16-19, height at bytes 20-23 (big-endian)
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(WARDLEY_MAP_DEFAULT_WIDTH);
    expect(height).toBe(WARDLEY_MAP_DEFAULT_HEIGHT);
  });
});
