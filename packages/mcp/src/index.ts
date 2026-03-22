/**
 * MCP server entry point — thin HTTP wrapper exposing render_wardley_map tool.
 *
 * Implements the Model Context Protocol (JSON-RPC 2.0 over stdio) and delegates
 * rendering to the @wardleyapi/render HTTP API via WARDLEY_API_URL.
 *
 * Environment variables:
 *   WARDLEY_API_URL — Base URL of the render API (e.g. http://localhost:3000)
 *   WARDLEY_API_KEY — Bearer token for API authentication
 *
 * @module mcp/index
 */

import { createInterface } from "node:readline";

// ── Types ────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool Definition ──────────────────────────────────────────────────

const RENDER_TOOL = {
  name: "render_wardley_map",
  description:
    "Render a Wardley Map from a WardleyMap JSON definition. " +
    "Returns SVG, PNG (base64), or interactive HTML based on the format parameter. " +
    "The map input follows the WardleyMap schema with components, relations, and optional context.",
  inputSchema: {
    type: "object" as const,
    properties: {
      map: {
        type: "object",
        description:
          "WardleyMap JSON object with title, components[], relations[], and optional context",
        properties: {
          title: { type: "string", description: "Map title" },
          components: {
            type: "array",
            description: "Array of ComponentSchema objects",
            items: { type: "object" },
          },
          relations: {
            type: "array",
            description: "Array of RelationSchema objects (id, source, target, type)",
            items: { type: "object" },
          },
          context: { type: "string", description: "Optional map context description" },
        },
        required: ["title", "components", "relations"],
      },
      renderConfig: {
        type: "object",
        description:
          "Optional RenderConfig overrides. Nested sub-schemas: spatial, typography, styling, filters, legend, axes, configIntent. " +
          "All fields have defaults — only send overrides.",
      },
      format: {
        type: "string",
        enum: ["svg", "png", "html"],
        description:
          "Output format: svg (image/svg+xml), png (image/png, returned as base64), or html (text/html, interactive artifact). Defaults to html.",
      },
    },
    required: ["map"],
  },
} as const;

// ── Format → Accept header mapping ──────────────────────────────────

const FORMAT_TO_ACCEPT: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  html: "text/html",
};

// ── Server Info ──────────────────────────────────────────────────────

const SERVER_INFO = {
  name: "wardleyapi-mcp",
  version: "0.1.0",
};

const CAPABILITIES = {
  tools: {},
};

// ── HTTP delegation to render API ────────────────────────────────────

function getApiUrl(): string {
  const url = process.env.WARDLEY_API_URL;
  if (!url) {
    throw new Error("WARDLEY_API_URL environment variable is required");
  }
  return url.replace(/\/$/, ""); // strip trailing slash
}

function getApiKey(): string {
  const key = process.env.WARDLEY_API_KEY;
  if (!key) {
    throw new Error("WARDLEY_API_KEY environment variable is required");
  }
  return key;
}

