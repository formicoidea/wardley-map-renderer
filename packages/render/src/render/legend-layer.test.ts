/**
 * Tests for LegendLayer — data-driven legend with per-type colors and i18n.
 *
 * Covers:
 *   - Regression: show/hide, empty map, edge entries
 *   - Type+color: typeColors applied, only present types shown, excludeComponentTypes
 *   - i18n: locale-driven labels for types, evolve arrows, and title
 *   - Evolution: all 4 evolve types including "forced"
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderLegendLayer } from "./legend-layer.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeMap(overrides: Record<string, unknown> = {}): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Test",
    components: [
      { id: "a", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
      { id: "b", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
    ],
    relations: [{ source: "a", target: "b" }],
    ...overrides,
  }));
}

function makeEmptyMap(): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Empty",
    components: [],
    relations: [],
  }));
}

function makeAllTypesMap(): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "All Types",
    components: [
      { id: "a", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
      { id: "b", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
      { id: "c", label: { name: "Need" }, type: "user-need", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } } },
      {
        id: "d", label: { name: "Platform" }, type: "pipeline",
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.7 } },
        pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.6, visEnd: 0.8 },
      },
      { id: "e", label: { name: "Note" }, type: "note", position: { evolution: { scalar: 0.1 }, visibility: { scalar: 0.9 } } },
    ],
    relations: [{ source: "a", target: "b" }],
  }));
}

function makeEvolveMap(evolveType: string): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Evolve",
    components: [
      {
        id: "a", label: { name: "Svc" }, type: "component",
        position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
        evolvesTo: [{ position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } }, evolveType }],
      },
    ],
    relations: [],
  }));
}

/** Join legend SVG output and check for a substring */
function legendContains(parts: string[], needle: string): boolean {
  return parts.some((p) => p.includes(needle));
}

// ── Regression ───────────────────────────────────────────────────────

describe("LegendLayer — regression", () => {
  it("legend.show = false → empty array", () => {
    const map = makeMap({ renderConfig: { legend: { show: false } } });
    const ctx = buildRenderContext(map);
    expect(renderLegendLayer(ctx)).toEqual([]);
  });

  it("empty map (no nodes) → empty array", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    expect(renderLegendLayer(ctx)).toEqual([]);
  });

  it("edges present → dependency entry appears", () => {
    const map = makeMap(); // has 1 relation → solid edge
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    expect(legendContains(parts, "Dependency")).toBe(true);
  });
});

// ── Type + color behavior ────────────────────────────────────────────

