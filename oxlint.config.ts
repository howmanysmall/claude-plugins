import { fileURLToPath } from "node:url";
import { getOxlintAsync } from "@howmanysmall/lint-configurations/get-oxlint-async";

import type { OxlintConfig } from "@isentinel/eslint-config/oxlint";

const tsconfigPath = fileURLToPath(new URL("tsconfig.json", import.meta.url));
const configuration: OxlintConfig = await getOxlintAsync({
	rootDirectory: import.meta.dirname,
	tsconfigPath,
});

export default configuration;
