// oxlint-disable vitest/no-standalone-expect -- `it.prop` callbacks are the test bodies.

import { describe, expect } from "vitest";
import { fc, it } from "@fast-check/vitest";

import { PROPERTY_RUNS } from "../property-runs";
import { createMessageReader, encodeMessage } from "./message-utilities";

import type { Message, RequestMessage } from "$types/protocol-types";

// Multi-byte text makes frame boundaries land inside a UTF-8 sequence, which
// is what a pipe does to a real stream.
const MULTI_BYTE_SUFFIX = "é中😀";

// `-0` serializes as `0`, so it cannot survive the wire.
const integerArbitrary = fc.integer().map((value) => value + 0);
const itemsArbitrary = fc.array(integerArbitrary);
const paramsArbitrary = fc.record(
	{ flag: fc.boolean(), items: itemsArbitrary, text: fc.string() },
	{ noNullPrototype: true },
);
const requestParts = fc.record(
	{
		id: fc.oneof(integerArbitrary, fc.string()),
		method: fc.string({ minLength: 1 }),
		params: paramsArbitrary,
	},
	{ noNullPrototype: true },
);

interface RequestParts {
	readonly id: number | string;
	readonly method: string;
	readonly params: { readonly flag: boolean; readonly items: ReadonlyArray<number>; readonly text: string };
}

function toRequest({ id, method, params }: RequestParts): RequestMessage {
	return { id, jsonrpc: "2.0", method: `${method}${MULTI_BYTE_SUFFIX}`, params };
}

function splitAt(bytes: Uint8Array, cuts: ReadonlyArray<number>): ReadonlyArray<Uint8Array> {
	const offsets = [...new Set(cuts.map((cut) => cut % (bytes.byteLength + 1)))].toSorted((a, b) => a - b);
	const chunks = new Array<Uint8Array>();
	let previous = 0;
	for (const offset of [...offsets, bytes.byteLength]) {
		chunks.push(bytes.subarray(previous, offset));
		previous = offset;
	}
	return chunks;
}

describe("createMessageReader", () => {
	// Catches frames lost or duplicated when a header or body is split across
	// reads.
	it.prop([fc.array(requestParts, { maxLength: 6 }), fc.array(fc.nat(), { maxLength: 12 })], {
		numRuns: PROPERTY_RUNS,
	})("should decode every framed message regardless of how the stream is chunked", (parts, cuts) => {
		expect.hasAssertions();

		// Arrange
		const requests: ReadonlyArray<RequestMessage> = parts.map((part) => toRequest(part));
		const received = new Array<Message>();
		const read = createMessageReader((message) => {
			received.push(message);
		});
		const stream = Buffer.concat(requests.map((request) => encodeMessage(request)));

		// Act
		for (const chunk of splitAt(stream, cuts)) read(chunk);

		// Assert
		expect(received).toStrictEqual(requests);
	});
});
