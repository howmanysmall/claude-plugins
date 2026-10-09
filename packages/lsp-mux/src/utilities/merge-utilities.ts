import { Predicate } from "effect";

import type { UnknownRecord } from "type-fest";

/**
 * Deep-merges configuration layers, leftmost winning, like c12's default
 * `defu` except that arrays are replaced instead of concatenated: a project
 * listing its `servers` means those servers, not both lists.
 *
 * @param layers - Layers, highest priority first.
 * @returns The merged layer.
 */
export function mergeLayers(...layers: ReadonlyArray<unknown>): UnknownRecord {
	const merged: UnknownRecord = {};
	for (const layer of layers.toReversed()) {
		if (!Predicate.isObject(layer)) continue;
		for (const [key, value] of Object.entries(layer)) {
			if (value === undefined) continue;

			const previous = merged[key];
			merged[key] =
				Predicate.isObject(previous) && Predicate.isObject(value) ? mergeLayers(value, previous) : value;
		}
	}
	return merged;
}
