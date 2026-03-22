/**
 * Tests for @wardleyapi/mcp server — render_wardley_map tool behavior.
 *
 * @module mcp/mcp.test
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlers, callRenderApi, RENDER_TOOL, SERVER_INFO, CAPABILITIES } from "./index.js";

// ── Tool definition ─────────────────────────────────────────────────

describe("RENDER_TOOL definition", () => {
  it("exposes render_wardley_map with map, renderConfig, format params", () => {
    expect(RENDER_TOOL.name).toBe("render_wardley_map");
    const props = RENDER_TOOL.inputSchema.properties;
    expect(props.map).toBeDefined();
    expect(props.renderConfig).toBeDefined();
    expect(props.format).toBeDefined();
    expect(props.format.enum).toEqual(["svg", "png", "html"]);
  });

  it("requires map parameter", () => {
    expect(RENDER_TOOL.inputSchema.required).toContain("map");
  });

  it("describes png as base64 in format description", () => {
    expect(RENDER_TOOL.inputSchema.properties.format.description).toContain("base64");
  });
});

// ── Server info ─────────────────────────────────────────────────────

describe("Server metadata", () => {
  it("has name and version", () => {
    expect(SERVER_INFO.name).toBe("wardleyapi-mcp");
    expect(SERVER_INFO.version).toBeDefined();
  });

  it("declares tools capability", () => {
    expect(CAPABILITIES.tools).toBeDefined();
  });
});

// ── callRenderApi with mocked fetch ─────────────────────────────────

describe("callRenderApi", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      WARDLEY_API_URL: "http://localhost:9999",
      WARDLEY_API_KEY: "test-key-123",
    };
    vi.restoreAllMocks();
  });

  it("returns PNG as base64 data URI text + MCP image content", async () => {
    // Create a tiny 1x1 red PNG (minimal valid PNG)
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const expectedBase64 = Buffer.from(pngBytes).toString("base64");
    const expectedDataUri = `data:image/png;base64,${expectedBase64}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Content-Type": "image/png" }),
        arrayBuffer: () => Promise.resolve(pngBytes.buffer),
      })
    );

    const result = await callRenderApi({ title: "test", components: [], relations: [] }, "png");

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(2);

    // First content: text with data URI
    const textContent = result.content[0];
    expect(textContent.type).toBe("text");
    expect(textContent.text).toBe(expectedDataUri);
    expect(textContent.text).toMatch(/^data:image\/png;base64,/);

    // Second content: MCP native image
    const imageContent = result.content[1];
    expect(imageContent.type).toBe("image");
    expect(imageContent.data).toBe(expectedBase64);
    expect(imageContent.mimeType).toBe("image/png");
  });

  it("sends correct Accept header for png format", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "Content-Type": "image/png" }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal("fetch", mockFetch);

    await callRenderApi({ title: "test", components: [], relations: [] }, "png");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:9999/v1/render",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "image/png",
          Authorization: "Bearer test-key-123",
        }),
      })
    );
  });

  it("returns SVG as text content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Content-Type": "image/svg+xml; charset=utf-8" }),
        text: () => Promise.resolve("<svg></svg>"),
      })
    );

    const result = await callRenderApi({ title: "test", components: [], relations: [] }, "svg");

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("<svg></svg>");
  });

  it("returns HTML as resource content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
        text: () => Promise.resolve("<html></html>"),
      })
    );

    const result = await callRenderApi({ title: "test", components: [], relations: [] }, "html");

    expect(result.content).toHaveLength(1);
    // Resource content wraps HTML in a wardley:// URI
    const content = result.content[0] as Record<string, unknown>;
    expect(content.type).toBe("resource");
  });

  it("returns error content on API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () =>
          Promise.resolve(
            JSON.stringify({ detail: "Invalid map", hint: "Check components" })
          ),
      })
    );

    const result = await callRenderApi({ title: "test", components: [], relations: [] }, "svg");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid map");
    expect(result.content[0].text).toContain("Check components");
  });
});

// ── JSON-RPC handlers ───────────────────────────────────────────────

describe("JSON-RPC handlers", () => {
  it("initialize returns protocol version and capabilities", async () => {
    const result = (await handlers.initialize(undefined)) as Record<string, unknown>;
    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.capabilities).toEqual(CAPABILITIES);
    expect(result.serverInfo).toEqual(SERVER_INFO);
  });

  it("tools/list returns render_wardley_map tool", async () => {
    const result = (await handlers["tools/list"](undefined)) as { tools: unknown[] };
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toBe(RENDER_TOOL);
  });

  it("tools/call rejects unknown tool", async () => {
    const result = (await handlers["tools/call"]({ name: "nonexistent" })) as {
      isError: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });

  it("tools/call rejects missing map parameter", async () => {
    const result = (await handlers["tools/call"]({
      name: "render_wardley_map",
      arguments: {},
    })) as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing required parameter: map");
  });

  it("tools/call rejects invalid format", async () => {
    const result = (await handlers["tools/call"]({
      name: "render_wardley_map",
      arguments: {
        map: { title: "test", components: [], relations: [] },
        format: "pdf",
      },
    })) as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid format: pdf");
  });

  it("ping returns empty object", async () => {
    const result = await handlers.ping(undefined);
    expect(result).toEqual({});
  });
});
