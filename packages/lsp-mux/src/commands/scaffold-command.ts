import nodePath from "node:path";
import { ValidationError } from "@cliffy/command";
import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };
import { confirm, select } from "@inquirer/prompts";
import { consola } from "consola";

import { TRUST_PROJECT_CONFIGS_VARIABLE, version } from "$constants";
import { getLoadOptions, isInteractive, runActionAsync } from "$functions/command-context";
import { loadConfigurationLayersAsync } from "$functions/load-configuration-async";
import { orderedCheckbox } from "$functions/ordered-checkbox-prompt";
import { getNewConfigurationPath, writeConfigurationFileAsync } from "$functions/update-configuration-file-async";
import { listCatalogServers } from "$meta/server-catalog";
import { ConfigurationFormat, getConfigurationFormat } from "$utilities/configuration-file-utilities";
import { catalogServerType } from "$validators/catalog-server-type";
import { configurationFormatType } from "$validators/configuration-format-type";
import { ConfigurationLocation, configurationLocationType } from "$validators/configuration-location-type";

const scriptName = getScriptName(true);

async function promptLocationAsync(): Promise<ConfigurationLocation> {
	return select({
		choices: [
			{ name: "This project (lsp-mux.config.*)", value: ConfigurationLocation.Local },
			{ name: "Your user configuration", value: ConfigurationLocation.Global },
		],
		message: "Where should the configuration go?",
	});
}

async function promptFormatAsync(location: ConfigurationLocation): Promise<ConfigurationFormat> {
	const typeScriptNote =
		location === ConfigurationLocation.Local
			? `Project TypeScript configurations only run when ${TRUST_PROJECT_CONFIGS_VARIABLE}=1 is set.`
			: "Typed with `LspMuxConfiguration`.";
	return select({
		choices: [
			{ name: "JSONC", value: ConfigurationFormat.Jsonc },
			{ name: "JSON", value: ConfigurationFormat.Json },
			{ name: "TypeScript", description: typeScriptNote, value: ConfigurationFormat.TypeScript },
		],
		message: "Which format?",
	});
}

interface ScaffoldFlags {
	readonly force?: boolean | undefined;
	readonly format?: ConfigurationFormat | undefined;
	readonly formatters?: ReadonlyArray<string> | undefined;
	readonly location?: ConfigurationLocation | undefined;
	readonly servers?: ReadonlyArray<string> | undefined;
}

interface ScaffoldTarget {
	readonly format: ConfigurationFormat;
	readonly location: ConfigurationLocation;
	readonly path: string;
}

function checkFormatters(servers: ReadonlyArray<string>, formatters: ReadonlyArray<string>): void {
	const serverSet = new Set(servers);
	const unknown = formatters.filter((formatter) => !serverSet.has(formatter));
	if (unknown.length > 0) {
		throw new ValidationError(`Formatters must also be servers: ${unknown.join(", ")}.`);
	}
}

/**
 * Decides which file to write, refusing to replace an existing configuration
 * unless forced, and never leaving two configurations side by side.
 *
 * @param flags - The command's flags.
 * @param interactive - Whether prompts can fill in missing flags.
 * @returns The file to write, or `undefined` when the user declined.
 * @rejects {Error} When a configuration already exists and can't be replaced.
 */
async function resolveTargetAsync(flags: ScaffoldFlags, interactive: boolean): Promise<ScaffoldTarget | undefined> {
	const options = getLoadOptions();
	const location = flags.location ?? (interactive ? await promptLocationAsync() : ConfigurationLocation.Local);
	const { project, user } = await loadConfigurationLayersAsync(options);
	const existing = location === ConfigurationLocation.Local ? project.file : user.file;
	if (existing !== undefined && flags.force !== true) {
		throw new Error(`${existing} already exists; pass --force to overwrite it.`);
	}

	const format = flags.format ?? (interactive ? await promptFormatAsync(location) : ConfigurationFormat.Jsonc);
	const path = getNewConfigurationPath(location, options, format);
	if (getConfigurationFormat(path) !== format) {
		throw new Error(`The user configuration path ${path} isn't a ${format} file.`);
	}
	if (existing === undefined) return { format, location, path };

	if (nodePath.resolve(existing) !== path) {
		throw new Error(`${existing} already exists in another format; remove it first.`);
	}
	if (interactive && !(await confirm({ default: false, message: `Overwrite ${existing}?` }))) return undefined;
	return { format, location, path };
}

async function chooseServersAsync(flags: ScaffoldFlags, interactive: boolean): Promise<ReadonlyArray<string>> {
	if (flags.servers !== undefined) return flags.servers;
	if (!interactive) {
		throw new ValidationError("Pass --servers when not running in a terminal.");
	}
	return orderedCheckbox({ choices: listCatalogServers(), message: "Which servers should run?", required: true });
}

async function chooseFormattersAsync(
	flags: ScaffoldFlags,
	interactive: boolean,
	servers: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
	if (flags.formatters !== undefined) return flags.formatters;
	if (!interactive) return [];
	return orderedCheckbox({ choices: servers, message: "Which of them format documents?" });
}

export const scaffoldCommand = createBaseCommand(scriptName, version, "Scaffold a new LSP configuration file.")
	.type("configuration-location", configurationLocationType)
	.type("configuration-format", configurationFormatType)
	.type("catalog-server", catalogServerType)
	.option("--location <location:configuration-location>", "Where to scaffold the configuration file.")
	.option("--format <format:configuration-format>", "The file format.")
	.option("--servers <servers:catalog-server[]>", "Servers to run, in priority order.")
	.option("--formatters <formatters:catalog-server[]>", "Servers that format documents, in priority order.")
	.option("-f, --force", "Overwrite an existing configuration file.")
	.example("Pick everything interactively", "lsp-mux scaffold")
	.example("Without prompts", "lsp-mux scaffold --servers typescript,oxlint,oxfmt --formatters oxfmt")
	.action(async (flags) => {
		await runActionAsync(async () => {
			const interactive = isInteractive();
			if (flags.servers !== undefined && flags.formatters !== undefined) {
				checkFormatters(flags.servers, flags.formatters);
			}
			if (!interactive && flags.servers === undefined) {
				throw new ValidationError("Pass --servers when not running in a terminal.");
			}

			const target = await resolveTargetAsync(flags, interactive);
			if (target === undefined) return;

			const servers = await chooseServersAsync(flags, interactive);
			const formatters = await chooseFormattersAsync(flags, interactive, servers);
			checkFormatters(servers, formatters);

			await writeConfigurationFileAsync(
				target.path,
				formatters.length > 0 ? { formatters, servers } : { servers },
			);
			consola.success(`Wrote ${target.path}`);
			if (target.location === ConfigurationLocation.Local && target.format === ConfigurationFormat.TypeScript) {
				consola.info(
					`lsp-mux only runs project TypeScript configurations when ${TRUST_PROJECT_CONFIGS_VARIABLE}=1 is set.`,
				);
			}
		});
	});
