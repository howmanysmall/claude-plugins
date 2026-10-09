import { defineConfig } from "bumpp";

// The npm package and the Claude Code plugin share one version: Claude Code
// only updates an installed plugin when its version changes.
const configuration = defineConfig({
	all: true,
	commit: true,
	confirm: true,
	execute: "node --run build",
	files: ["packages/lsp-mux/package.json", "plugins/howmanysmall-lsps/.claude-plugin/plugin.json"],
	noGitCheck: false,
	push: true,
	tag: true,
});

export default configuration;
