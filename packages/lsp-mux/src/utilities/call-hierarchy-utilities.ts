import { MUX_DATA_KEY } from "$constants";
import { asObject, getObject, getString, isJsonArray, withoutKeys } from "$utilities/json-utilities";

import type { JsonObject, JsonValue } from "type-fest";

import type { ResponseMessage } from "$types/protocol-types";

const DATA_KEYS: ReadonlySet<string> = new Set(["data"]);

function tagItem(item: JsonValue, key: string): JsonValue {
	const object = asObject(item);
	if (object === undefined) return item;

	const { data } = object;
	return { ...object, data: data === undefined ? { [MUX_DATA_KEY]: key } : { data, [MUX_DATA_KEY]: key } };
}

function tagCalls(result: ReadonlyArray<JsonValue>, field: string, key: string): ReadonlyArray<JsonValue> {
	return result.map((call) => {
		const object = asObject(call);
		const item = object?.[field];
		return object === undefined || item === undefined ? call : { ...object, [field]: tagItem(item, key) };
	});
}

export interface UntaggedItem {
	readonly key: string;
	readonly item: JsonObject;
}

/**
 * Restores a call hierarchy item the mux tagged and reports which server
 * produced it.
 *
 * @param item - The item the client sent back.
 * @returns The original item and its server, or `undefined` when untagged.
 */
export function untagItem(item?: JsonObject): undefined | UntaggedItem {
	const data = getObject(item, "data");
	const key = getString(data, MUX_DATA_KEY);
	if (item === undefined || key === undefined) return undefined;

	const original = data?.data;
	const rest = withoutKeys(item, DATA_KEYS);
	return { key, item: original === undefined ? rest : { ...rest, data: original } };
}

/**
 * Marks call hierarchy items with the server that produced them so follow-up
 * `callHierarchy/*` requests return to the same server.
 *
 * @param method - The request method.
 * @param key - The answering server's backend key.
 * @param response - The server's response.
 * @returns The response with its items tagged.
 */
export function tagResponse(method: string, key: string, response: ResponseMessage): ResponseMessage {
	const { result } = response;
	if (!isJsonArray(result)) return response;

	switch (method) {
		case "callHierarchy/incomingCalls":
			return { ...response, result: tagCalls(result, "from", key) };

		case "callHierarchy/outgoingCalls":
			return { ...response, result: tagCalls(result, "to", key) };

		case "textDocument/prepareCallHierarchy":
			return { ...response, result: result.map((item) => tagItem(item, key)) };

		default:
			return response;
	}
}
