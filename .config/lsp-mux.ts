import { defineConfiguration } from "@pobammer-ts/lsp-mux";

export default defineConfiguration({
	formatters: ["oxfmt", "biome", "rumdl"],
	options: {
		// TypeScript 7 ships as `tsc`.
		typescript: { command: "tsc" },
	},
	servers: ["typescript", "oxlint", "eslint", "biome", "oxfmt", "yaml", "rumdl", "vale", "bash", "tombi"],
});
