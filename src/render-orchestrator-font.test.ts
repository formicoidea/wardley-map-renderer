/**
 * Regression: Inter must reach resvg as a file PATH (resvg-js 2.6.2
 * `font.fontFiles: string[]`), with system fonts disabled.
 */
import { describe, it, expect, vi } from "vitest";

const resvgOpts: any[] = [];
vi.mock("@resvg/resvg-js", () => ({
  Resvg: class {
    constructor(_svg: string, opts: any) {
      resvgOpts.push(opts);
    }
    render() {
      return { asPng: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]) };
    }
  },
}));

import { renderToPNG } from "./render-orchestrator.js";
import { WardleyMapSchema } from "./schema.js";

describe("rasterizeSVG font loading", () => {
  it("passes Inter-Regular.ttf as a path with loadSystemFonts=false", async () => {
    const map = WardleyMapSchema.parse({
      title: "Font",
      components: [
        { id: "a", label: { name: "A" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
    });
    await renderToPNG(map);

    const font = resvgOpts.at(-1)?.font;
    expect(font).toBeDefined();
    expect(typeof font.fontFiles[0]).toBe("string");
    expect(font.fontFiles[0]).toMatch(/Inter-Regular\.ttf$/);
    expect(font.loadSystemFonts).toBe(false);
    expect(font.defaultFontFamily).toBe("Inter");
  });
});
