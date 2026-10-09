import { exit } from "node:process";
import { Command, ValidationError } from "@cliffy/command";

export function createBaseCommand(name: string, version: string | undefined, description: string): Command {
	const baseCommand = new Command()
		.error((error, command) => {
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
	return baseCommand;
}
