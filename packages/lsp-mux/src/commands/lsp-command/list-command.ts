import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };

import { configurationLocationType } from "$validators/configuration-location-type";

const scriptName = getScriptName(true);

export const listCommand = createBaseCommand(scriptName, "1.0.0", "List configured LSPs.")
	.type("configuration-location", configurationLocationType)
	.option("--location <type:configuration-location>", "Where to scaffold the configuration file.")
	.option("--json", "Output the list in JSON format.");
