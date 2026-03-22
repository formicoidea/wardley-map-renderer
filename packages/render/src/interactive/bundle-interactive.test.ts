/**
 * Tests for esbuild interactive bundle compilation.
 */
import { describe, it, expect } from "vitest";
import { bundleInteractive, wrapInScriptTag } from "../../scripts/bundle-interactive.js";

describe("bundle-interactive", () => {
  it("produces a non-empty JS string", async () => {
    const code = await bundleInteractive();
    expect(code.length).toBeGreaterThan(0);
    expect(typeof code).toBe("string");
  });

  it("produces an IIFE (self-executing function)", async () => {
    const code = await bundleInteractive();
    // esbuild IIFE wraps in (() => { ... })();
    expect(code).toContain("(()=>");
    expect(code.trimEnd().endsWith("})();")).toBe(true);
  });

  it("bundles svg-primitives functions inline (no imports)", async () => {
    const code = await bundleInteractive();
    // Should NOT contain import/require statements
    expect(code).not.toContain("import ");
    expect(code).not.toContain("require(");
    // Should contain inlined svg-primitive code (e.g., the esc function logic)
    expect(code).toContain("&amp;");
    expect(code).toContain("&lt;");
  });

  it("contains the bootstrap log message", async () => {
    const code = await bundleInteractive();
    expect(code).toContain("wardley-interactive");
  });

  it("wrapInScriptTag wraps code in script tags", () => {
    const wrapped = wrapInScriptTag("console.log('hello');");
    expect(wrapped).toBe("<script>\nconsole.log('hello');\n</script>");
  });

  it("bundle has no external dependencies (fully self-contained)", async () => {
    const code = await bundleInteractive();
    // No dynamic imports or module references
    expect(code).not.toMatch(/from\s+["']/);
    expect(code).not.toContain("__require");
  });
});
