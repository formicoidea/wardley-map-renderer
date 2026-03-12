/**
 * AC 5: Map title displayed above axes.
 *
 * Verifies that the map title is rendered as a <text> element
 * positioned above the plot area (axes), using the correct font
 * size and styling from wardley-map-consts.ts.
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG } from "./render.js";
import { sanitizeMap } from "./schema.js";
import {
  TITLE_FONT_SIZE,
  AXIS_MARGIN_TOP,
} from "./blocks/wardley-map/wardley-map-consts.js";

function makeMap(title: string) {
  return sanitizeMap({
    title,
    components: [
      {
        id: "c1",
        label: "User",
        type: "anchor" as const,
        nature: null,
        evolution: 0.5,
        visibility: 0.1,
      },
    ],
    relations: [],
  });
}

describe("Map title rendering (AC 5)", () => {
  const svg = renderMapToSVG(makeMap("Tea Shop Strategy"));

  // ── Title text present ─────────────────────────────────────
  it("renders the map title text", () => {
    expect(svg).toContain("Tea Shop Strategy");
  });

  // ── Title positioned above axes ────────────────────────────
  it("positions the title above the plot area (y < AXIS_MARGIN_TOP)", () => {
    // Extract the y attribute of the title text element
    const titleMatch = svg.match(
      /<text[^>]*>Tea Shop Strategy<\/text>/
    );
    expect(titleMatch).not.toBeNull();

    const yMatch = titleMatch![0].match(/y="(\d+)"/);
    expect(yMatch).not.toBeNull();
    const titleY = parseInt(yMatch![1], 10);

    // Title must be above the plot area top edge
    expect(titleY).toBeLessThan(AXIS_MARGIN_TOP);
    expect(titleY).toBeGreaterThan(0);
  });

  // ── Title uses correct font size from consts ───────────────
  it("uses TITLE_FONT_SIZE from wardley-map-consts", () => {
    expect(svg).toContain(`font-size="${TITLE_FONT_SIZE}"`);
  });

  // ── Title is centered horizontally ─────────────────────────
  it("centers the title horizontally with text-anchor middle", () => {
    const titleMatch = svg.match(
      /<text[^>]*>Tea Shop Strategy<\/text>/
    );
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![0]).toContain('text-anchor="middle"');
  });

  // ── Title uses Inter font ─────────────────────────────────
  it("uses Inter font family", () => {
    const titleMatch = svg.match(
      /<text[^>]*>Tea Shop Strategy<\/text>/
    );
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![0]).toContain('font-family="Inter, sans-serif"');
  });

  // ── Title uses bold weight ─────────────────────────────────
  it("uses semi-bold font weight (600)", () => {
    const titleMatch = svg.match(
      /<text[^>]*>Tea Shop Strategy<\/text>/
    );
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![0]).toContain('font-weight="600"');
  });

  // ── Title centered at canvas midpoint ──────────────────────
  it("positions title at horizontal center of canvas (x=800)", () => {
    const titleMatch = svg.match(
      /<text[^>]*>Tea Shop Strategy<\/text>/
    );
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![0]).toContain('x="800"');
  });

  // ── Empty title is not rendered ────────────────────────────
  it("does not render a title element when title is empty", () => {
    const emptySvg = renderMapToSVG(makeMap(""));
    // Should not contain a title text element (the word would only appear in a <text>)
    const titleTexts = emptySvg.match(
      /<text[^>]*font-weight="600"[^>]*>[^<]+<\/text>/
    );
    expect(titleTexts).toBeNull();
  });

  it("does not render a title element when title is whitespace-only", () => {
    const wsSvg = renderMapToSVG(makeMap("   "));
    const titleTexts = wsSvg.match(
      /<text[^>]*font-weight="600"[^>]*>[^<]+<\/text>/
    );
    expect(titleTexts).toBeNull();
  });

  // ── Special characters are escaped ─────────────────────────
  it("escapes HTML special characters in the title", () => {
    const specialSvg = renderMapToSVG(makeMap('Maps & "Strategy" <v2>'));
    expect(specialSvg).toContain("Maps &amp; &quot;Strategy&quot; &lt;v2&gt;");
  });
});
