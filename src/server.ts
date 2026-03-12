import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { generateMap } from "./llm.js";
import { validateMap, toOWM } from "./schema.js";
import { renderRoute } from "./render.js";

const app = new Hono();

app.use("*", cors());

// ── Global error handler — all unhandled errors return JSON ──
app.onError((err, c) => {
  console.error("[server] Unhandled error:", err.message);
  const status = "status" in err && typeof err.status === "number" ? err.status : 500;
  return c.json(
    {
      error: status >= 500 ? "Internal Server Error" : "Request Error",
      message: err.message || "An unexpected error occurred",
    },
    status as any
  );
});

// ── Health check ───────────────────────────────────────────
app.get("/", (c) =>
  c.json({
    name: "WardleyAPI",
    version: "0.1.0",
    status: "ok",
    endpoints: {
      "POST /generate": "Generate a Wardley Map from a prompt",
      "POST /render": "Render a Wardley Map to PNG (default) or SVG (Accept: image/svg+xml)",
    },
  })
);

// ── Main endpoint ──────────────────────────────────────────
app.post("/generate", async (c) => {
  const body = await c.req.json<{ prompt: string; format?: string }>();

  if (!body.prompt || typeof body.prompt !== "string") {
    return c.json({ error: "Missing 'prompt' field (string)" }, 400);
  }

  const format = body.format || "json"; // "json" | "owm" | "both"

  try {
    const startTime = Date.now();
    const map = await generateMap(body.prompt);
    const elapsed = Date.now() - startTime;

    // Run validation (Engine 3)
    const warnings = validateMap(map);

    // Build response based on requested format
    const response: Record<string, unknown> = {
      meta: {
        elapsed_ms: elapsed,
        warnings,
        engine: "llm-only-v1", // honest about current architecture
      },
    };

    if (format === "json" || format === "both") {
      response.map = map;
    }
    if (format === "owm" || format === "both") {
      response.owm = toOWM(map);
    }

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Generation failed:", message);
    return c.json({ error: message }, 500);
  }
});

// ── Render endpoint ─────────────────────────────────────────
// Content negotiation via Accept header:
//   image/svg+xml → SVG
//   image/png     → PNG (1600×900, default when no/ambiguous Accept header)
//   unsupported   → 406 Not Acceptable
app.post("/render", renderRoute);

// ── Method Not Allowed for /render ──────────────────────────
app.all("/render", (c) =>
  c.json(
    { error: "Method Not Allowed", message: "Use POST for /render" },
    405
  )
);

// ── 404 catch-all — unknown routes return JSON ──────────────
app.notFound((c) =>
  c.json({ error: "Not Found", message: `No route for ${c.req.method} ${c.req.path}` }, 404)
);

// ── Start ──────────────────────────────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`WardleyAPI running at http://localhost:${info.port}`);
  console.log(`  POST /generate  { "prompt": "...", "format": "json|owm|both" }`);
  console.log(`  POST /render    WardleyMap JSON body, Accept: image/png (default)|image/svg+xml`);
});
