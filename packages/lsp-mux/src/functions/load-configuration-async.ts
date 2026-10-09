import nodePath from "node:path";
import { type } from "arktype";
import { loadConfig } from "c12";
import { Predicate } from "effect";

import { CONFIGURATION_NAME, USER_CONFIGURATION_VARIABLE } from "$constants";
import { isConfiguration } from "$validators/configuration-type";

import type { UnknownRecord } from "type-fest";

import type { Configuration } from "$validators/configuration-type";

export interface ConfigurationLocation {
	readonly configFile: string;
	readonly cwd: string;
}

export interface LoadConfigurationOptions {
	/** The project directory; c12 looks for `lsp-mux.config.*` here. */
	readonly cwd: string;
	/**
	 * Lowest-priority configuration file, such as the defaults a plugin ships.
	 */
	readonly defaults?: string | undefined;
	/** Variables used to find the user configuration. */
	readonly environment: Readonly<Record<string, string | undefined>>;
	/** The user's home directory. */
	readonly home: string;
}

/**
 * Deep-merges configuration layers, leftmost winning, like c12's default
 * `defu` except that arrays are replaced instead of concatenated: a project
 * overriding a server's `args` means those arguments, not both sets.
 *
 * @param layers - Layers, highest priority first.
 * @returns The merged layer.
 */
export function mergeLayers(...layers: ReadonlyArray<unknown>): UnknownRecord {
	const merged: UnknownRecord = {};
	for (const layer of layers.toReversed()) {
		if (!Predicate.isObject(layer)) continue;
		for (const [key, value] of Object.entries(layer)) {
			if (value === undefined) continue;

			const previous = merged[key];
			merged[key] =
				Predicate.isObject(previous) && Predicate.isObject(value) ? mergeLayers(value, previous) : value;
		}
	}
	return merged;
}

async function readLayerAsync(cwd: string, configFile: string): Promise<UnknownRecord> {
	const { config } = await loadConfig<UnknownRecord>({
		configFile,
		cwd,
		dotenv: false,
		envName: false,
		globalRc: false,
		omit$Keys: true,
		packageJson: false,
		rcFile: false,
	});
	return Predicate.isObject(config) ? config : {};
}

async function readDefaultsAsync(cwd: string, defaults: string): Promise<UnknownRecord> {
	const path = nodePath.resolve(cwd, defaults);
	return readLayerAsync(nodePath.dirname(path), nodePath.basename(defaults));
}

/**
 * Finds where the user configuration lives: `$LSP_MUX_CONFIG`, else
 * `lsp-mux.{json,jsonc,ts,...}` in `$XDG_CONFIG_HOME` (default `~/.config`).
 *
 * @param environment - Variables to read.
 * @param home - The user's home directory.
 * @returns The directory and base name c12 should load.
 */
export function getUserConfigurationLocation(
	environment: Readonly<Record<string, string | undefined>>,
	home: string,
): ConfigurationLocation {
	const explicit = environment[USER_CONFIGURATION_VARIABLE];
	if (explicit !== undefined && explicit !== "") {
		const path = nodePath.resolve(home, explicit);
		return { configFile: nodePath.basename(path), cwd: nodePath.dirname(path) };
	}

	const xdg = environment.XDG_CONFIG_HOME;
	return {
		configFile: CONFIGURATION_NAME,
		cwd: xdg === undefined || xdg === "" ? nodePath.join(home, ".config") : xdg,
	};
}

function parseConfiguration(config: UnknownRecord): Configuration {
	const configuration = isConfiguration(config);
	if (configuration instanceof type.errors) {
		throw new TypeError(`invalid lsp-mux configuration: ${configuration.summary}`);
	}
	return configuration;
}

/**
 * Loads the layered configuration: the defaults file, then the user
 * configuration, then the project's `lsp-mux.config.*`, later layers winning.
 * Servers are keyed by name, so a layer only states what it changes.
 *
 * @param options - Where each layer comes from.
 * @param options.cwd - The project directory.
 * @param options.defaults - Lowest-priority configuration file, if any.
 * @param options.environment - Variables used to find the user configuration.
 * @param options.home - The user's home directory.
 * @returns The validated configuration.
 * @throws {TypeError} When the merged configuration is invalid.
 */
export async function loadConfigurationAsync({
	cwd,
	defaults,
	environment,
	home,
}: LoadConfigurationOptions): Promise<Configuration> {
	const user = getUserConfigurationLocation(environment, home);
	const [defaultsLayer, userLayer] = await Promise.all([
		defaults === undefined ? Promise.resolve({}) : readDefaultsAsync(cwd, defaults),
		readLayerAsync(user.cwd, user.configFile),
	]);

	const { config } = await loadConfig<UnknownRecord>({
		name: CONFIGURATION_NAME,
		cwd,
		defaults: mergeLayers(userLayer, defaultsLayer),
		dotenv: false,
		envName: false,
		globalRc: false,
		merger: mergeLayers,
		omit$Keys: true,
		packageJson: false,
		rcFile: false,
	});

	return parseConfiguration(config);
}
