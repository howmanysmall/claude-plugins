import { test as it } from "vitest";

import { createMessageReader, encodeMessage } from "./message-utilities";

import type { Message } from "$types/protocol-types";

const MESSAGE: Message = {
	id: 1,
	jsonrpc: "2.0",
	method: "textDocument/didChange",
	params: { contentChanges: [{ text: "const value = 1;\n" }], textDocument: { uri: "file:///a.ts", version: 2 } },
};
const FRAME = encodeMessage(MESSAGE);
const CHUNKS = Array.from({ length: Math.ceil(FRAME.byteLength / 16) }, (_, index) =>
	FRAME.subarray(index * 16, index * 16 + 16),
);

it("createMessageReader", async ({ bench }) => {
	await bench.compare(
		bench("one whole frame", () => {
			createMessageReader(() => undefined)(FRAME);
		}),
		bench("frame in 16 byte chunks", () => {
			const read = createMessageReader(() => undefined);
			for (const chunk of CHUNKS) read(chunk);
		}),
	);
});
