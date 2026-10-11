import nodePath from "node:path";
import { defineConfig } from "tsdown";

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
		generator: "tsgo",
		resolver: "oxc",
		tsgo: {
			path: nodePath.join(import.meta.dirname, "node_modules", ".bin", "tsc"),
		},
	},
	fixedExtension: false,
	format: ["esm"],
	platform: "node",
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
