import { describe, it, expect } from "vitest";
import {
  AcceleratorSchema,
  AcceleratorTypeEnum,
  WardleyMapSchema,
} from "./schema.js";

describe("AcceleratorTypeEnum", () => {
  it("accepts 'accelerator'", () => {
    expect(AcceleratorTypeEnum.parse("accelerator")).toBe("accelerator");
  });

  it("accepts 'deaccelerator'", () => {
    expect(AcceleratorTypeEnum.parse("deaccelerator")).toBe("deaccelerator");
  });

  it("rejects invalid values", () => {
    expect(() => AcceleratorTypeEnum.parse("blocker")).toThrow();
  });
});

describe("AcceleratorSchema", () => {
  const validAccelerator = {
    id: "acc-1",
    label: "Open Source",
    position: {
      evolution: { scalar: 0.6 },
      visibility: { scalar: 0.3 },
    },
    type: "accelerator" as const,
  };

  it("parses a valid accelerator", () => {
    const result = AcceleratorSchema.parse(validAccelerator);
    expect(result.id).toBe("acc-1");
    expect(result.label).toBe("Open Source");
    expect(result.type).toBe("accelerator");
    expect(result.position.evolution.scalar).toBe(0.6);
  });

  it("parses a valid deaccelerator", () => {
    const deacc = { ...validAccelerator, id: "deacc-1", type: "deaccelerator" as const };
    const result = AcceleratorSchema.parse(deacc);
    expect(result.type).toBe("deaccelerator");
  });

  it("rejects missing id", () => {
    const { id: _, ...noId } = validAccelerator;
    expect(() => AcceleratorSchema.parse(noId)).toThrow();
  });

  it("rejects missing label", () => {
    const { label: _, ...noLabel } = validAccelerator;
    expect(() => AcceleratorSchema.parse(noLabel)).toThrow();
  });

  it("rejects missing position", () => {
    const { position: _, ...noPos } = validAccelerator;
    expect(() => AcceleratorSchema.parse(noPos)).toThrow();
  });

  it("rejects invalid type", () => {
    expect(() =>
      AcceleratorSchema.parse({ ...validAccelerator, type: "blocker" })
    ).toThrow();
  });
});

describe("WardleyMapSchema.accelerators", () => {
  const minimalMap = {
    title: "Test",
    components: [],
    relations: [],
  };

  it("accepts a map without accelerators (backward compat)", () => {
    const result = WardleyMapSchema.parse(minimalMap);
    expect(result.accelerators).toBeUndefined();
  });

  it("accepts a map with empty accelerators array", () => {
    const result = WardleyMapSchema.parse({ ...minimalMap, accelerators: [] });
    expect(result.accelerators).toEqual([]);
  });

  it("accepts a map with accelerators", () => {
    const map = {
      ...minimalMap,
      accelerators: [
        {
          id: "acc-1",
          label: "Open Source",
          position: {
            evolution: { scalar: 0.65 },
            visibility: { scalar: 0.4 },
          },
          type: "accelerator",
        },
        {
          id: "deacc-1",
          label: "Regulation",
          position: {
            evolution: { scalar: 0.3 },
            visibility: { scalar: 0.5 },
          },
          type: "deaccelerator",
        },
      ],
    };
    const result = WardleyMapSchema.parse(map);
    expect(result.accelerators).toHaveLength(2);
    expect(result.accelerators![0].type).toBe("accelerator");
    expect(result.accelerators![1].type).toBe("deaccelerator");
  });

  it("rejects accelerators with invalid entries", () => {
    const map = {
      ...minimalMap,
      accelerators: [{ id: "bad" }], // missing required fields
    };
    expect(() => WardleyMapSchema.parse(map)).toThrow();
  });
});
