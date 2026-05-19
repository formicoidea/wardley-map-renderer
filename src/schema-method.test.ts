import { describe, it, expect } from "vitest";
import { ComponentSchema, MethodSchema, MethodEnum } from "./schema.js";

describe("MethodSchema", () => {
  it("accepts a valid method object with type and preconisation", () => {
    const result = MethodSchema.parse({ type: "build", preconisation: "recommended" });
    expect(result).toEqual({ type: "build", preconisation: "recommended" });
  });

  it("accepts any free string for type", () => {
    const result = MethodSchema.parse({ type: "custom-method", preconisation: "none" });
    expect(result.type).toBe("custom-method");
  });

  it("accepts any free string for preconisation", () => {
    const result = MethodSchema.parse({ type: "build", preconisation: "strongly advised" });
    expect(result.preconisation).toBe("strongly advised");
  });

  it("rejects missing type", () => {
    expect(() => MethodSchema.parse({ preconisation: "ok" })).toThrow();
  });

  it("rejects missing preconisation", () => {
    expect(() => MethodSchema.parse({ type: "build" })).toThrow();
  });

  it("rejects a plain string (old enum format)", () => {
    expect(() => MethodSchema.parse("build")).toThrow();
  });

  it("rejects empty object", () => {
    expect(() => MethodSchema.parse({})).toThrow();
  });

  it("MethodEnum is an alias for MethodSchema (backward compat)", () => {
    expect(MethodEnum).toBe(MethodSchema);
  });
});

describe("ComponentSchema.method", () => {
  const baseComponent = {
    id: "c1",
    label: { name: "CRM" },
    type: "component",
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

  it("accepts component with method object: build", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { type: "build", preconisation: "recommended" },
    });
    expect(result.method).toEqual({ type: "build", preconisation: "recommended" });
  });

  it("accepts component with method object: buy", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { type: "buy", preconisation: "default" },
    });
    expect(result.method?.type).toBe("buy");
  });

  it("accepts component with method object: outsource", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { type: "outsource", preconisation: "cost-driven" },
    });
    expect(result.method?.type).toBe("outsource");
  });

  it("accepts component with custom free-string method type", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { type: "lease", preconisation: "experimental" },
    });
    expect(result.method?.type).toBe("lease");
  });

  it("rejects old-style string method value", () => {
    expect(() =>
      ComponentSchema.parse({ ...baseComponent, method: "build" }),
    ).toThrow();
  });

  it("coexists with other optional fields (color, evolvesTo)", () => {
    const result = ComponentSchema.parse({
      ...baseComponent,
      method: { type: "buy", preconisation: "preferred" },
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
    expect(result.method?.type).toBe("buy");
    expect(result.color).toBe("blue-500");
    expect(result.evolvesTo).toHaveLength(1);
  });
});
