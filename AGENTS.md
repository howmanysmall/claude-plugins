# Agents guide

<!-- vale off -->
This file provides guidance to agents when working with code in this repository.
<!-- vale on -->

## Repository

A Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) with one plugin, `howmanysmall-lsps`, plus the
source of `lsp-mux`, the language server multiplexer that plugin runs. Claude Code starts one LSP server per file
extension, so `lsp-mux` presents many servers to Claude Code as one.

`packages/lsp-mux/tsdown.config.ts` builds the same code into two outputs:

- `@pobammer-ts/lsp-mux` on npm (`dist/`, with `defineConfiguration` as the public API and `lsp-mux` as the CLI).
- `plugins/howmanysmall-lsps/lsp-mux.js`, one minified file with every dependency inlined, because Claude Code
  runs the plugin from its cache with only `node` on `PATH`. This bundle is committed. A pre-commit step rebuilds and
  stages it when anything under `packages/`, `tools/`, or the workspace config changes, and CI fails on a stale bundle.

The package and the plugin manifest share one version, because Claude Code only updates an installed plugin when its
version changes. `bump.config.ts` bumps both together.

## Commands

pnpm workspace with Turborepo (`turbo.json`). Scripts are run with `nr <script>` (from `ni`), which is
`node --run <script>` here. Tools such as `hk`, `pnpm`, `node`, `rumdl`, and `vale` come from `mise.toml`.

```sh
pnpm install
nr test                  # vitest in every package, through turbo
nr type-check            # tsc --build in every package, plus root configs via tsconfig.node.json
nr lint:agent            # isentinel-lint (ESLint + oxlint + oxfmt) and Biome, concise output
nr lint:agent path/      # same, limited to paths; flags before paths are forwarded
nr format                # biome check --fix then oxfmt
nr build                 # the npm package and the plugin bundle, through turbo
nr references:check      # tsconfig project references match workspace: deps (references:sync to fix)
mise run check           # lint, type-check, test, and build
```

Single package or test file: filter the Turborepo task and pass vitest arguments after `--`. Each package has its
own `vitest.config.ts`, which resolves its `$` path aliases.

```sh
nr test --filter=@pobammer-ts/lsp-mux
nr test --filter=@pobammer-ts/lsp-mux -- src/utilities/path-utilities.test.ts
nr test --filter=@pobammer-ts/lsp-mux -- -t "test name"
```

Deep tests, which the weekly `deep-tests.yaml` workflow runs:

```sh
nr test:fuzz:run         # vitiate fuzzing of *.fuzz.ts targets
nr test:mutation         # stryker
PROPERTY_RUNS=10000 nr test   # *.property.test.ts run 100 times by default (src/property-runs.ts)
```

Release: `nr release` (bumpp) bumps both version files, rebuilds, updates `CHANGELOG.md`, commits, tags, and pushes.
It requires a clean worktree. Publish with `pnpm --filter @pobammer-ts/lsp-mux publish`.

## Hooks and gates

`hk.pkl` defines the git hooks (`hk install --mise`). Pre-commit runs type-check, isentinel-lint, Biome, tsconfig
reference sync, sherif, shellcheck/shfmt, rumdl and vale on Markdown, betterleaks, and the bundle rebuild. Pre-push
adds fallow audit (only new findings block), dead code, duplicates, unit tests, and build. `commit-msg` runs
commitlint: conventional commits, lower-case type and scope, header at most 72 characters, subject without a trailing
period.
Allowed types: feat, fix, refactor, docs, style, test, chore, perf, ci, build.

`.claude/settings.json` adds a PreToolUse hook on Bash that blocks `git commit` and `git push` when `fallow audit`
fails. If a commit is blocked, run `nr fallow:audit` and fix or address the findings rather than bypassing.

## Workspace layout

- `packages/lsp-mux` is the product. `packages/arktype-utilities` and `packages/cli-utilities` are private helpers
  (arktype type guards; Cliffy `createBaseCommand` and `getScriptName`) that the build inlines because they are not
  published.
- `tools/project-configurations` holds the shared tsdown and Vitest (plus Stryker and vitiate) configurations every
  package merges. `tools/lint-configurations` and `tools/linter-utilities` back the root `eslint.config.ts` and
  `oxlint.config.ts`.
