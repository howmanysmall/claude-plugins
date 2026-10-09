# claude-plugins

HowManySmall's Claude Code plugin marketplace. It also holds the source of
`lsp-mux`, the language server multiplexer behind the `howmanysmall-lsps`
plugin.

## Install

```text
/plugin marketplace add howmanysmall/claude-plugins
/plugin install howmanysmall-lsps@howmanysmall
```

Requires Node 22 or newer on `PATH`. The plugin ships `lsp-mux.js` as a single
self-contained file, so nothing else is installed.

## Configuration

`lsp-mux` presents several language servers to Claude Code as one, because
Claude Code starts only one server per file extension. Configuration layers,
later layers winning:

1. The plugin defaults, `lsp-mux.jsonc` next to the bundle.
2. Your user configuration: `~/.config/lsp-mux.jsonc` (or
   `$XDG_CONFIG_HOME`), or the file named by `$LSP_MUX_CONFIG`.
3. The project: `lsp-mux.config.*` or `.config/lsp-mux.*` in the working
   directory.

Servers are keyed by name, so a later layer overrides just the fields it sets
on a server. Arrays replace instead of merging. Set `"enabled": false` on a
server to turn it off, and `"requireRootMarker": true` to start it only inside
a project that has one of its root markers.

```jsonc
{
	"servers": {
		"eslint": { "enabled": false },
		"biome": { "requireRootMarker": true },
	},
}
```

## Develop

```sh
pnpm install
node --run test          # vitest across the workspace
node --run type-check    # tsc --build
node --run lint:agent    # ESLint, oxlint, and Biome
node --run build         # bundle to plugins/howmanysmall-lsps/lsp-mux.js
```

The source is in `packages/lsp-mux`. `build` runs tsdown (see
`tsdown.config.ts`), which bundles cliffy, c12, confbox, arktype, and effect
into one ESM file with a `#!/usr/bin/env node` banner. Rebuild and commit
`plugins/howmanysmall-lsps/lsp-mux.js` after changing the source.
