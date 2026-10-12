// oxlint-disable small-rules/prevent-abbreviations -- `args` and `env` are configuration fields.

import { ValidationError } from "@cliffy/command";
import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };
import { consola } from "consola";

import { version } from "$constants";
import { completeAddableServersAsync, getLoadOptions, runActionAsync } from "$functions/command-context";
import {
	getLayerPath,
	loadParsedLayersAsync,
	updateConfigurationFileAsync,
} from "$functions/update-configuration-file-async";
import { getCatalogServer } from "$meta/server-catalog";
import { addServer } from "$utilities/server-list-utilities";
import { ConfigurationLocation, configurationLocationType } from "$validators/configuration-location-type";

import type { ServerOptions } from "$types/configuration-types";
import type { InheritedList } from "$utilities/server-list-utilities";

const scriptName = getScriptName(true);

interface AddFlags {
	readonly env?: ReadonlyArray<string>;
	readonly extension?: ReadonlyArray<string>;
	readonly rootMarker?: ReadonlyArray<string>;
}

function parseEnvironment(variables: ReadonlyArray<string>): ServerOptions["env"] {
	if (variables.length === 0) return undefined;

	const environment = new Map<string, string>();
	for (const variable of variables) {
		const separator = variable.indexOf("=");
		if (separator <= 0) throw new ValidationError(`Expected KEY=VALUE, got "${variable}".`);
		environment.set(variable.slice(0, separator), variable.slice(separator + 1));
	}
	return Object.fromEntries(environment);
}

function nonEmpty(values: ReadonlyArray<string>): ReadonlyArray<string> | undefined {
	return values.length > 0 ? values : undefined;
}

function buildOptions(
	command: string | undefined,
	commandArguments: ReadonlyArray<string>,
	{ env: variables = [], extension = [], rootMarker = [] }: AddFlags,
): ServerOptions {
	const options: ServerOptions = {
		args: command === undefined ? undefined : commandArguments,
		command,
		env: parseEnvironment(variables),
		extensions: nonEmpty(extension),
		rootMarkers: nonEmpty(rootMarker),
	};
	return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

function describeInherited(inherited: ReadonlyArray<InheritedList>): string {
	return inherited.map((list) => `\`${list}\``).join(" and ");
}

export const addCommand = createBaseCommand(scriptName, version, "Add an LSP to a configuration.")
	.type("configuration-location", configurationLocationType)
	.complete("addable-server", completeAddableServersAsync)
	.arguments("<name:string:addable-server> [command:string] [...args:string]")
	.option("--location <location:configuration-location>", "Which configuration to edit.", {
		default: ConfigurationLocation.Local,
	})
	.option("-e, --env <variable:string>", "Set an environment variable for the server (KEY=VALUE).", {
		collect: true,
	})
	.option("--extension <extension:string>", "A file extension the server handles, like .ts.", { collect: true })
	.option("--root-marker <marker:string>", "A file that marks the server's project root.", { collect: true })
	.option("--formatter", "Also format documents with the server.")
	.example("A built-in server", "lsp-mux lsp add typescript")
	.example("A built-in server as a formatter", "lsp-mux lsp add oxfmt --formatter")
	.example("A custom server", "lsp-mux lsp add my-lsp --extension .foo -- my-lsp --stdio")
	.action(async function addAction(
		this: { getLiteralArgs(): Array<string> },
		flags,
		name,
		command,
		...commandArguments
	) {
		const literal = this.getLiteralArgs();
		await runActionAsync(async () => {
			const [literalCommand, ...literalArguments] = literal;
			const resolvedCommand = command ?? literalCommand;
			const resolvedArguments = command === undefined ? literalArguments : [...commandArguments, ...literal];

			const options = buildOptions(resolvedCommand, resolvedArguments, flags);
			if (
				getCatalogServer(name) === undefined &&
				(options.command === undefined || options.extensions === undefined)
			) {
				throw new ValidationError(
					`${name} isn't a built-in server, so pass its command and at least one --extension.`,
				);
			}

			const loadOptions = getLoadOptions();
			const layers = await loadParsedLayersAsync(loadOptions);
			const { location } = flags;
			const path = getLayerPath(location, layers, loadOptions);
			const inheritFrom = location === ConfigurationLocation.Local ? layers.user.configuration : undefined;

			let inherited: ReadonlyArray<InheritedList> = [];
			await updateConfigurationFileAsync(path, (configuration) => {
				if (configuration.servers?.includes(name) === true) {
					throw new Error(`${name} is already in ${path}.`);
				}
				const edit = addServer(configuration, {
					name,
					formatter: flags.formatter === true,
					inheritFrom,
					options,
				});
				({ inherited } = edit);
				return edit.configuration;
			});

			if (inherited.length > 0) {
				consola.info(
					`Copied the user configuration's ${describeInherited(inherited)} into ${path}, since a project list replaces the user list.`,
				);
			}
			consola.success(`Added ${name} to ${path}`);
		});
	});
