/**
 * AC 3: SVG renders fond de carte with axes and phase labels.
 *
 * Verifies that the SVG output contains the background grid,
 * axis labels, phase dividers, and the four standard Wardley
 * evolution phase labels (Genesis, Custom-Built, Product, Commodity).
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG } from "./render.js";
import { sanitizeMap } from "./schema.js";

const MINIMAL_MAP = sanitizeMap({
  title: "Fond de carte test",
  components: [
    {
      id: "c1",
      label: "User",
      type: "anchor",
      nature: null,
      evolution: 0.5,
      visibility: 0.1,
    },
  ],
  relations: [],
});

describe("SVG fond de carte (AC 3)", () => {
  const svg = renderMapToSVG(MINIMAL_MAP);

  // ── Background ────────────────────────────────────────────
  it("renders white opaque background", () => {
    expect(svg).toContain('fill="#ffffff"');
  });

  // ── Plot area border (axes box) ───────────────────────────
  it("renders the plot area border rectangle", () => {
    // The border rect uses BORDER_COLOR (#c0c0c0) from consts
    expect(svg).toContain('stroke="#c0c0c0"');
  });

  // ── Phase labels ──────────────────────────────────────────
  it("renders Genesis phase label", () => {
    expect(svg).toContain("Genesis");
  });

  it("renders Custom-Built phase label", () => {
    expect(svg).toContain("Custom-Built");
  });

  it("renders Product (+Rental) phase label", () => {
    expect(svg).toContain("Product (+Rental)");
  });

  it("renders Commodity (+Utility) phase label", () => {
    expect(svg).toContain("Commodity (+Utility)");
  });

  // ── Phase dividers (vertical dashed lines) ────────────────
  it("renders three vertical dashed phase dividers", () => {
    const dividerMatches = svg.match(/stroke-dasharray="4,4"/g);
    expect(dividerMatches).not.toBeNull();
    // Exactly 3 interior dividers between the 4 evolution phases
    expect(dividerMatches!.length).toBe(3);
  });

  // ── Axis labels ───────────────────────────────────────────
  it("renders the Evolution x-axis label", () => {
    expect(svg).toContain("Evolution");
  });

  it("renders the Value Chain y-axis label", () => {
    expect(svg).toContain("Value Chain (Visibility)");
  });

  // ── Direction indicators ──────────────────────────────────
  it("renders Visible indicator at top of y-axis", () => {
    expect(svg).toContain("Visible");
  });

  it("renders Invisible indicator at bottom of y-axis", () => {
    expect(svg).toContain("Invisible");
  });

  // ── Horizontal grid lines ─────────────────────────────────
  it("renders horizontal grid lines inside the plot area", () => {
    // Grid uses GRID_COLOR (#e8e8e8)
    const gridMatches = svg.match(/stroke="#e8e8e8"/g);
    expect(gridMatches).not.toBeNull();
    // 7 interior lines (8 divisions)
    expect(gridMatches!.length).toBe(7);
  });

  // ── Uses constants from wardley-map-consts ────────────────
  it("uses correct canvas dimensions (1600x900 viewBox)", () => {
    expect(svg).toContain('viewBox="0 0 1600 900"');
  });

  it("uses Inter font family for labels", () => {
    expect(svg).toContain('font-family="Inter, sans-serif"');
  });
});
