import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };

import { configurationLocationType } from "$validators/configuration-location-type";

const scriptName = getScriptName(true);

export const scaffoldCommand = createBaseCommand(scriptName, "1.0.0", "Scaffold a new LSP configuration file.")
	.type("configuration-location", configurationLocationType)
	.option("--location <type:configuration-location>", "Where to scaffold the configuration file.");
