import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };
import { consola } from "consola";

import { version } from "$constants";
import { completeConfiguredServersAsync, getLoadOptions, runActionAsync } from "$functions/command-context";
import {
	getLayerPath,
	loadParsedLayersAsync,
	updateConfigurationFileAsync,
} from "$functions/update-configuration-file-async";
import { mentionsServer, removeServer } from "$utilities/server-list-utilities";
import { ConfigurationLocation, configurationLocationType } from "$validators/configuration-location-type";

import type { ParsedLayers } from "$functions/update-configuration-file-async";
import type { InheritedList } from "$utilities/server-list-utilities";

const scriptName = getScriptName(true);

function findLocation(name: string, { project, user }: ParsedLayers): ConfigurationLocation {
	const inProject = mentionsServer(project.configuration, name);
	const inUser = mentionsServer(user.configuration, name);
	if (inProject && inUser) {
		throw new Error(`${name} is in both configurations; pass --location local or --location global.`);
	}
	if (inProject) return ConfigurationLocation.Local;
	if (inUser) return ConfigurationLocation.Global;
	throw new Error(`${name} isn't configured.`);
}

export const removeCommand = createBaseCommand(scriptName, version, "Remove an LSP from a configuration.")
	.type("configuration-location", configurationLocationType)
	.complete("configured-server", completeConfiguredServersAsync)
	.arguments("<name:string:configured-server>")
	.option(
		"--location <location:configuration-location>",
		"Which configuration to edit. Defaults to the one that has the server.",
	)
	.example("Remove a server", "lsp-mux lsp remove eslint")
	.example("Stop a user server in this project", "lsp-mux lsp remove eslint --location local")
	.action(async (flags, name) => {
		await runActionAsync(async () => {
			const loadOptions = getLoadOptions();
			const layers = await loadParsedLayersAsync(loadOptions);
			const location = flags.location ?? findLocation(name, layers);
			const isLocal = location === ConfigurationLocation.Local;
			const layer = isLocal ? layers.project : layers.user;

			if (
				!mentionsServer(layer.configuration, name) &&
				(!isLocal || !mentionsServer(layers.user.configuration, name))
			) {
				throw new Error(`${name} isn't in the ${location} configuration.`);
			}

			const path = getLayerPath(location, layers, loadOptions);
			let inherited: ReadonlyArray<InheritedList> = [];
			await updateConfigurationFileAsync(path, (configuration) => {
				const edit = removeServer(configuration, name, isLocal ? layers.user.configuration : undefined);
				({ inherited } = edit);
				return edit.configuration;
			});

			if (inherited.length > 0) {
				const lists = inherited.map((list) => `\`${list}\``).join(" and ");
				consola.info(
					`Copied the user configuration's ${lists} into ${path} without ${name}, since a project list replaces the user list.`,
				);
			}
			consola.success(`Removed ${name} from ${path}`);
		});
	});
