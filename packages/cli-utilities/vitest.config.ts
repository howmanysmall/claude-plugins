import { sharedConfiguration } from "@howmanysmall/project-configurations/vitest";
import { mergeConfig } from "vitest/config";

const configuration = mergeConfig(sharedConfiguration, {
	test: {
		name: "cli-utilities",
		include: ["src/**/*.test.ts"],
		testTimeout: 5_000,
	},
});

export default configuration;
