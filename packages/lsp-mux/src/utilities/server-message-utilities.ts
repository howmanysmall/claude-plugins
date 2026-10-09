// oxlint-disable unicorn/no-null -- JSON-RPC results and ids are real null.

import nodePath from "node:path";
import { pathToFileURL } from "node:url";

import { METHOD_NOT_FOUND } from "$constants";
import { MessageType } from "$meta/protocol-meta";
import { logToClient } from "$utilities/client-utilities";
import { sendRequest } from "$utilities/connection-utilities";
import { pullAllDiagnostics, storeDiagnostics } from "$utilities/diagnostic-utilities";
import { asObject, getNumber, getObjects, getString } from "$utilities/json-utilities";

import type { JsonObject, JsonValue } from "type-fest";

import type { Backend, Mux } from "$types/mux-types";
import type { RequestMessage, RequestResult } from "$types/protocol-types";

function lookupSetting(settings?: JsonValue, section?: string): JsonValue {
	if (settings === undefined) return null;
	if (section === undefined || section.length === 0) return settings;

	let current: JsonValue | undefined = settings;
	for (const key of section.split(".")) current = asObject(current)?.[key];
	return current ?? null;
}

function register(mux: Mux, backend: Backend, parameters?: JsonObject): RequestResult {
	for (const registration of getObjects(parameters, "registrations")) {
		const id = getString(registration, "id");
		const method = getString(registration, "method");
		if (id !== undefined && method !== undefined) backend.registrations.set(id, method);
	}
	pullAllDiagnostics(mux, backend);
	return { result: null };
}

function unregister(backend: Backend, parameters?: JsonObject): RequestResult {
	for (const registration of getObjects(parameters, "unregisterations")) {
		const id = getString(registration, "id");
		if (id !== undefined) backend.registrations.delete(id);
	}
	return { result: null };
}

async function applyEditAsync(mux: Mux, request: RequestMessage): Promise<RequestResult> {
	const { error, result } = await sendRequest(mux.client, request.method, request.params).response;
	return error === undefined ? { result: result ?? null } : { error };
}

/**
 * Answers a request a server sends its client. The mux owns configuration,
 * registrations, and workspace folders; edits go to the real client.
 *
 * @param mux - State shared by every handler.
 * @param backend - The asking server.
 * @param request - The JSON-RPC request the server sent.
 * @returns The answer.
 */
export async function handleServerRequestAsync(
	mux: Mux,
	backend: Backend,
	request: RequestMessage,
): Promise<RequestResult> {
	const parameters = asObject(request.params);
	switch (request.method) {
		case "client/registerCapability":
			return register(mux, backend, parameters);

		case "client/unregisterCapability":
			return unregister(backend, parameters);

		case "workspace/applyEdit":
			return applyEditAsync(mux, request);

		case "workspace/configuration": {
			const { settings } = backend.server;
			const items = getObjects(parameters, "items");
			return { result: items.map((item) => lookupSetting(settings, getString(item, "section"))) };
		}

		case "workspace/diagnostic/refresh": {
			pullAllDiagnostics(mux, backend);
			return { result: null };
		}

		case "workspace/workspaceFolders":
			return { result: [{ name: nodePath.basename(backend.root), uri: pathToFileURL(backend.root).href }] };

		default: {
			// Servers ask the client for UI work (progress, messages) and
			// refreshes the mux has nothing to do for.
			const { method } = request;
			if (method.startsWith("window/") || method.endsWith("/refresh")) return { result: null };
			return { error: { code: METHOD_NOT_FOUND, message: `unhandled method ${method}` } };
		}
	}
}

export function handleServerNotification(mux: Mux, backend: Backend, method: string, parameters?: JsonValue): void {
	const object = asObject(parameters);
	if (method === "textDocument/publishDiagnostics") {
		const uri = getString(object, "uri");
		if (uri !== undefined) storeDiagnostics(mux, backend, uri, getObjects(object, "diagnostics"));
		return;
	}

	if (method !== "window/logMessage" && method !== "window/showMessage") return;
	const type: MessageType = getNumber(object, "type") ?? MessageType.Info;
	if (type <= MessageType.Warning) {
		logToClient(mux, type, `[${backend.name}] ${getString(object, "message") ?? ""}`);
	}
}
