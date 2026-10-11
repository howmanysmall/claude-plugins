import { sharedConfiguration } from "@howmanysmall/vite-configuration";
import { mergeConfig } from "vitest/config";

const configuration = mergeConfig(sharedConfiguration, {
	test: {
		name: "cli-utilities",
		include: ["src/**/*.test.ts"],
		testTimeout: 5_000,
	},
});

export default configuration;
