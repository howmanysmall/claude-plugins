import { statSync } from "node:fs";
import nodePath from "node:path";

import { loadParsedLayersAsync } from "$functions/update-configuration-file-async";
import { resolveCommand } from "$utilities/path-utilities";
import { describeServers } from "$utilities/server-list-utilities";

import type { LoadConfigurationOptions } from "$functions/load-configuration-async";
import type { ServerEntry } from "$utilities/server-list-utilities";
import type { ConfigurationLocation } from "$validators/configuration-location-type";

export interface InspectedServer extends ServerEntry {
	/** Whether the server's command resolves from the project or `PATH`. */
	readonly found: boolean;
}

export interface InspectedServers {
	readonly servers: ReadonlyArray<InspectedServer>;
	/** Why a configuration layer was skipped. */
	readonly warnings: ReadonlyArray<string>;
}

function fileExists(path: string): boolean {
	return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}

/**
 * Lists configured servers with whether each one can start here.
 *
 * @param options - Where each layer comes from.
 * @param location - Only list servers from this layer.
 * @returns The servers, project layer first, and any loading warnings.
 */
export async function inspectServersAsync(
	options: LoadConfigurationOptions,
	location?: ConfigurationLocation,
): Promise<InspectedServers> {
	const { project, user, warnings } = await loadParsedLayersAsync(options);
	const searchPath = (options.environment.PATH ?? "").split(nodePath.delimiter);

	const servers = new Array<InspectedServer>();
	const entries = describeServers({ project: project.configuration, user: user.configuration });
	for (const entry of entries) {
		if (location !== undefined && entry.scope !== location) continue;
		const command = entry.definition?.command;
		const found =
			command !== undefined &&
			resolveCommand(command, options.cwd, options.cwd, searchPath, fileExists) !== undefined;
		servers.push({ ...entry, found });
	}

	return { servers, warnings };
}
