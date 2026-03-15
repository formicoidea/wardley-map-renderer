/**
 * AC 8: Schema supports new relation types (DependsOn, Flow, Constraint).
 *
 * Verifies that:
 * 1. The schema accepts all three relation types
 * 2. DependsOn remains the default when type is omitted
 * 3. Each relation type renders with distinct visual styling
 * 4. Legacy type names are normalized to the canonical types
 * 5. Flow metadata works with all relation types
 * 6. Invalid relation types are rejected by the schema
 */
import { describe, it, expect } from "vitest";
import { renderMapToSVG } from "./render.js";
import {
  WardleyMapSchema,
  RelationTypeEnum,
  RelationSchema,
  sanitizeMap,
} from "./schema.js";
import type { WardleyMap } from "./schema.js";

// ── Helper: base map with 3 components ──────────────────────────

function makeMap(relations: any[]): WardleyMap {
  return sanitizeMap({
    title: "Relation types test",
    components: [
      { id: "a", label: "A", type: "anchor", evolution: 0.2, visibility: 0.9 },
      { id: "b", label: "B", type: "component", evolution: 0.5, visibility: 0.5 },
      { id: "c", label: "C", type: "component", evolution: 0.8, visibility: 0.3 },
    ],
    relations,
  });
}

/** Extract <line> elements from SVG */
function extractLines(svg: string): string[] {
  return svg.match(/<line[^>]+>/g) ?? [];
}

// ── Schema validation tests ─────────────────────────────────────

describe("RelationTypeEnum schema (AC 8)", () => {
  it("accepts DependsOn", () => {
    expect(RelationTypeEnum.parse("DependsOn")).toBe("DependsOn");
  });

  it("accepts Flow", () => {
    expect(RelationTypeEnum.parse("Flow")).toBe("Flow");
  });

  it("accepts Constraint", () => {
    expect(RelationTypeEnum.parse("Constraint")).toBe("Constraint");
  });

  it("rejects unknown type", () => {
    expect(() => RelationTypeEnum.parse("Unknown")).toThrow();
  });
});

describe("RelationSchema defaults (AC 8)", () => {
  it("defaults type to DependsOn when omitted", () => {
    const parsed = RelationSchema.parse({ source: "a", target: "b" });
    expect(parsed.type).toBe("DependsOn");
  });

  it("accepts explicit Flow type", () => {
    const parsed = RelationSchema.parse({ source: "a", target: "b", type: "Flow" });
    expect(parsed.type).toBe("Flow");
  });

  it("accepts explicit Constraint type", () => {
    const parsed = RelationSchema.parse({ source: "a", target: "b", type: "Constraint" });
    expect(parsed.type).toBe("Constraint");
  });

  it("accepts Flow type with flow metadata", () => {
    const parsed = RelationSchema.parse({
      source: "a",
      target: "b",
      type: "Flow",
      flow: { label: "data", style: "dashed" },
    });
    expect(parsed.type).toBe("Flow");
    expect(parsed.flow?.label).toBe("data");
  });

  it("accepts Constraint type with flow metadata", () => {
    const parsed = RelationSchema.parse({
      source: "a",
      target: "b",
      type: "Constraint",
      flow: { label: "GDPR compliance", style: "bold" },
    });
    expect(parsed.type).toBe("Constraint");
    expect(parsed.flow?.label).toBe("GDPR compliance");
  });
});

// ── Full map schema validation ──────────────────────────────────

describe("WardleyMapSchema with mixed relation types (AC 8)", () => {
  it("parses a map with all three relation types", () => {
    const raw = {
      title: "Mixed relations",
      components: [
        { id: "a", label: "A", type: "anchor", evolution: 0.2, visibility: 0.9 },
        { id: "b", label: "B", type: "component", evolution: 0.5, visibility: 0.5 },
        { id: "c", label: "C", type: "component", evolution: 0.8, visibility: 0.3 },
      ],
      relations: [
        { source: "a", target: "b", type: "DependsOn" },
        { source: "b", target: "c", type: "Flow", flow: { label: "data" } },
        { source: "a", target: "c", type: "Constraint" },
      ],
    };
    const parsed = WardleyMapSchema.parse(raw);
    expect(parsed.relations).toHaveLength(3);
    expect(parsed.relations[0].type).toBe("DependsOn");
    expect(parsed.relations[1].type).toBe("Flow");
    expect(parsed.relations[2].type).toBe("Constraint");
  });
});

