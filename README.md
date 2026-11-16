# PF2e Grimoire

A Foundry VTT v14 module for the Pathfinder 2e system (8.7.x). It adds a separate spellbook window that shows every spell from every spellcasting entry, staff, wand and scroll in one filterable list.

## Development

You need Node 22 or later and git.

```bash
git clone --recurse-submodules <repo-url>
npm install
npm run build
npm run link
```

`npm run link` connects `dist/` to your Foundry install as `Data/modules/pf2e-grimoire`. By default it uses `%LOCALAPPDATA%\FoundryVTT\Data`. For a different Data folder, run `npm run link -- "D:\path\to\FoundryVTT\Data"` once; the path is saved to `foundry.config.json`, which is gitignored.

| Command | What it does |
| --- | --- |
| `npm run dev` | Rebuilds into `dist/` on every save. Refresh Foundry (F5) to pick up changes. |
| `npm run build` | Production build into `dist/`. |
| `npm test` | Vitest unit tests for the pure-logic modules. |
| `npm run typecheck` | svelte-check over TypeScript and Svelte, including pf2e's types. |

### pf2e types

`vendor/pf2e` is a git submodule pinned to the `pf2e-8.7.0` tag. It is only there for types. Import from it with `import type` through the aliases (`@actor`, `@item`, `@module/...`, `@client/...` and so on). The build fails on a value import from pf2e. At runtime, reach pf2e classes through `CONFIG.PF2E`, `game.pf2e` or the documents themselves.

To move to a newer pf2e release:

```bash
cd vendor/pf2e
git fetch --depth 1 origin tag pf2e-<version>
git checkout pf2e-<version>
```

## Releasing

Push a version tag, such as `v0.2.0`. The GitHub Actions workflow type-checks, tests and builds. It then publishes `module.json` and `module.zip` as a release. Foundry and The Forge install from:

```
https://github.com/srclark213/pf2e-grimoire/releases/latest/download/module.json
```

Bump `version` in both `package.json` and `static/module.json` before tagging. A unit test checks that they match.
