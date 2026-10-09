import { sharedConfiguration } from "@howmanysmall/vite-configuration";
import { defineConfig, mergeConfig } from "vitest/config";

const configuration = mergeConfig(
	sharedConfiguration,
	defineConfig({
		test: {
			name: "lsp-mux",
			include: ["src/**/*.test.ts"],
			restoreMocks: true,
			testTimeout: 5_000,
		},
	}),
);

export default configuration;
