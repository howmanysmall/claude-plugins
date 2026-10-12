import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";

import { CONFIGURATION_NAME } from "$constants";
import {
	getUserConfigurationLocation,
	loadConfigurationLayersAsync,
	parseConfiguration,
} from "$functions/load-configuration-async";
import {
	ConfigurationFormat,
	editConfigurationSource,
	getConfigurationFormat,
	renderConfiguration,
} from "$utilities/configuration-file-utilities";
import { ConfigurationLocation } from "$validators/configuration-location-type";

import type { LoadConfigurationOptions } from "$functions/load-configuration-async";
import type { Configuration } from "$types/configuration-types";

export interface ParsedLayer {
	readonly configuration: Configuration;
	readonly file: string | undefined;
}

export interface ParsedLayers {
	readonly project: ParsedLayer;
	readonly user: ParsedLayer;
	readonly warnings: ReadonlyArray<string>;
}

const FORMAT_EXTENSIONS = new Set([
	".cjs",
	".cts",
	".js",
	".json",
	".json5",
	".jsonc",
	".mjs",
	".mts",
	".toml",
	".ts",
	".yaml",
	".yml",
]);

/**
 * Loads both configuration layers and validates each one.
 *
 * @param options - Where each layer comes from.
 * @returns The layers and the files they came from.
 * @throws {TypeError} When a layer is invalid.
 */
export async function loadParsedLayersAsync(options: LoadConfigurationOptions): Promise<ParsedLayers> {
	const { project, user, warnings } = await loadConfigurationLayersAsync(options);
	return {
		project: { configuration: parseConfiguration(project.configuration), file: project.file },
		user: { configuration: parseConfiguration(user.configuration), file: user.file },
		warnings,
	};
}

/**
 * Picks the file a new configuration goes in: `lsp-mux.config.<format>` in
 * the project, or the user configuration path.
 *
 * @param location - Which layer.
 * @param options - Where each layer comes from.
 * @param format - The format to write.
 * @returns The path to create.
 */
export function getNewConfigurationPath(
	location: ConfigurationLocation,
	options: LoadConfigurationOptions,
	format: ConfigurationFormat,
): string {
	if (location === ConfigurationLocation.Local) {
		return nodePath.join(options.cwd, `${CONFIGURATION_NAME}.config.${format}`);
	}

	const { configFile, cwd } = getUserConfigurationLocation(options.environment, options.home);
	const path = nodePath.join(cwd, configFile);
	return FORMAT_EXTENSIONS.has(nodePath.extname(path)) ? path : `${path}.${format}`;
}

/**
 * Picks the file layer edits go to: the existing file, else a new JSONC one.
 *
 * @param location - Which layer.
 * @param layers - The loaded layers.
 * @param options - Where each layer comes from.
 * @returns The file to edit or create.
 */
export function getLayerPath(
	location: ConfigurationLocation,
	layers: ParsedLayers,
	options: LoadConfigurationOptions,
): string {
	const existing = location === ConfigurationLocation.Local ? layers.project.file : layers.user.file;
	return existing ?? getNewConfigurationPath(location, options, ConfigurationFormat.Jsonc);
}

/**
 * Writes a new configuration file, creating its directory.
 *
 * @param path - Where to write; its extension picks the format.
 * @param configuration - What the new file should hold.
 */
export async function writeConfigurationFileAsync(path: string, configuration: Configuration): Promise<void> {
	const format = getConfigurationFormat(path) ?? ConfigurationFormat.Jsonc;
	await mkdir(nodePath.dirname(path), { recursive: true });
	await writeFile(path, renderConfiguration(configuration, format));
}

/**
 * Edits a configuration file in place, or creates it when it doesn't exist.
 *
 * @param path - The configuration file to edit or create.
 * @param mutate - Returns the configuration the file should hold.
 */
export async function updateConfigurationFileAsync(
	path: string,
	mutate: (configuration: Configuration) => Configuration,
): Promise<void> {
	const content = await readFile(path, "utf8").catch(() => undefined);
	if (content === undefined) {
		await writeConfigurationFileAsync(path, mutate({}));
		return;
	}
	await writeFile(path, editConfigurationSource(path, content, mutate));
}
