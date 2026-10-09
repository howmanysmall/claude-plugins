// oxlint-disable unicorn/no-null -- JSON-RPC results and ids are real null.

import { CONTENT_LENGTH_REGEXP, HEADER_SEPARATOR } from "$constants";
import { asObject, getNumber, getString, isJsonRpcId, isJsonValue } from "$utilities/json-utilities";

import type { JsonValue } from "type-fest";

import type {
	Message,
	NotificationMessage,
	RequestMessage,
	ResponseError,
	ResponseMessage,
} from "$types/protocol-types";

export type MessageReader = (chunk: Uint8Array) => void;

function toResponseError(value?: JsonValue): ResponseError | undefined {
	const object = asObject(value);
	const code = getNumber(object, "code");
	const message = getString(object, "message");
	if (code === undefined || message === undefined) return undefined;

	const data = object?.data;
	return data === undefined ? { code, message } : { code, data, message };
}

/**
 * Decodes a parsed JSON value into a JSON-RPC 2.0 message.
 *
 * @param value - The parsed JSON body.
 * @returns The message, or `undefined` when the value is not JSON-RPC 2.0.
 */
export function toMessage(value: JsonValue): Message | undefined {
	const object = asObject(value);
	if (object?.jsonrpc !== "2.0") return undefined;

	const { id, params: parameters } = object;
	const method = getString(object, "method");

	if (method !== undefined) {
		const notification: NotificationMessage =
			parameters === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params: parameters };
		return isJsonRpcId(id) ? { ...notification, id } : notification;
	}

	if (id !== null && !isJsonRpcId(id)) return undefined;
	const error = toResponseError(object.error);
	if (error !== undefined) return { id, error, jsonrpc: "2.0" };
	return { id, jsonrpc: "2.0", result: object.result ?? null };
}

export function isRequestMessage(message: Message): message is RequestMessage {
	return "method" in message && "id" in message;
}

export function isNotificationMessage(message: Message): message is NotificationMessage {
	return "method" in message && !("id" in message);
}

export function isResponseMessage(message: Message): message is ResponseMessage {
	return !("method" in message);
}

export function encodeMessage(message: Message): Buffer {
	const body = Buffer.from(JSON.stringify(message), "utf8");
	return Buffer.concat([Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "ascii"), body]);
}

function parseBody(body: Buffer): Message | undefined {
	let value: unknown;
	try {
		value = JSON.parse(body.toString("utf8"));
	} catch {
		return undefined;
	}
	return isJsonValue(value) ? toMessage(value) : undefined;
}

/**
 * Creates a reader that splits a byte stream into `Content-Length` framed
 * messages. Malformed frames are skipped.
 *
 * @param onMessage - Receives each decoded message.
 * @returns A function to feed stream chunks to.
 */
export function createMessageReader(onMessage: (message: Message) => void): MessageReader {
	let buffer = Buffer.alloc(0);

	return (chunk) => {
		buffer = buffer.byteLength === 0 ? Buffer.from(chunk) : Buffer.concat([buffer, chunk]);

		for (;;) {
			const headerEnd = buffer.indexOf(HEADER_SEPARATOR);
			if (headerEnd === -1) return;

			const bodyStart = headerEnd + HEADER_SEPARATOR.byteLength;
			const length = CONTENT_LENGTH_REGEXP.exec(buffer.subarray(0, headerEnd).toString("ascii"))?.groups?.length;
			if (length === undefined) {
				buffer = buffer.subarray(bodyStart);
				continue;
			}

			const bodyEnd = bodyStart + Number(length);
			if (buffer.byteLength < bodyEnd) return;

			const message = parseBody(buffer.subarray(bodyStart, bodyEnd));
			buffer = buffer.subarray(bodyEnd);
			if (message !== undefined) onMessage(message);
		}
	};
}
