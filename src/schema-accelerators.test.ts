import { describe, it, expect } from "vitest";
import { ComponentSchema } from "./schema.js";

// Accelerator / deaccelerator are now COMPONENT DECORATORS (boolean flags),
// not standalone top-level entities.
describe("ComponentSchema accelerator / deaccelerator decorators", () => {
  const base = {
    id: "c1",
    label: { name: "Open Source" },
    type: "component",
    position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.3 } },
  };

  it("accepts a component without gameplay decorators", () => {
    const result = ComponentSchema.parse(base);
    expect(result.accelerator).toBeUndefined();
    expect(result.deaccelerator).toBeUndefined();
  });

  it("accepts an accelerator decorator", () => {
    expect(ComponentSchema.parse({ ...base, accelerator: true }).accelerator).toBe(true);
  });

  it("accepts a deaccelerator decorator", () => {
    expect(ComponentSchema.parse({ ...base, deaccelerator: true }).deaccelerator).toBe(true);
  });

  it("rejects a non-boolean accelerator", () => {
    expect(() => ComponentSchema.parse({ ...base, accelerator: "yes" })).toThrow();
  });

  it("rejects a non-boolean deaccelerator", () => {
    expect(() => ComponentSchema.parse({ ...base, deaccelerator: 1 })).toThrow();
  });
});
