# Publishing `@formicoidea/wardley-map-renderer`

This package ships to **GitHub Packages** (private) under the scope `@formicoidea`
— the scope is mandatory and must equal the GitHub repo owner.

> Package name consumers import from: **`@formicoidea/wardley-map-renderer`**

## What ships

The published tarball (`files` in `package.json`) contains:

- `dist/` — compiled ESM + `.d.ts` types (the public API: `render`, `renderToSVG`,
  `renderToPNG`, `toOWM`, `validateMap`, `WardleyMapSchema` and all sub-schemas/enums).
- `schema/wardley-map.schema.json` — the canonical JSON Schema, also reachable via a
  subpath export:
  ```ts
  import schema from "@formicoidea/wardley-map-renderer/schema.json" with { type: "json" };
  ```
- `README.md`

`dist/` is gitignored; it is **not** committed. It is rebuilt by the `prepublishOnly`
hook and by the CI workflow before every publish, so the tarball is never stale.

## Releasing (automated — recommended)

`.github/workflows/release.yml` builds and publishes on any pushed `v*` tag,
authenticating with the built-in `GITHUB_TOKEN` (needs `packages: write`, already
declared in the workflow). No personal token required.

```sh
# 1. bump the version (prerelease example)
npm version 1.0.0-beta.1 --no-git-tag-version   # or edit package.json

# 2. commit + tag + push the tag
git commit -am "release: v1.0.0-beta.1"
git tag v1.0.0-beta.1
git push origin main --tags
```

The workflow derives the npm dist-tag automatically: any version containing a hyphen
(e.g. `1.0.0-beta.1`) publishes under **`beta`**; a clean version (`1.0.0`) publishes
under **`latest`**.

## Releasing (manual — needs a PAT)

Requires a classic Personal Access Token with `write:packages`.

```sh
$env:NODE_AUTH_TOKEN="ghp_xxx"     # PowerShell  (export NODE_AUTH_TOKEN=ghp_xxx on bash)
pnpm publish --no-git-checks --tag beta     # drop --tag for a stable release
```

Validate without publishing:

```sh
pnpm publish --dry-run --no-git-checks --tag beta
```

> Note: prerelease versions (`x.y.z-...`) **require** an explicit `--tag`, otherwise
> npm/pnpm refuses to publish (it won't auto-point `latest` at a prerelease).

> The `WARN ... Failed to replace env in config: ${NODE_AUTH_TOKEN}` line is harmless
> when the token isn't set — it only affects the `@formicoidea` registry, never the
> public deps.

---

## Consumer side (e.g. `labre-mcp`)

### 1. Add an `.npmrc` in the consumer repo

```ini
@formicoidea:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

### 2. Provide a token (read access)

GitHub Packages requires authentication even to **read** a private package. Use a PAT
with `read:packages`:

```sh
# PowerShell
$env:NODE_AUTH_TOKEN="ghp_xxx"
# bash
export NODE_AUTH_TOKEN=ghp_xxx
```

### 3. Install

```sh
pnpm add @formicoidea/wardley-map-renderer@beta
```

(Use `@beta` while the package is in prerelease; drop it once `1.0.0` ships under `latest`.)

### 4. Import

```ts
import {
  render,
  renderToSVG,
  renderToPNG,
  toOWM,
  validateMap,
  WardleyMapSchema,
  type WardleyMap,
} from "@formicoidea/wardley-map-renderer";
```
