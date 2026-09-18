/**
 * HTML renderer.
 *
 * - `interactive: false` → minimal standalone page: the server SVG, no script.
 * - `interactive: true`  → the editor: `interactive/template.html` filled with
 *   the server SVG (first paint), the sanitized map (`#wardley-data`), the
 *   resolved render inputs (`#wardley-prepared`) and the minified editor bundle.
 *
 * Runtime assets: `dist/interactive-bundle.js` and `dist/interactive/template.html`
 * are written by `scripts/bundle-interactive.ts` (prebuild). When running from
 * `src/` (tsx, vitest) the bundle is built on the fly with esbuild.
 *
 * @module render-html
 */

import { readFile } from "node:fs/promises";
import type { RenderOptions } from "./render/types.js";
import { renderSVGFromPrepared, type PreparedRender } from "./render/browser-render.js";
import { resolveTheme, sanitizeMap, type WardleyMap } from "./schema.js";

export interface HTMLRenderOptions extends RenderOptions {
  /** Emit the editor (toolbar, drag & drop, properties, diff export). Defaults to false. */
  readonly interactive?: boolean;
  /**
   * Optional URL the editor POSTs `{ title, ops }` to on "Send" (tried after an
   * MCP-App host, before the clipboard fallback). Exposed as `data-edits-endpoint`.
   */
  readonly editsEndpoint?: string;
}

const asset = (path: string) => new URL(path, import.meta.url);
let bundle: Promise<string> | undefined;

/**
 * Drop the cached editor bundle so the next interactive render rebuilds it.
 * For dev servers only: without it a long-running process keeps serving the
 * bundle built on its first request, while the template is re-read every time —
 * new buttons appear but their code does not.
 */
export function invalidateInteractiveBundle(): void {
  bundle = undefined;
}

function loadBundle(): Promise<string> {
  return (bundle ??= readFile(asset("./interactive-bundle.js"), "utf-8").catch(async () => {
    // Not built (running from src/): bundle on the fly. Non-literal specifier keeps tsc's rootDir happy.
    const script = "../scripts/bundle-interactive.js";
    try {
      const mod = (await import(/* @vite-ignore */ script)) as { bundleInteractive(): Promise<string> };
      return await mod.bundleInteractive();
    } catch (err) {
      bundle = undefined;
      throw new Error(`renderToHTML: interactive bundle unavailable (run "pnpm run prebuild"): ${(err as Error).message}`);
    }
  }));
}

const escapeHTML = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON safe inside a <script> element (no `</script`, `<!--`). */
const jsonScript = (id: string, value: unknown) =>
  `<script type="application/json" id="${id}">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;

const STATIC_CSS =
  ":root{color-scheme:light dark}" +
  "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f7}" +
  "@media(prefers-color-scheme:dark){body{background:#17181c}}" +
  "svg{display:block;max-width:100%;height:auto}";

/** Render a WardleyMap to a self-contained HTML document. */
export async function renderToHTML(inputMap: WardleyMap, options: HTMLRenderOptions = {}): Promise<string> {
  const { interactive = false, editsEndpoint, ...renderOptions } = options;
  // Sanitize and resolve the theme once: renderSVGFromPrepared(map, prepared) === renderToSVG(inputMap, options).
  const map = sanitizeMap(inputMap);
  const prepared: PreparedRender = { config: resolveTheme(map.renderConfig), options: { ...renderOptions, interactive } };
  const svg = renderSVGFromPrepared(map, prepared);
  const title = escapeHTML(map.title?.trim() || "Wardley Map");

  if (!interactive) {
    return (
      `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n` +
      `<style>${STATIC_CSS}</style>\n</head>\n<body>\n${svg}\n</body>\n</html>\n`
    );
  }

  const [template, code] = await Promise.all([readFile(asset("./interactive/template.html"), "utf-8"), loadBundle()]);
  const values: Record<string, string> = {
    TITLE: title,
    SVG: svg,
    DATA: `${jsonScript("wardley-data", map)}\n${jsonScript("wardley-prepared", prepared)}`,
    BUNDLE: `<script>${code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--")}</script>`,
  };
  // Function replacers only: substituted content is inserted verbatim — never
  // re-scanned for placeholders, and `$&` / `$'` in it are not expanded.
  let html = template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => values[key] ?? m);
  if (editsEndpoint) {
    const body = `<body data-edits-endpoint="${escapeHTML(editsEndpoint)}">`;
    html = html.replace("<body>", () => body);
  }
  return html;
}
