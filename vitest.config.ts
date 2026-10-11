import { env } from "node:process";
import { vitiateConfiguration } from "@howmanysmall/project-configurations/vitest/vitiate";
import { defineConfig } from "vitest/config";

// vitiate respawns vitest per fuzz target without forwarding --config, so the
// child auto-discovers this file and has to become the fuzz config.
const isFuzzRun = env.VITIATE_FUZZ === "1" || env.VITIATE_OPTIMIZE === "1" || env.VITIATE_SUPERVISOR === "1";

// Each package's own config resolves its `$` path aliases.
const testConfiguration = defineConfig({
	test: {
		projects: ["packages/*/vitest.config.ts", "tools/*/vitest.config.ts"],
	},
});

const configuration = isFuzzRun ? vitiateConfiguration : testConfiguration;

export default configuration;
