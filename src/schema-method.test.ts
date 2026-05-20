import { describe, it, expect } from "vitest";
import { ComponentSchema, MethodSchema } from "./schema.js";

describe("MethodSchema", () => {
  it("accepts a valid method object with category and recommendation", () => {
    const result = MethodSchema.parse({ category: "buying-policy", recommendation: "Uncharted" });
    expect(result).toEqual({ category: "buying-policy", recommendation: "Uncharted" });
  });

  it("accepts any free string for category", () => {
    const result = MethodSchema.parse({ category: "custom-method", recommendation: "none" });
    expect(result.category).toBe("custom-method");
  });

  it("accepts any free string for recommendation", () => {
    const result = MethodSchema.parse({ category: "buying-policy", recommendation: "strongly advised" });
    expect(result.recommendation).toBe("strongly advised");
  });

  it("rejects missing category", () => {
    expect(() => MethodSchema.parse({ recommendation: "ok" })).toThrow();
  });

  it("rejects missing recommendation", () => {
    expect(() => MethodSchema.parse({ category: "buying-policy" })).toThrow();
  });

  it("rejects a plain string (old enum format)", () => {
    expect(() => MethodSchema.parse("build")).toThrow();
  });

  it("rejects empty object", () => {
    expect(() => MethodSchema.parse({})).toThrow();
  });
});

describe("ComponentSchema.method", () => {
  // component/functional carries a nature; method decorates it.
  const baseComponent = {
    id: "c1",
    label: { name: "CRM" },
    type: "component",
    subtype: "functional",
    nature: "activity",
    position: {
      evolution: { scalar: 0.7 },
      visibility: { scalar: 0.5 },
    },
  };

  it("accepts component without method (backward compat)", () => {
    const result = ComponentSchema.parse(baseComponent);
    expect(result.method).toBeUndefined();
  });

  it("accepts component with a method decorator", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { category: "buying-policy", recommendation: "Uncharted" },
    });
    expect(result.method).toEqual({ category: "buying-policy", recommendation: "Uncharted" });
  });

  it("accepts component with a custom method category", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { category: "lease-policy", recommendation: "experimental" },
    });
    expect(result.method?.category).toBe("lease-policy");
  });

  it("rejects old-style string method value", () => {
    expect(() =>
      ComponentSchema.parse({ ...baseComponent, method: "build" }),
    ).toThrow();
  });

  it("coexists with other optional fields (color, evolvesTo)", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { category: "buying-policy", recommendation: "preferred" },
      color: "blue-500",
      evolvesTo: [
        {
          position: {
            evolution: { scalar: 0.9 },
            visibility: { scalar: 0.5 },
          },
          evolveType: "natural",
        },
      ],
    });
    expect(result.method?.category).toBe("buying-policy");
    expect(result.color).toBe("blue-500");
    expect(result.evolvesTo).toHaveLength(1);
  });
});
