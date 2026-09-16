/**
 * Build the interactive editor assets used by `renderToHTML({ interactive: true })`.
 *
 *   dist/interactive-bundle.js        minified IIFE of src/interactive/interactive.ts
 *   dist/interactive/template.html    app shell template
 *   dist/assets/                      fonts etc. (copied from src/assets)
 *
 * Run as the `prebuild` script. In dev/tests (tsx, vitest) render-html.ts
 * imports `bundleInteractive()` to build on the fly instead.
 */

import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(ROOT, "src/interactive/interactive.ts");
const DIST = resolve(ROOT, "dist");

export async function bundleInteractive(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    legalComments: "none",
    write: false,
    logLevel: "warning",
  });
  return result.outputFiles[0].text;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await bundleInteractive();
  mkdirSync(resolve(DIST, "interactive"), { recursive: true });
  writeFileSync(resolve(DIST, "interactive-bundle.js"), code, "utf-8");
  cpSync(resolve(ROOT, "src/interactive/template.html"), resolve(DIST, "interactive/template.html"));
  if (existsSync(resolve(ROOT, "src/assets"))) cpSync(resolve(ROOT, "src/assets"), resolve(DIST, "assets"), { recursive: true });
  const kb = (n: number) => (n / 1024).toFixed(1);
  console.log(`[bundle-interactive] dist/interactive-bundle.js ${kb(code.length)} KB (${kb(gzipSync(code).length)} KB gzip) + template + assets`);
}
