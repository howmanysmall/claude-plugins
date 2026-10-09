import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import nodePath from "node:path";
import { cwd, env, exit, stdin, stdout } from "node:process";
import { CompletionsCommand } from "@cliffy/command/completions";

import { description, version } from "$constants";
import { createBaseCommand } from "$functions/create-base-command";
import { createProcessTransport } from "$functions/create-process-transport";
import { loadConfigurationAsync } from "$functions/load-configuration-async";
import { runMux } from "$utilities/mux-utilities";

const name = "lsp-mux";

function fileExists(path: string): boolean {
	return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}

function readFileOrUndefined(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

const command = createBaseCommand(name, version, description)
	.option(
		"--defaults <file:file>",
		"Configuration layered beneath the user's and the project's, such as the defaults a plugin ships.",
	)
	.action(async ({ defaults }) => {
		const directory = cwd();
		runMux({
			configuration: await loadConfigurationAsync({
				cwd: directory,
				defaults,
				environment: env,
				home: homedir(),
			}),
			createTransport: createProcessTransport,
			cwd: directory,
			exists: fileExists,
			exit,
			input: stdin,
			output: stdout,
			readFile: readFileOrUndefined,
			searchPath: (env.PATH ?? "").split(nodePath.delimiter),
		});
	})
	.command("completions", new CompletionsCommand());

export async function runAsync(parameters: Array<string>): Promise<void> {
	await command.parse(parameters);
}
