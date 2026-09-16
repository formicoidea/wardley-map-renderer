// @vitest-environment happy-dom
/**
 * Controller smoke test: template + server SVG + interactive.ts in a DOM,
 * driven by dispatched pointer/keyboard events. One editor instance; the
 * steps run in order and share state.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { DiffOp } from "../diff-ops-apply.js";
import { pxToMap, renderSVGFromPrepared } from "../render/browser-render.js";
import { prepareRender } from "../render/prepare-render.js";
import { sanitizeMap, type WardleyMap } from "../schema.js";
import { initEditor } from "./interactive.js";

const pos = (evolution: number, visibility: number) => ({ evolution: { scalar: evolution }, visibility: { scalar: visibility } });
const MAP = sanitizeMap({
  title: "Tea",
  components: [
    { id: "a", label: { name: "Alpha" }, type: "component", position: pos(0.3, 0.3) },
    { id: "title", label: { name: "Kettle" }, type: "component", position: pos(0.7, 0.7) },
    { id: "p", label: { name: "Brewing" }, type: "pipeline", position: pos(0.7, 0.9), pipelineGeometry: { evoStart: 0.5, evoEnd: 0.9, visStart: 0.85, visEnd: 0.95 } },
    { id: "m", label: { name: "Member" }, type: "component", position: pos(0.6, 0.9) },
  ],
  relations: [],
} as WardleyMap);

type Api = { getDiff(): DiffOp[]; getMap(): WardleyMap; undo(): boolean };
const api = () => (window as unknown as { __wardley: Api }).__wardley;
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as unknown as T;
const node = (id: string) => $(`#map [data-id="${id}"][data-kind=component]`).firstElementChild!;
const label = (id: string) => $(`#map [data-id="${id}"][data-kind=label]`);
const ptr = (el: Element, type: string, x: number, y: number, extra: PointerEventInit = {}) =>
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: "mouse", ...extra }));
// Each click lands somewhere new so unrelated clicks never pair up as a double click.
let spot = 0;
const click = (el: Element, x = (spot += 20)) => {
  ptr(el, "pointerdown", x, 5);
  ptr(el, "pointerup", x, 5);
};
const dblclick = (el: Element) => {
  click(el);
  click(el, spot);
};
const key = (el: Element, k: string, type = "keydown") => el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
const act = (name: string) => {
  const b = $<HTMLButtonElement>(`[data-action=${name}]`);
  ptr(b, "pointerdown", 0, 0); // a real click starts with one (resets the shell's post-pan click swallow)
  b.click();
};
const frame = () => new Promise((r) => setTimeout(r, 30));

beforeAll(() => {
  const prepared = prepareRender(MAP, { interactive: true });
  const json = (id: string, v: unknown) => `<script type="application/json" id="${id}">${JSON.stringify(v)}</script>`;
  const html = readFileSync("src/interactive/template.html", "utf-8")
    .replace("{{SVG}}", renderSVGFromPrepared(MAP, prepared))
    .replace("{{DATA}}", json("wardley-data", MAP) + json("wardley-prepared", prepared))
    .replace(/\{\{\w+\}\}/g, "");
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.head.innerHTML = doc.head.innerHTML;
  document.body.innerHTML = doc.body.innerHTML;
  document.body.dataset.editsEndpoint = "http://localhost/edits";
  // Layout-free DOM: 1 client px = 1 SVG unit.
  const svg = $<SVGSVGElement>("#map svg");
  const [, , w, h] = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
  $("#stage").getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h }) as DOMRect;
  initEditor(document);
});

describe("interactive controller", () => {
  it("select, drag, undo", async () => {
    click(node("a"));
    expect($<HTMLButtonElement>("[data-action=delete]").disabled).toBe(false);
    ptr(node("a"), "pointerdown", 100, 100);
    ptr(node("a"), "pointermove", 150, 100);
    await frame();
    ptr(node("a"), "pointerup", 150, 100);
    expect(api().getDiff()).toEqual([expect.objectContaining({ op: "move_component", payload: expect.objectContaining({ id: "a" }) })]);
    act("undo");
    expect(api().getDiff()).toEqual([]);
  });

  it("Escape during a drag drops the queued preview", async () => {
    ptr(node("a"), "pointerdown", 100, 100);
    ptr(node("a"), "pointermove", 300, 100);
    key(document.body, "Escape");
    await frame();
    const x = node("a").getAttribute("cx");
    expect(x).toBe(renderedCx("a"));
    ptr(node("a"), "pointerup", 300, 100);
    expect(api().getDiff()).toEqual([]);
  });

  it("dblclick renames a component whose id is 'title' (not the map title)", () => {
    dblclick(label("title"));
    const ta = $<HTMLTextAreaElement>(".wm-rename");
    expect(ta.getAttribute("aria-label")).toBe("Component name");
    ta.value = "Big kettle";
    key(ta, "Enter");
    expect(api().getDiff().at(-1)).toEqual({ op: "rename_component", payload: { id: "title", name: "Big kettle" } });
    expect(api().getMap().title).toBe("Tea");
  });

  it("dblclick on the map title renames the map and document.title follows", () => {
    dblclick($("#map [data-kind=title]"));
    const ta = $<HTMLTextAreaElement>(".wm-rename");
    expect(ta.getAttribute("aria-label")).toBe("Map title");
    ta.value = "Tea shop";
    key(ta, "Enter");
    expect(api().getDiff().at(-1)).toEqual({ op: "rename_map", payload: { title: "Tea shop" } });
    expect(document.title).toBe("Tea shop");
  });

  it("delete via toolbar, undo restores", () => {
    click(node("a"));
    act("delete");
    expect(api().getDiff().at(-1)).toEqual({ op: "delete_component", payload: { id: "a" } });
    act("undo");
    expect(api().getMap().components.map((c) => c.id)).toEqual(["a", "title", "p", "m"]);
  });

  it("Space+drag on a component pans instead of moving it", () => {
    const before = api().getDiff().length;
    const stage = $("#stage");
    const t0 = stage.style.transform;
    key(document.body, " ");
    ptr(node("a"), "pointerdown", 100, 100);
    ptr(node("a"), "pointermove", 160, 140);
    ptr(node("a"), "pointerup", 160, 140);
    key(document.body, " ", "keyup");
    expect(api().getDiff()).toHaveLength(before);
    expect(stage.style.transform).not.toBe(t0);
  });

  describe("link / evolve tools", () => {
    const centre = (e: Element) => ({ x: +e.getAttribute("cx")!, y: +e.getAttribute("cy")! });
    const handle = () => $(`#map [data-part=handle][data-id="p"]`).lastElementChild!;
    const handleXY = () => {
      const r = handle();
      return { x: +r.getAttribute("x")! + +r.getAttribute("width")! / 2, y: +r.getAttribute("y")! + +r.getAttribute("height")! / 2 };
    };
    /**
     * Drag from `from` (a to b); `under` is what the pointer is released over. Moves and
     * the release go to the viewport, as with pointer capture (`from` is re-rendered).
     */
    const drag = async (from: Element, a: { x: number; y: number }, b: { x: number; y: number }, under: Element) => {
      document.elementFromPoint = () => under;
      const vp = $("#viewport");
      ptr(from, "pointerdown", a.x, a.y);
      ptr(vp, "pointermove", (a.x + b.x) / 2, (a.y + b.y) / 2);
      ptr(vp, "pointermove", b.x, b.y);
      await frame();
      ptr(vp, "pointerup", b.x, b.y);
    };
    const svgRoot = () => $("#map svg");

    it("renders the pipeline handle as a hit target", () => {
      expect(handle().tagName.toLowerCase()).toBe("rect");
      expect($(`#map [data-part=handle][data-id="p"]`).getAttribute("data-kind")).toBe("pipeline");
    });

    it("evolve: drop in empty space → horizontal arrow at the pointer evolution (with a horizontal ghost)", async () => {
      key(document.body, "e");
      const a = centre(node("a"));
      const b = { x: a.x + 150, y: a.y + 40 };
      document.elementFromPoint = () => svgRoot();
      ptr(node("a"), "pointerdown", a.x, a.y);
      ptr(node("a"), "pointermove", b.x, b.y);
      const ghost = $("#overlay line");
      expect(ghost.getAttribute("y1")).toBe(ghost.getAttribute("y2"));
      expect(+ghost.getAttribute("x2")!).toBeCloseTo(b.x, -1);
      ptr(node("a"), "pointerup", b.x, b.y);
      const evolution = Math.round(pxToMap(prepareRender(MAP, { interactive: true }), b.x, b.y).evo * 1000) / 1000;
      expect(api().getDiff().at(-1)).toEqual({ op: "set_evolves_to", payload: { id: "a", position: { evolution, visibility: 0.3 } } });
      expect(api().getMap().components[0].evolvesTo).toHaveLength(1);
      expect($("#toast").textContent).not.toMatch(/Drop on/);
    });

    it("evolve: click source, click empty space", () => {
      const a = centre(node("title"));
      document.elementFromPoint = () => svgRoot();
      click(node("title"), a.x);
      ptr(svgRoot(), "pointerdown", a.x + 60, a.y + 90);
      ptr(svgRoot(), "pointerup", a.x + 60, a.y + 90);
      expect(api().getDiff().at(-1)).toMatchObject({ op: "set_evolves_to", payload: { id: "title", position: { visibility: 0.7 } } });
    });

    it("select: dragging the evolve arrow moves its head horizontally", async () => {
      key(document.body, "v");
      const arrow = $(`#map [data-id="a"][data-kind=evolve]`).firstElementChild!;
      const x2 = +arrow.getAttribute("x2")!, y = +arrow.getAttribute("y2")!;
      await drag(arrow, { x: x2, y }, { x: x2 + 30, y: y + 25 }, arrow);
      const op = api().getDiff().at(-1)!;
      expect(op).toMatchObject({ op: "set_evolves_to", payload: { id: "a", position: { visibility: 0.3 } } });
      expect((op.payload as { position: { evolution: number } }).position.evolution).toBeGreaterThan(api().getMap().components[0].position.evolution.scalar);
    });

    it("link: from the pipeline handle to a component, and from a component to the handle", async () => {
      key(document.body, "l");
      await drag(handle(), handleXY(), centre(node("a")), node("a"));
      expect(api().getDiff().at(-1)).toMatchObject({ op: "add_edge", payload: { consumer: "p", supplier: "a", type: "DependsOn" } });
      await drag(node("title"), centre(node("title")), handleXY(), handle());
      expect(api().getDiff().at(-1)).toMatchObject({ op: "add_edge", payload: { consumer: "title", supplier: "p" } });
      expect(api().getMap().relations.map((r) => [r.consumer, r.supplier])).toEqual([["p", "a"], ["title", "p"]]);
    });

    it("link: a member component inside the pipeline box wins over the box", async () => {
      const body = $(`#map [data-id="p"][data-kind=pipeline]`).firstElementChild!;
      await drag(node("a"), centre(node("a")), centre(node("m")), body);
      expect(api().getDiff().at(-1)).toMatchObject({ op: "add_edge", payload: { consumer: "a", supplier: "m" } });
      const empty = centre(node("m"));
      await drag(node("a"), centre(node("a")), { x: empty.x + 120, y: empty.y }, body);
      expect(api().getDiff().at(-1)).toMatchObject({ op: "add_edge", payload: { consumer: "a", supplier: "p" } });
    });

    it("select: dragging the handle square sets handleEvolution", async () => {
      key(document.body, "v");
      const h = handleXY();
      await drag(handle(), h, { x: h.x + 20, y: h.y + 30 }, handle());
      const op = api().getDiff().at(-1)!;
      expect(op).toMatchObject({ op: "resize_pipeline", payload: { id: "p" } });
      expect(Object.keys(op.payload)).toEqual(["id", "handleEvolution"]);
      expect(api().getMap().components.find((c) => c.id === "p")!.pipelineGeometry!.handleEvolution).toBeGreaterThan(0.7);
    });
  });

  it("send: clipboard keeps the diff; endpoint delivery checkpoints it", async () => {
    const n = api().getDiff().length;
    expect(n).toBeGreaterThan(0);
    const fetch = vi.fn(async () => ({ ok: false }));
    const writeText = vi.fn(async () => {});
    Object.assign(window, { fetch });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    act("send");
    await vi.waitFor(() => expect($("#toast").textContent).toMatch(/^Copied/));
    expect($("#toast").textContent).toBe(`Copied ${n} changes — paste them into Claude`);
    expect(api().getDiff()).toHaveLength(n);

    fetch.mockResolvedValue({ ok: true });
    act("send");
    await vi.waitFor(() => expect($("#toast").textContent).toBe(`Sent ${n} changes to Claude`));
    expect(api().getDiff()).toEqual([]);
    expect($("[data-diff-count]").hidden).toBe(true);
    expect($<HTMLButtonElement>("[data-action=undo]").disabled).toBe(true);
    expect(api().undo()).toBe(false);
  });
});

/** cx of a node as rendered from the current (committed) map. */
function renderedCx(id: string): string | null {
  const prepared = prepareRender(MAP, { interactive: true });
  const box = document.createElement("div");
  box.innerHTML = renderSVGFromPrepared(api().getMap(), prepared);
  return box.querySelector(`[data-id="${id}"][data-kind=component]`)!.firstElementChild!.getAttribute("cx");
}
