import type { CatalogServer } from "$meta/server-catalog";
import type { ServerOptions } from "$validators/configuration-type";

/** A server name lsp-mux knows, or any other name with its own options. */
export type ServerName = CatalogServer | (Record<never, never> & string);

export interface LspMuxConfiguration {
	/** Servers that format documents, in priority order. */
	readonly formatters?: ReadonlyArray<ServerName>;
	/** Per-server options, layered over any built-in definition. */
	readonly options?: Readonly<Partial<Record<ServerName, ServerOptions>>>;
	/** Servers to run, in priority order. */
	readonly servers?: ReadonlyArray<ServerName>;
}

/**
 * Types an `lsp-mux.config.ts` file.
 *
 * @param configuration - The servers to run and their options.
 * @returns The configuration, unchanged.
 */
export function defineConfiguration(configuration: LspMuxConfiguration): LspMuxConfiguration {
	return configuration;
}
