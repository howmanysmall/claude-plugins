import { defineConfig } from "vitest/config";

// Each package's own config resolves its `$` path aliases.
const configuration = defineConfig({
	test: {
		projects: ["packages/*/vitest.config.ts", "tools/*/vitest.config.ts"],
	},
});

export default configuration;
