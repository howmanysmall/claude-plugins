import { type } from "arktype";

import { getCatalogServer } from "$meta/server-catalog";
import { mergeLayers } from "$utilities/merge-utilities";
import { isServerDefinition } from "$validators/configuration-type";

import type { Configuration, ServerDefinition } from "$validators/configuration-type";

export interface ResolvedServer extends ServerDefinition {
	readonly name: string;
}

export interface ResolvedConfiguration {
	/** Servers that format documents, in priority order. */
	readonly formatters: ReadonlyArray<string>;
	/** Servers to run, in priority order. */
	readonly servers: ReadonlyArray<ResolvedServer>;
	/** Problems loading the configuration, shown to the client. */
	readonly warnings?: ReadonlyArray<string>;
}

function resolveServer(name: string, configuration: Configuration): ResolvedServer {
	const definition = isServerDefinition(mergeLayers(configuration.options?.[name], getCatalogServer(name)));
	if (definition instanceof type.errors) {
		throw new TypeError(`lsp-mux server "${name}": ${definition.summary}`);
	}
	return { ...definition, name };
}

/**
 * Turns a configuration into the servers to run: each named server's built-in
 * definition, if any, with its `options` layered on top.
 *
 * @param configuration - The merged configuration.
 * @returns The servers and formatters, in priority order.
 * @throws {TypeError} When a server is unknown and its options don't say how to
 *   start it.
 */
export function resolveConfiguration(configuration: Configuration): ResolvedConfiguration {
	return {
		formatters: configuration.formatters ?? [],
		servers: (configuration.servers ?? []).map((name) => resolveServer(name, configuration)),
	};
}
