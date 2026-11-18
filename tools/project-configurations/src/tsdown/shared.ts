import { defineConfig } from "tsdown";
import Macros from "unplugin-macros/rolldown";

// Settings every published package shares; each package's own
// `tsdown.config.ts` adds its entries and output.
export const sharedConfiguration = defineConfig({
	attw: {
		enabled: true,
		level: "error",
		profile: "esm-only",
	},
	clean: true,
	dts: {
		generator: "tsrs",
		resolver: "oxc",
		// The plugin lives in the pnpm store, where `tsrs` does not resolve.
		tsrs: { moduleUrl: import.meta.resolve("tsrs") },
	},
	fixedExtension: false,
	format: ["esm"],
	platform: "node",
	plugins: [Macros()],
	publint: {
		enabled: true,
		level: "error",
	},
	treeshake: {
		moduleSideEffects: false,
		propertyReadSideEffects: false,
		unknownGlobalSideEffects: false,
	},
});
