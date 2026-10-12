import nodePath from "node:path";
import { isDeepStrictEqual } from "node:util";
import { type } from "arktype";
import { Predicate } from "effect";
import { parse, printParseErrorCode } from "jsonc-parser";
import { generateCode, parseModule } from "magicast";

import { name as packageName } from "$constants";
import { isConfiguration } from "$types/configuration-types";
import { editJsonc } from "$utilities/jsonc-utilities";

import type { ArkErrors } from "arktype";
import type { ParseError } from "jsonc-parser";
import type { ProxifiedModule, ProxifiedValue } from "magicast";
import type { UnknownRecord } from "type-fest";

import type { Configuration } from "$types/configuration-types";

/** A format `scaffold` can write. */
export const enum ConfigurationFormat {
	Json = "json",
	Jsonc = "jsonc",
	TypeScript = "ts",
}

const enum SourceKind {
	Code = "code",
	Json = "json",
}

const SOURCE_KINDS = new Map([
	[".cjs", SourceKind.Code],
	[".cts", SourceKind.Code],
	[".js", SourceKind.Code],
	[".json", SourceKind.Json],
	[".jsonc", SourceKind.Json],
	[".mjs", SourceKind.Code],
	[".mts", SourceKind.Code],
	[".ts", SourceKind.Code],
]);

const IDENTIFIER_KEY_REGEXP = /^(?<indentation>\t*)"(?<key>[$A-Z_a-z][\w$]*)":/gmu;
const STRING_ARRAY_REGEXP = /\[\n\t+(?<items>(?:"(?:[^"\\]|\\.)*",\n\t+)*"(?:[^"\\]|\\.)*")\n\t*\]/gu;
const ITEM_SEPARATOR_REGEXP = /,\n\t+/gu;
const TAB_INDENTATION_REGEXP = /^\t/mu;
const LEADING_TABS_REGEXP = /^\t+/gmu;
const LEADING_SPACES_REGEXP = /^(?: {4})+/gmu;
const SPACES_PER_TAB = 4;
/** The order a new file lists its keys in: what runs, then how. */
const KEY_ORDER = ["servers", "formatters", "options"] as const;

interface ConfigurationModule {
	readonly default?: ProxifiedValue;
}

function getSourceKind(path: string): SourceKind {
	const extension = nodePath.extname(path);
	const kind = SOURCE_KINDS.get(extension);
	if (kind === undefined) {
		throw new TypeError(`lsp-mux can't edit ${extension || "extensionless"} configurations; edit ${path} by hand`);
	}
	return kind;
}

function assertValid(path: string, result: ArkErrors | Configuration): Configuration {
	if (result instanceof type.errors) {
		throw new TypeError(`invalid lsp-mux configuration in ${path}: ${result.summary}`);
	}
	return result;
}

function parseJsonConfiguration(path: string, content: string): Configuration {
	const errors = new Array<ParseError>();
	const data: unknown = parse(content, errors, { allowTrailingComma: true });
	const [error] = errors;
	if (error !== undefined) {
		throw new SyntaxError(`${path}: ${printParseErrorCode(error.error)} at offset ${error.offset}`);
	}
	return assertValid(path, isConfiguration(data ?? {}));
}

/**
 * Finds the object literal a code configuration exports: either
 * `export default { ... }` or `export default defineConfiguration({ ... })`.
 *
 * @param path - The file, for errors.
 * @param program - The parsed file.
 * @returns The proxied object literal.
 * @throws {TypeError} When the export isn't a literal lsp-mux can edit.
 */
function getDefaultExportObject(path: string, program: ProxifiedModule<ConfigurationModule>): UnknownRecord {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: magicast proxifies every export as a `ProxifiedValue`.
	const exported = program.exports.default as ProxifiedValue | undefined;
	let literal = exported;
	if (exported?.$type === "function-call") {
		const [argument] = exported.$args;
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: call arguments are proxified the same way.
		literal = argument as ProxifiedValue | undefined;
	}
	if (literal?.$type === "object") {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: object proxies read and write like plain objects.
		return literal as UnknownRecord;
	}

	if (exported === undefined) {
		throw new TypeError(`${path} has no default export; edit it by hand`);
	}
	throw new TypeError(`${path} doesn't export an object literal lsp-mux can edit; edit it by hand`);
}

function readProxiedConfiguration(path: string, proxied: UnknownRecord): Configuration {
	// oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- structuredClone can't clone a Proxy.
	const data = JSON.parse(JSON.stringify(proxied));
	return assertValid(path, isConfiguration(data));
}

/**
 * Writes the difference between two plain objects onto a magicast proxy, so
 * untouched properties keep their source text.
 *
 * @param target - The proxied object literal.
 * @param before - The object the proxy currently holds.
 * @param after - The object it should hold.
 */
function applyDifference(target: UnknownRecord, before: UnknownRecord, after: UnknownRecord): void {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const key of keys) {
		const previous = before[key];
		const next = after[key];
		if (isDeepStrictEqual(previous, next)) continue;

		const proxied = target[key];
		if (next === undefined) {
			delete target[key];
		} else if (Predicate.isObject(proxied) && Predicate.isObject(previous) && Predicate.isObject(next)) {
			applyDifference(proxied, previous, next);
		} else {
			target[key] = next;
		}
	}
}

