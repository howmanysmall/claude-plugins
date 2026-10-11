import { describe, expect, it } from "vitest";

import {
	asObject,
	getNumber,
	getObject,
	getObjects,
	getString,
	isJsonArray,
	isJsonRpcId,
	isJsonValue,
	withoutKeys,
} from "./json-utilities";

import type { JsonObject } from "type-fest";

describe("isJsonValue", () => {
	// Catches a valid nested result or params payload being rejected as
	// non-JSON, which would drop a legitimate server message.
	it("accepts every value JSON can carry, at any depth", () => {
		expect.assertions(8);

		expect(isJsonValue(null)).toBe(true);
		expect(isJsonValue(true)).toBe(true);
		expect(isJsonValue(0)).toBe(true);
		expect(isJsonValue(-1.5)).toBe(true);
		expect(isJsonValue("")).toBe(true);
		expect(isJsonValue([])).toBe(true);
		expect(isJsonValue([1, "a", null, false])).toBe(true);
		expect(isJsonValue({ nested: { deep: ["x"] } })).toBe(true);
	});

	// Catches NaN or Infinity in a server payload being treated as JSON, since
	// those round-trip to the client as null and lose the real value.
	it("rejects numbers JSON cannot represent", () => {
		expect.assertions(3);

		expect(isJsonValue(Number.NaN)).toBe(false);
		expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
		expect(isJsonValue(Number.NEGATIVE_INFINITY)).toBe(false);
	});

	// Catches undefined, a function, or a symbol slipping through a shallow
	// check at the top level or buried in a nested array or object.
	it("rejects values with no JSON representation, even when nested", () => {
		expect.assertions(8);

		expect(isJsonValue(undefined)).toBe(false);
		expect(isJsonValue(() => 1)).toBe(false);
		expect(isJsonValue(Symbol("s"))).toBe(false);
		expect(isJsonValue(123n)).toBe(false);
		expect(isJsonValue({ a: undefined })).toBe(false);
		expect(isJsonValue([undefined])).toBe(false);
		expect(isJsonValue({ a: [1, () => 1] })).toBe(false);
		expect(isJsonValue({ a: { b: Symbol("s") } })).toBe(false);
	});
});

describe("isJsonArray", () => {
	// Catches a single workspace folder sent as one object, or a scalar, being
	// indexed as a list so `folders[0]` reads a key off the wrong thing.
	it("treats only real arrays as arrays", () => {
		expect.assertions(7);

		expect(isJsonArray([])).toBe(true);
		expect(isJsonArray([1, "a"])).toBe(true);
		expect(isJsonArray({})).toBe(false);
		expect(isJsonArray("uri")).toBe(false);
		expect(isJsonArray(0)).toBe(false);
		expect(isJsonArray(null)).toBe(false);
		expect(isJsonArray(undefined)).toBe(false);
	});
});

describe("isJsonRpcId", () => {
	// Catches id 0 or "" being discarded as falsy, which turns the client's
	// request into a notification it never receives a response to.
	it("accepts string and numeric ids, including 0 and the empty string", () => {
		expect.assertions(4);

		expect(isJsonRpcId("1")).toBe(true);
		expect(isJsonRpcId(1)).toBe(true);
		expect(isJsonRpcId(0)).toBe(true);
		expect(isJsonRpcId("")).toBe(true);
	});

	// Catches a null or structured id from a parse-error response being read as
	// correlation to a live request, so the wrong callback resolves.
	it("rejects ids a JSON-RPC peer never sends", () => {
		expect.assertions(6);

		expect(isJsonRpcId(undefined)).toBe(false);
		expect(isJsonRpcId(null)).toBe(false);
		expect(isJsonRpcId(true)).toBe(false);
		expect(isJsonRpcId(false)).toBe(false);
		expect(isJsonRpcId({})).toBe(false);
		expect(isJsonRpcId([])).toBe(false);
	});
});

describe("asObject", () => {
	// Catches params or an initialize result sent as an array or scalar being
	// read as an object, so every key lookup against it silently misses.
	it("returns JSON objects as-is and rejects everything else", () => {
		expect.assertions(10);

		expect(asObject({ a: 1 })).toStrictEqual({ a: 1 });
		expect(asObject({})).toStrictEqual({});
		expect(asObject([])).toBeUndefined();
		expect(asObject([{ a: 1 }])).toBeUndefined();
		expect(asObject("")).toBeUndefined();
		expect(asObject(0)).toBeUndefined();
		expect(asObject(false)).toBeUndefined();
		expect(asObject(true)).toBeUndefined();
		expect(asObject(null)).toBeUndefined();
		expect(asObject(undefined)).toBeUndefined();
	});
});

