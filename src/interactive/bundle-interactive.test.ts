/**
 * The editor bundle: one self-contained, zod-free IIFE within the size budget.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { gzipSync } from "node:zlib";
import { bundleInteractive } from "../../scripts/bundle-interactive.js";

describe("bundle-interactive", () => {
  let code: string;
  beforeAll(async () => {
    code = await bundleInteractive();
  });

  it("is a self-contained IIFE", () => {
    expect(code).toMatch(/^("use strict";)?\(\(\)=>\{/);
    expect(code.trimEnd().endsWith("})();")).toBe(true);
    expect(code).not.toMatch(/\bimport\s*\(|\brequire\(|__require/);
  });

  it("does not pull in zod or node modules", () => {
    expect(code).not.toMatch(/zod|ZodError|node:fs|resvg/i);
  });

  it("contains the editor API and the shared renderer", () => {
    expect(code).toContain("__wardley");
    expect(code).toContain("wardley-prepared");
    expect(code).toContain("data-plot-area");
  });

  it("stays within the size budget (25 KB gzip)", () => {
    expect(gzipSync(code).length).toBeLessThan(25 * 1024);
  });
});