async function callRenderApi(
  map: Record<string, unknown>,
  format: string
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
  const apiUrl = getApiUrl();
  const apiKey = getApiKey();
  const accept = FORMAT_TO_ACCEPT[format] ?? FORMAT_TO_ACCEPT.svg;

  const response = await fetch(`${apiUrl}/v1/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: accept,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(map),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let detail = `Render API returned ${response.status}`;
    try {
      const problem = JSON.parse(errorBody);
      if (problem.detail) detail = problem.detail;
      if (problem.hint) detail += ` (hint: ${problem.hint})`;
    } catch {
      // non-JSON error body
      if (errorBody) detail += `: ${errorBody.slice(0, 200)}`;
    }
    return {
      content: [{ type: "text", text: detail }],
      isError: true,
    };
  }

  const contentType = response.headers.get("Content-Type") ?? "";

  // PNG → base64 data URI + MCP image content
  if (contentType.includes("image/png")) {
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUri = `data:image/png;base64,${base64}`;
    return {
      content: [
        {
          type: "text",
          text: dataUri,
        },
        {
          type: "image",
          data: base64,
          mimeType: "image/png",
        },
      ],
    };
  }

  // SVG or HTML → text content
  const text = await response.text();

  if (contentType.includes("text/html")) {
    return {
      content: [
        {
          type: "resource",
          resource: {
            uri: "wardley://map/render.html",
            mimeType: "text/html",
            text,
          },
        } as unknown as { type: string; text: string },
      ],
    };
  }

  // SVG (default)
  return {
    content: [{ type: "text", text }],
  };
}

// ── JSON-RPC Method Handlers ─────────────────────────────────────────

type Handler = (params: Record<string, unknown> | undefined) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  initialize: async () => ({
    protocolVersion: "2024-11-05",
    capabilities: CAPABILITIES,
    serverInfo: SERVER_INFO,
  }),

  "notifications/initialized": async () => {
    // Client acknowledgement — no response needed (notification)
    return undefined;
  },

  "tools/list": async () => ({
    tools: [RENDER_TOOL],
  }),

  "tools/call": async (params) => {
    const toolName = params?.name as string | undefined;
    if (toolName !== "render_wardley_map") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    const map = args.map as Record<string, unknown> | undefined;

    if (!map) {
      return {
        content: [{ type: "text", text: "Missing required parameter: map" }],
        isError: true,
      };
    }

    // Merge top-level renderConfig into the map body if provided
    const renderConfig = args.renderConfig as Record<string, unknown> | undefined;
    const requestBody: Record<string, unknown> = { ...map };
    if (renderConfig) {
      requestBody.renderConfig = renderConfig;
    }

    const format = (args.format as string) ?? "html";
    if (!FORMAT_TO_ACCEPT[format]) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid format: ${format}. Supported: svg, png, html`,
          },
        ],
        isError: true,
      };
    }

    // Extract metadata from input map
    const title = (map.title as string) ?? "Untitled Map";
    const components = Array.isArray(map.components) ? map.components : [];
    const relations = Array.isArray(map.relations) ? map.relations : [];

    const renderResult = await callRenderApi(requestBody, format);

    // On error, return as-is (no metadata wrapping)
    if (renderResult.isError) {
      return renderResult;
    }

    // Build structured response: metadata as first text content, then rendered content
    const metadata = {
      title,
      components_count: components.length,
      relations_count: relations.length,
      format,
    };

    return {
      content: [
        { type: "text", text: JSON.stringify(metadata) },
        ...renderResult.content,
      ],
    };
  },

  ping: async () => ({}),
};

// ── JSON-RPC Dispatch ────────────────────────────────────────────────

function send(msg: JsonRpcResponse): void {
  const json = JSON.stringify(msg);
  process.stdout.write(json + "\n");
}

async function dispatch(request: JsonRpcRequest): Promise<void> {
  const handler = handlers[request.method];

  // Notifications (no id) don't get responses
  const isNotification = request.id === undefined || request.id === null;

  if (!handler) {
    if (!isNotification) {
      send({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
      });
    }
    return;
  }

  try {
    const result = await handler(request.params);
    // Notifications don't get responses
    if (!isNotification) {
      send({
        jsonrpc: "2.0",
        id: request.id ?? null,
        result,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (!isNotification) {
      send({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32603,
          message,
        },
      });
    }
  }
}

// ── Stdio Transport ──────────────────────────────────────────────────

export function startServer(): void {
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const request = JSON.parse(trimmed) as JsonRpcRequest;
      if (request.jsonrpc !== "2.0") {
        send({
          jsonrpc: "2.0",
          id: request.id ?? null,
          error: {
            code: -32600,
            message: "Invalid Request: jsonrpc must be '2.0'",
          },
        });
        return;
      }
      await dispatch(request);
    } catch {
      send({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error: invalid JSON",
        },
      });
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });

  // Log to stderr (stdout is reserved for JSON-RPC)
  process.stderr.write(`${SERVER_INFO.name} v${SERVER_INFO.version} started (stdio)\n`);
}

// ── Exported for testing ─────────────────────────────────────────────

export { handlers, callRenderApi, RENDER_TOOL, SERVER_INFO, CAPABILITIES };
export type { JsonRpcRequest, JsonRpcResponse };
