import { resolveConfiguration } from "$functions/resolve-configuration";
import { isConfiguration } from "$types/configuration-types";
import { mergeLayers } from "$utilities/merge-utilities";
import { ConfigurationLocation } from "$validators/configuration-location-type";

import type { ResolvedServer } from "$functions/resolve-configuration";
import type { Configuration, ServerOptions } from "$types/configuration-types";

/** A list a layer inherited from the user layer before editing it. */
export type InheritedList = "formatters" | "servers";

export interface ServerListEdit {
	readonly configuration: Configuration;
	/** Lists copied from the user layer because the edited layer had none. */
	readonly inherited: ReadonlyArray<InheritedList>;
}

export interface AddServerOptions {
	readonly name: string;
	/** Also format documents with the server. */
	readonly formatter: boolean;
	/** Lists to start from when the layer has none, so it doesn't shadow them. */
	readonly inheritFrom?: Configuration | undefined;
	/** Options to layer over the server's built-in definition. */
	readonly options?: ServerOptions | undefined;
}

export interface ServerEntry {
	readonly name: string;
	/** The resolved server, unless its definition is incomplete. */
	readonly definition: ResolvedServer | undefined;
	/** Why the server couldn't be resolved. */
	readonly error: string | undefined;
	/** Whether the server formats documents. */
	readonly formatter: boolean;
	/** The layer listing the server. */
	readonly scope: ConfigurationLocation;
	/** Whether the project's own `servers` list hides this one. */
	readonly shadowed: boolean;
}

export interface Layers {
	readonly project: Configuration;
	readonly user: Configuration;
}

function startList(
	configuration: Configuration,
	key: InheritedList,
	inheritFrom: Configuration | undefined,
	inherited: Array<InheritedList>,
): ReadonlyArray<string> {
	const own = configuration[key];
	if (own !== undefined) return own;

	const parent = inheritFrom?.[key];
	if (parent === undefined || parent.length === 0) return [];
	inherited.push(key);
	return parent;
}

function compact(configuration: Configuration): Configuration {
	return Object.fromEntries(Object.entries(configuration).filter(([, value]) => value !== undefined));
}

function withoutName(list: ReadonlyArray<string>, name: string): ReadonlyArray<string> {
	return list.filter((entry) => entry !== name);
}

function withName(list: ReadonlyArray<string>, name: string): ReadonlyArray<string> {
	return list.includes(name) ? list : [...list, name];
}

function removeFromList(
	configuration: Configuration,
	key: InheritedList,
	name: string,
	inheritFrom: Configuration | undefined,
	inherited: Array<InheritedList>,
): ReadonlyArray<string> | undefined {
	const own = configuration[key];
	if (own !== undefined) {
		return withoutName(own, name);
	}

	if (inheritFrom?.[key]?.includes(name) !== true) return undefined;
	return withoutName(startList(configuration, key, inheritFrom, inherited), name);
}

function removeOptions(options: Configuration["options"], name: string): Configuration["options"] {
	if (options?.[name] === undefined) return options;
	const { [name]: _removed, ...rest } = options;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * Checks whether a layer mentions a server anywhere.
 *
 * @param configuration - The layer to search.
 * @param name - The server's name, as `servers` lists it.
 * @returns Whether `servers`, `formatters`, or `options` name it.
 */
export function mentionsServer(configuration: Configuration, name: string): boolean {
	return (
		configuration.servers?.includes(name) === true ||
		configuration.formatters?.includes(name) === true ||
		configuration.options?.[name] !== undefined
	);
}

/**
 * Adds a server to a layer. A layer with no `servers` list starts from the
 * user layer's, since a project list replaces the user list instead of adding
 * to it.
 *
 * @param configuration - The layer to edit.
 * @param options - The server to add.
 * @returns The edited layer and which lists it inherited.
 */
export function addServer(
	configuration: Configuration,
	{ name, formatter, inheritFrom, options }: AddServerOptions,
): ServerListEdit {
	const inherited = new Array<InheritedList>();
	const servers = withName(startList(configuration, "servers", inheritFrom, inherited), name);
	const formatters = formatter
		? withName(startList(configuration, "formatters", inheritFrom, inherited), name)
		: configuration.formatters;
	const hasOptions = options !== undefined && Object.keys(options).length > 0;

	return {
		configuration: compact({
			...configuration,
			formatters,
			options: hasOptions
				? { ...configuration.options, [name]: { ...configuration.options?.[name], ...options } }
				: configuration.options,
			servers,
		}),
		inherited,
	};
}

/**
 * Removes a server from a layer's `servers`, `formatters`, and `options`. A
 * layer with no `servers` list starts from the user layer's minus the server,
 * which is the only way a project can stop running a user server.
 *
 * @param configuration - The layer to edit.
 * @param name - The server to remove.
 * @param inheritFrom - The user layer, when editing the project layer.
 * @returns The edited layer and which lists it inherited.
 */
export function removeServer(configuration: Configuration, name: string, inheritFrom?: Configuration): ServerListEdit {
	const inherited = new Array<InheritedList>();
	const servers = removeFromList(configuration, "servers", name, inheritFrom, inherited);
	const formatters = removeFromList(configuration, "formatters", name, inheritFrom, inherited);

	return {
		configuration: compact({
			...configuration,
			formatters,
			options: removeOptions(configuration.options, name),
			servers,
		}),
		inherited,
	};
}

function resolveEntry(name: string, options: Configuration["options"]): Pick<ServerEntry, "definition" | "error"> {
	try {
		const [definition] = resolveConfiguration({ options, servers: [name] }).servers;
		return { definition, error: undefined };
	} catch (error) {
		return { definition: undefined, error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Lists the servers each layer names, project layer first, the way the mux
 * sees them: a project `servers` list hides every user server.
 *
 * @param layers - The project and user layers.
 * @returns One entry per server per layer.
 */
export function describeServers({ project, user }: Layers): ReadonlyArray<ServerEntry> {
	const { options } = isConfiguration.assert({ options: mergeLayers(project.options, user.options) });
	const effectiveFormatters = new Set<string>(project.formatters ?? user.formatters);
	const userFormatters = new Set<string>(user.formatters);
	const userShadowed = project.servers !== undefined;
	const projectServers = project.servers ?? [];
	const userServers = user.servers ?? [];

	const entries = new Array<ServerEntry>();
	for (const name of projectServers) {
		entries.push({
			name,
			...resolveEntry(name, options),
			formatter: effectiveFormatters.has(name),
			scope: ConfigurationLocation.Local,
			shadowed: false,
		});
	}
	for (const name of userServers) {
		entries.push({
			name,
			...resolveEntry(name, options),
			formatter: (userShadowed ? userFormatters : effectiveFormatters).has(name),
			scope: ConfigurationLocation.Global,
			shadowed: userShadowed,
		});
	}
	return entries;
}
