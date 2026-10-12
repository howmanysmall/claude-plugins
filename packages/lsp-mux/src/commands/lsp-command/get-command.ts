import { styleText } from "node:util";
import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };
import { consola } from "consola";

import { version } from "$constants";
import { completeConfiguredServersAsync, getLoadOptions, runActionAsync } from "$functions/command-context";
import { inspectServersAsync } from "$functions/inspect-servers-async";
import { configurationLocationType } from "$validators/configuration-location-type";

import type { InspectedServer } from "$functions/inspect-servers-async";

const scriptName = getScriptName(true);

function formatList(values: ReadonlyArray<string>): string {
	return values.length === 0 ? styleText("dim", "none") : values.join(", ");
}

function formatServer(server: InspectedServer): string {
	const scope = `(${server.scope})`;
	const heading = `${styleText("bold", server.name)} ${styleText("dim", scope)}`;
	const { definition } = server;
	if (definition === undefined) return `${heading}\n  ${styleText("red", server.error ?? "invalid")}`;

	const found = server.found ? styleText("green", "✓ found") : styleText("red", "✗ not found");
	const fields: Array<[string, string]> = [
		["Command", `${[definition.command, ...definition.args].join(" ")}  ${found}`],
		["Extensions", formatList(definition.extensions)],
		["Root markers", formatList(definition.rootMarkers)],
		["Requires root marker", definition.requireRootMarker ? "yes" : "no"],
		["Formatter", server.formatter ? "yes" : "no"],
		["Environment", formatList(Object.entries(definition.env).map(([key, value]) => `${key}=${value}`))],
	];
	if (definition.settings !== undefined) fields.push(["Settings", JSON.stringify(definition.settings)]);
	if (definition.initializationOptions !== undefined) {
		fields.push(["Initialization options", JSON.stringify(definition.initializationOptions)]);
	}
	if (server.shadowed) {
		fields.push(["Status", styleText("yellow", "shadowed: the project's `servers` list replaces the user list")]);
	}

	let width = 0;
	for (const [label] of fields) width = Math.max(width, label.length + 1);
	const lines = fields.map(([label, value]) => {
		const field = `${label}:`;
		return `  ${field.padEnd(width)} ${value}`;
	});
	return [heading, ...lines].join("\n");
}

export const getCommand = createBaseCommand(scriptName, version, "Get details about a configured LSP.")
	.type("configuration-location", configurationLocationType)
	.complete("configured-server", completeConfiguredServersAsync)
	.arguments("<name:string:configured-server>")
	.option("--location <location:configuration-location>", "Only look in one configuration.")
	.option("--json", "Output the details in JSON format.")
	.action(async ({ json = false, location }, name) => {
		await runActionAsync(async () => {
			const { servers, warnings } = await inspectServersAsync(getLoadOptions(), location);
			for (const warning of warnings) consola.warn(warning);

			const matches = servers.filter((server) => server.name === name);
			if (matches.length === 0) throw new Error(`${name} isn't configured.`);

			if (json) {
				console.log(JSON.stringify(matches, undefined, "\t"));
				return;
			}
			console.log(matches.map(formatServer).join("\n\n"));
		});
	});
