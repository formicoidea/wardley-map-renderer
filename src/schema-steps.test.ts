import { describe, it, expect } from "vitest";
import { StepDecoratorSchema, ComponentSchema } from "./schema.js";

describe("StepDecoratorSchema", () => {
  it("parses a valid step decorator without color", () => {
    const result = StepDecoratorSchema.parse({ number: 1 });
    expect(result.number).toBe(1);
    expect(result.color).toBeUndefined();
  });

  it("parses a valid step decorator with color", () => {
    expect(StepDecoratorSchema.parse({ number: 1, color: "#ff0000" }).color).toBe("#ff0000");
  });

  it("accepts CSS color names", () => {
    expect(StepDecoratorSchema.parse({ number: 1, color: "red" }).color).toBe("red");
  });

  it("rejects missing number", () => {
    expect(() => StepDecoratorSchema.parse({})).toThrow();
  });

  it("rejects non-integer number", () => {
    expect(() => StepDecoratorSchema.parse({ number: 1.5 })).toThrow();
  });

  it("rejects number less than 1", () => {
    expect(() => StepDecoratorSchema.parse({ number: 0 })).toThrow();
  });

  it("accepts large step numbers", () => {
    expect(StepDecoratorSchema.parse({ number: 99 }).number).toBe(99);
  });
});

describe("ComponentSchema.step decorator", () => {
  const base = {
    id: "c1",
    label: { name: "X" },
    type: "component",
    position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.3 } },
  };

  it("accepts a component without a step (backward compat)", () => {
    expect(ComponentSchema.parse(base).step).toBeUndefined();
  });

  it("accepts a component with a step decorator", () => {
    const result = ComponentSchema.parse({ ...base, step: { number: 2, color: "blue" } });
    expect(result.step?.number).toBe(2);
    expect(result.step?.color).toBe("blue");
  });

  it("rejects an invalid step decorator (missing number)", () => {
    expect(() => ComponentSchema.parse({ ...base, step: { color: "red" } })).toThrow();
  });
});
