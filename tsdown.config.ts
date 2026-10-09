import { defineConfig } from "tsdown";

// Claude Code runs the plugin straight from its cache with only Node on PATH,
// so the bundle has to carry every dependency. c12's optional loaders (jiti,
// giget, dotenv, magicast) are imported lazily and stay external; JSON and
// JSONC configuration loads through the bundled confbox.
const configuration = defineConfig({
	clean: false,
	deps: {
		alwaysBundle: [/.*/u],
		neverBundle: ["dotenv", "giget", "jiti", "magicast"],
		onlyBundle: false,
	},
	dts: false,
	entry: { "lsp-mux": "./packages/lsp-mux/src/cli.ts" },
	fixedExtension: false,
	format: ["esm"],
	minify: true,
	outDir: "plugins/howmanysmall-lsps",
	outputOptions: { codeSplitting: false },
	platform: "node",
	sourcemap: false,
	target: "node22",
	tsconfig: "packages/lsp-mux/tsconfig.json",
});

export default configuration;
