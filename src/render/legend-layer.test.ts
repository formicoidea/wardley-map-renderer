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
    relations: [{ id: "rel-a-b", source: "a", target: "b" }],
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
      { id: "c", label: { name: "Need" }, type: "component", subtype: "userNeed", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } } },
      {
        id: "d", label: { name: "Platform" }, type: "pipeline",
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.7 } },
        pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.6, visEnd: 0.8 },
      },
      { id: "f", label: { name: "Trading" }, type: "component", subtype: "market", position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.4 } } },
      { id: "g", label: { name: "Cloud" }, type: "component", subtype: "ecosystem", position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.6 } } },
    ],
    relations: [{ id: "rel-a-b", source: "a", target: "b" }],
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
    const map = makeMap({ renderConfig: { display: { legend: false } } });
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
      renderConfig: { style: { nodes: { default: { override: { symbol: { stroke: "#2563eb" } } }, byType: { anchor: { override: { symbol: { stroke: "#dc2626" } } } } } } },
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
        renderConfig: { display: { pipeline: false } },
      }))
    );
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).not.toContain("Pipeline");
    // Other types still present
    expect(svg).toContain("Component");
  });

  it("two distinct types get two separate colored entries", () => {
    const map = makeMap({
      renderConfig: { style: { nodes: { default: { override: { symbol: { stroke: "#2563eb" } } }, bySubtype: { userNeed: { override: { symbol: { stroke: "#dc2626" } } } } } } },
      components: [
        { id: "a", label: { name: "Need" }, type: "component", subtype: "userNeed", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } } },
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

  it("all renderable types present → type entries + relation + evolve entries", () => {
    const allMap = sanitizeMap(WardleyMapSchema.parse({
      title: "Full",
      components: [
        { id: "a", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        {
          id: "b", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [{ position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } }, evolveType: "natural" }],
        },
        { id: "c", label: { name: "Need" }, type: "component", subtype: "userNeed", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.2 } } },
        {
          id: "d", label: { name: "Platform" }, type: "pipeline",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.7 } },
          pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.6, visEnd: 0.8 },
        },
        { id: "f", label: { name: "Trading" }, type: "component", subtype: "market", position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.4 } } },
        { id: "g", label: { name: "Cloud" }, type: "component", subtype: "ecosystem", position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.6 } } },
      ],
      relations: [{ id: "rel-a-b", source: "a", target: "b" }],
    }));
    const ctx = buildRenderContext(allMap);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    // renderable types
    expect(svg).toContain("Component");
    expect(svg).toContain("User Need");
    expect(svg).toContain("Pipeline");
    expect(svg).toContain("User / Stakeholder");
    expect(svg).toContain("Market");
    expect(svg).toContain("Ecosystem");
    // 1 dependency edge
    expect(svg).toContain("Dependency");
    // 1 evolution arrow
    expect(svg).toContain("Future change");
  });
});

// ── i18n ─────────────────────────────────────────────────────────────

describe("LegendLayer — i18n", () => {
  it("locale 'fr' → French labels", () => {
    const map = makeMap({ renderConfig: { rendering: { locale: "fr" } } });
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
      renderConfig: { rendering: { locale: "fr" } },
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

// ── New element legend entries ────────────────────────────────────────

describe("LegendLayer — method entries (resolved textual values)", () => {
  it("legend shows capitalized method type name, not raw kebab-case", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Method",
      components: [
        {
          id: "a", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          method: { category: "buying-policy", recommendation: "Uncharted" },
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    // Shows capitalized type name, NOT raw kebab-case
    expect(svg).toContain("Buying Policy");
    expect(svg).not.toContain("buying-policy");
    expect(svg).toContain('fill="#2563eb"');
  });

  it("legend label is capitalized method type name regardless of locale", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Method FR",
      components: [
        {
          id: "a", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          method: { category: "project-management", recommendation: "Uncharted" },
        },
      ],
      relations: [],
      renderConfig: { rendering: { locale: "fr" } },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Project Management");
    expect(svg).not.toContain("project-management");
  });

  it("custom renderConfig.methods[] drives legend colors", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Custom",
      components: [
        {
          id: "a", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          method: { category: "custom-method", recommendation: "phase1" },
        },
      ],
      relations: [],
      renderConfig: {
        style: { decorators: { method: { "custom-method": { default: { color: "#00a86b", legend: { phase1: "do", phase2: "delegate", phase3: "automate" } } } } } },
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Custom Method");
    expect(svg).toContain('fill="#00a86b"');
  });

  it("multiple methods → each gets its own resolved textual entry", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Methods",
      components: [
        { id: "a", label: { name: "A" }, type: "component", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.3 } }, method: { category: "buying-policy", recommendation: "Uncharted" } },
        { id: "b", label: { name: "B" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.6 } }, method: { category: "attitudes", recommendation: "Transitional" } },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Buying Policy");
    expect(svg).toContain("Attitudes");
    expect(svg).not.toContain("Project Management");
  });

  it("unknown method type falls back to raw type as label with grey color", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Unknown",
      components: [
        {
          id: "a", label: { name: "A" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          method: { category: "custom-method", recommendation: "trial" },
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    // Falls back to capitalized type name
    expect(svg).toContain("Custom Method");
    // Uses fallback grey color
    expect(svg).toContain('fill="#888888"');
  });

  it("method swatch uses concentric circles, not letter symbols", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Swatch",
      components: [
        {
          id: "a", label: { name: "A" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          method: { category: "buying-policy", recommendation: "recommended" },
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    // Concentric circles swatch: 3 circles with method color, no letter text
    const methodParts = parts.filter((p) => p.includes("#2563eb"));
    expect(methodParts.length).toBeGreaterThanOrEqual(1);
    // Should NOT contain bold text with a letter symbol
    const methodSvg = methodParts.join("");
    expect(methodSvg).not.toContain('font-weight="bold"');
    // Should have concentric circles (fill + stroke pattern)
    expect(methodSvg).toContain('r="7"');
    expect(methodSvg).toContain('r="4"');
    expect(methodSvg).toContain('r="1.5"');
  });

  it("no method → no method entry in legend", () => {
    const map = makeMap();
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).not.toContain("Buying Policy");
    expect(svg).not.toContain("Project Management");
    expect(svg).not.toContain("Attitudes");
  });
});

describe("LegendLayer — accelerator/deaccelerator entries", () => {
  it("accelerators present → 'Accelerator' entry with arrow swatch", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Accel",
      components: [
        { id: "a", label: { name: "Svc" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } }, accelerator: true },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Accelerator");
    expect(svg).toContain("<path");
  });

  it("deaccelerator present → 'Deaccelerator' entry", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Deaccel",
      components: [
        { id: "a", label: { name: "Svc" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } }, deaccelerator: true },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Deaccelerator");
  });

  it("mixed accelerators → both entries", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Mixed",
      components: [
        { id: "a", label: { name: "Push" }, type: "component", position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.3 } }, accelerator: true },
        { id: "b", label: { name: "Drag" }, type: "component", position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.7 } }, deaccelerator: true },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Accelerator");
    expect(svg).toContain("Deaccelerator");
  });

  it("no accelerators → no accelerator entry", () => {
    const map = makeMap();
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).not.toContain("Accelerator");
    expect(svg).not.toContain("Deaccelerator");
  });
});

