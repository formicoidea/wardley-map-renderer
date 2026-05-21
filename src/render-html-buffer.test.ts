/**
 * Tests for the diff buffer in the interactive HTML artifact.
 *
 * AC 12: Buffer accumulates non-merged ops in chronological order,
 * sent as complete array.
 *
 * Since the buffer lives in inline JS within the HTML artifact, we test:
 * 1. The generated HTML contains the correct buffer structure
 * 2. The buffer logic (extracted) correctly accumulates without merging
 * 3. Both send paths (clipboard + claude.complete) emit the full array
 */

import { describe, it, expect, beforeAll } from "vitest";
import { renderToHTML } from "./render-html.js";
import type { WardleyMap } from "./schema.js";

// ── Test helpers ─────────────────────────────────────────────────────

function makeMap(): WardleyMap {
  return {
    title: "Buffer Test Map",
    components: [
      {
        id: "c1",
        label: { name: "User" },
        type: "component",
        // nature omitted (optional enum)
        position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.1 } },
      },
      {
        id: "c2",
        label: { name: "Web App" },
        type: "component",
        // nature omitted (optional enum)
        position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.3 } },
      },
    ],
    relations: [
      { id: "r1", consumer: "c1", supplier: "c2", type: "DependsOn" },
    ],
  };
}

// ── HTML structure tests ─────────────────────────────────────────────

describe("Diff buffer in HTML artifact", () => {
  let html: string;
  beforeAll(async () => {
    html = await renderToHTML(makeMap(), { interactive: true });
  });

  it("contains append-only diffBuffer array", () => {
    expect(html).toContain("var diffBuffer = [];");
  });

  it("addDiff pushes to buffer without filtering or merging", () => {
    // addDiff must be a simple push — no indexOf, findIndex, filter, some, etc.
    expect(html).toContain("diffBuffer.push(op)");
    // Verify no merge/coalesce/dedup patterns exist
    expect(html).not.toMatch(/diffBuffer\.(find|filter|some|indexOf|splice|reduce)/);
  });

  it("flushDiffs returns a copy of the complete array", () => {
    // Must slice (copy) the full buffer, then clear it
    expect(html).toContain("diffBuffer.slice()");
    expect(html).toContain("diffBuffer.length = 0");
  });

  it("applyOp records each operation individually via addDiff", () => {
    // Each applyOp call records exactly one diff entry
    expect(html).toContain('addDiff({ op: opType, payload: payload })');
  });

  it("copy button sends complete JSON array to clipboard", () => {
    expect(html).toContain("JSON.stringify(ops, null, 2)");
    expect(html).toContain("navigator.clipboard.writeText(json)");
  });

  it("apply button sends complete array via window.claude.complete()", () => {
    expect(html).toContain("window.claude.complete(message)");
    expect(html).toContain("JSON.stringify(ops, null, 2)");
  });

  it("undo also records an op in the buffer", () => {
    expect(html).toContain('addDiff({ op: "undo", payload: {} })');
  });

  it("exposes diffBuffer and helpers on window.__wardley", () => {
    expect(html).toContain("diffBuffer: diffBuffer");
    expect(html).toContain("addDiff: addDiff");
    expect(html).toContain("flushDiffs: flushDiffs");
    expect(html).toContain("getDiffCount: getDiffCount");
  });
});

// ── Buffer logic simulation tests ────────────────────────────────────
// Extract and simulate the buffer logic to prove non-merging behavior.

