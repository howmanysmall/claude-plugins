import { exit } from "node:process";
import { Command, ValidationError } from "@cliffy/command";

import { ShowHelpError } from "./show-help-error";

export interface ExtraOptions {
	readonly showHelpWithoutArguments?: boolean | undefined;
}

export function createBaseCommand(
	name: string,
	version: string | undefined,
	description: string,
	options?: ExtraOptions,
): Command {
	const baseCommand = new Command()
		.error((error, command) => {
			if (error instanceof ShowHelpError) {
				command.showHelp();
				exit(0);
			}

			if (error instanceof ValidationError) {
				command.showHelp();
				console.error(error.message);
				exit(error.exitCode);
			}

			console.error(error);
			exit(1);
		})
		.name(name)
		.description(description)
		.help({
			colors: true,
			hints: true,
			types: true,
		});

	if (version !== undefined) baseCommand.version(version);
	if (options?.showHelpWithoutArguments === true) {
		baseCommand.action(() => {
			throw new ShowHelpError("No command specified.");
		});
	}

	return baseCommand;
}
