#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import nodePath from "node:path";
import { argv, cwd, env, exit, stdin, stdout } from "node:process";
import { CompletionsCommand } from "@cliffy/command/completions";
import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };

import { description, version } from "$constants";
import { createProcessTransport } from "$functions/create-process-transport";
import { loadConfigurationAsync } from "$functions/load-configuration-async";
import { runMux } from "$utilities/mux-utilities";

const scriptName = getScriptName(true);

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

const command = createBaseCommand(scriptName, version, description)
	.action(async () => {
		const directory = cwd();
		runMux({
			configuration: await loadConfigurationAsync({ cwd: directory, environment: env, home: homedir() }),
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
	.command("scaffold", async () => {
		const { scaffoldCommand } = await import("$commands/scaffold-command");
		return scaffoldCommand;
	})
	.command("completions", new CompletionsCommand());

await command.parse(argv.slice(2));
