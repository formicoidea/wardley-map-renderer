/**
 * Tests for the layer registry and type definitions.
 *
 * Validates:
 * - 8 layers are defined in correct order
 * - registerLayer / getOrderedLayers / getLayer work correctly
 * - validateRegistry detects missing layers
 * - Layers execute in z-order (back-to-front)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  LAYER_ORDER,
  LAYER_NAMES,
  registerLayer,
  getOrderedLayers,
  getLayer,
  validateRegistry,
  clearRegistry,
  registrySize,
} from "./registry.js";
import type { LayerName, LayerRenderer, RenderContext } from "./types.js";

// Stub renderer that returns its name — useful for order verification
const stubRenderer = (name: string): LayerRenderer => () => [`<!-- ${name} -->`];

describe("LAYER_ORDER", () => {
  it("defines exactly 9 layers", () => {
    expect(Object.keys(LAYER_ORDER)).toHaveLength(9);
  });

  it("contains all expected layer names", () => {
    const expected: LayerName[] = [
      "title", "axes", "pipelines", "edges",
      "evolvesTo", "nodes", "labels", "notes",
    ];
    for (const name of expected) {
      expect(LAYER_ORDER).toHaveProperty(name);
    }
  });

  it("has strictly increasing order values matching z-order", () => {
    const orderedValues = LAYER_NAMES.map((n) => LAYER_ORDER[n]);
    for (let i = 1; i < orderedValues.length; i++) {
      expect(orderedValues[i]).toBeGreaterThan(orderedValues[i - 1]);
    }
  });

  it("places pipelines before edges (background treatment)", () => {
    expect(LAYER_ORDER.pipelines).toBeLessThan(LAYER_ORDER.edges);
  });

  it("places nodes before labels", () => {
    expect(LAYER_ORDER.nodes).toBeLessThan(LAYER_ORDER.labels);
  });

  it("places title first", () => {
    const minOrder = Math.min(...Object.values(LAYER_ORDER));
    expect(LAYER_ORDER.title).toBe(minOrder);
  });

  it("places legend last", () => {
    const maxOrder = Math.max(...Object.values(LAYER_ORDER));
    expect(LAYER_ORDER.legend).toBe(maxOrder);
  });
});

describe("LAYER_NAMES", () => {
  it("has 9 entries in execution order", () => {
    expect(LAYER_NAMES).toHaveLength(9);
    expect(LAYER_NAMES[0]).toBe("title");
    expect(LAYER_NAMES[8]).toBe("legend");
  });
});

describe("registerLayer / getOrderedLayers", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("registers and retrieves a single layer", () => {
    const render = stubRenderer("title");
    registerLayer("title", render);

    const layer = getLayer("title");
    expect(layer).toBeDefined();
    expect(layer!.name).toBe("title");
    expect(layer!.order).toBe(LAYER_ORDER.title);
    expect(layer!.render).toBe(render);
  });

  it("returns layers sorted by order", () => {
    // Register in reverse order
    registerLayer("notes", stubRenderer("notes"));
    registerLayer("title", stubRenderer("title"));
    registerLayer("nodes", stubRenderer("nodes"));

    const ordered = getOrderedLayers();
    expect(ordered).toHaveLength(3);
    expect(ordered[0].name).toBe("title");
    expect(ordered[1].name).toBe("nodes");
    expect(ordered[2].name).toBe("notes");
  });

  it("overwrites previous registration for same layer", () => {
    const first = stubRenderer("v1");
    const second = stubRenderer("v2");

    registerLayer("axes", first);
    registerLayer("axes", second);

    expect(registrySize()).toBe(1);
    expect(getLayer("axes")!.render).toBe(second);
  });
});

describe("validateRegistry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("reports all 9 layers missing when registry is empty", () => {
    const result = validateRegistry();
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(9);
  });

  it("reports valid when all 9 layers are registered", () => {
    for (const name of LAYER_NAMES) {
      registerLayer(name, stubRenderer(name));
    }
    const result = validateRegistry();
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("reports specific missing layers", () => {
    registerLayer("title", stubRenderer("title"));
    registerLayer("axes", stubRenderer("axes"));

    const result = validateRegistry();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("pipelines");
    expect(result.missing).toContain("edges");
    expect(result.missing).not.toContain("title");
    expect(result.missing).not.toContain("axes");
  });
});

describe("clearRegistry", () => {
  it("removes all registrations", () => {
    registerLayer("title", stubRenderer("title"));
    registerLayer("axes", stubRenderer("axes"));
    expect(registrySize()).toBe(2);

    clearRegistry();
    expect(registrySize()).toBe(0);
    expect(getOrderedLayers()).toHaveLength(0);
  });
});

describe("Layer execution order (z-order)", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("produces SVG fragments in back-to-front order", () => {
    // Register all 8 layers with traceable output
    for (const name of LAYER_NAMES) {
      registerLayer(name, () => [`<!-- layer:${name} -->`]);
    }

    const ordered = getOrderedLayers();
    const fragments = ordered.flatMap((layer) => layer.render({} as RenderContext));

    expect(fragments).toEqual([
      "<!-- layer:title -->",
      "<!-- layer:axes -->",
      "<!-- layer:pipelines -->",
      "<!-- layer:edges -->",
      "<!-- layer:evolvesTo -->",
      "<!-- layer:nodes -->",
      "<!-- layer:labels -->",
      "<!-- layer:notes -->",
      "<!-- layer:legend -->",
    ]);
  });
});
