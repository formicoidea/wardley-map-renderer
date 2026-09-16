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
  });

  it("embeds the interactive server SVG as first paint", () => {
    expect(html).toContain(renderToSVG(map(), { interactive: true }));
    expect(html).toContain('data-kind="component"');
    expect(html).toContain('data-id="a&quot;b"');
    // Legacy hit-test attributes are gone from the SVG (data-id/data-kind only).
    expect(renderToSVG(map(), { interactive: true })).not.toMatch(/data-(component-id|edge-id|label-for|pipeline-id|step-id|evolves-from|plot-area|handle)\b/);
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

describe("renderToHTML (injection)", () => {
  const evil = '"><script>alert(1)</script><x a="';
  const line = { override: { line: { color: `red${evil}`, dash: `4${evil}` } } };
  const hostile = (): WardleyMap => ({
    title: "T $' $& $` $$",
    components: [
      {
        id: `c${evil}`, label: { name: "C" }, type: "anchor", color: `#fff${evil}`,
        step: { number: 1, color: `#abc${evil}` }, method: { category: "build", recommendation: "x" },
        evolvesTo: [{ position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.5 } } }],
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
      },
      { id: `e${evil}`, label: { name: "E" }, type: "component", subtype: "ecosystem", position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.7 } } },
      {
        id: `p${evil}`, label: { name: "P" }, type: "pipeline", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.2 } },
        pipelineGeometry: { evoStart: 0.3, evoEnd: 0.7, visStart: 0.15, visEnd: 0.25 },
      },
    ],
    relations: [{ id: `r${evil}`, consumer: `c${evil}`, supplier: `e${evil}`, type: "Flow", flow: { label: `f${evil}` } }],
    renderConfig: {
      style: {
        global: { fontFamily: `Inter${evil}` },
        nodes: { default: { override: { symbol: { stroke: `#000${evil}` } } } },
        movement: { default: line, natural: line },
        decorators: { method: { build: { override: { color: `red${evil}`, legend: { x: "X", y: "Y", z: "Z" } } } } },
      },
    },
  }) as unknown as WardleyMap;

  it("never lets map/theme strings break out of an SVG attribute", async () => {
    for (const interactive of [false, true]) {
      const svg = renderToSVG(hostile(), { interactive });
      expect(svg).toContain("&quot;&gt;&lt;script&gt;"); // the payload did reach the markup, escaped
      const html = await renderToHTML(hostile(), { interactive });
      const body = html.slice(html.indexOf("<body"));
      expect(body).not.toContain('"><script');
      expect(body).not.toContain("<script>alert");
      expect(body).not.toContain("<x ");
    }
  });

  it("drops malformed hex colors", () => {
    const svg = renderToSVG(hostile());
    expect(svg).not.toContain("#fff&quot;");
    expect(svg).not.toContain("#abc&quot;");
  });

  it("inserts `$'` / `$&` from the title, endpoint and SVG verbatim", async () => {
    const endpoint = "http://127.0.0.1:1/e?$'$&$`";
    const html = await renderToHTML(hostile(), { interactive: true, editsEndpoint: endpoint });
    expect(html).toContain("<title>T $' $&amp; $` $$</title>");
    expect(html).toContain('<body data-edits-endpoint="http://127.0.0.1:1/e?$\'$&amp;$`">');
    expect(html.match(/<body\b/g)).toHaveLength(1);
    expect(html).toContain(renderToSVG(hostile(), { interactive: true }));
    expect(await renderToHTML(hostile())).toContain(renderToSVG(hostile()));
  });
});
