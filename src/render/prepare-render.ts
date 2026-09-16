/**
 * Server half of the browser renderer (Node, zod-dependent): resolves once
 * what renderSVGFromPrepared needs. See browser-render.ts.
 *
 * @module render/prepare-render
 */

import { resolveTheme, sanitizeMap, type WardleyMap } from "../schema.js";
import type { RenderOptions } from "./types.js";
import type { PreparedRender } from "./browser-render.js";

export type { PreparedRender } from "./browser-render.js";

/**
 * Resolve the render config for `map` (sanitized first, exactly like
 * renderToSVG). The result is plain JSON: embed it in the page as-is.
 */
export function prepareRender(map: WardleyMap, options: RenderOptions = {}): PreparedRender {
  return { config: resolveTheme(sanitizeMap(map).renderConfig), options };
}