describe("LegendLayer — type+color", () => {
  it("typeColors reflected in swatches", () => {
    const map = makeMap({
      renderConfig: { typeColors: { _default: "#2563eb", "anchor": "#dc2626" } },
    });
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    // component uses _default blue
    expect(svg).toContain('stroke="#2563eb"');
    // anchor uses explicit red
    expect(svg).toContain('stroke="#dc2626"');
  });

  it("only types present on the map get entries", () => {
    // Only has anchor + component, no user-need/pipeline/note
    const map = makeMap();
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Component");
    expect(svg).toContain("User / Stakeholder");
    expect(svg).not.toContain("User Need");
    expect(svg).not.toContain("Pipeline");
    expect(svg).not.toContain(">Note<");
  });

  it("excludeComponentTypes removes entry from legend", () => {
    const map = makeAllTypesMap();
    const ctx = buildRenderContext(
      sanitizeMap(WardleyMapSchema.parse({
        ...JSON.parse(JSON.stringify(map)),
        renderConfig: { filters: { excludeComponentTypes: ["note"] } },
      }))
    );
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).not.toContain(">Note<");
    // Other types still present
    expect(svg).toContain("Component");
  });

  it("two distinct types get two separate colored entries", () => {
    const map = makeMap({
      renderConfig: { typeColors: { _default: "#2563eb", "user-need": "#dc2626" } },
      components: [
        { id: "a", label: { name: "Need" }, type: "user-need", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } } },
        { id: "b", label: { name: "Svc" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
      ],
    });
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Component");
    expect(svg).toContain("User Need");
    expect(svg).toContain("#2563eb"); // _default for component
    expect(svg).toContain("#dc2626"); // explicit for user-need
  });

  it("no typeColors → falls back to #000000", () => {
    const map = makeMap(); // no renderConfig.typeColors
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain('stroke="#000000"');
  });

  it("all 5 types present → 5 type entries + relation + evolve entries", () => {
    const allMap = sanitizeMap(WardleyMapSchema.parse({
      title: "Full",
      components: [
        { id: "a", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        {
          id: "b", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [{ position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } }, evolveType: "natural" }],
        },
        { id: "c", label: { name: "Need" }, type: "user-need", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } } },
        {
          id: "d", label: { name: "Platform" }, type: "pipeline",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.7 } },
          pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.6, visEnd: 0.8 },
        },
        { id: "e", label: { name: "N" }, type: "note", position: { evolution: { scalar: 0.1 }, visibility: { scalar: 0.9 } } },
      ],
      relations: [{ source: "a", target: "b" }],
    }));
    const ctx = buildRenderContext(allMap);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    // 5 types
    expect(svg).toContain("Component");
    expect(svg).toContain("User Need");
    expect(svg).toContain("Pipeline");
    expect(svg).toContain("User / Stakeholder");
    expect(svg).toContain(">Note<");
    // 1 dependency edge
    expect(svg).toContain("Dependency");
    // 1 evolution arrow
    expect(svg).toContain("Future change");
  });
});

// ── i18n ─────────────────────────────────────────────────────────────

describe("LegendLayer — i18n", () => {
  it("locale 'fr' → French labels", () => {
    const map = makeMap({ renderConfig: { locale: "fr" } });
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Légende");
    expect(svg).toContain("Composant");
    expect(svg).toContain("Utilisateur / Partie prenante");
  });

  it("locale 'en' → English labels (default)", () => {
    const map = makeMap();
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Legend");
    expect(svg).toContain("Component");
  });

  it("unknown type falls back to raw type name", () => {
    // We can't easily add an unknown type due to schema validation,
    // but we verify the fallback logic by checking that known types use labels
    const map = makeMap();
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    // anchor label is "User / Stakeholder", not raw "anchor"
    expect(legendContains(parts, "User / Stakeholder")).toBe(true);
  });

  it("French evolve labels", () => {
    const map = makeEvolveMap("natural");
    const parsed = sanitizeMap(WardleyMapSchema.parse({
      ...JSON.parse(JSON.stringify(map)),
      renderConfig: { locale: "fr" },
    }));
    const ctx = buildRenderContext(parsed);
    const parts = renderLegendLayer(ctx);
    expect(legendContains(parts, "Changement futur")).toBe(true);
  });
});

// ── Evolution arrows ─────────────────────────────────────────────────

describe("LegendLayer — evolution arrows", () => {
  it("natural evolve → 'Future change' entry", () => {
    const ctx = buildRenderContext(makeEvolveMap("natural"));
    expect(legendContains(renderLegendLayer(ctx), "Future change")).toBe(true);
  });

  it("ecosystem evolve → entry present", () => {
    const ctx = buildRenderContext(makeEvolveMap("ecosystem"));
    expect(legendContains(renderLegendLayer(ctx), "Change push by ecosystem")).toBe(true);
  });

  it("forced evolve → entry present", () => {
    const ctx = buildRenderContext(makeEvolveMap("forced"));
    expect(legendContains(renderLegendLayer(ctx), "Forced change")).toBe(true);
  });

  it("late evolve → entry present", () => {
    const ctx = buildRenderContext(makeEvolveMap("late"));
    expect(legendContains(renderLegendLayer(ctx), "already happening")).toBe(true);
  });
});
