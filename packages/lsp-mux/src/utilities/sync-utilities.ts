import { SyncKind } from "$meta/protocol-meta";
import { BackendState } from "$types/mux-types";
import { getBackendSyncKind, getConnection } from "$utilities/backend-utilities";
import { sendNotification } from "$utilities/connection-utilities";
import { pullDiagnostics } from "$utilities/diagnostic-utilities";

import type { Backend, Mux } from "$types/mux-types";

/**
 * Brings one server's copy of a document up to date with the mux's copy:
 * open, full-text change, or close. Full text keeps every server correct even
 * when it started while edits were in flight.
 *
 * @param mux - State shared by every handler.
 * @param backend - Server to update; ignored until it is ready.
 * @param uri - Document to bring up to date.
 */
export function syncDocument(mux: Mux, backend: Backend, uri: string): void {
	if (backend.state !== BackendState.Ready) return;

	const document = mux.documents.get(uri);
	const sent = backend.sentVersions.get(uri);
	const connection = getConnection(backend);

	if (document === undefined) {
		if (sent === undefined) return;
		backend.sentVersions.delete(uri);
		sendNotification(connection, "textDocument/didClose", { textDocument: { uri } });
		return;
	}

	if (sent === document.version) return;
	backend.sentVersions.set(uri, document.version);

	if (sent === undefined) {
		const { languageId, text, version } = document;
		sendNotification(connection, "textDocument/didOpen", { textDocument: { languageId, text, uri, version } });
	} else if (getBackendSyncKind(backend) !== SyncKind.None) {
		sendNotification(connection, "textDocument/didChange", {
			contentChanges: [{ text: document.text }],
			textDocument: { uri, version: document.version },
		});
	}
	pullDiagnostics(mux, backend, uri);
}
