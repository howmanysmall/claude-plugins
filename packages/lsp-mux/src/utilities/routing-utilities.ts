// oxlint-disable unicorn/no-null -- JSON-RPC results and ids are real null.

import { Predicate } from "effect";

import { MERGED_BY_DEFAULT, PROVIDERS, RouteStrategy, SyncKind } from "$meta/protocol-meta";
import { asObject, isJsonArray } from "$utilities/json-utilities";

import type { JsonObject, JsonValue } from "type-fest";

import type { RequestResult, ResponseMessage } from "$types/protocol-types";

export function getDefaultStrategy(method: string): RouteStrategy {
	return MERGED_BY_DEFAULT.has(method) ? RouteStrategy.Merge : RouteStrategy.First;
}

/**
 * Whether a server declared support for a method, statically in its
 * initialize result or through `client/registerCapability`.
 *
 * @param capabilities - The server's capabilities.
 * @param registered - Methods registered dynamically.
 * @param method - The LSP method.
 * @returns `true` when the server should receive the request.
 */
export function supportsMethod(
	capabilities: JsonObject,
	registered: ReadonlyMap<string, string>,
	method: string,
): boolean {
	for (const registeredMethod of registered.values()) {
		if (registeredMethod === method) return true;
	}

	const provider = PROVIDERS.get(method);
	if (provider === undefined) return true;

	const value = capabilities[provider];
	if (method === "textDocument/prepareRename") {
		return asObject(value)?.prepareProvider === true;
	}

	return value !== undefined && value !== null && value !== false;
}

export function getSyncKind(capabilities: JsonObject): SyncKind {
	const sync = capabilities.textDocumentSync;
	const kind = Predicate.isNumber(sync) ? sync : asObject(sync)?.change;
	if (kind === SyncKind.Full || kind === SyncKind.Incremental) return kind;
	return SyncKind.None;
}

function isEmpty(value: JsonValue): boolean {
	return value === null || (isJsonArray(value) && value.length === 0);
}

/**
 * Combines server responses in priority order. `first` returns the
 * highest-priority useful answer; `merge` concatenates array answers and
 * otherwise falls back to `first`.
 *
 * @param strategy - How to combine the answers.
 * @param responses - Responses ordered by server priority.
 * @returns The result or error to send the client.
 */
export function combineResponses(strategy: RouteStrategy, responses: ReadonlyArray<ResponseMessage>): RequestResult {
	if (strategy === RouteStrategy.Merge) {
		const arrays = responses.flatMap(({ result }) => (isJsonArray(result) ? [result] : []));
		if (arrays.some((array) => array.length > 0)) {
			return { result: arrays.flat() };
		}
	}

	for (const { error, result } of responses) {
		if (error === undefined && result !== undefined && !isEmpty(result)) return { result };
	}

	const answered = responses.find(({ error }) => error === undefined);
	if (answered !== undefined) {
		return { result: answered.result ?? null };
	}

	const failed = responses.find(({ error }) => error !== undefined)?.error;
	return failed === undefined ? { result: null } : { error: failed };
}
