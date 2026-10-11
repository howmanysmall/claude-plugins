import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };

const scriptName = getScriptName(true);

export const lspCommand = createBaseCommand(scriptName, "1.0.0", "The interface for managing LSPs.")
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
