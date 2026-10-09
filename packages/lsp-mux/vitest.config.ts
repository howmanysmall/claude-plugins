import { sharedConfiguration } from "@howmanysmall/vite-configuration";
import { defineConfig, mergeConfig } from "vitest/config";

const configuration = mergeConfig(
	sharedConfiguration,
	defineConfig({
		test: {
			name: "lsp-mux",
			include: ["src/**/*.test.ts"],
			restoreMocks: true,
			server: {
				// Test configuration files load through Node, as in the CLI,
				// so its resolve hook applies.
				deps: { external: [/lsp-mux-configuration-/u] },
			},
			testTimeout: 5_000,
		},
	}),
);

export default configuration;
