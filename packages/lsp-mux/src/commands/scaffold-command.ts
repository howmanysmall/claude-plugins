import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };

const scriptName = getScriptName(true);

export const scaffoldCommand = createBaseCommand(scriptName, "1.0.0", "Scaffold a new LSP configuration file.");
