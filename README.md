# wardley-map-renderer

Pure-function Wardley Map renderer. JSON in → SVG / PNG / interactive HTML out.

No HTTP server, no LLM, no transport layer. Drop this module into any Node-based API and call `render()` directly.

## Install

```bash
pnpm add wardley-map-renderer
```

Peer requirement: Node.js ≥ 18 (the PNG path uses `@resvg/resvg-js`, a native binary).

## Quick start

```typescript
import { render, WardleyMapSchema, type WardleyMap } from "wardley-map-renderer";

const map: WardleyMap = WardleyMapSchema.parse({
  title: "Tea shop",
  components: [
    { id: "customer", label: { name: "Customer" }, type: "anchor",
      position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.05 } } },
    { id: "cup-of-tea", label: { name: "Cup of tea" }, type: "component",
      position: { evolution: { scalar: 0.85 }, visibility: { scalar: 0.25 } } }
  ],
  relations: [
    { id: "r1", consumer: "customer", supplier: "cup-of-tea" }
  ]
});

const result = await render(map, { format: "png" });
// result.data        : string (SVG) | Buffer (PNG)
// result.contentType : "image/svg+xml" | "image/png"
// result.format      : "svg" | "png"
// result.context     : RenderContext (geometry, for inspection)
```

### Shorthand helpers

```typescript
import { renderToSVG, renderToPNG } from "wardley-map-renderer";

const svgString: string = await renderToSVG(map);
const pngBuffer: Buffer = await renderToPNG(map);
```

### Interactive HTML artifact

```typescript
import { renderInteractiveHTML } from "wardley-map-renderer";
// Returns a self-contained HTML document with embedded SVG + drag-drop editor
const html: string = await renderInteractiveHTML(map);
```

## Text size

Every text size is `base × style.global.textScale × element label.scale` (all default to `1`).

| Option | Affects | Base size |
|---|---|---|
| `style.global.textScale` | all texts below (comfort factor) | — |
| `style.global.labelScale` | component labels | 12px |
| `style.nodes.{default,byType.*,bySubtype.*}.default.label.scale` | component labels, per type/subtype | 12px |
| `style.title.default.label.scale` | map title | 16px |
| `style.legend.default.label.scale` | legend title and entries (box resizes) | 12px |
| `style.background.axisEvolution.default.label.scale` | evolution axis label and direction labels | 13px / 10px |
| `style.background.axisValueChain.default.label.scale` | value chain axis label and visibility labels | 13px / 12px |
| `style.background.phases.default.labels[i].scale` | phase label `i` | 12px |

`override` can be used instead of `default` for any element.

```json
"renderConfig": {
  "style": {
    "global": { "textScale": 1.25 },
    "legend": { "default": { "label": { "scale": 0.9 } } }
  }
}
```

## Output formats

| `format` | `result.data` type | Use |
|---|---|---|
| `"svg"` | `string` | Embed in DOM, save as `.svg`, post-process |
| `"png"` | `Buffer` | Server response, file storage |

## Public surface

The package re-exports ~210 named symbols from `src/index.ts`:

- **Render pipeline** : `render`, `renderToSVG`, `renderToPNG`, `computeMapGeometry`
- **Schemas (Zod)** : `WardleyMapSchema`, `RenderConfigSchema`, `ComponentSchema`, `RelationSchema`, …
- **Defaults** : `DEFAULT_RENDER_CONFIG`, `DEFAULT_SPATIAL_CONFIG`, …
- **Themes** : `THEME_BASELINES`, `resolveThemeBaseline`, `DARK_THEME_BASELINE`, …
- **Phase mapping** : `PhaseMappingSchema`, `resolveStyleByPosition`, …
- **Config resolution** : `resolveConfig` (4-tier precedence), `resolveConflict`
- **Constraints** : `checkConstraints`, `evaluateConstraints`, `validateRenderConfig`
- **Diff operations** (HTML interactive) : `diff-ops.ts` exports

## Architecture

Two-phase pipeline:

```
buildRenderContext(map)  →  composeSVG(ctx, layers)
   Phase 1                        Phase 2
   pixel positions                SVG string
```

11 z-ordered layers : `title → axes → pipelines → edges → evolvesTo → nodes → steps → accelerators → labels → notes → legend`.

## Build

```bash
pnpm install
pnpm build       # tsc → dist/
pnpm test        # vitest run
pnpm typecheck
```

The `prebuild` step bundles `src/interactive/interactive.ts` via esbuild into a single IIFE inlined in the HTML template.

## License

ISC
