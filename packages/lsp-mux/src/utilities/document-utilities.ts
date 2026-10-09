import nodePath from "node:path";

import { applyContentChanges } from "$functions/apply-content-changes";
import { enqueue, getConnection } from "$utilities/backend-utilities";
import { sendNotification } from "$utilities/connection-utilities";
import { asObject, getNumber, getObject, getObjects, getString } from "$utilities/json-utilities";
import { getBackendsForDocument, toFilePath } from "$utilities/lifecycle-utilities";
import { syncDocument } from "$utilities/sync-utilities";

import type { JsonObject, JsonValue } from "type-fest";

import type { Mux } from "$types/mux-types";
import type { ContentChange, Position, Range } from "$types/protocol-types";

function toPosition(value?: JsonObject): Position | undefined {
	const line = getNumber(value, "line");
	const character = getNumber(value, "character");
	return line === undefined || character === undefined ? undefined : { character, line };
}

function toRange(value?: JsonObject): Range | undefined {
	const start = toPosition(getObject(value, "start"));
	const end = toPosition(getObject(value, "end"));
	return start === undefined || end === undefined ? undefined : { end, start };
}

function toContentChange(change: JsonObject): ContentChange | undefined {
	const text = getString(change, "text");
	if (text === undefined) return undefined;
	if (change.range === undefined) {
		return { text };
	}

	const range = toRange(getObject(change, "range"));
	return range === undefined ? undefined : { range, text };
}

function getUri(parameters?: JsonObject): string | undefined {
	return getString(getObject(parameters, "textDocument"), "uri");
}

function syncEverywhere(mux: Mux, uri: string): void {
	for (const backend of getBackendsForDocument(mux, uri)) {
		enqueue(backend, () => {
			syncDocument(mux, backend, uri);
		});
	}
}

export function openDocument(mux: Mux, parameters?: JsonObject): void {
	const textDocument = getObject(parameters, "textDocument");
	const uri = getString(textDocument, "uri");
	const text = getString(textDocument, "text");
	if (uri === undefined || text === undefined) return;

	mux.documents.set(uri, {
		languageId: getString(textDocument, "languageId") ?? "",
		text,
		version: getNumber(textDocument, "version") ?? 0,
	});
	syncEverywhere(mux, uri);
}

/**
 * Opens a document the client asked about without opening it, so servers
 * that only answer for open documents still can.
 *
 * @param mux - State shared by every handler.
 * @param uri - The document.
 */
export function openFromDisk(mux: Mux, uri: string): void {
	const path = toFilePath(uri);
	const text = path === undefined ? undefined : mux.options.readFile(path);
	if (path === undefined || text === undefined) return;

	mux.documents.set(uri, { languageId: nodePath.extname(path).slice(1), text, version: 0 });
	syncEverywhere(mux, uri);
}

export function changeDocument(mux: Mux, parameters?: JsonObject): void {
	const textDocument = getObject(parameters, "textDocument");
	const uri = getString(textDocument, "uri");
	const document = uri === undefined ? undefined : mux.documents.get(uri);
	if (uri === undefined || document === undefined) return;

	const changes = getObjects(parameters, "contentChanges").flatMap((change) => {
		const converted = toContentChange(change);
		return converted === undefined ? [] : [converted];
	});
	mux.documents.set(uri, {
		languageId: document.languageId,
		text: applyContentChanges(document.text, changes),
		version: getNumber(textDocument, "version") ?? document.version + 1,
	});
	syncEverywhere(mux, uri);
}

export function closeDocument(mux: Mux, parameters?: JsonObject): void {
	const uri = getUri(parameters);
	if (uri === undefined) return;

	mux.documents.delete(uri);
	mux.diagnostics.delete(uri);
	for (const backend of mux.backends.values()) {
		if (backend.sentVersions.has(uri)) {
			enqueue(backend, () => {
				syncDocument(mux, backend, uri);
			});
		}
	}
}

export function saveDocument(mux: Mux, method: string, parameters?: JsonValue): void {
	const uri = getUri(asObject(parameters));
	if (uri === undefined) return;

	for (const backend of mux.backends.values()) {
		if (backend.sentVersions.has(uri)) {
			enqueue(backend, () => {
				sendNotification(getConnection(backend), method, parameters);
			});
		}
	}
}

export function broadcast(mux: Mux, method: string, parameters?: JsonValue): void {
	for (const backend of mux.backends.values()) {
		enqueue(backend, () => {
			sendNotification(getConnection(backend), method, parameters);
		});
	}
}
