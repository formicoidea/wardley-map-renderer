/**
 * @file resolve-diagnostics.test.ts
 *
 * Tests for the runtime diagnostic collection infrastructure introduced in
 * Sub-AC 2 of AC 6.
 *
 * ## Coverage
 *
 * 1. `collectConfigDiagnostics` — pure inspector for TypeStyleMap fields:
 *    - detects unrecognized keys in `typeColors` (catchall schema)
 *    - returns empty diagnostics for fully-recognized configs
 *    - handles absent fields gracefully
 *    - detects unrecognized keys in `evolveStyles` / `nodeRadii` (defensive)
 *
 * 2. `resolveConfig` — end-to-end diagnostics flow:
 *    - `diagnostics.unrecognizedTypes` is populated with unrecognized string keys
 *    - `options.diagnosticsOut` receives the richer `UnrecognizedTypeEntry` objects
 *    - empty diagnostics for fully-recognized config
 *    - diagnosticsOut is independent per call (no cross-contamination)
 *
 * 3. `mapComponentType` — structured diagnostic log format:
 *    - console.warn emits JSON with code, dataType, recognitionLevel, message, hint
 *    - format does NOT fire for known types
 *    - format does NOT fire for the `_default` sentinel (idempotent)
 *
 * 4. Supporting utilities:
 *    - `createDiagnosticsCollector` creates a fresh empty container
 *    - `EMPTY_RESOLVE_DIAGNOSTICS` is frozen with empty arrays
 *    - `RenderableTypeRecognitionLevel` type covers "known" and "unrecognized"
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  collectConfigDiagnostics,
  createDiagnosticsCollector,
  EMPTY_RESOLVE_DIAGNOSTICS,
  type UnrecognizedTypeEntry,
  type ResolveDiagnostics,
} from "./resolve-diagnostics.js";
import { resolveConfig, EMPTY_RENDER_DIAGNOSTICS } from "./resolve-conflict.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cfg = (viewer: any, author: any, opts?: any) => resolveConfig(viewer, author, opts);
import { mapComponentType } from "./renderable-type.js";

// ── 1. collectConfigDiagnostics — pure TypeStyleMap key inspector ──────────

describe("collectConfigDiagnostics — typeColors (catchall schema)", () => {
  it("returns empty diagnostics for a fully-recognized typeColors map", () => {
    const diag = collectConfigDiagnostics({
      typeColors: { _default: "#000", component: "#f00", anchor: "#00f" },
    });
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });

  it("returns empty diagnostics when typeColors only has _default", () => {
    const diag = collectConfigDiagnostics({
      typeColors: { _default: "#000" },
    });
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });

  it("detects a single unrecognized key in typeColors", () => {
    const diag = collectConfigDiagnostics({
      typeColors: { _default: "#000", "future-type": "#f00" },
    });
    expect(diag.unrecognizedTypes).toHaveLength(1);
    const entry: UnrecognizedTypeEntry = diag.unrecognizedTypes[0];
    expect(entry.type).toBe("future-type");
    expect(entry.field).toBe("typeColors");
    expect(entry.recognitionLevel).toBe("unrecognized");
  });

  it("detects multiple unrecognized keys in typeColors", () => {
    const diag = collectConfigDiagnostics({
      typeColors: {
        _default: "#000",
        component: "#f00",       // known — not reported
        "custom-type": "#0f0",   // unknown — reported
        "legacy-widget": "#00f", // unknown — reported
      },
    });
    const types = diag.unrecognizedTypes.map((e) => e.type);
    expect(types).toContain("custom-type");
    expect(types).toContain("legacy-widget");
    expect(types).not.toContain("component");
    expect(types).not.toContain("_default");
    expect(diag.unrecognizedTypes).toHaveLength(2);
  });

  it("does NOT report any KNOWN_RENDERABLE_TYPES keys as unrecognized", () => {
    const diag = collectConfigDiagnostics({
      typeColors: {
        _default: "#000",
        component: "#f00",
        "user-need": "#0f0",
        pipeline: "#00f",
        note: "#ff0",
        anchor: "#f0f",
      },
    });
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });

  it("does NOT report _default as unrecognized", () => {
    const diag = collectConfigDiagnostics({
      typeColors: { _default: "#000", "bad-key": "#111" },
    });
    const types = diag.unrecognizedTypes.map((e) => e.type);
    expect(types).not.toContain("_default");
    expect(types).toContain("bad-key");
  });

  it("returns empty diagnostics when typeColors is absent", () => {
    const diag = collectConfigDiagnostics({});
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });
});

describe("collectConfigDiagnostics — evolveStyles (defensive inspection)", () => {
  it("returns empty diagnostics for a fully-recognized evolveStyles map", () => {
    const diag = collectConfigDiagnostics({
      evolveStyles: {
        _default: { stroke: "#666" },
        natural: { stroke: "#f00" },
        ecosystem: { stroke: "#0f0" },
        forced: { stroke: "#00f" },
        late: { stroke: "#ff0" },
      },
    });
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });

  it("detects unrecognized evolveStyles key (pre-Zod bypass scenario)", () => {
    // In practice Zod rejects these at parse time (strict schema),
    // but collectConfigDiagnostics is called post-Zod with typed-cast inputs
    // so the function still needs to handle pre-parse or manually assembled configs.
    const fakeMap = { _default: {}, "genesis-zone": {} } as Record<string, unknown>;
    const diag = collectConfigDiagnostics({ evolveStyles: fakeMap });
    const entry = diag.unrecognizedTypes.find((e) => e.type === "genesis-zone");
    expect(entry).toBeDefined();
    expect(entry?.field).toBe("evolveStyles");
    expect(entry?.recognitionLevel).toBe("unrecognized");
  });

  it("returns empty diagnostics when evolveStyles is absent", () => {
    const diag = collectConfigDiagnostics({});
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });
});

describe("collectConfigDiagnostics — nodeRadii (defensive inspection)", () => {
  it("returns empty diagnostics for a fully-recognized nodeRadii map", () => {
    const diag = collectConfigDiagnostics({
      nodeRadii: {
        _default: 5 as unknown as Record<string, unknown>,
        component: 6 as unknown as Record<string, unknown>,
        anchor: 4 as unknown as Record<string, unknown>,
      } as Record<string, unknown>,
    });
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });

  it("returns empty diagnostics when nodeRadii is absent", () => {
    const diag = collectConfigDiagnostics({});
    expect(diag.unrecognizedTypes).toHaveLength(0);
  });
});

describe("collectConfigDiagnostics — multi-field inspection", () => {
  it("aggregates unrecognized entries from typeColors and evolveStyles", () => {
    const fakeEvolve = { "genesis-phase": {} } as Record<string, unknown>;
    const diag = collectConfigDiagnostics({
      typeColors: { _default: "#000", "future-widget": "#f00" },
      evolveStyles: fakeEvolve,
    });
    expect(diag.unrecognizedTypes.length).toBeGreaterThanOrEqual(2);
    const fields = diag.unrecognizedTypes.map((e) => e.field);
    expect(fields).toContain("typeColors");
    expect(fields).toContain("evolveStyles");
  });

  it("returns ResolveDiagnostics shape (unrecognizedTypes array)", () => {
    const diag: ResolveDiagnostics = collectConfigDiagnostics({ typeColors: { _default: "#000" } });
    expect(Array.isArray(diag.unrecognizedTypes)).toBe(true);
  });
});

// ── 2. resolveConfig — end-to-end diagnostics flow ────────────────────────

describe("resolveConfig — diagnostics.unrecognizedTypes (string[] in RenderDiagnostics)", () => {
  it("returns empty unrecognizedTypes for a fully-recognized config", () => {
    const { diagnostics } = cfg(
      {},
      { styling: { palette: { _default: "#000", component: "#f00" } } },
    );
    expect(diagnostics.unrecognizedTypes).toHaveLength(0);
  });

  it("returns empty unrecognizedTypes when palette is absent", () => {
    const { diagnostics } = cfg({}, {});
    expect(diagnostics.unrecognizedTypes).toHaveLength(0);
  });

  it("populates unrecognizedTypes with the unrecognized key string when typeColors has unknown key", () => {
    // typeColors uses .catchall() — Zod accepts any key, but render vocab doesn't
    const { diagnostics } = cfg(
      {},
      { styling: { palette: { _default: "#000", "future-type": "#f00" } } } as never,
    );
    expect(diagnostics.unrecognizedTypes).toContain("future-type");
    expect(diagnostics.unrecognizedTypes).not.toContain("_default");
  });

  it("populates unrecognizedTypes with multiple unrecognized key strings", () => {
    const { diagnostics } = cfg(
      {},
      {
        styling: {
          palette: {
            _default: "#000",
            component: "#f00",   // known
            "stale-type": "#0f0", // unknown
            "legacy-node": "#00f", // unknown
          },
        },
      } as never,
    );
    expect(diagnostics.unrecognizedTypes).toContain("stale-type");
    expect(diagnostics.unrecognizedTypes).toContain("legacy-node");
    expect(diagnostics.unrecognizedTypes).not.toContain("component");
    expect(diagnostics.unrecognizedTypes).not.toContain("_default");
  });

  it("does not throw when unrecognized typeColors keys are present (graceful diagnostics)", () => {
    expect(() =>
      cfg(
        {},
        { styling: { palette: { _default: "#000", "unknown-key": "#fff" } } } as never,
      ),
    ).not.toThrow();
  });

  it("diagnostics.constraintViolations is still empty [] from stub", () => {
    const { diagnostics } = cfg({}, {});
    expect(diagnostics.constraintViolations).toEqual([]);
  });

  it("diagnostics.warnings is still empty [] from stub", () => {
    const { diagnostics } = cfg({}, {});
    expect(diagnostics.warnings).toEqual([]);
  });
});

describe("resolveConfig — options.diagnosticsOut (richer UnrecognizedTypeEntry)", () => {
  it("populates diagnosticsOut.unrecognizedTypes with UnrecognizedTypeEntry objects", () => {
    const collector = createDiagnosticsCollector();
    cfg(
      {},
      { styling: { palette: { _default: "#000", "future-type": "#f00" } } } as never,
      { diagnosticsOut: collector },
    );
    expect(collector.unrecognizedTypes).toHaveLength(1);
    const entry = collector.unrecognizedTypes[0];
    expect(entry.type).toBe("future-type");
    expect(entry.field).toBe("typeColors");
    expect(entry.recognitionLevel).toBe("unrecognized");
  });

  it("does not modify diagnosticsOut when config has no unrecognized types", () => {
    const collector = createDiagnosticsCollector();
    cfg(
      {},
      { styling: { palette: { _default: "#000", component: "#f00" } } },
      { diagnosticsOut: collector },
    );
    expect(collector.unrecognizedTypes).toHaveLength(0);
  });

  it("diagnosticsOut contains entries per field (typeColors field label)", () => {
    const collector = createDiagnosticsCollector();
    cfg(
      {},
      {
        styling: {
          palette: {
            _default: "#000",
            "unknown-a": "#f00",
            "unknown-b": "#0f0",
          },
        },
      } as never,
      { diagnosticsOut: collector },
    );
    const fields = collector.unrecognizedTypes.map((e) => e.field);
    // All entries should report typeColors as the field
    expect(fields.every((f) => f === "typeColors")).toBe(true);
    expect(collector.unrecognizedTypes).toHaveLength(2);
  });

  it("diagnosticsOut is independent between calls (no cross-contamination)", () => {
    const collector1 = createDiagnosticsCollector();
    const collector2 = createDiagnosticsCollector();

    cfg(
      {},
      { styling: { palette: { _default: "#000", "type-x": "#f00" } } } as never,
      { diagnosticsOut: collector1 },
    );
    cfg(
      {},
      { styling: { palette: { _default: "#000", component: "#00f" } } }, // no unknown keys
      { diagnosticsOut: collector2 },
    );

    expect(collector1.unrecognizedTypes).toHaveLength(1);
    expect(collector1.unrecognizedTypes[0].type).toBe("type-x");
    expect(collector2.unrecognizedTypes).toHaveLength(0);
  });

  it("diagnosticsOut is optional — omitting it does not affect returned diagnostics", () => {
    // When diagnosticsOut is absent, behavior is unchanged
    const { diagnostics, config } = cfg(
      {},
      { styling: { palette: { _default: "#000", "future-type": "#f00" } } } as never,
      // no diagnosticsOut
    );
    expect(diagnostics.unrecognizedTypes).toContain("future-type");
    expect(config.styling?.palette).toBeDefined();
  });

  it("both diagnosticsOut and diagnostics.unrecognizedTypes are populated simultaneously", () => {
    const collector = createDiagnosticsCollector();
    const { diagnostics } = cfg(
      {},
      { styling: { palette: { _default: "#000", "phantom-type": "#aaa" } } } as never,
      { diagnosticsOut: collector },
    );

    // RenderDiagnostics string array
    expect(diagnostics.unrecognizedTypes).toContain("phantom-type");
    // DiagnosticsCollector richer entry
    expect(collector.unrecognizedTypes[0].type).toBe("phantom-type");
    expect(collector.unrecognizedTypes[0].field).toBe("typeColors");
  });
});

// ── 3. mapComponentType — structured diagnostic log format ────────────────

describe("mapComponentType — structured JSON diagnostic format", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a JSON-parseable console.warn for an unknown component type", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mapComponentType("unknown-widget");

    expect(warnSpy).toHaveBeenCalledOnce();
    const call = warnSpy.mock.calls[0][0] as string;

    // Starts with the expected prefix
    expect(call).toMatch(/^\[mapComponentType\] /);

    // JSON payload is parseable
    const json = call.replace("[mapComponentType] ", "");
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.code).toBe("UNRECOGNIZED_RENDERABLE_TYPE");
    expect(parsed.dataType).toBe("unknown-widget");
    expect(parsed.recognitionLevel).toBe("unrecognized");
    expect(typeof parsed.message).toBe("string");
    expect(typeof parsed.hint).toBe("string");
  });

  it("structured entry includes the unrecognized dataType verbatim", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mapComponentType("custom-plugin:node");

    const call = warnSpy.mock.calls[0][0] as string;
    const json = call.replace("[mapComponentType] ", "");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.dataType).toBe("custom-plugin:node");
  });

  it("does NOT emit console.warn for a known component type", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mapComponentType("component");
    mapComponentType("anchor");
    mapComponentType("pipeline");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT emit console.warn for the _default sentinel (idempotent)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mapComponentType("_default");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("structured entry message mentions the unknown dataType in human-readable form", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mapComponentType("stale-type");

    const call = warnSpy.mock.calls[0][0] as string;
    expect(call).toContain("stale-type");
    const json = call.replace("[mapComponentType] ", "");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.message).toContain("stale-type");
  });

  it("structured entry hint field is present and non-empty", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mapComponentType("future-node");

    const call = warnSpy.mock.calls[0][0] as string;
    const json = call.replace("[mapComponentType] ", "");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(typeof parsed.hint).toBe("string");
    expect((parsed.hint as string).length).toBeGreaterThan(0);
  });
});

// ── 4. Supporting utilities ────────────────────────────────────────────────

describe("createDiagnosticsCollector", () => {
  it("creates a fresh collector with an empty unrecognizedTypes array", () => {
    const collector = createDiagnosticsCollector();
    expect(collector.unrecognizedTypes).toEqual([]);
    expect(Array.isArray(collector.unrecognizedTypes)).toBe(true);
  });

  it("each call returns a new independent collector instance", () => {
    const c1 = createDiagnosticsCollector();
    const c2 = createDiagnosticsCollector();
    c1.unrecognizedTypes.push({
      type: "test",
      field: "typeColors",
      recognitionLevel: "unrecognized",
    });
    expect(c2.unrecognizedTypes).toHaveLength(0);
  });

  it("collector.unrecognizedTypes is mutable — entries can be pushed", () => {
    const collector = createDiagnosticsCollector();
    const entry: UnrecognizedTypeEntry = {
      type: "custom",
      field: "typeColors",
      recognitionLevel: "unrecognized",
    };
    expect(() => collector.unrecognizedTypes.push(entry)).not.toThrow();
    expect(collector.unrecognizedTypes).toHaveLength(1);
    expect(collector.unrecognizedTypes[0]).toEqual(entry);
  });
});

describe("EMPTY_RESOLVE_DIAGNOSTICS", () => {
  it("has an empty unrecognizedTypes array", () => {
    expect(EMPTY_RESOLVE_DIAGNOSTICS.unrecognizedTypes).toEqual([]);
  });

  it("is frozen — cannot be mutated", () => {
    expect(Object.isFrozen(EMPTY_RESOLVE_DIAGNOSTICS)).toBe(true);
  });

  it("unrecognizedTypes array is also frozen", () => {
    expect(Object.isFrozen(EMPTY_RESOLVE_DIAGNOSTICS.unrecognizedTypes)).toBe(true);
  });
});

describe("EMPTY_RENDER_DIAGNOSTICS (baseline from Sub-AC 1)", () => {
  it("has empty unrecognizedTypes, constraintViolations, warnings", () => {
    expect(EMPTY_RENDER_DIAGNOSTICS.unrecognizedTypes).toEqual([]);
    expect(EMPTY_RENDER_DIAGNOSTICS.constraintViolations).toEqual([]);
    expect(EMPTY_RENDER_DIAGNOSTICS.warnings).toEqual([]);
  });
});
