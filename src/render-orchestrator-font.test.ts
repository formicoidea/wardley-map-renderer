/**
 * Regression: Inter must reach resvg as a file PATH (resvg-js 2.6.2
 * `font.fontFiles: string[]`), with system fonts disabled, and must include
 * the SemiBold/Bold files so font-weight 600/700 actually render bold.
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
  it("passes Inter Regular, SemiBold and Bold as paths with loadSystemFonts=false", async () => {
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
    expect(font.fontFiles.every((f: unknown) => typeof f === "string")).toBe(true);
    expect(font.fontFiles[0]).toMatch(/Inter-Regular\.ttf$/);
    expect(font.fontFiles.some((f: string) => /Inter-SemiBold\.ttf$/.test(f))).toBe(true);
    expect(font.fontFiles.some((f: string) => /Inter-Bold\.ttf$/.test(f))).toBe(true);
    expect(font.loadSystemFonts).toBe(false);
    expect(font.defaultFontFamily).toBe("Inter");
  });

  it("the resolved font set renders weights 400, 600 and 700 differently", async () => {
    await renderToPNG(WardleyMapSchema.parse({ title: "Font", components: [], relations: [] }));
    const font = resvgOpts.at(-1)!.font;
    const { Resvg } = await vi.importActual<typeof import("@resvg/resvg-js")>("@resvg/resvg-js");
    const png = (weight: number) =>
      Buffer.from(new Resvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="40">` +
        `<text x="5" y="28" font-family="Inter, sans-serif" font-size="24" font-weight="${weight}">Tea shop</text></svg>`,
        { font },
      ).render().asPng()).toString("base64");

    // With Regular only, 600/700 fall back to the 400 glyphs and render identically.
    expect(png(600)).not.toBe(png(400));
    expect(png(700)).not.toBe(png(600));
  });
});
