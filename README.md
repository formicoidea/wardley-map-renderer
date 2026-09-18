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

### HTML page and interactive editor

```typescript
import { renderToHTML } from "wardley-map-renderer";

const page = await renderToHTML(map);                          // static page, no script
const editor = await renderToHTML(map, {
  interactive: true,
  editsEndpoint: "http://127.0.0.1:7777/edits",                // optional
});
```

The editor is a single self-contained HTML file (about 25 KB gzip of script, and the same renderer as the server). It supports:

- **Tools**: Select (V), Component (C), Link (L), Evolve (E), Pipeline (P), Pan (H or hold Space).
- **Select**: click or Shift+click to select, then drag to move. You can drag a component, a label, a step, a pipeline body (its contained components move too) or a pipeline handle (resizes it).
- **Rename and add**: double-click a label or the title to rename it, or double-click empty space to add a component.
- **Delete and properties**: Del deletes the selection. Right-click, long-press or Enter opens the properties panel.
- **Keyboard**: Esc cancels or clears, Ctrl+Z / Ctrl+Shift+Z undo and redo, and F2 renames.
- **Navigation**: pan by dragging empty space or with the wheel. Zoom with Ctrl+wheel, pinch or the zoom buttons.

Every edit is a `DiffOp` (see `applyDiffOp`). The op log always equals the net diff from the original map, so undo removes ops from it. There are three ways to get the edits out of the page:

- **Send** tries each route in turn, and the edits stay in the page afterwards:
  1. the MCP-App host (`ui/message`), when the page is embedded;
  2. otherwise `POST {title, ops}` to `editsEndpoint`;
  3. otherwise it copies a prompt to the clipboard.
- **Copy diff** copies the raw JSON array of ops. **Download** saves the full edited map.
- **Scripting**: `window.__wardley` exposes `getMap()`, `getDiff()`, `clearDiff()`, `apply(op)`, `undo()` and `redo()`. `getDiff()` does not clear the ops.

## Éditeur interactif — boucle de retour vers Claude

`Send` sait poster les ops sur `editsEndpoint`, mais encore faut-il que quelqu'un les ramasse. Le dépôt fournit les deux moitiés : un serveur de dev qui sert l'éditeur et encaisse les POST, et un hook `Stop` qui relance la conversation Claude Code avec les éditions reçues.

```bash
pnpm run editor data/ma-carte.json            # http://127.0.0.1:4173
pnpm run editor data/ma-carte.json --port 8080 --inbox .claude/wardley-inbox
```

| Route | Effet |
|---|---|
| `GET /` | l'éditeur, carte relue du disque à chaque requête (recharger la page = dernier état du fichier) |
| `POST /edits` | `{ title, ops }` → un fichier `<horodatage>.json` dans la boîte de réception, `204` |
| `GET /health` | `200` |

Le serveur écoute sur `127.0.0.1` uniquement, plafonne les corps à 1 Mo, et logue une ligne par lot reçu. Aucune dépendance : `node:http` et le renderer.

Le hook `.claude/hooks/wardley-inbox.mjs`, enregistré dans `.claude/settings.json`, se déclenche quand Claude s'arrête de travailler : si la boîte contient des éditions, il les lit, les supprime, et répond `{"decision":"block","reason":"<prompt>"}` — Claude repart aussitôt sur « Applique ces N édition(s)… ». Boîte vide, absente ou erreur quelconque : sortie silencieuse, la session n'est jamais bloquée. `stop_hook_active` coupe la boucle (un tour relancé ne se relance pas lui-même). La boîte se règle via `$WARDLEY_INBOX`, sinon `<projet>/.claude/wardley-inbox`.

Boucle complète : `pnpm run editor carte.json` → on édite dans le navigateur → `Send` → Claude reprend la main tout seul dès qu'il a fini ce qu'il faisait.

### Les trois voies, honnêtement

| Voie | Latence | Ce qu'elle coûte |
|---|---|---|
| **Serveur local + hook `Stop`** | immédiate si Claude travaille encore, sinon à la fin du prochain tour | ne réveille pas une session au repos : il faut un tour en cours (ou taper n'importe quoi pour en provoquer un). Hook propre à ce dépôt, donc à recopier ailleurs. |
| **Sondage `/loop`** | l'intervalle choisi | `/loop 2m` sur un prompt qui vide la boîte : réveille vraiment une session inactive, mais consomme des tours dans le vide et la fenêtre de contexte avec. |
| **Hôte MCP Apps** | immédiate, sans serveur ni hook | la voie propre (`ui/message`, spec 2026-01-26), mais elle suppose un hôte qui embarque la page et implémente l'extension ; Claude Code en terminal n'en est pas un aujourd'hui. |

Les trois cohabitent sans conflit : `Send` essaie l'hôte, puis l'endpoint, puis le presse-papier, et s'arrête au premier qui répond.

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
- **HTML / editor** : `renderToHTML`, `applyDiffOp`, `applyDiffOps`, `DiffOp`

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

The `prebuild` step bundles `src/interactive/interactive.ts` with esbuild into `dist/interactive-bundle.js` and copies `src/interactive/template.html` to `dist/interactive/`. When running from `src/` (tsx, vitest), `renderToHTML` builds the bundle on the fly.

## License

ISC
