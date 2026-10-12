import { homedir } from "node:os";
import process, { cwd, env, stdin, stdout } from "node:process";
import { ValidationError } from "@cliffy/command";
import { ExitPromptError } from "@inquirer/core";
import { consola } from "consola";

import { loadParsedLayersAsync } from "$functions/update-configuration-file-async";
import { listCatalogServers } from "$meta/server-catalog";

import type { LoadConfigurationOptions } from "$functions/load-configuration-async";

/**
 * Describes where this process finds its configuration layers.
 *
 * @returns The working directory, environment, and home directory.
 */
export function getLoadOptions(): LoadConfigurationOptions {
	return { cwd: cwd(), environment: env, home: homedir() };
}

/**
 * Checks whether a person can answer prompts.
 *
 * @returns Whether stdin and stdout are terminals.
 */
export function isInteractive(): boolean {
	return stdin.isTTY && stdout.isTTY;
}

/**
 * Runs a command action, reporting failures as one line instead of a stack
 * trace. Usage errors still reach Cliffy so it can show help.
 *
 * @param runAsync - The command's work.
 * @returns A promise that settles once the action has finished.
 * @rejects {ValidationError} When the command was used wrongly.
 */
export async function runActionAsync(runAsync: () => Promise<void>): Promise<void> {
	try {
		await runAsync();
	} catch (error) {
		if (error instanceof ValidationError) throw error;
		if (error instanceof ExitPromptError) {
			process.exitCode = 130;
			return;
		}
		consola.fail(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

async function listConfiguredServersAsync(): Promise<ReadonlyArray<string>> {
	const { project, user } = await loadParsedLayersAsync(getLoadOptions());
	return [...new Set([...(project.configuration.servers ?? []), ...(user.configuration.servers ?? [])])];
}

/**
 * Completes server names either configuration layer lists.
 *
 * @returns The names, or none when the configuration can't be read.
 */
export async function completeConfiguredServersAsync(): Promise<Array<string>> {
	return [...(await listConfiguredServersAsync().catch(() => []))];
}

/**
 * Completes catalog servers that aren't configured yet.
 *
 * @returns The names.
 */
export async function completeAddableServersAsync(): Promise<Array<string>> {
	const configured = new Set(await listConfiguredServersAsync().catch(() => []));
	return listCatalogServers().filter((name) => !configured.has(name));
}
