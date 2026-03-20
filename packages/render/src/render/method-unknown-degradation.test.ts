/**
 * Tests for AC 13: Unknown method.type renders component normally without indicator.
 *
 * When a component has a method whose type is not found in renderConfig.methods[],
 * the component renders normally (circle, label, etc.) but NO method indicator
 * (aura circle) is emitted. No error, no warning — silent degradation.
 *
 * @module render/method-unknown-degradation.test
 */

import { describe, it, expect } from "vitest";
import { renderToSVG } from "../render-orchestrator.js";
import { makeMap } from "../test-helpers.js";
import type { Component } from "../schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a component with a method field */
function componentWithMethod(
  id: string,
  methodType: string,
  preconisation: string
): Component {
  return {
    id,
    label: { name: id },
    type: "component",
    position: {
      evolution: { scalar: 0.5 },
      visibility: { scalar: 0.5 },
    },
    method: { type: methodType, preconisation },
  } as Component;
}

/** Count occurrences of a substring */
function countOccurrences(str: string, sub: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) {
    count++;
    pos += sub.length;
  }
  return count;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Unknown method.type graceful degradation (AC 13)", () => {
  it("known method type with valid preconisation renders method indicator aura", () => {
    // "Uncharted" is position 0 in buying-policy legend → ring only (fill="none")
    const map = makeMap({
      title: "Known Method",
      components: [componentWithMethod("crm", "buying-policy", "Uncharted")],
      relations: [],
    });

    const svg = renderToSVG(map);

    // Component label is present
    expect(svg).toContain(">crm</text>");

    // Method indicator aura should be present — buying-policy is a default method type
    // Position 0 renders as ring: fill="none" stroke="<color>"
    expect(svg).toContain('fill="none"');
  });

  it("known method type with invalid preconisation renders NO indicator", () => {
    // "recommended" is not a key in buying-policy legend → no indicator
    const map = makeMap({
      title: "Bad Preconisation",
      components: [componentWithMethod("crm", "buying-policy", "recommended")],
      relations: [],
    });

    const svg = renderToSVG(map);
    expect(svg).toContain(">crm</text>");

    // No aura circle with the method color
    expect(svg).not.toContain('fill-opacity="0.4"');
    expect(svg).not.toContain('fill-opacity="1"');
  });

  it("unknown method type renders component normally WITHOUT method indicator", () => {
    const map = makeMap({
      title: "Unknown Method",
      components: [componentWithMethod("crm", "nonexistent-method-xyz", "some-preconisation")],
      relations: [],
    });

    const svg = renderToSVG(map);

    // Component label is still rendered
    expect(svg).toContain(">crm</text>");

    // No method indicator aura
    expect(svg).not.toContain('fill-opacity="0.4"');
    expect(svg).not.toContain('fill-opacity="1"');
  });

  it("unknown method type does not throw errors", () => {
    const map = makeMap({
      title: "No Throw",
      components: [componentWithMethod("x", "totally-unknown-type", "whatever")],
      relations: [],
    });

    // Should not throw — silent degradation
    expect(() => renderToSVG(map)).not.toThrow();
  });

  it("component with unknown method renders same circle count as component without method", () => {
    const withUnknownMethod = makeMap({
      title: "With Unknown",
      components: [componentWithMethod("comp", "unknown-xyz", "n/a")],
      relations: [],
    });

    const withoutMethod = makeMap({
      title: "Without Method",
      components: [{
        id: "comp",
        label: { name: "comp" },
        type: "component" as const,
        position: {
          evolution: { scalar: 0.5 },
          visibility: { scalar: 0.5 },
        },
      }],
      relations: [],
    });

    const svgWithUnknown = renderToSVG(withUnknownMethod);
    const svgWithout = renderToSVG(withoutMethod);

    // Extract just the nodes layer to compare circle counts
    const nodesLayerRegex = /<g data-layer="nodes">([\s\S]*?)<\/g>/;
    const nodesWithUnknown = nodesLayerRegex.exec(svgWithUnknown)?.[1] ?? "";
    const nodesWithout = nodesLayerRegex.exec(svgWithout)?.[1] ?? "";

    // Both should have the same number of circles (just the base component circle)
    const circlesWithUnknown = countOccurrences(nodesWithUnknown, "<circle ");
    const circlesWithout = countOccurrences(nodesWithout, "<circle ");
    expect(circlesWithUnknown).toBe(circlesWithout);
  });

  it("mixed known and unknown methods: only known method gets indicator", () => {
    // "Transitional" is position 1 → semi-filled (fill-opacity="0.4")
    const map = makeMap({
      title: "Mixed",
      components: [
        componentWithMethod("known-comp", "buying-policy", "Transitional"),
        componentWithMethod("unknown-comp", "nonexistent-method", "n/a"),
      ],
      relations: [],
    });

    const svg = renderToSVG(map);

    // Both component labels render
    expect(svg).toContain(">known-comp</text>");
    expect(svg).toContain(">unknown-comp</text>");

    // Only one method indicator (for the known type with valid preconisation)
    expect(countOccurrences(svg, 'fill-opacity="0.4"')).toBe(1);
  });
});
