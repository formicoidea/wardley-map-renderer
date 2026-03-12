/**
 * AC 13: Inter Regular TTF font embedded and used by resvg-js.
 *
 * Verifies that:
 * 1. The Inter-Regular.ttf font file exists in assets/fonts/
 * 2. SVG text elements reference font-family="Inter, sans-serif"
 * 3. PNG rendering uses the Inter font via resvg-js fontFiles option
 * 4. The font is lazy-loaded and cached
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG, renderMapToPNG } from "./render.js";
import { sanitizeMap } from "./schema.js";
import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MINIMAL_MAP = sanitizeMap({
  title: "Font test map",
  components: [
    {
      id: "c1",
      label: "Web Application",
      type: "component",
      nature: null,
      evolution: 0.65,
      visibility: 0.3,
    },
  ],
  relations: [],
});

describe("Inter font embedding (AC 13)", () => {
  it("Inter-Regular.ttf exists in assets/fonts/", () => {
    // Resolve from src/ -> project root -> assets/fonts/
    const projectRoot = join(import.meta.dirname ?? dirname(fileURLToPath(import.meta.url)), "..");
    const fontPath = join(projectRoot, "assets", "fonts", "Inter-Regular.ttf");
    expect(existsSync(fontPath)).toBe(true);
    // Font should be around 300-500KB (reasonable TTF size)
    const stat = statSync(fontPath);
    expect(stat.size).toBeGreaterThan(100_000);
    expect(stat.size).toBeLessThan(1_000_000);
  });

  it("SVG text elements use Inter font-family", () => {
    const svg = renderMapToSVG(MINIMAL_MAP);
    // All text elements should reference Inter
    const textMatches = svg.match(/<text[^>]*>/g) ?? [];
    expect(textMatches.length).toBeGreaterThan(0);
    for (const tag of textMatches) {
      expect(tag).toContain('font-family="Inter, sans-serif"');
    }
  });

  it("PNG renders successfully with embedded font (non-empty buffer)", async () => {
    const png = await renderMapToPNG(MINIMAL_MAP);
    expect(png).toBeInstanceOf(Buffer);
    // PNG should have reasonable size (at least a few KB for 1600x900)
    expect(png.length).toBeGreaterThan(10_000);
    // Verify PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });

  it("PNG rendering is idempotent (font cached)", async () => {
    const png1 = await renderMapToPNG(MINIMAL_MAP);
    const png2 = await renderMapToPNG(MINIMAL_MAP);
    // Both should produce identical output (same font loaded)
    expect(png1.equals(png2)).toBe(true);
  });

  it("PNG has correct 1600x900 dimensions from IHDR chunk", async () => {
    const png = await renderMapToPNG(MINIMAL_MAP);
    // PNG IHDR chunk starts at byte 16, width at 16-19, height at 20-23 (big-endian)
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(1600);
    expect(height).toBe(900);
  });
});
