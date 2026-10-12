import { sharedConfiguration } from "@howmanysmall/project-configurations/tsdown";
import { defineConfig, mergeConfig } from "tsdown";
import Macros from "unplugin-macros/rolldown";

const configuration = defineConfig([
	mergeConfig(sharedConfiguration, {
		// The private workspace packages aren't published, so they are inlined.
		deps: { alwaysBundle: [/^@howmanysmall\//u] },
		entry: { cli: "./src/cli.ts", index: "./src/index.ts" },
		outDir: "dist",
		plugins: [Macros()],
		tsconfig: "tsconfig.lib.json",
	}),
	mergeConfig(sharedConfiguration, {
		// jsonc-parser's `main` is a UMD build whose `require("./impl/...")`
		// calls survive bundling and fail at runtime, so inline its ESM build.
		alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
		// The plugin folder also holds its manifests, so it is never cleaned.
		clean: false,
		// Claude Code runs the plugin from its cache with only a runtime on
		// PATH, so this one file carries every dependency. giget backs c12's
		// remote `extends`, which lsp-mux never uses.
		deps: { alwaysBundle: [/.*/u], neverBundle: ["giget"], onlyBundle: false },
		dts: false,
		entry: { "lsp-mux": "./src/cli.ts" },
		minify: true,
		outDir: "../../plugins/howmanysmall-lsps",
		outputOptions: { codeSplitting: false },
		plugins: [Macros()],
		target: "node22",
	}),
]);

export default configuration;