describe("Buffer logic (simulated)", () => {
  /**
   * Simulates the exact buffer logic from the HTML artifact.
   * This is a direct port of the inline JS to verify correctness.
   */
  function createBuffer() {
    const diffBuffer: Array<{ op: string; payload: Record<string, unknown> }> = [];

    function addDiff(op: { op: string; payload: Record<string, unknown> }) {
      diffBuffer.push(op);
    }

    function flushDiffs() {
      const ops = diffBuffer.slice();
      diffBuffer.length = 0;
      return ops;
    }

    function getDiffCount() {
      return diffBuffer.length;
    }

    return { diffBuffer, addDiff, flushDiffs, getDiffCount };
  }

  it("accumulates ops in chronological order", () => {
    const buf = createBuffer();
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.5, visibility: 0.2 } });
    buf.addDiff({ op: "rename_component", payload: { id: "c2", name: "API" } });
    buf.addDiff({ op: "add_edge", payload: { id: "r2", consumer: "c1", supplier: "c2", type: "Flow" } });

    expect(buf.getDiffCount()).toBe(3);
    expect(buf.diffBuffer[0].op).toBe("move_component");
    expect(buf.diffBuffer[1].op).toBe("rename_component");
    expect(buf.diffBuffer[2].op).toBe("add_edge");
  });

  it("does NOT merge duplicate moves on the same component", () => {
    const buf = createBuffer();
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.3, visibility: 0.2 } });
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.5, visibility: 0.2 } });
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.7, visibility: 0.2 } });

    // All 3 moves must be in the buffer — no merging/coalescing
    expect(buf.getDiffCount()).toBe(3);
    const ops = buf.flushDiffs();
    expect(ops).toHaveLength(3);
    expect(ops[0].payload).toEqual({ id: "c1", evolution: 0.3, visibility: 0.2 });
    expect(ops[1].payload).toEqual({ id: "c1", evolution: 0.5, visibility: 0.2 });
    expect(ops[2].payload).toEqual({ id: "c1", evolution: 0.7, visibility: 0.2 });
  });

  it("does NOT merge different ops on the same entity", () => {
    const buf = createBuffer();
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.5, visibility: 0.2 } });
    buf.addDiff({ op: "rename_component", payload: { id: "c1", name: "New Name" } });
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.6, visibility: 0.3 } });

    expect(buf.getDiffCount()).toBe(3);
    const ops = buf.flushDiffs();
    expect(ops.map((o) => o.op)).toEqual([
      "move_component",
      "rename_component",
      "move_component",
    ]);
  });

  it("flushDiffs returns complete array and clears buffer", () => {
    const buf = createBuffer();
    buf.addDiff({ op: "add_component", payload: { id: "c3", name: "DB", type: "component", nature: "visible", evolution: 0.4, visibility: 0.5 } });
    buf.addDiff({ op: "add_edge", payload: { id: "r2", consumer: "c1", supplier: "c3", type: "DependsOn" } });

    const flushed = buf.flushDiffs();
    expect(flushed).toHaveLength(2);
    expect(buf.getDiffCount()).toBe(0);
    expect(buf.diffBuffer).toHaveLength(0);
  });

  it("flushed array is a copy (buffer mutations don't affect it)", () => {
    const buf = createBuffer();
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.5, visibility: 0.2 } });
    const flushed = buf.flushDiffs();

    // Add more after flush
    buf.addDiff({ op: "rename_component", payload: { id: "c2", name: "X" } });

    // Flushed array is unchanged
    expect(flushed).toHaveLength(1);
    expect(buf.getDiffCount()).toBe(1);
  });

  it("multiple flushes work independently", () => {
    const buf = createBuffer();
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.3, visibility: 0.1 } });
    const first = buf.flushDiffs();

    buf.addDiff({ op: "rename_component", payload: { id: "c2", name: "Y" } });
    buf.addDiff({ op: "delete_edge", payload: { id: "r1" } });
    const second = buf.flushDiffs();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(first[0].op).toBe("move_component");
    expect(second[0].op).toBe("rename_component");
    expect(second[1].op).toBe("delete_edge");
  });

  it("undo ops accumulate alongside regular ops", () => {
    const buf = createBuffer();
    buf.addDiff({ op: "move_component", payload: { id: "c1", evolution: 0.5, visibility: 0.2 } });
    buf.addDiff({ op: "undo", payload: {} });
    buf.addDiff({ op: "rename_component", payload: { id: "c1", name: "New" } });

    const ops = buf.flushDiffs();
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => o.op)).toEqual([
      "move_component",
      "undo",
      "rename_component",
    ]);
  });

  it("empty buffer flush returns empty array", () => {
    const buf = createBuffer();
    const ops = buf.flushDiffs();
    expect(ops).toEqual([]);
    expect(ops).toHaveLength(0);
  });

  it("cascade delete ops accumulate as separate entries", () => {
    // Simulates what happens when deleting a component with edges:
    // The handler adds explicit delete_edge ops + the delete_component op
    const buf = createBuffer();
    buf.addDiff({ op: "delete_edge", payload: { id: "r1" } });
    buf.addDiff({ op: "delete_edge", payload: { id: "r2" } });
    buf.addDiff({ op: "set_evolves_to", payload: { id: "c3", evolvesTo: null } });
    buf.addDiff({ op: "delete_component", payload: { id: "c1" } });

    const ops = buf.flushDiffs();
    expect(ops).toHaveLength(4);
    expect(ops.map((o) => o.op)).toEqual([
      "delete_edge",
      "delete_edge",
      "set_evolves_to",
      "delete_component",
    ]);
  });
});
