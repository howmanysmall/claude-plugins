import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };

import { configurationLocationType } from "$validators/configuration-location-type";

const scriptName = getScriptName(true);

export const getCommand = createBaseCommand(scriptName, "1.0.0", "Get details about a configured LSP.")
	.type("configuration-location", configurationLocationType)
	.option("--location <type:configuration-location>", "Where to scaffold the configuration file.");
