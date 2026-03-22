import { describe, it, expect } from "vitest";
import {
  EvolutionRangeSchema,
  ComponentSchema,
  WardleyMapSchema,
  validateComponent,
  sanitizeMap,
} from "./schema";

describe("EvolutionRangeSchema", () => {
  it("accepts a valid [min, max] tuple", () => {
    const result = EvolutionRangeSchema.safeParse([0.2, 0.7]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([0.2, 0.7]);
    }
  });

  it("accepts equal min and max", () => {
    const result = EvolutionRangeSchema.safeParse([0.5, 0.5]);
    expect(result.success).toBe(true);
  });

  it("accepts boundary values [0, 1]", () => {
    const result = EvolutionRangeSchema.safeParse([0, 1]);
    expect(result.success).toBe(true);
  });

  it("rejects min > max", () => {
    const result = EvolutionRangeSchema.safeParse([0.8, 0.2]);
    expect(result.success).toBe(false);
  });

  it("rejects values outside [0, 1]", () => {
    expect(EvolutionRangeSchema.safeParse([-0.1, 0.5]).success).toBe(false);
    expect(EvolutionRangeSchema.safeParse([0.5, 1.1]).success).toBe(false);
  });

  it("rejects non-tuple inputs", () => {
    expect(EvolutionRangeSchema.safeParse([0.5]).success).toBe(false);
    expect(EvolutionRangeSchema.safeParse([0.1, 0.5, 0.9]).success).toBe(false);
    expect(EvolutionRangeSchema.safeParse("0.5").success).toBe(false);
  });
});

describe("ComponentSchema with evolutionRange", () => {
  const baseComponent = {
    id: "comp-1",
    label: { name: "Test Component" },
    type: "component" as const,
    position: {
      evolution: { scalar: 0.5 },
      visibility: { scalar: 0.8 },
    },
  };

  it("accepts component without evolutionRange (optional)", () => {
    const result = ComponentSchema.safeParse(baseComponent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position.evolution.range).toBeUndefined();
    }
  });

  it("accepts component with valid evolutionRange", () => {
    const result = ComponentSchema.safeParse({
      ...baseComponent,
      position: {
        evolution: { scalar: 0.5, range: [0.3, 0.7] },
        visibility: { scalar: 0.8 },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position.evolution.range).toEqual([0.3, 0.7]);
    }
  });

  it("rejects component with invalid evolutionRange (min > max)", () => {
    const result = ComponentSchema.safeParse({
      ...baseComponent,
      position: {
        evolution: { scalar: 0.5, range: [0.9, 0.1] },
        visibility: { scalar: 0.8 },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("WardleyMapSchema with evolutionRange", () => {
  it("parses a map with components that have evolutionRange", () => {
    const map = {
      title: "Test Map",
      components: [
        {
          id: "user",
          label: { name: "User" },
          type: "user-need",
          position: {
            evolution: { scalar: 0.9 },
            visibility: { scalar: 0.95 },
          },
        },
        {
          id: "platform",
          label: { name: "Platform" },
          type: "component",
          position: {
            evolution: { scalar: 0.5, range: [0.3, 0.7] },
            visibility: { scalar: 0.6 },
          },
        },
      ],
      relations: [{ id: "rel-user-platform", source: "user", target: "platform" }],
    };
    const result = WardleyMapSchema.safeParse(map);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.components[1].position.evolution.range).toEqual([0.3, 0.7]);
    }
  });
});

describe("validateComponent with evolutionRange", () => {
  it("returns no errors when evolution is within range", () => {
    const errors = validateComponent({
      id: "c1",
      label: { name: "Comp" },
      type: "component",
      position: {
        evolution: { scalar: 0.5, range: [0.3, 0.7] },
        visibility: { scalar: 0.5 },
      },
    });
    expect(errors).toEqual([]);
  });

  it("returns error when evolution is below range min", () => {
    const errors = validateComponent({
      id: "c1",
      label: { name: "Comp" },
      type: "component",
      position: {
        evolution: { scalar: 0.1, range: [0.3, 0.7] },
        visibility: { scalar: 0.5 },
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("outside its evolutionRange");
  });

  it("returns error when evolution is above range max", () => {
    const errors = validateComponent({
      id: "c1",
      label: { name: "Comp" },
      type: "component",
      position: {
        evolution: { scalar: 0.9, range: [0.3, 0.7] },
        visibility: { scalar: 0.5 },
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("outside its evolutionRange");
  });

  it("accepts evolution at range boundaries", () => {
    expect(
      validateComponent({
        id: "c1",
        label: { name: "Comp" },
        type: "component",
        position: {
          evolution: { scalar: 0.3, range: [0.3, 0.7] },
          visibility: { scalar: 0.5 },
        },
      })
    ).toEqual([]);

    expect(
      validateComponent({
        id: "c1",
        label: { name: "Comp" },
        type: "component",
        position: {
          evolution: { scalar: 0.7, range: [0.3, 0.7] },
          visibility: { scalar: 0.5 },
        },
      })
    ).toEqual([]);
  });
});

describe("sanitizeMap with evolutionRange", () => {
  const makeMap = (components: any[]) => ({
    title: "Test",
    components: [
      {
        id: "user",
        label: { name: "User" },
        type: "user-need",
        position: {
          evolution: { scalar: 0.9 },
          visibility: { scalar: 0.95 },
        },
      },
      ...components,
    ],
    relations: [],
  });

  it("clamps evolutionRange values to [0, 1]", () => {
    const map = makeMap([
      {
        id: "c1",
        label: { name: "Comp" },
        type: "component",
        position: {
          evolution: { scalar: 0.5, range: [-0.2, 1.5] },
          visibility: { scalar: 0.5 },
        },
      },
    ]);
    const sanitized = sanitizeMap(map as any);
    const comp = sanitized.components.find((c) => c.id === "c1")!;
    expect(comp.position.evolution.range).toEqual([0, 1]);
  });

  it("swaps inverted evolutionRange", () => {
    const map = makeMap([
      {
        id: "c1",
        label: { name: "Comp" },
        type: "component",
        position: {
          evolution: { scalar: 0.5, range: [0.8, 0.2] },
          visibility: { scalar: 0.5 },
        },
      },
    ]);
    const sanitized = sanitizeMap(map as any);
    const comp = sanitized.components.find((c) => c.id === "c1")!;
    expect(comp.position.evolution.range).toEqual([0.2, 0.8]);
  });

  it("preserves valid evolutionRange unchanged", () => {
    const map = makeMap([
      {
        id: "c1",
        label: { name: "Comp" },
        type: "component",
        position: {
          evolution: { scalar: 0.5, range: [0.3, 0.7] },
          visibility: { scalar: 0.5 },
        },
      },
    ]);
    const sanitized = sanitizeMap(map as any);
    const comp = sanitized.components.find((c) => c.id === "c1")!;
    expect(comp.position.evolution.range).toEqual([0.3, 0.7]);
  });

  it("leaves components without evolutionRange untouched", () => {
    const map = makeMap([
      {
        id: "c1",
        label: { name: "Comp" },
        type: "component",
        position: {
          evolution: { scalar: 0.5 },
          visibility: { scalar: 0.5 },
        },
      },
    ]);
    const sanitized = sanitizeMap(map as any);
    const comp = sanitized.components.find((c) => c.id === "c1")!;
    expect(comp.position.evolution.range).toBeUndefined();
  });
});
