# Publishing `@formicoidea/wardley-map-renderer`

This package ships to the **public npm registry** (`registry.npmjs.org`) under the
scope `@formicoidea`. Authentication goes through the **browser** — no personal
access token, no `NPM_TOKEN`, nothing stored in a file.

> Package name consumers import from: **`@formicoidea/wardley-map-renderer`**

## What ships

The published tarball (`files` in `package.json`) contains:

- `dist/` — compiled ESM + `.d.ts` types (the public API: `render`, `renderToSVG`,
  `renderToPNG`, `renderToHTML`, `applyDiffOps`, `WardleyMapSchema` and all
  sub-schemas/enums).
- `schema/wardley-map.schema.json` — the canonical JSON Schema, also reachable via a
  subpath export:
  ```ts
  import schema from "@formicoidea/wardley-map-renderer/schema.json" with { type: "json" };
  ```
- `README.md`

`dist/` and `schema/` are gitignored; they are **not** committed. Both are rebuilt by
the `prepublishOnly` hook, so the tarball is never stale.

The editor bundle (`dist/interactive-bundle.js`) is embedded in the HTML by
`renderToHTML`; its sources are excluded from the tarball (see `files`).

## Releasing

Publish from `main`, with the work merged and the version bumped past the latest
published one.

```sh
# 1. main up to date, tests green
git switch main && git pull
pnpm test && pnpm run build

# 2. bump (prerelease example)
npm version 1.0.0-beta.5 --no-git-tag-version
git commit -am "chore(release): 1.0.0-beta.5"
git push origin main

# 3. sign in through the browser (once per session)
npm login --scope=@formicoidea --auth-type=web

# 4. publish
pnpm publish --no-git-checks --tag beta
```

- `--no-git-checks`: `dist/` is gitignored and rebuilt by `prepublishOnly`, so the
  tree is intentionally "dirty"; this skips pnpm's clean-branch guard.
- Prerelease versions (`x.y.z-…`) **require** an explicit `--tag`, otherwise npm/pnpm
  refuses to publish (it will not point `latest` at a prerelease).
- To also move `latest` onto the new prerelease (consumers installing without a
  range): `npm dist-tag add @formicoidea/wardley-map-renderer@1.0.0-beta.5 latest`.

Validate without publishing:

```sh
pnpm publish --dry-run --no-git-checks --tag beta
```

## Consuming it

Nothing to configure: the public npm registry is npm's default. The repo `.npmrc`
holds no registry routing and no token on purpose.

## CI

`.github/workflows/release.yml` publishes on a pushed `v*` tag through npm
**trusted publishing** (OIDC): the workflow proves its identity to npm, so no token
or secret is involved.

> **One-time setup required.** On npmjs, open the package settings → *Trusted
> publishers* → add this GitHub repository and the workflow file
> `release.yml`. **Until that is done, do not push a `v*` tag**: the workflow will
> fail at the publish step (it cannot publish anywhere wrong — it just stops).
> Manual publishing with `npm login --auth-type=web` works regardless.
