import { describe, it, expect } from "vitest";
import { renderToSVG } from "../render-orchestrator.js";
import { WardleyMapSchema } from "../schema.js";

const pos = (evolution: number, visibility: number) => ({ evolution: { scalar: evolution }, visibility: { scalar: visibility } });
const map = WardleyMapSchema.parse({
  title: "Notes",
  components: [{ id: "a", label: { name: "A" }, type: "component", position: pos(0.3, 0.3), step: { number: 2, color: "#0055aa" } }],
  relations: [],
  notes: [
    { id: "free", text: "Libre\nligne 2", position: pos(0.5, 0.5) },
    { id: "s2", title: "Co-évolution", text: "Texte du step", position: pos(0.6, 0.7), step: 2 },
    { id: "s9", text: "Step absent", position: pos(0.1, 0.9), step: 9 },
  ],
});

describe("notes layer", () => {
  it("draws free text (multi-line) and step texts with the step's sticker", () => {
    const svg = renderToSVG(map);
    expect(svg).toContain("Libre");
    expect(svg).toContain(">ligne 2</tspan>");
    // Step 2 card: border, sticker and bold title in the component's step colour.
    expect(svg).toMatch(/stroke="#0055aa"/);
    expect(svg).toMatch(/<circle[^>]*fill="#0055aa"/);
    expect(svg).toMatch(/font-weight="bold" fill="#0055aa"><tspan[^>]*>Co-évolution</);
    // Unknown step → default step red.
    expect(svg).toMatch(/<circle[^>]*fill="#cc0000" \/><text[^>]*>9</);
    expect(svg).toContain("Texte du step");
  });

  it("marks notes as hit groups in interactive mode only", () => {
    expect(renderToSVG(map)).not.toContain('data-kind="note"');
    expect(renderToSVG(map, { interactive: true })).toContain('data-id="s2" data-kind="note"');
  });
});
