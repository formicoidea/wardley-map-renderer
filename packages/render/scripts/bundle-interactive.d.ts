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
export declare function bundleInteractive(): Promise<string>;
/**
 * Load the pre-built bundle from dist/interactive-bundle.js.
 * Falls back to building on-the-fly if the pre-built file doesn't exist.
 */
export declare function loadInteractiveBundle(): Promise<string>;
/**
 * Wrap the bundled JS in a <script> tag for HTML template injection.
 */
export declare function wrapInScriptTag(jsCode: string): string;
//# sourceMappingURL=bundle-interactive.d.ts.map