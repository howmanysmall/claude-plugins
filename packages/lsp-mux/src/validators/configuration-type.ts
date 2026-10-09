import {
	isBoolean,
	isMaybeBoolean,
	isMaybeJsonObject,
	isMaybeNonEmptyString,
	isMaybeReadonlyArrayOfStrings,
	isMaybeReadonlyDictionaryOfStrings,
	isReadonlyArrayOfStrings,
	isReadonlyDictionaryOfStrings,
	isString,
	isUndefined,
} from "@howmanysmall/arktype-utilities";
import { type } from "arktype";

/** How to start a language server and which files it handles. */
export const isServerOptions = type({
	"args?": isMaybeReadonlyArrayOfStrings,
	"command?": isMaybeNonEmptyString,
	"env?": isMaybeReadonlyDictionaryOfStrings,
	"extensions?": isMaybeReadonlyArrayOfStrings,
	"initializationOptions?": isMaybeJsonObject,
	/** Only start where a root marker exists, not at the workspace root. */
	"requireRootMarker?": isMaybeBoolean,
	"rootMarkers?": isMaybeReadonlyArrayOfStrings,
	"settings?": isMaybeJsonObject,
}).readonly();
export type ServerOptions = typeof isServerOptions.inferIn;

/** A server with everything needed to start it. */
export const isServerDefinition = type({
	args: isReadonlyArrayOfStrings.default(() => []),
	command: "string > 0",
	env: isReadonlyDictionaryOfStrings.default(() => ({})),
	extensions: isReadonlyArrayOfStrings,
	"initializationOptions?": isMaybeJsonObject,
	requireRootMarker: isBoolean.default(false),
	rootMarkers: isReadonlyArrayOfStrings.default(() => []),
	"settings?": isMaybeJsonObject,
}).readonly();
export type ServerDefinition = typeof isServerDefinition.infer;

export const isConfiguration = type({
	/** Servers that format documents, in priority order. */
	"formatters?": isMaybeReadonlyArrayOfStrings,
	/**
	 * Per-server options, layered over the built-in definition if there is one.
	 */
	"options?": type.Record(isString, isServerOptions).or(isUndefined),
	/** Servers to run, in priority order. */
	"servers?": isMaybeReadonlyArrayOfStrings,
}).readonly();
export type Configuration = typeof isConfiguration.infer;
