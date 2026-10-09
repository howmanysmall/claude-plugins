import { inspect } from "node:util";
import { Predicate } from "effect";

import { INTERNAL_ERROR } from "$constants";
import { isNotificationMessage, isRequestMessage } from "$utilities/message-utilities";

import type { JsonValue } from "type-fest";

import type { Connection, ConnectionHandlers, PendingRequest } from "$types/mux-types";
import type { Message, RequestMessage, RequestResult, ResponseMessage } from "$types/protocol-types";

/**
 * Lets work run without awaiting it. Failures surface elsewhere (as error
 * responses or exit events), so a rejection carries no new information.
 *
 * @param promise - The work to let run.
 */
export function detach(promise: Promise<unknown>): void {
	promise.catch(() => undefined);
}

export function createConnection(send: (message: Message) => void, handlers: ConnectionHandlers): Connection {
	return { closed: false, handlers, nextId: 1, pending: new Map(), send };
}

/**
 * Resolves every in-flight request with an error and refuses new ones.
 *
 * @param connection - The connection to close.
 * @param reason - The error message handed to waiting callers.
 */
export function closeConnection(connection: Connection, reason: string): void {
	connection.closed = true;
	const waiting = [...connection.pending.entries()];
	connection.pending.clear();
	for (const [id, resolve] of waiting) {
		resolve({ id, error: { code: INTERNAL_ERROR, message: reason }, jsonrpc: "2.0" });
	}
}

async function answerAsync(connection: Connection, request: RequestMessage): Promise<void> {
	let outcome: RequestResult;
	try {
		outcome = await connection.handlers.onRequest(request);
	} catch (error) {
		outcome = { error: { code: INTERNAL_ERROR, message: inspect(error) } };
	}
	if (!connection.closed) connection.send({ ...outcome, id: request.id, jsonrpc: "2.0" });
}

/**
 * Dispatches one incoming message: requests to the request handler,
 * notifications to the notification handler, responses to their caller.
 *
 * @param connection - The receiving connection.
 * @param message - The decoded JSON-RPC message to route.
 */
export function receiveMessage(connection: Connection, message: Message): void {
	if (isRequestMessage(message)) {
		detach(answerAsync(connection, message));
		return;
	}
	if (isNotificationMessage(message)) {
		connection.handlers.onNotification(message.method, message.params);
		return;
	}
	if (!Predicate.isNumber(message.id)) return;

	const resolve = connection.pending.get(message.id);
	if (resolve === undefined) return;
	connection.pending.delete(message.id);
	resolve(message);
}

export function sendNotification(connection: Connection, method: string, parameters?: JsonValue): void {
	if (connection.closed) return;
	connection.send(
		parameters === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params: parameters },
	);
}

export function sendRequest(connection: Connection, method: string, parameters?: JsonValue): PendingRequest {
	const id = connection.nextId++;

	if (connection.closed) {
		const error = { code: INTERNAL_ERROR, message: "connection is closed" };
		return { id, response: Promise.resolve({ id, error, jsonrpc: "2.0" }) };
	}

	const { promise, resolve } = Promise.withResolvers<ResponseMessage>();
	connection.pending.set(id, resolve);
	connection.send(
		parameters === undefined ? { id, jsonrpc: "2.0", method } : { id, jsonrpc: "2.0", method, params: parameters },
	);
	return { id, response: promise };
}
