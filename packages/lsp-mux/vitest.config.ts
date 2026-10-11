import { sharedConfiguration } from "@howmanysmall/project-configurations/vitest";
import { mergeConfig } from "vitest/config";

const configuration = mergeConfig(sharedConfiguration, {
	test: {
		name: "lsp-mux",
		benchmark: { include: ["src/**/*.bench.ts"] },
		include: ["src/**/*.test.ts"],
		restoreMocks: true,
		server: {
			// Test configuration files load through Node, as in the CLI,
			// so its resolve hook applies.
			deps: { external: [/lsp-mux-configuration-/u] },
		},
		testTimeout: 5_000,
	},
});

export default configuration;
