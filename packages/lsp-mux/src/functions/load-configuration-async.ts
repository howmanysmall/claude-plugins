import nodePath from "node:path";
import { pathToFileURL } from "node:url";
import { type } from "arktype";
import { loadConfig } from "c12";
import { Predicate } from "effect";

import { CONFIGURATION_NAME, TRUST_PROJECT_CONFIGS_VARIABLE, USER_CONFIGURATION_VARIABLE } from "$constants";
import { resolveConfiguration } from "$functions/resolve-configuration";
import { isConfiguration } from "$types/configuration-types";
import { mergeLayers } from "$utilities/merge-utilities";

import type { LoadConfigOptions } from "c12";
import type { UnknownRecord } from "type-fest";

import type { ResolvedConfiguration } from "$functions/resolve-configuration";
import type { Configuration } from "$types/configuration-types";

export interface ConfigurationLocation {
	readonly configFile: string;
	readonly cwd: string;
}

export interface LoadConfigurationOptions {
	/** The project directory; c12 looks for `lsp-mux.config.*` here. */
	readonly cwd: string;
	/** Variables used to find the user configuration. */
	readonly environment: Readonly<Record<string, string | undefined>>;
	/** The user's home directory. */
	readonly home: string;
}

/**
 * Imports a code configuration.
 *
 * @param id - The configuration file.
 * @returns The configuration module.
 */
const importConfigurationAsync: NonNullable<LoadConfigOptions["import"]> = async function importConfigurationAsync(id) {
	const module: unknown = await import(pathToFileURL(id).href);
	return module;
};

/**
 * Loads a project's code configuration only when the user opted in: Claude
 * Code starts lsp-mux on its own, so running an untrusted repository's
 * `lsp-mux.config.ts` would run its code unasked.
 *
 * @param trusted - Whether the user set the opt-in variable.
 * @param warnings - Collects why a configuration was skipped.
 * @returns The import function c12 calls for code configurations.
 */
function createProjectImport(trusted: boolean, warnings: Array<string>): NonNullable<LoadConfigOptions["import"]> {
	if (trusted) return importConfigurationAsync;
	// oxlint-disable-next-line typescript/require-await -- c12's hook returns a promise; skipping awaits nothing.
	return async (id) => {
		warnings.push(`skipped ${id}: set ${TRUST_PROJECT_CONFIGS_VARIABLE}=1 to run project configuration code`);
		return {};
	};
}

async function readLayerAsync(location: ConfigurationLocation): Promise<UnknownRecord> {
	const { config } = await loadConfig<UnknownRecord>({
		...location,
		dotenv: false,
		envName: false,
		globalRc: false,
		import: importConfigurationAsync,
		omit$Keys: true,
		packageJson: false,
		rcFile: false,
	});
	return Predicate.isObject(config) ? config : {};
}

/**
 * Finds where the user configuration lives: `$LSP_MUX_CONFIG`, else
 * `lsp-mux.{ts,json,jsonc,...}` in `$XDG_CONFIG_HOME` (default `~/.config`).
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
 * Loads the user configuration, then the project's `lsp-mux.config.*` over
 * it, and resolves the servers to run.
 *
 * @param options - Where each layer comes from.
 * @param options.cwd - The project directory.
 * @param options.environment - Variables used to find the user configuration.
 * @param options.home - The user's home directory.
 * @returns The servers and formatters to use.
 * @throws {TypeError} When the configuration is invalid.
 */
export async function loadConfigurationAsync({
	cwd,
	environment,
	home,
}: LoadConfigurationOptions): Promise<ResolvedConfiguration> {
	const warnings = new Array<string>();
	const trusted = environment[TRUST_PROJECT_CONFIGS_VARIABLE] === "1";
	const userLayer = await readLayerAsync(getUserConfigurationLocation(environment, home));
	const { config } = await loadConfig<UnknownRecord>({
		name: CONFIGURATION_NAME,
		cwd,
		defaults: userLayer,
		dotenv: false,
		envName: false,
		globalRc: false,
		import: createProjectImport(trusted, warnings),
		merger: mergeLayers,
		omit$Keys: true,
		packageJson: false,
		rcFile: false,
	});

	return { ...resolveConfiguration(parseConfiguration(config)), warnings };
}
