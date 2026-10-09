import { BackendState } from "$types/mux-types";
import { backendSupports } from "$utilities/backend-utilities";
import { forwardAsync } from "$utilities/client-utilities";
import { detach, sendNotification } from "$utilities/connection-utilities";
import { asObject, getObjects, getString } from "$utilities/json-utilities";

import type { JsonObject } from "type-fest";

import type { Backend, Mux } from "$types/mux-types";

/**
 * Sends the client the union of every server's diagnostics for a document: a
 * publish from one server must not erase another's findings.
 *
 * @param mux - State shared by every handler.
 * @param uri - The document.
 */
export function publishDiagnostics(mux: Mux, uri: string): void {
	const owners = mux.diagnostics.get(uri);
	const diagnostics = owners === undefined ? [] : [...owners.values()].flat();
	sendNotification(mux.client, "textDocument/publishDiagnostics", { diagnostics, uri });
}

export function storeDiagnostics(
	mux: Mux,
	backend: Backend,
	uri: string,
	diagnostics: ReadonlyArray<JsonObject>,
): void {
	let owners = mux.diagnostics.get(uri);
	if (owners === undefined) {
		owners = new Map();
		mux.diagnostics.set(uri, owners);
	}

	const { name } = backend;
	owners.set(
		backend.key,
		diagnostics.map((diagnostic) =>
			diagnostic.source === undefined ? { ...diagnostic, source: name } : diagnostic,
		),
	);
	publishDiagnostics(mux, uri);
}

export function clearBackendDiagnostics(mux: Mux, backend: Backend): void {
	for (const [uri, owners] of mux.diagnostics) if (owners.delete(backend.key)) publishDiagnostics(mux, uri);
}

async function pullDiagnosticsAsync(mux: Mux, backend: Backend, uri: string): Promise<void> {
	if (!backendSupports(backend, "textDocument/diagnostic")) return;

	const version = mux.documents.get(uri)?.version;
	const response = await forwardAsync(mux, backend, "textDocument/diagnostic", { textDocument: { uri } });
	const report = asObject(response.result);
	const current = backend.state !== BackendState.Stopped && mux.documents.get(uri)?.version === version;
	if (current && getString(report, "kind") === "full") {
		storeDiagnostics(mux, backend, uri, getObjects(report, "items"));
	}
}

/**
 * Asks a pull-only server for a document's diagnostics. Backends are told the
 * client cannot pull, so most servers publish instead and this does nothing.
 *
 * @param mux - State shared by every handler.
 * @param backend - The server to ask.
 * @param uri - The document.
 */
export function pullDiagnostics(mux: Mux, backend: Backend, uri: string): void {
	detach(pullDiagnosticsAsync(mux, backend, uri));
}

export function pullAllDiagnostics(mux: Mux, backend: Backend): void {
	for (const uri of backend.sentVersions.keys()) pullDiagnostics(mux, backend, uri);
}