// ── Legacy type normalization in sanitizeMap ─────────────────────

describe("sanitizeMap legacy relation type mapping (AC 8)", () => {
  it("normalizes 'flow' to 'Flow'", () => {
    const map = makeMap([{ source: "a", target: "b", type: "flow" }]);
    expect(map.relations[0].type).toBe("Flow");
  });

  it("normalizes 'constraint' to 'Constraint'", () => {
    const map = makeMap([{ source: "a", target: "b", type: "constraint" }]);
    expect(map.relations[0].type).toBe("Constraint");
  });

  it("normalizes 'data_flow' to 'Flow'", () => {
    const map = makeMap([{ source: "a", target: "b", type: "data_flow" }]);
    expect(map.relations[0].type).toBe("Flow");
  });

  it("normalizes 'regulation' to 'Constraint'", () => {
    const map = makeMap([{ source: "a", target: "b", type: "regulation" }]);
    expect(map.relations[0].type).toBe("Constraint");
  });

  it("defaults unknown relation type to DependsOn", () => {
    const map = makeMap([{ source: "a", target: "b", type: "something_else" }]);
    expect(map.relations[0].type).toBe("DependsOn");
  });
});

// ── Visual rendering differentiation ────────────────────────────

describe("Relation type visual styling (AC 8)", () => {
  it("DependsOn renders with grey stroke (#999999)", () => {
    const map = makeMap([{ source: "a", target: "b", type: "DependsOn" }]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#999999"'));
    expect(lines.length).toBe(1);
  });

  it("Flow renders with blue stroke (#2563eb)", () => {
    const map = makeMap([{ source: "a", target: "b", type: "Flow" }]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#2563eb"'));
    expect(lines.length).toBe(1);
  });

  it("Constraint renders with red stroke (#dc2626)", () => {
    const map = makeMap([{ source: "a", target: "b", type: "Constraint" }]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#dc2626"'));
    expect(lines.length).toBe(1);
  });

  it("Flow relation has dashed style by default", () => {
    const map = makeMap([{ source: "a", target: "b", type: "Flow" }]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#2563eb"'));
    expect(lines[0]).toContain("stroke-dasharray");
  });

  it("Constraint relation has dotted style by default", () => {
    const map = makeMap([{ source: "a", target: "b", type: "Constraint" }]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#dc2626"'));
    expect(lines[0]).toContain("stroke-dasharray");
  });

  it("DependsOn relation has no dasharray (solid)", () => {
    const map = makeMap([{ source: "a", target: "b", type: "DependsOn" }]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#999999"'));
    expect(lines[0]).not.toContain("stroke-dasharray");
  });

  it("mixed relation types render with distinct colors in same map", () => {
    const map = makeMap([
      { source: "a", target: "b", type: "DependsOn" },
      { source: "b", target: "c", type: "Flow" },
      { source: "a", target: "c", type: "Constraint" },
    ]);
    const svg = renderMapToSVG(map);
    const allLines = extractLines(svg);

    const grey = allLines.filter((l) => l.includes('stroke="#999999"'));
    const blue = allLines.filter((l) => l.includes('stroke="#2563eb"'));
    const red = allLines.filter((l) => l.includes('stroke="#dc2626"'));

    expect(grey.length).toBe(1);
    expect(blue.length).toBe(1);
    expect(red.length).toBe(1);
  });
});

// ── Flow metadata override on different relation types ──────────

describe("Flow metadata override on relation types (AC 8)", () => {
  it("Flow relation with bold flow style renders thicker line", () => {
    const map = makeMap([
      { source: "a", target: "b", type: "Flow", flow: { label: "money", style: "bold" } },
    ]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#2563eb"'));
    expect(lines[0]).toContain('stroke-width="3"');
  });

  it("Constraint relation with dashed flow style overrides dot pattern", () => {
    const map = makeMap([
      { source: "a", target: "b", type: "Constraint", flow: { label: "policy", style: "dashed" } },
    ]);
    const svg = renderMapToSVG(map);
    const lines = extractLines(svg).filter((l) => l.includes('stroke="#dc2626"'));
    expect(lines[0]).toContain('stroke-dasharray="6,4"');
  });
});
