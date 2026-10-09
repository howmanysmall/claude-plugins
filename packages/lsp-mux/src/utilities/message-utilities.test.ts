import { describe, expect, it } from "vitest";

import { createMessageReader, encodeMessage, toMessage } from "./message-utilities";

import type { Message } from "$types/protocol-types";

describe("createMessageReader", () => {
	// Catches a message split across stdout chunks being dropped or mangled.
	it("decodes framed messages split across chunks and skips malformed frames", () => {
		expect.assertions(1);

		const messages = new Array<Message>();
		const read = createMessageReader((message) => {
			messages.push(message);
		});
		const encoded = encodeMessage({ id: 1, jsonrpc: "2.0", method: "a", params: { text: "é" } });
		const malformed = Buffer.from("X-Nope: 1\r\n\r\nContent-Length: 2\r\n\r\n{]Content-Length: 2\r\n\r\n{}");

		read(malformed);
		read(encoded.subarray(0, 10));
		read(encoded.subarray(10));

		expect(messages).toStrictEqual([{ id: 1, jsonrpc: "2.0", method: "a", params: { text: "é" } }]);
	});
});

describe("toMessage", () => {
	it("decodes requests, notifications, responses, and errors", () => {
		expect.assertions(5);

		expect(toMessage({ id: "x", jsonrpc: "2.0", method: "m" })).toStrictEqual({
			id: "x",
			jsonrpc: "2.0",
			method: "m",
		});
		expect(toMessage({ id: [], jsonrpc: "2.0", method: "m" })).toStrictEqual({ jsonrpc: "2.0", method: "m" });
		expect(toMessage({ id: 1, jsonrpc: "2.0" })).toStrictEqual({ id: 1, jsonrpc: "2.0", result: null });
		expect(toMessage({ id: null, error: { code: 1, data: 2, message: "m" }, jsonrpc: "2.0" })).toStrictEqual({
			id: null,
			error: { code: 1, data: 2, message: "m" },
			jsonrpc: "2.0",
		});
		expect(toMessage({ id: {}, jsonrpc: "2.0" })).toBeUndefined();
	});
});
