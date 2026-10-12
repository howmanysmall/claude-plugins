// oxlint-disable small-rules/prevent-abbreviations -- `args` is the configuration field.

import { styleText } from "node:util";
import { createBaseCommand } from "@howmanysmall/cli-utilities/create-base-command";
import { getScriptName } from "@howmanysmall/cli-utilities/get-script-name" with { type: "macro" };
import { consola } from "consola";

import { version } from "$constants";
import { getLoadOptions, runActionAsync } from "$functions/command-context";
import { inspectServersAsync } from "$functions/inspect-servers-async";
import { configurationLocationType } from "$validators/configuration-location-type";

import type { InspectedServer } from "$functions/inspect-servers-async";

const scriptName = getScriptName(true);

function getCommandLine({ definition }: InspectedServer): string {
	return definition === undefined ? "" : [definition.command, ...definition.args].join(" ");
}

function getStatus(server: InspectedServer): string {
	if (server.error !== undefined) return styleText("red", "✗ invalid");
	const found = server.found ? styleText("green", "✓ found") : styleText("red", "✗ not found");
	return server.shadowed ? `${found} ${styleText("dim", "(shadowed)")}` : found;
}

function toTable(servers: ReadonlyArray<InspectedServer>): string {
	const rows = servers.map((server) => [
		server.name + (server.formatter ? " (formatter)" : ""),
		server.scope,
		getCommandLine(server),
		getStatus(server),
	]);
	const widths = [0, 0, 0];
	for (const row of rows) {
		for (const [column, width] of widths.entries()) widths[column] = Math.max(width, row[column]?.length ?? 0);
	}

	return rows
		.map((row, index) => {
			const line = row
				.map((cell, column) => cell.padEnd(widths[column] ?? 0))
				.join("  ")
				.trimEnd();
			return servers[index]?.shadowed === true ? styleText("dim", line) : line;
		})
		.join("\n");
}

export const listCommand = createBaseCommand(scriptName, version, "List configured LSPs.")
	.type("configuration-location", configurationLocationType)
	.option("--location <location:configuration-location>", "Only list servers from one configuration.")
	.option("--json", "Output the list in JSON format.")
	.action(async ({ json = false, location }) => {
		await runActionAsync(async () => {
			const { servers, warnings } = await inspectServersAsync(getLoadOptions(), location);
			for (const warning of warnings) consola.warn(warning);

			if (json) {
				const rows = servers.map(({ name, definition, error, formatter, found, scope, shadowed }) => ({
					name,
					args: definition?.args,
					command: definition?.command,
					error,
					formatter,
					found,
					scope,
					shadowed,
				}));
				console.log(JSON.stringify(rows, undefined, "\t"));
				return;
			}

			if (servers.length === 0) {
				consola.info("No servers configured. Run `lsp-mux scaffold` to create a configuration.");
				return;
			}
			console.log(toTable(servers));
		});
	});
