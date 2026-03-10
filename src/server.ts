import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { generateMap } from "./llm.js";
import { validateMap, toOWM } from "./schema.js";

const app = new Hono();

app.use("*", cors());

// ── Health check ───────────────────────────────────────────
app.get("/", (c) =>
  c.json({
    name: "WardleyAPI",
    version: "0.1.0",
    status: "ok",
    endpoints: {
      "POST /generate": "Generate a Wardley Map from a prompt",
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

// ── Start ──────────────────────────────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`WardleyAPI running at http://localhost:${info.port}`);
  console.log(`  POST /generate  { "prompt": "...", "format": "json|owm|both" }`);
});
