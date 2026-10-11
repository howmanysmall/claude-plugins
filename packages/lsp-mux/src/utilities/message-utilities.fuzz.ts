import { expect } from "vitest";
import { fuzz } from "@vitiate/core";
import { FuzzedDataProvider } from "@vitiate/fuzzed-data-provider";

import { createMessageReader, encodeMessage } from "./message-utilities";

import type { Message } from "$types/protocol-types";

fuzz(
	"decodes an encoded message split into arbitrary chunks",
	(data): void => {
		// Catches framing bugs that only show when a header or a multi-byte
		// character straddles two reads.
		const provider = new FuzzedDataProvider(data);
		const message: Message = {
			id: provider.consumeIntegralInRange(0, 1_000_000),
			jsonrpc: "2.0",
			method: provider.consumeString(32),
			params: { text: provider.consumeString(64) },
		};
		const received = new Array<Message>();
		const read = createMessageReader((decoded) => {
			received.push(decoded);
		});

		const frame = encodeMessage(message);
		let offset = 0;
		while (offset < frame.byteLength) {
			const size = provider.consumeIntegralInRange(1, 16);
			read(frame.subarray(offset, offset + size));
			offset += size;
		}

		expect(received).toStrictEqual([message]);
	},
	{ maxLen: 256 },
);

fuzz(
	"only emits JSON-RPC 2.0 messages for arbitrary bytes",
	(data): void => {
		// Catches a malformed stream throwing out of the reader or leaking a
		// non-protocol value to the multiplexer.
		const received = new Array<Message>();
		const read = createMessageReader((message) => {
			received.push(message);
		});

		read(data);

		for (const message of received) expect(message.jsonrpc).toBe("2.0");
	},
	{ maxLen: 1024 },
);
