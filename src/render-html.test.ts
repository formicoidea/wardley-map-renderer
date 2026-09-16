/**
 * renderToHTML: static page vs interactive editor document.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { renderToHTML } from "./render-html.js";
import { renderToSVG } from "./render-orchestrator.js";
import { prepareRender } from "./render/prepare-render.js";
import { renderSVGFromPrepared } from "./render/browser-render.js";
import { sanitizeMap, type WardleyMap } from "./schema.js";

const map = (): WardleyMap => ({
  title: "Evil </script><!-- {{DATA}} & co",
  components: [
    { id: "u", label: { name: "User </script>" }, type: "anchor", position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.05 } } },
    { id: "a\"b", label: { name: "App $& {{BUNDLE}}" }, type: "component", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.4 } } },
  ],
  relations: [{ id: "r1", consumer: "u", supplier: "a\"b", type: "DependsOn" }],
}) as WardleyMap;

const jsonOf = (html: string, id: string) => {
  const m = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
  expect(m).not.toBeNull();
  return JSON.parse(m![1]);
};
const scripts = (html: string) => html.match(/<script\b/g)?.length ?? 0;

describe("renderToHTML (static)", () => {
  it("is a minimal page with the SVG and no script", async () => {
    const html = await renderToHTML(map());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Evil &lt;/script&gt;&lt;!-- {{DATA}} &amp; co</title>");
    expect(html).toContain(renderToSVG(map()));
    expect(scripts(html)).toBe(0);
    expect(html).not.toContain("data-kind=");
    expect(html.length).toBeLessThan(renderToSVG(map()).length + 1000);
  });
});

describe("renderToHTML (interactive)", () => {
  let html: string;
  beforeAll(async () => {
    html = await renderToHTML(map(), { interactive: true, editsEndpoint: "http://127.0.0.1:7777/edits?a=1&b=\"x\"" });
  });

  it("fills every template placeholder (user text containing one is not substituted)", async () => {
    const clean = await renderToHTML({ ...map(), title: "Clean", components: map().components.slice(0, 1), relations: [] }, { interactive: true });
    expect(clean).not.toMatch(/\{\{\w+\}\}/);
    expect(clean).toContain("<title>Clean</title>");
    expect(html.match(/\{\{DATA\}\}/g)!.length).toBe(3); // <title>, SVG title, JSON
    expect(html.match(/\{\{BUNDLE\}\}/g)!.length).toBe(2); // SVG label, JSON
    expect(html).toContain('<main id="viewport"');
    expect(html).toContain('<div id="map"><svg');
    expect(html).toContain('id="props"');
    expect(html).toContain("data-diff-count");
    expect(html).toMatch(/--map-bg:#[0-9a-f]+;/i);
  });

  it("embeds the interactive server SVG as first paint", () => {
    expect(html).toContain(renderToSVG(map(), { interactive: true }));
    expect(html).toContain('data-kind="component"');
    expect(html).toContain('data-id="a&quot;b"');
    expect(html).toContain('data-component-id="a&quot;b"');
  });

  it("embeds the sanitized map and the prepared render inputs", () => {
    expect(jsonOf(html, "wardley-data")).toEqual(sanitizeMap(map()));
    const prepared = jsonOf(html, "wardley-prepared");
    expect(prepared).toEqual(JSON.parse(JSON.stringify(prepareRender(map(), { interactive: true }))));
    // The browser renderer reproduces the embedded first paint from the embedded JSON.
    expect(renderSVGFromPrepared(jsonOf(html, "wardley-data"), prepared)).toBe(renderToSVG(map(), { interactive: true }));
  });

  it("escapes </script and <!-- inside JSON and the bundle", () => {
    const body = html.slice(html.indexOf("<body"));
    // Exactly 3 scripts (2 JSON + bundle), each properly closed.
    expect(scripts(body)).toBe(3);
    expect(body.match(/<\/script>/g)).toHaveLength(3);
    expect(body).not.toContain("<!--");
    expect(html).toContain("\\u003c/script>");
  });

  it("ships one bundle and no legacy inline editor", () => {
    expect(html).toContain("__wardley");
    expect(html).not.toMatch(/diffBuffer|render-constants|window\.claude\.complete|buildHTMLDocument/);
    expect(html).not.toMatch(/zod/i);
  });

  it("puts the edits endpoint on <body>, escaped", () => {
    expect(html).toContain('<body data-edits-endpoint="http://127.0.0.1:7777/edits?a=1&amp;b=&quot;x&quot;">');
  });

  it("omits the endpoint attribute by default", async () => {
    const plain = await renderToHTML(map(), { interactive: true });
    expect(plain).toContain("<body>");
    expect(plain).not.toContain("data-edits-endpoint");
  });
});
