import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };

import { version } from "$constants";

const scriptName = getScriptName(true);

export const lspCommand = createBaseCommand(scriptName, version, "Manage the LSPs in a configuration.", {
	showHelpWithoutArguments: true,
})
	.command("add", async () => {
		const { addCommand } = await import("./add-command");
		return addCommand;
	})
	.command("get", async () => {
		const { getCommand } = await import("./get-command");
		return getCommand;
	})
	.command("list", async () => {
		const { listCommand } = await import("./list-command");
		return listCommand;
	})
	.command("remove", async () => {
		const { removeCommand } = await import("./remove-command");
		return removeCommand;
	});