describe("getObject", () => {
	// Catches a scalar sent where a nested object is expected (textDocument as
	// a URI string, a range as an array) being handed on to key lookups.
	it("reads a nested object by key and nothing else", () => {
		expect.assertions(6);

		expect(getObject({ a: { b: 1 } }, "a")).toStrictEqual({ b: 1 });
		expect(getObject({ a: [1] }, "a")).toBeUndefined();
		expect(getObject({ a: "uri" }, "a")).toBeUndefined();
		expect(getObject({ a: 1 }, "a")).toBeUndefined();
		expect(getObject({}, "a")).toBeUndefined();
		expect(getObject(undefined, "a")).toBeUndefined();
	});
});

describe("getString", () => {
	// Catches a version, language id, or boolean read as a string, so a URI or
	// method comparison never matches.
	it("reads only string values", () => {
		expect.assertions(8);

		const object: JsonObject = {
			array: [],
			flag: true,
			nothing: null,
			number: 1,
			object: {},
			string: "x",
		};

		expect(getString(object, "string")).toBe("x");
		expect(getString(object, "number")).toBeUndefined();
		expect(getString(object, "flag")).toBeUndefined();
		expect(getString(object, "object")).toBeUndefined();
		expect(getString(object, "array")).toBeUndefined();
		expect(getString(object, "nothing")).toBeUndefined();
		expect(getString(object, "missing")).toBeUndefined();
		expect(getString(undefined, "string")).toBeUndefined();
	});
});

describe("getNumber", () => {
	// Catches a numeric string version ("3") or a boolean being read as a
	// number, so a document version or message type comes out wrong.
	it("reads only number values", () => {
		expect.assertions(6);

		const object: JsonObject = { array: [], flag: true, nothing: null, number: 3.5, string: "3" };

		expect(getNumber(object, "number")).toBe(3.5);
		expect(getNumber(object, "string")).toBeUndefined();
		expect(getNumber(object, "flag")).toBeUndefined();
		expect(getNumber(object, "array")).toBeUndefined();
		expect(getNumber(object, "nothing")).toBeUndefined();
		expect(getNumber(undefined, "number")).toBeUndefined();
	});
});

describe("getObjects", () => {
	// Catches a malformed entry inside contentChanges or diagnostics (a string,
	// null, or nested array) crashing the caller or reading as an object.
	it("keeps object entries in order and drops the rest", () => {
		expect.assertions(2);

		const object: JsonObject = { items: [7, { a: 1 }, "x", [1], null, { b: 2 }] };

		expect(getObjects(object, "items")).toStrictEqual([{ a: 1 }, { b: 2 }]);
		expect(getObjects(object, "items")).toHaveLength(2);
	});

	// Catches an object or scalar sent where a list is expected being iterated,
	// or a missing key crashing the caller.
	it("returns an empty list for a non-array or missing value", () => {
		expect.assertions(5);

		expect(getObjects({ items: { a: 1 } }, "items")).toStrictEqual([]);
		expect(getObjects({ items: "x" }, "items")).toStrictEqual([]);
		expect(getObjects({ items: null }, "items")).toStrictEqual([]);
		expect(getObjects({}, "items")).toStrictEqual([]);
		expect(getObjects(undefined, "items")).toStrictEqual([]);
	});
});

describe("withoutKeys", () => {
	// Catches sibling capabilities being stripped with the targeted one, or a
	// same-named key nested a level deeper being removed along with it.
	it("removes only the named top-level keys", () => {
		expect.assertions(2);

		const capabilities: JsonObject = {
			diagnostic: { dynamicRegistration: false },
			hover: { dynamicRegistration: true },
			textDocument: { diagnostic: { dynamicRegistration: false }, hover: true },
		};

		expect(withoutKeys(capabilities, new Set(["diagnostic"]))).toStrictEqual({
			hover: { dynamicRegistration: true },
			textDocument: { diagnostic: { dynamicRegistration: false }, hover: true },
		});
		expect(withoutKeys(capabilities, new Set())).toStrictEqual(capabilities);
	});

	// Catches the client's own initialization capabilities being mutated in
	// place, which would leak the stripped capability into every later server.
	it("leaves the input untouched", () => {
		expect.assertions(2);

		const capabilities: JsonObject = { diagnostic: {}, hover: {} };
		withoutKeys(capabilities, new Set(["diagnostic"]));

		expect(capabilities).toStrictEqual({ diagnostic: {}, hover: {} });
		expect(capabilities.diagnostic).toStrictEqual({});
	});
});
