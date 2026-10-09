import { type } from "arktype";

import {
	isBoolean,
	isMaybeReadonlyArrayOfStrings,
	isReadonlyArrayOfStrings,
	isReadonlyRecordOfStrings,
	isString,
	isUndefined,
} from "$validators/primitive-validators";

export const enum RouteStrategy {
	First = "first",
	Merge = "merge",
}

export const isServerConfiguration = type({
	args: isReadonlyArrayOfStrings.default(() => []),
	command: "string > 0",
	enabled: isBoolean.default(true),
	env: isReadonlyRecordOfStrings.default(() => ({})),
	extensions: isReadonlyArrayOfStrings,
	"initializationOptions?": "object.json | undefined",
	/** Only start where a root marker exists, not at the workspace root. */
	requireRootMarker: isBoolean.default(false),
	rootMarkers: isReadonlyArrayOfStrings.default(() => []),
	"settings?": "object.json | undefined",
}).readonly();

export const isRouteConfiguration = type({
	/** Servers allowed to answer, in priority order. */
	"servers?": isMaybeReadonlyArrayOfStrings,
	"strategy?": type.enumerated(RouteStrategy.First, RouteStrategy.Merge).or(isUndefined),
}).readonly();

/** A configuration file. Servers are keyed by name to merge across layers. */
export const isConfiguration = type({
	"routes?": type.Record(isString, isRouteConfiguration).or(isUndefined),
	"servers?": type.Record(isString, isServerConfiguration).or(isUndefined),
}).readonly();

export type ConfigurationInput = typeof isConfiguration.inferIn;
export type Configuration = typeof isConfiguration.infer;
export type ServerConfiguration = typeof isServerConfiguration.infer;
