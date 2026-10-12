// oxlint-disable small-rules/prevent-abbreviations -- `args` is the configuration field.

import type { ServerOptions } from "$types/configuration-types";

const ESLINT_SETTINGS = {
	codeAction: {
		disableRuleComment: { enable: true, location: "separateLine" },
		showDocumentation: { enable: true },
	},
	codeActionOnSave: { mode: "all" },
	experimental: {},
	format: false,
	// oxlint-disable-next-line unicorn/no-null -- vscode-eslint reports nothing without `nodePath`.
	nodePath: null,
	onIgnoredFiles: "off",
	options: {},
	problems: { shortenToSingleLine: false },
	quiet: false,
	rulesCustomizations: [],
	run: "onType",
	useESLintClass: false,
	useFlatConfig: true,
	validate: "on",
	workingDirectory: { mode: "auto" },
};

const CATALOG = {
	astro: {
		args: ["--stdio"],
		command: "astro-ls",
		extensions: [".astro"],
	},
	bash: {
		args: ["start"],
		command: "bash-language-server",
		extensions: [".bash", ".ksh", ".sh", ".zsh"],
	},
	biome: {
		args: ["lsp-proxy"],
		command: "biome",
		extensions: [
			".astro",
			".cjs",
			".css",
			".cts",
			".gql",
			".graphql",
			".html",
			".js",
			".json",
			".jsonc",
			".jsx",
			".mjs",
			".mts",
			".scss",
			".svelte",
			".ts",
			".tsx",
			".vue",
			".yaml",
			".yml",
		],
		requireRootMarker: true,
		rootMarkers: ["biome.json", "biome.jsonc"],
	},
	clangd: {
		command: "clangd",
		extensions: [".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".m", ".mm"],
		rootMarkers: ["compile_commands.json", "compile_flags.txt", ".clangd"],
	},
	eslint: {
		args: ["--stdio"],
		command: "vscode-eslint-language-server",
		extensions: [
			".cjs",
			".cts",
			".js",
			".json",
			".json5",
			".jsonc",
			".jsx",
			".mjs",
			".mts",
			".ts",
			".tsx",
			".yaml",
			".yml",
		],
		requireRootMarker: true,
		rootMarkers: ["eslint.config.ts", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"],
		settings: ESLINT_SETTINGS,
	},
	gopls: {
		command: "gopls",
		extensions: [".go"],
		rootMarkers: ["go.mod", "go.work"],
	},
	lua: {
		command: "lua-language-server",
		extensions: [".lua"],
		rootMarkers: [".luarc.json", ".luarc.jsonc"],
	},
	oxfmt: {
		args: ["--lsp"],
		command: "oxfmt",
		extensions: [
			".cjs",
			".css",
			".cts",
			".gql",
			".graphql",
			".handlebars",
			".hbs",
			".htm",
			".html",
			".js",
			".json",
			".json5",
			".jsonc",
			".jsx",
			".less",
			".mdx",
			".mjs",
			".mts",
			".sass",
			".scss",
			".ts",
			".tsx",
			".vue",
			".yaml",
			".yml",
		],
		requireRootMarker: true,
		rootMarkers: [".oxfmtrc.json", ".oxfmtrc.jsonc"],
	},
	oxlint: {
		args: ["--lsp"],
		command: "oxlint",
		extensions: [".astro", ".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"],
		requireRootMarker: true,
		rootMarkers: [".oxlintrc.json", "oxlint.config.ts"],
	},
	pyright: {
		args: ["--stdio"],
		command: "pyright-langserver",
		extensions: [".py", ".pyi"],
		rootMarkers: ["pyproject.toml", "pyrightconfig.json"],
	},
	rumdl: {
		args: ["server"],
		command: "rumdl",
		extensions: [".markdown", ".md", ".mdown", ".mdtext", ".mdtxt", ".mdwn", ".mkd", ".mkdn", ".Rmd", ".text"],
	},
	"rust-analyzer": {
		command: "rust-analyzer",
		extensions: [".rs"],
		rootMarkers: ["Cargo.toml"],
	},
	sourcekit: {
		command: "sourcekit-lsp",
		extensions: [".swift"],
		rootMarkers: ["Package.swift"],
	},
	tombi: {
		args: ["lsp"],
		command: "tombi",
		extensions: [".toml"],
	},
	typescript: {
		args: ["--lsp", "--stdio"],
		command: "tsgo",
		extensions: [".cts", ".mts", ".ts", ".tsx"],
		rootMarkers: ["tsconfig.json", "jsconfig.json"],
	},
	vale: {
		command: "vale-ls",
		extensions: [".markdown", ".md", ".mdx"],
		requireRootMarker: true,
		rootMarkers: [".vale.ini"],
	},
	yaml: {
		args: ["--stdio"],
		command: "yaml-language-server",
		extensions: [".yaml", ".yml"],
	},
	zls: {
		command: "zls",
		extensions: [".zig", ".zon"],
		rootMarkers: ["build.zig"],
	},
} as const satisfies Readonly<Record<string, ServerOptions>>;

export type CatalogServer = keyof typeof CATALOG;

const CATALOG_BY_NAME = new Map<string, ServerOptions>(Object.entries(CATALOG));

/**
 * Finds a language server lsp-mux knows how to start. None run unless a
 * configuration lists them in `servers`.
 *
 * @param name - A name from a configuration's `servers` list.
 * @returns Its built-in options, or `undefined` for an unknown server.
 */
export function getCatalogServer(name: string): ServerOptions | undefined {
	return CATALOG_BY_NAME.get(name);
}

/**
 * Lists every language server lsp-mux knows how to start.
 *
 * @returns The server names, in alphabetical order.
 */
export function listCatalogServers(): ReadonlyArray<string> {
	return [...CATALOG_BY_NAME.keys()];
}
