/**
 * Bundle interactive.ts into a self-contained IIFE JS string using esbuild.
 *
 * Usage:
 *   pnpm --filter @wardleyapi/render bundle:interactive
 *
 * Output:
 *   packages/render/dist/interactive-bundle.js
 *
 * The bundled output is a single JS string (IIFE, no imports) that can be
 * inlined into the HTML template via the {{BUNDLE_SCRIPT}} placeholder.
 *
 * This script is also importable as a module for programmatic use by
 * render-html.ts at build/serve time.
 */

import * as esbuild from "esbuild";
import { readFileSync, mkdirSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(__dirname, "../src/interactive/interactive.ts");
const OUT_DIR = resolve(__dirname, "../dist");
const OUT_FILE = resolve(OUT_DIR, "interactive-bundle.js");
const ASSETS_SRC = resolve(__dirname, "../src/assets");
const ASSETS_DEST = resolve(OUT_DIR, "assets");

export function copyAssets(): void {
  if (!existsSync(ASSETS_SRC)) return;
  cpSync(ASSETS_SRC, ASSETS_DEST, { recursive: true });
}

export async function bundleInteractive(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    write: false,
    sourcemap: false,
    treeShaking: true,
    // No external dependencies — everything is inlined
    logLevel: "warning",
  });

  if (result.errors.length > 0) {
    throw new Error(
      `esbuild errors:\n${result.errors.map((e) => e.text).join("\n")}`
    );
  }

  const code = result.outputFiles[0].text;
  return code;
}

/**
 * Load the pre-built bundle from dist/interactive-bundle.js.
 * Falls back to building on-the-fly if the pre-built file doesn't exist.
 */
export async function loadInteractiveBundle(): Promise<string> {
  try {
    return readFileSync(OUT_FILE, "utf-8");
  } catch {
    // File doesn't exist yet — build it
    return bundleInteractive();
  }
}

/**
 * Wrap the bundled JS in a <script> tag for HTML template injection.
 */
export function wrapInScriptTag(jsCode: string): string {
  return `<script>\n${jsCode}\n</script>`;
}

// ── CLI entry point ─────────────────────────────────────────────────
// When run directly: bundle and write to disk

const isMain =
  process.argv[1] &&
  (process.argv[1].includes("bundle-interactive") ||
    process.argv[1].endsWith("bundle-interactive.ts"));

if (isMain) {
  bundleInteractive()
    .then((code) => {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(OUT_FILE, code, "utf-8");
      const sizeKB = (Buffer.byteLength(code) / 1024).toFixed(1);
      console.log(`[bundle-interactive] ${OUT_FILE} (${sizeKB} KB)`);
      copyAssets();
      console.log(`[bundle-interactive] copied src/assets/ → dist/assets/`);
    })
    .catch((err) => {
      console.error("[bundle-interactive] Failed:", err);
      process.exit(1);
    });
}