/**
 * Picks the format of a file from its extension.
 *
 * @param path - The configuration file.
 * @returns The format, or `undefined` for one `scaffold` doesn't write.
 */
export function getConfigurationFormat(path: string): ConfigurationFormat | undefined {
	switch (nodePath.extname(path)) {
		case ".json":
			return ConfigurationFormat.Json;

		case ".jsonc":
			return ConfigurationFormat.Jsonc;

		case ".ts":
			return ConfigurationFormat.TypeScript;

		default:
			return undefined;
	}
}

/**
 * Writes a new configuration file's contents. A TypeScript configuration only
 * imports the package's types, so it runs where the package isn't installed.
 *
 * @param configuration - The configuration to write.
 * @param format - Which syntax to write it in.
 * @returns The file contents.
 */
export function renderConfiguration(configuration: Configuration, format: ConfigurationFormat): string {
	const ordered = Object.fromEntries(KEY_ORDER.map((key) => [key, configuration[key]]));
	const expanded = JSON.stringify(ordered, undefined, "\t");
	const json = expanded.replaceAll(STRING_ARRAY_REGEXP, (_match, items: string) => {
		const inline = items.replaceAll(ITEM_SEPARATOR_REGEXP, ", ");
		return `[${inline}]`;
	});
	if (format !== ConfigurationFormat.TypeScript) return `${json}\n`;

	const literal = json.replaceAll(IDENTIFIER_KEY_REGEXP, "$<indentation>$<key>:");
	return `export default ${literal} satisfies import("${packageName}").LspMuxConfiguration;\n`;
}

/**
 * Reads a configuration file without running it.
 *
 * @param path - The file, used for its extension and in errors.
 * @param content - The file contents.
 * @returns What the file configures.
 * @throws {TypeError} When the file can't be read statically or is invalid.
 */
export function readConfigurationSource(path: string, content: string): Configuration {
	if (getSourceKind(path) === SourceKind.Json) {
		return parseJsonConfiguration(path, content);
	}

	return readProxiedConfiguration(path, getDefaultExportObject(path, parseModule<ConfigurationModule>(content)));
}

/**
 * Edits a configuration file in place, keeping comments and formatting where
 * nothing changed.
 *
 * @param path - The file, used for its extension and in errors.
 * @param content - The file contents.
 * @param mutate - Returns the configuration the file should hold.
 * @returns The new file contents.
 * @throws {TypeError} When the file can't be edited or is invalid.
 */
export function editConfigurationSource(
	path: string,
	content: string,
	mutate: (configuration: Configuration) => Configuration,
): string {
	if (getSourceKind(path) === SourceKind.Json) {
		return editJsonc(content, (data) => assertValid(path, isConfiguration(data ?? {})), mutate);
	}

	// recast misaligns tab indentation it reprints, so it only ever sees spaces.
	const usesTabs = TAB_INDENTATION_REGEXP.test(content);
	const source = usesTabs
		? content.replaceAll(LEADING_TABS_REGEXP, (tabs) => " ".repeat(tabs.length * SPACES_PER_TAB))
		: content;

	const program = parseModule<ConfigurationModule>(source);
	const target = getDefaultExportObject(path, program);
	const before = readProxiedConfiguration(path, target);
	applyDifference(target, before, mutate(before));

	const { code } = generateCode(program, { format: { tabWidth: SPACES_PER_TAB, useTabs: false } });
	const edited = usesTabs
		? code.replaceAll(LEADING_SPACES_REGEXP, (spaces) => "\t".repeat(spaces.length / SPACES_PER_TAB))
		: code;
	return edited.endsWith("\n") ? edited : `${edited}\n`;
}
