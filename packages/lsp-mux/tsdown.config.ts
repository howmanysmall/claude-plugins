import { defineConfig } from "tsdown";

import type { UserConfig } from "tsdown";

/** The private workspace packages are not published, so they are inlined. */
const PRIVATE_PACKAGES = [/^@howmanysmall\/arktype-utilities/u];
const ANYTHING = /.*/u;

function getPluginBuild(name: string, entry: string): UserConfig {
	return {
		clean: false,
		// giget backs c12's remote `extends`, which lsp-mux never uses.
		deps: { alwaysBundle: [ANYTHING], neverBundle: ["giget"], onlyBundle: false },
		dts: false,
		entry: { [name]: entry },
		minify: true,
		outDir: "../../plugins/howmanysmall-lsps",
		outputOptions: { codeSplitting: false },
		target: "node22",
	};
}

const configuration = defineConfig([
	{
		deps: { alwaysBundle: PRIVATE_PACKAGES },
		entry: { cli: "./src/cli.ts", index: "./src/index.ts" },
		outDir: "dist",
		tsconfig: "tsconfig.lib.json",
	},
	getPluginBuild("lsp-mux", "./src/cli.ts"),
	getPluginBuild("index", "./src/index.ts"),
]);

export default configuration;
