/**
 * Browser renderer parity: renderSVGFromPrepared(map, prepareRender(map)) must be
 * byte-identical to renderToSVG(map) — the editor re-renders with zero drift.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromMapKeep, sanitizeMap, WardleyMapSchema, type WardleyMap } from "../schema.js";
import { renderToSVG } from "../render-orchestrator.js";
import { renderSVGFromPrepared, pxToMap, mapToPx } from "./browser-render.js";
import { prepareRender } from "./prepare-render.js";
import type { RenderOptions } from "./types.js";

const MAPKEEP_JSON = join(import.meta.dirname ?? ".", "..", "..", "data", "mapkeep", "mapkeep-extracted-maps.json");

/** Mapkeep map with pipelines + evolve arrows, enriched with methods, steps, decorators, flows, legend. */
function mapkeepMap(): WardleyMap {
  const raw = (JSON.parse(readFileSync(MAPKEEP_JSON, "utf-8")) as Array<{ mapId: string }>)
    .find((m) => m.mapId === "01JAT0NX0NBHPMQQHD0T7B2MJ8");
  const map = fromMapKeep(raw);
  map.title = "Tea & <shop>";
  const plain = map.components.filter((c) => c.type === "component");
  plain[0].method = { category: "buying-policy", recommendation: "build" };
  plain[1].method = { category: "buying-policy", recommendation: "buy" };
  plain[2].step = { number: 1 };
  plain[3].step = { number: 2, color: "#2563eb" };
  plain[4].accelerator = true;
  plain[5].deaccelerator = true;
  plain[6].inertia = true;
  plain[7].evolvesTo = [{ position: { evolution: { scalar: 0.9 }, visibility: { scalar: plain[7].position.visibility.scalar } }, evolveType: "forced", inertia: true }];
  map.relations[0] = { ...map.relations[0], type: "Flow", flow: { label: "data", style: "dashed" } };
  map.renderConfig = { ...map.renderConfig, legend: { show: true } } as WardleyMap["renderConfig"];
  expect(map.components.some((c) => c.type === "pipeline")).toBe(true);
  expect(map.components.some((c) => c.evolvesTo?.length)).toBe(true);
  return map;
}

/** v3 renderConfig: theme, locale, text scale, method decorator legend, layer toggle, custom canvas. */
const v3Map = WardleyMapSchema.parse({
  title: "Tea shop",
  components: [
    { id: "u", label: { name: "Customer" }, type: "anchor", position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.05 } } },
    { id: "t", label: { name: "Cup of tea" }, type: "component", subtype: "market", position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.2 } }, method: { category: "buying-policy", recommendation: "outsource" } },
    { id: "k", label: { name: "Kettle\nelectric" }, type: "component", position: { evolution: { scalar: 0.35 }, visibility: { scalar: 0.6 } }, evolvesTo: [{ position: { evolution: { scalar: 0.62 }, visibility: { scalar: 0.6 } } }] },
    { id: "p", label: { name: "Power" }, type: "pipeline", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.85 } }, pipelineGeometry: { evoStart: 0.3, evoEnd: 0.9, visStart: 0.8, visEnd: 0.9 } },
  ],
  relations: [
    { id: "r1", consumer: "u", supplier: "t" },
    { id: "r2", consumer: "t", supplier: "k", type: "Constraint" },
    { id: "r3", consumer: "k", supplier: "p" },
  ],
  renderConfig: {
    display: { legend: true, notes: false },
    rendering: { locale: "fr", theme: "dark" },
    style: {
      global: { textScale: 1.2 },
      background: { canvas: { default: { width: 1200, height: 700, evolutionRange: [0.2, 1] } } },
      decorators: { method: { "buying-policy": { default: { color: "#16a34a", legend: { en: "Buying policy" } } } } },
    },
  },
});

const minimal: WardleyMap = { title: "", components: [], relations: [] };

const cases: Array<[string, WardleyMap, RenderOptions]> = [
  ["mapkeep (pipelines, evolve, methods, steps, legend) interactive", mapkeepMap(), { interactive: true }],
  ["v3 renderConfig (dark, fr, text scale, range)", v3Map, {}],
  ["minimal map with width override", minimal, { width: 900, height: 500 }],
];

describe("renderSVGFromPrepared", () => {
  for (const [name, raw, options] of cases) {
    it(`matches renderToSVG byte-for-byte: ${name}`, () => {
      // The page embeds the sanitized map; prepared travels as JSON.
      const map = sanitizeMap(raw);
      const prepared = JSON.parse(JSON.stringify(prepareRender(map, options)));
      const server = renderToSVG(map, options);
      expect(renderSVGFromPrepared(map, prepared)).toBe(server);
      expect(renderToSVG(raw, options)).toBe(server);
    });
  }

  it("emits the data-id / data-kind hit-testing contract in interactive mode", () => {
    const map = sanitizeMap(mapkeepMap());
    const svg = renderSVGFromPrepared(map, prepareRender(map, { interactive: true }));
    for (const kind of ["component", "pipeline", "relation", "label", "evolve", "title"]) {
      expect(svg).toContain(`data-kind="${kind}"`);
    }
    expect(svg).toContain(`data-id="${map.relations[0].id}" data-kind="relation"`);
    expect(renderToSVG(map)).not.toContain("data-kind");
  });
});

describe("pxToMap / mapToPx", () => {
  const prepared = prepareRender(v3Map, { width: 1000, height: 600 });

  it("round-trips map → px → map", () => {
    for (const [evo, vis] of [[0.2, 0], [1, 1], [0.37, 0.61], [0.5, 0.25]]) {
      const { x, y } = mapToPx(prepared, evo, vis);
      const back = pxToMap(prepared, x, y);
      expect(back.evo).toBeCloseTo(evo, 10);
      expect(back.vis).toBeCloseTo(vis, 10);
    }
  });

  it("uses the renderer's coordinate space (node centre matches the SVG)", () => {
    const map = sanitizeMap(v3Map);
    const p = prepareRender(map);
    const svg = renderSVGFromPrepared(map, p);
    const kettle = map.components.find((c) => c.id === "k")!;
    const { x, y } = mapToPx(p, kettle.position.evolution.scalar, kettle.position.visibility.scalar);
    expect(svg).toContain(`cx="${x}" cy="${y}"`);
  });
});
