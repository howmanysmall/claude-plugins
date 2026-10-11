import { mergeConfig } from "vitest/config";

import { sharedConfiguration } from "./shared.ts";

/**
 * Config used by Stryker's Vitest runner.
 *
 * Flat on purpose: `stryker.config.mjs` only mutates `packages/lsp-mux/src`, so
 * pulling in the `projects` list would run every other package's suite for each
 * mutant without any of them being able to kill one. Stryker also overrides
 * `pool`, `maxWorkers`, `maxConcurrency`, `bail`, and `coverage` at the CLI
 * layer, which resolves cleanly against a single config but not across
 * separately-loaded project configs.
 */
export const strykerConfiguration = mergeConfig(sharedConfiguration, {
	test: {
		name: "lsp-mux",
		coverage: { enabled: false },
		include: ["packages/lsp-mux/src/**/*.test.ts"],
		// Stryker swaps the active mutant between runs, so each file needs a
		// fresh module registry.
		isolate: true,
		restoreMocks: true,
		server: {
			// Test configuration files load through Node, as in the CLI, so its
			// resolve hook applies.
			deps: { external: [/lsp-mux-configuration-/u] },
		},
		typecheck: { enabled: false },
	},
});
