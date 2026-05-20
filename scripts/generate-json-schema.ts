/**
 * generate-json-schema.ts — derive a JSON Schema for the Wardley Map input file
 * directly from the Zod single source of truth (`src/schema.ts`).
 *
 * Why a script (not a hand-written .json):
 *   `src/schema.ts` is the ONLY source of truth since the monorepo was dismantled
 *   (no more OpenAPI layer). Generating from Zod guarantees zero drift — re-run
 *   this whenever the schema changes.
 *
 * Why `io: "input"`:
 *   The schema applies `.transform(round3)` to coordinates. The "output" view
 *   (Zod's default) marks transforms as unrepresentable and throws; the "input"
 *   view describes exactly what an author writes in the file. We document the
 *   INPUT, so we use `io: "input"`.
 *
 * Not captured (JSON Schema vanilla cannot express cross-field rules):
 *   - evolutionRange: min ≤ max
 *   - filters.layers: evolvesTo/labels require nodes=true
 *   - legend.position {x,y}: must lie within canvas bounds
 *   - methods[].legend: exactly 3 keys
 *   These remain enforced at runtime by Zod's .refine/.superRefine.
 *
 * Usage:  pnpm exec tsx scripts/generate-json-schema.ts
 */
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WardleyMapSchema } from "../src/schema.js";
import { RenderConfigV3Schema } from "../src/render-config-v3.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../schema/wardley-map.schema.json");

const jsonSchema: any = z.toJSONSchema(WardleyMapSchema, {
  // Describe what the author writes (pre-transform), not the parsed output.
  io: "input",
  // Don't throw on the rare construct Zod can't represent — emit `{}` instead.
  unrepresentable: "any",
});

// `WardleyMapSchema.renderConfig` is a `z.preprocess` (accepts v3 → bridges to
// legacy), so its generated input schema is opaque. Describe it from the real
// v3 input shape (RenderConfigV3Schema) instead.
if (jsonSchema.properties?.renderConfig !== undefined) {
  jsonSchema.properties.renderConfig = z.toJSONSchema(RenderConfigV3Schema, {
    io: "input",
    unrepresentable: "any",
  });
}

// Decorate with standard JSON Schema metadata for editor/tooling integration.
const decorated = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://wardley-map-renderer/schema/wardley-map.schema.json",
  title: "WardleyMap",
  description:
    "Input file schema for wardley-map-renderer. Generated from src/schema.ts " +
    "(Zod) via scripts/generate-json-schema.ts — do not edit by hand.",
  ...jsonSchema,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(decorated, null, 2) + "\n", "utf8");

console.log(`✓ JSON Schema written to ${OUT_PATH}`);
