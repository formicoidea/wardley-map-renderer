/**
 * Tests for LabelsLayer — ensures all LABEL_TYPES render text labels,
 * including market and ecosystem types.
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderLabelsLayer } from "./labels-layer.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";

// ── Test fixtures ───────────────────────────────────────────────────

function makeMapWithTypes(
  types: Array<{ id: string; name: string; type: string }>
): WardleyMap {
  return sanitizeMap(
    WardleyMapSchema.parse({
      title: "Label Test Map",
      components: types.map((t, i) => ({
        id: t.id,
        label: { name: t.name },
        type: t.type,
        position: {
          evolution: { scalar: 0.3 + i * 0.1 },
          visibility: { scalar: 0.2 + i * 0.1 },
        },
      })),
      relations: [],
    })
  );
}

// ── Tests ───────────────────────────────────────────────────────────

describe("LabelsLayer", () => {
  it("renders labels for component type", () => {
    const map = makeMapWithTypes([
      { id: "c1", name: "My Service", type: "component" },
    ]);
    const ctx = buildRenderContext(map);
    const parts = renderLabelsLayer(ctx);
    const svg = parts.join("\n");
    expect(svg).toContain("My Service");
  });

  it("renders labels for market type", () => {
    const map = makeMapWithTypes([
      { id: "m1", name: "Cloud Market", type: "component", subtype: "market" },
    ]);
    const ctx = buildRenderContext(map);
    const parts = renderLabelsLayer(ctx);
    const svg = parts.join("\n");
    expect(svg).toContain("Cloud Market");
  });

  it("renders labels for ecosystem type", () => {
    const map = makeMapWithTypes([
      { id: "e1", name: "OSS Ecosystem", type: "component", subtype: "ecosystem" },
    ]);
    const ctx = buildRenderContext(map);
    const parts = renderLabelsLayer(ctx);
    const svg = parts.join("\n");
    expect(svg).toContain("OSS Ecosystem");
  });

  it("renders labels for both market and ecosystem alongside regular types", () => {
    const map = makeMapWithTypes([
      { id: "a1", name: "User", type: "anchor" },
      { id: "c1", name: "Platform", type: "component" },
      { id: "m1", name: "Cloud Market", type: "component", subtype: "market" },
      { id: "e1", name: "Dev Ecosystem", type: "component", subtype: "ecosystem" },
    ]);
    const ctx = buildRenderContext(map);
    const parts = renderLabelsLayer(ctx);
    const svg = parts.join("\n");
    expect(svg).toContain("User");
    expect(svg).toContain("Platform");
    expect(svg).toContain("Cloud Market");
    expect(svg).toContain("Dev Ecosystem");
  });

  it("excludes labels for an excluded component TYPE (component)", () => {
    const map = sanitizeMap(
      WardleyMapSchema.parse({
        title: "Exclude Test",
        components: [
          { id: "m1", label: { name: "Hidden Service" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.3 } } },
          { id: "a1", label: { name: "Visible Anchor" }, type: "anchor", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.4 } } },
        ],
        relations: [],
        renderConfig: { display: { component: false } },
      })
    );
    const ctx = buildRenderContext(map);
    const parts = renderLabelsLayer(ctx);
    const svg = parts.join("\n");
    expect(svg).not.toContain("Hidden Service");
    expect(svg).toContain("Visible Anchor");
  });
});

describe("LabelsLayer — remembered anchor and locks", () => {
  function makeMap(component: Record<string, unknown>): WardleyMap {
    return sanitizeMap(WardleyMapSchema.parse({
      title: "Anchor Test",
      components: [component],
      relations: [],
    }));
  }

  it("a stored anchor wins over the sign of dx", () => {
    // dx > 0 would derive "start"; the stored anchor must win (no flip on drag)
    const map = makeMap({
      id: "c1", label: { name: "Pinned", position: { dx: 20, dy: 4, anchor: "end" } },
      type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
    });
    const svg = renderLabelsLayer(buildRenderContext(map)).join("\n");
    expect(svg).toContain('text-anchor="end"');
  });

  it("without a stored anchor the sign of dx still decides", () => {
    const map = makeMap({
      id: "c1", label: { name: "Derived", position: { dx: -20, dy: 4 } },
      type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
    });
    const svg = renderLabelsLayer(buildRenderContext(map)).join("\n");
    expect(svg).toContain('text-anchor="end"');
  });

  it("locked.label pins the label even without label.position", () => {
    // Two labels on the same spot: the locked one must keep its baseline.
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Lock Test",
      components: [
        {
          id: "locked", label: { name: "Locked" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          locked: { label: true },
        },
        {
          id: "free", label: { name: "Free" }, type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
        },
      ],
      relations: [],
    }));
    const ctx = buildRenderContext(map);
    const svg = renderLabelsLayer(ctx).join("\n");

    // The locked label sits at the node baseline (cy + 4), untouched by phase 2
    const node = ctx.nodes.find((n) => n.component.id === "locked")!;
    expect(svg).toContain(`y="${node.cy + 4}" text-anchor="start"`);
  });

  it("multi-line label names are emitted as tspans, not escaped newlines", () => {
    const map = makeMap({
      id: "c1", label: { name: "First line\nSecond line" }, type: "component",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
    });
    const svg = renderLabelsLayer(buildRenderContext(map)).join("\n");
    expect(svg).toContain("<tspan");
    expect(svg).toContain("Second line");
    expect(svg).not.toContain("\\n");
  });
});
