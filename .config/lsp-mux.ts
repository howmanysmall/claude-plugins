import { defineConfiguration } from "@pobammer-ts/lsp-mux";

export default defineConfiguration({
	formatters: ["oxfmt", "biome", "rumdl"],
	options: {
		typescript: { command: "tsrs" },
	},
	servers: ["typescript", "oxlint", "eslint", "biome", "oxfmt", "yaml", "rumdl", "vale", "bash", "tombi"],
});