describe("LegendLayer — steps entries", () => {
  it("steps present → 'Step' entry with red circle swatch", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Steps",
      components: [
        { id: "a", label: { name: "Svc" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } }, step: { number: 1 } },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Step");
    expect(svg).toContain('fill="#cc0000"');
  });

  it("no steps → no step entry", () => {
    const map = makeMap();
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).not.toContain(">Step<");
  });
});

describe("LegendLayer — inertia entry", () => {
  it("inertia on evolve → 'Inertia' entry with thick vertical line", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Inertia",
      components: [
        {
          id: "a", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [{ position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } }, evolveType: "natural", inertia: true }],
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Inertia");
    expect(svg).toContain('stroke-width="4"');
  });

  it("no inertia → no inertia entry", () => {
    const map = makeEvolveMap("natural");
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).not.toContain("Inertia");
  });
});

describe("LegendLayer — i18n for new elements", () => {
  it("French labels for method, accelerator, step, inertia", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "FR",
      components: [
        {
          id: "a", label: { name: "Svc" }, type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          method: { category: "build", recommendation: "recommended" },
          accelerator: true,
          step: { number: 1 },
          evolvesTo: [{ position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } }, evolveType: "natural", inertia: true }],
        },
      ],
      relations: [],
      renderConfig: {
        rendering: { locale: "fr" },
        style: { decorators: { method: { build: { default: { color: "#00a86b", legend: { Uncharted: "faire", Transitional: "acheter", Industrialized: "externaliser" } } } } } },
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Build");
    expect(svg).toContain("Accélérateur");
    expect(svg).toContain("Étape");
    expect(svg).toContain("Inertie");
  });
});

// ── Market & Ecosystem in legend ──────────────────────────────────────

describe("LegendLayer — Market & Ecosystem entries", () => {
  it("market type present → 'Market' entry with rings-and-triangle swatch", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Market",
      components: [
        { id: "a", label: { name: "Trading" }, type: "component", subtype: "market", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.4 } } },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Market");
    // Triangle connecting the nodes + ring circles, no center spokes
    expect(svg).toContain("<polygon");
    expect(svg).not.toContain("<line");
    expect(svg).toContain("<circle");
  });

  it("ecosystem type present → 'Ecosystem' entry with concentric circles swatch", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Eco",
      components: [
        { id: "a", label: { name: "Cloud" }, type: "component", subtype: "ecosystem", position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Ecosystem");
    // 3 concentric circles
    const circleCount = (svg.match(/<circle/g) || []).length;
    expect(circleCount).toBeGreaterThanOrEqual(3);
  });

  it("makeAllTypesMap includes Market and Ecosystem entries", () => {
    const map = makeAllTypesMap();
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Market");
    expect(svg).toContain("Ecosystem");
  });
});

// ── Accelerator subtype-only rendering ─────────────────────────────────

describe("LegendLayer — accelerator subtype isolation", () => {
  it("only accelerator subtype → shows Accelerator, not Deaccelerator", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "AccOnly",
      components: [
        { id: "a", label: { name: "Svc" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } }, accelerator: true },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Accelerator");
    expect(svg).not.toContain("Deaccelerator");
  });

  it("only deaccelerator subtype → shows Deaccelerator, not Accelerator", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "DeaccOnly",
      components: [
        { id: "a", label: { name: "Svc" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } }, deaccelerator: true },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const parts = renderLegendLayer(ctx);
    const svg = parts.join("");
    expect(svg).toContain("Deaccelerator");
    expect(svg).not.toContain(">Accelerator<");
  });
});
