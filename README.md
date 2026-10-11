# claude-plugins

HowManySmall's Claude Code plugin marketplace. It also holds the source of
`lsp-mux`, the language server multiplexer behind the `howmanysmall-lsps`
plugin.

## Install

```text
/plugin marketplace add howmanysmall/claude-plugins
/plugin install howmanysmall-lsps@howmanysmall
```

Requires Node 22.18 or newer on `PATH`. The plugin bundles `lsp-mux.js` into one
self-contained file, so nothing else is installed.

## Configuration

`lsp-mux` presents several language servers to Claude Code as one, because
Claude Code starts only one server per file extension. It doesn't run any servers
until you list some.

```ts
// .config/lsp-mux.ts (or lsp-mux.config.ts)
import { defineConfiguration } from "@pobammer-ts/lsp-mux";

export default defineConfiguration({
	formatters: ["oxfmt", "biome"],
	options: {
		typescript: { command: "tsc" },
		zls: { command: "zls", extensions: [".zig"] },
	},
	servers: ["typescript", "oxlint", "eslint", "biome", "oxfmt", "zls"],
});
```

- `servers` picks the servers to run. Earlier servers win when several answer the
  same request.
- `formatters` picks which servers format a document, in order.
- `options` changes how a server starts. lsp-mux already knows `astro`, `bash`,
  `biome`, `clangd`, `eslint`, `gopls`, `lua`, `oxfmt`, `oxlint`, `pyright`,
  `rumdl`, `rust-analyzer`, `sourcekit`, `tombi`, `typescript`, `vale`, `yaml`,
  and `zls`. Any other server needs a `command` and `extensions`.

Server options:

| Field | Meaning |
| --- | --- |
| `command` | Executable; found in the project's `node_modules/.bin` first, then `PATH`. |
| `args` | Arguments. |
| `extensions` | File extensions the server handles, like `".ts"`. |
| `rootMarkers` | Files that mark the server's root, like `"tsconfig.json"`. |
| `requireRootMarker` | Only start where a root marker exists. |
| `env`, `settings`, `initializationOptions` | Passed to the server. |

Servers that aren't installed are skipped.

### Where configuration lives

1. Your user configuration: `~/.config/lsp-mux.ts` (or `.json`, `.jsonc`, and
   so on, under `$XDG_CONFIG_HOME` if set), or the file named by
   `$LSP_MUX_CONFIG`.
2. The project: `lsp-mux.config.*` or `.config/lsp-mux.*`, which overrides the
   user configuration. Lists replace each other, and `options` merge.

Install `@pobammer-ts/lsp-mux` as a dev dependency so the import resolves. Install `@pobammer-ts/lsp-mux` as a
dev dependency to type-check it.

### Project configuration that runs code

A `.ts` or `.js` configuration is code, and Claude Code starts lsp-mux on its own
as soon as you open a matching file. To keep a cloned repository from running
code unasked, lsp-mux only runs a project's code configuration when
`LSP_MUX_TRUST_PROJECT_CONFIGS=1` is set, such as in the `env` of
`~/.claude/settings.json`. Otherwise it skips the file and logs why. Your user
configuration and JSON project configurations always load.

## Develop

```sh
pnpm install
node --run test          # vitest in every package, through turbo
node --run type-check    # tsc --build in every package, through turbo
node --run lint:agent    # ESLint, oxlint, and Biome
node --run build         # the npm package and the plugin bundle, through turbo
nr release               # bump, rebuild, commit, tag, and push
```

The source is in `packages/lsp-mux`. The root `tsdown.config.ts` holds the
settings every package shares, and `packages/lsp-mux/tsdown.config.ts` builds
the npm package into `dist` and the self-contained plugin bundle into
`plugins/howmanysmall-lsps`.

`nr release` bumps the package and the plugin to the same version, because Claude
Code only updates an installed plugin when its version changes. Publish the
package with `pnpm --filter @pobammer-ts/lsp-mux publish`.