- `scripts/` is its own workspace package. `sync-tsconfig-references.ts` derives `tsconfig.json` `references` from
  each package's `workspace:` dependencies; a missing reference is silent because `tsc --build` still resolves the
  import through the root `node_modules`, so keep this in sync after adding a workspace dependency.
- Dependency versions live in `pnpm-workspace.yaml` catalogs (`catalog:runtime`, `catalog:lint`, `catalog:test`, and
  so on). Add new dependencies to a catalog, not as a bare version in a `package.json`.
- Tests sit beside the source as `*.test.ts`; `*.property.test.ts` uses fast-check; `*.fuzz.ts` and `*.bench.ts` are
  excluded from `tsconfig.lib.json` and the build.

## lsp-mux architecture

Entry points are `src/cli.ts` (the executable) and `src/index.ts` (the library, which only exports
`defineConfiguration` and types). Inside the package, imports use `$constants`, `$functions/*`, `$meta/*`,
`$types/*`, `$utilities/*`, `$validators/*`, and `$commands/*`, defined in `packages/lsp-mux/tsconfig.json`.

Configuration flow, in `src/functions/`:

1. `load-configuration-async.ts` uses c12 to read two layers: the user file (`$LSP_MUX_CONFIG`, else
   `lsp-mux.*` under `$XDG_CONFIG_HOME` or `~/.config`) and the project file (`lsp-mux.config.*` or
   `.config/lsp-mux.*`). Project layers override user layers; lists replace, `options` merge
   (`utilities/merge-utilities.ts`). A project's `.ts`/`.js` configuration is only executed when
   `LSP_MUX_TRUST_PROJECT_CONFIGS=1`, because Claude Code starts lsp-mux unattended in any cloned repository.
   Otherwise it is skipped and a warning is surfaced to the client at `initialize`.
2. `resolve-configuration.ts` turns each name in `servers` into a `ResolvedServer` by layering the user's `options`
   over the built-in definition in `src/meta/server-catalog.ts`, validated with arktype. Unknown servers must supply
   `command` and `extensions`.

Runtime, in `src/utilities/`:

- `mux-utilities.ts` holds `createMux` and `runMux` and dispatches client requests and notifications. `Mux` (in
  `types/mux-types.ts`) is a plain state object that every handler takes as its first argument. There are no classes.
- `lifecycle-utilities.ts` decides which servers own a document (matching the file extension, in `servers` order) and
  starts one `Backend` per server per project root. The root is the nearest directory that contains one of the
  server's `rootMarkers`,
  bounded by the workspace folder from `initialize`; `requireRootMarker` makes a server skip documents with no marker.
  Commands resolve from the project's `node_modules/.bin` before `PATH` (`path-utilities.ts`). Missing commands mark
  the server unavailable instead of failing.
- `request-utilities.ts` and `routing-utilities.ts` forward a request to every backend that advertises the method
  (statically or via `client/registerCapability`) and combine responses by strategy from `meta/protocol-meta.ts`:
  `first` returns the highest-priority non-empty answer, `merge` concatenates arrays. Formatting requests go only to
  the configured `formatters`, in order. Pull diagnostics are stripped from client capabilities so servers publish
  diagnostics, which `diagnostic-utilities.ts` merges per document. Call hierarchy items are tagged with
  `MUX_DATA_KEY` so follow-up calls route back to the originating backend.
- `message-utilities.ts` and `connection-utilities.ts` handle JSON-RPC framing and request/response correlation.
  `create-process-transport.ts` is the only place that spawns processes; tests inject a fake `TransportFactory`
  through `MuxOptions`.

`cli.ts` lazy-loads the subcommands (`lsp add|get|list|remove`, `scaffold`, `completions`) with `import()` so the
mux starts fast. `getScriptName` is imported `with { type: "macro" }` and evaluated at build time by
unplugin-macros.

The plugin manifest `plugins/howmanysmall-lsps/.lsp.json` maps file extensions to language ids; that list, not the
server catalog, decides which files Claude Code hands to lsp-mux at all.
