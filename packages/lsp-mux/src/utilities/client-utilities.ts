import { getConnection } from "$utilities/backend-utilities";
import { sendNotification, sendRequest } from "$utilities/connection-utilities";

import type { JsonValue } from "type-fest";

import type { MessageType } from "$meta/protocol-meta";
import type { Backend, Mux } from "$types/mux-types";
import type { JsonRpcId, ResponseMessage } from "$types/protocol-types";

export function logToClient(mux: Mux, type: MessageType, message: string): void {
	sendNotification(mux.client, "window/logMessage", { message, type });
}

/**
 * Sends a request to one server, remembering which client request it serves
 * so a client cancellation reaches it.
 *
 * @param mux - State shared by every handler.
 * @param backend - The server to ask.
 * @param method - The LSP method.
 * @param parameters - The request parameters.
 * @param clientId - The client request being served, if any.
 * @returns The server's response.
 */
export async function forwardAsync(
	mux: Mux,
	backend: Backend,
	method: string,
	parameters?: JsonValue,
	clientId?: JsonRpcId,
): Promise<ResponseMessage> {
	const { id, response } = sendRequest(getConnection(backend), method, parameters);
	if (clientId === undefined) return response;

	const entry = { id, backend };
	const entries = mux.cancellations.get(clientId) ?? [];
	entries.push(entry);
	mux.cancellations.set(clientId, entries);

	const result = await response;
	const remaining = entries.filter((candidate) => candidate !== entry);

	if (remaining.length === 0) mux.cancellations.delete(clientId);
	else mux.cancellations.set(clientId, remaining);

	return result;
}
