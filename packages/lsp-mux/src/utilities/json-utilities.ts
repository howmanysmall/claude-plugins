import { Predicate } from "effect";

import type { JsonObject, JsonValue } from "type-fest";

export function isJsonValue(value: unknown): value is JsonValue {
	switch (typeof value) {
		case "boolean":
		case "string":
			return true;

		case "number":
			return Number.isFinite(value);

		case "object": {
			if (value === null) return true;
			if (Array.isArray(value)) return value.every(isJsonValue);
			return Object.values(value).every(isJsonValue);
		}

		default:
			return false;
	}
}

export function isJsonArray(value?: JsonValue): value is ReadonlyArray<JsonValue> {
	return Array.isArray(value);
}

export function isJsonRpcId(value: JsonValue | undefined): value is number | string {
	return Predicate.isNumber(value) || Predicate.isString(value);
}

export function asObject(value?: JsonValue): JsonObject | undefined {
	if (
		value === undefined ||
		value === null ||
		Predicate.isString(value) ||
		Predicate.isNumber(value) ||
		Predicate.isBoolean(value) ||
		isJsonArray(value)
	) {
		return undefined;
	}
	return value;
}

export function getObject(object: JsonObject | undefined, key: string): JsonObject | undefined {
	return asObject(object?.[key]);
}

export function getString(object: JsonObject | undefined, key: string): string | undefined {
	const value = object?.[key];
	return Predicate.isString(value) ? value : undefined;
}

export function getNumber(object: JsonObject | undefined, key: string): number | undefined {
	const value = object?.[key];
	return Predicate.isNumber(value) ? value : undefined;
}

export function getObjects(object: JsonObject | undefined, key: string): ReadonlyArray<JsonObject> {
	const value = object?.[key];
	if (!isJsonArray(value)) return [];

	const objects = new Array<JsonObject>();
	let size = 0;
	for (const element of value) {
		const entry = asObject(element);
		if (entry !== undefined) objects[size++] = entry;
	}
	return objects;
}

export function withoutKeys(object: JsonObject, keys: ReadonlySet<string>): JsonObject {
	return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.has(key)));
}
