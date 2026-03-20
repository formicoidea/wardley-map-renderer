import { describe, it, expect } from "vitest";
import { StepSchema, WardleyMapSchema } from "./schema.js";

describe("StepSchema", () => {
  const validStep = {
    number: 1,
    position: {
      evolution: { scalar: 0.5 },
      visibility: { scalar: 0.3 },
    },
  };

  it("parses a valid step without color", () => {
    const result = StepSchema.parse(validStep);
    expect(result.number).toBe(1);
    expect(result.position.evolution.scalar).toBe(0.5);
    expect(result.position.visibility.scalar).toBe(0.3);
    expect(result.color).toBeUndefined();
  });

  it("parses a valid step with color", () => {
    const result = StepSchema.parse({ ...validStep, color: "#ff0000" });
    expect(result.color).toBe("#ff0000");
  });

  it("accepts CSS color names", () => {
    const result = StepSchema.parse({ ...validStep, color: "red" });
    expect(result.color).toBe("red");
  });

  it("rejects missing number", () => {
    const { number: _, ...noNumber } = validStep;
    expect(() => StepSchema.parse(noNumber)).toThrow();
  });

  it("rejects missing position", () => {
    const { position: _, ...noPos } = validStep;
    expect(() => StepSchema.parse(noPos)).toThrow();
  });

  it("rejects non-integer number", () => {
    expect(() => StepSchema.parse({ ...validStep, number: 1.5 })).toThrow();
  });

  it("rejects number less than 1", () => {
    expect(() => StepSchema.parse({ ...validStep, number: 0 })).toThrow();
  });

  it("accepts large step numbers", () => {
    const result = StepSchema.parse({ ...validStep, number: 99 });
    expect(result.number).toBe(99);
  });
});

describe("WardleyMapSchema.steps", () => {
  const minimalMap = {
    title: "Test",
    components: [],
    relations: [],
  };

  it("accepts a map without steps (backward compat)", () => {
    const result = WardleyMapSchema.parse(minimalMap);
    expect(result.steps).toBeUndefined();
  });

  it("accepts a map with empty steps array", () => {
    const result = WardleyMapSchema.parse({ ...minimalMap, steps: [] });
    expect(result.steps).toEqual([]);
  });

  it("accepts a map with steps", () => {
    const map = {
      ...minimalMap,
      steps: [
        {
          number: 1,
          position: {
            evolution: { scalar: 0.2 },
            visibility: { scalar: 0.1 },
          },
        },
        {
          number: 2,
          position: {
            evolution: { scalar: 0.6 },
            visibility: { scalar: 0.5 },
          },
          color: "blue",
        },
      ],
    };
    const result = WardleyMapSchema.parse(map);
    expect(result.steps).toHaveLength(2);
    expect(result.steps![0].number).toBe(1);
    expect(result.steps![0].color).toBeUndefined();
    expect(result.steps![1].number).toBe(2);
    expect(result.steps![1].color).toBe("blue");
  });

  it("rejects steps with invalid entries", () => {
    const map = {
      ...minimalMap,
      steps: [{ color: "red" }], // missing required fields
    };
    expect(() => WardleyMapSchema.parse(map)).toThrow();
  });
});
