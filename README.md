# claude-plugins

HowManySmall's Claude Code plugin marketplace. It also holds the source of
`lsp-mux`, the language server multiplexer behind the `howmanysmall-lsps`
plugin.

## Install

```text
/plugin marketplace add howmanysmall/claude-plugins
/plugin install howmanysmall-lsps@howmanysmall
```

Requires Node 22 or newer on `PATH`. The plugin bundles `lsp-mux.js` into one
self-contained file, so nothing else is installed.

## Configuration

`lsp-mux` presents several language servers to Claude Code as one, because
Claude Code starts only one server per file extension. It doesn't run any servers
until you configure some. Configuration comes in two layers, and the project
overrides the user:

1. Your user configuration: `~/.config/lsp-mux.jsonc` (or `$XDG_CONFIG_HOME`),
   or the file named by `$LSP_MUX_CONFIG`.
2. The project: `lsp-mux.config.*` or `.config/lsp-mux.*` in the working
   directory.

Each server is keyed by name:

| Field | Meaning |
| --- | --- |
| `command` | Executable; found in the project's `node_modules/.bin` first, then `PATH`. |
| `args` | Arguments. |
| `extensions` | File extensions the server handles, like `".ts"`. |
| `rootMarkers` | Files that mark the server's root, like `"tsconfig.json"`. |
| `requireRootMarker` | Only start where a root marker exists. |
| `env`, `settings`, `initializationOptions` | Passed to the server. |
| `enabled` | `false` turns the server off. |

A later layer overrides only the fields it sets, and arrays replace instead of
merging. Servers that are not installed are skipped. `routes` picks which
servers answer a request, in order, like formatting:

```jsonc
{
	"routes": {
		"textDocument/formatting": { "servers": ["biome"] },
	},
	"servers": {
		"typescript": {
			"command": "tsgo",
			"args": ["--lsp", "--stdio"],
			"extensions": [".ts", ".tsx", ".mts", ".cts"],
			"rootMarkers": ["tsconfig.json"],
		},
		"biome": {
			"command": "biome",
			"args": ["lsp-proxy"],
			"extensions": [".ts", ".tsx", ".js", ".json", ".css"],
			"rootMarkers": ["biome.json", "biome.jsonc"],
			"requireRootMarker": true,
		},
	},
}
```

A project can then turn one off or swap a command:

```jsonc
{
	"servers": {
		"biome": { "enabled": false },
		"typescript": { "command": "tsc" },
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
