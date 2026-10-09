import { describe, expect, it } from "vitest";

import { name as packageName } from "$constants";
import { resolveConfiguration } from "$functions/resolve-configuration";
import { detach } from "$utilities/connection-utilities";
import { asObject, getObject, getString, isJsonArray } from "$utilities/json-utilities";
import { createMux, receiveClientMessage } from "$utilities/mux-utilities";
import { isConfiguration } from "$validators/configuration-type";

import type { JsonObject, JsonValue } from "type-fest";

import type { LspMuxConfiguration } from "$functions/define-config";
import type { ResolvedConfiguration } from "$functions/resolve-configuration";
import type { Mux, SpawnSpecification, TransportEvents } from "$types/mux-types";
import type { Message, RequestMessage, ResponseError } from "$types/protocol-types";
import type { ServerOptions } from "$validators/configuration-type";

type HandlerOutcome = JsonValue | { readonly failure: string };
type Handler = (parameters: JsonObject) => HandlerOutcome | Promise<HandlerOutcome>;

interface FakeBehavior {
	readonly capabilities?: JsonObject;
	readonly handlers?: Readonly<Record<string, Handler>>;
	readonly initializeError?: boolean;
	readonly initializeResult?: JsonValue;
}

interface FakeServer {
	readonly crash: (reason?: string) => void;
	readonly errorFor: (id: number) => string | undefined;
	readonly initializeParameter: (key: string) => JsonValue | undefined;
	readonly methods: () => ReadonlyArray<string>;
	readonly notify: (method: string, parameters: JsonValue) => void;
	readonly openedUris: () => ReadonlyArray<string | undefined>;
	readonly parametersOf: (method: string) => ReadonlyArray<JsonObject | undefined>;
	readonly receive: (message: Message) => void;
	readonly request: (method: string, parameters: JsonValue) => number;
	readonly resultFor: (id: number) => JsonValue | undefined;
	readonly specification: SpawnSpecification;
}

function getResultOf(message?: Message): JsonValue | undefined {
	return message !== undefined && "result" in message ? message.result : undefined;
}

function getErrorOf(message?: Message): string | undefined {
	return message !== undefined && "error" in message ? message.error?.message : undefined;
}

function createFakeServer(
	specification: SpawnSpecification,
	events: TransportEvents,
	behavior: FakeBehavior,
): FakeServer {
	const received = new Array<Message>();
	let nextId = 1000;

	function getParametersOf(method: string): ReadonlyArray<JsonObject | undefined> {
		return received.flatMap((message) =>
			"method" in message && message.method === method ? [asObject(message.params)] : [],
		);
	}

	function getResponseFor(id: number): Message | undefined {
		return received.find((message) => !("method" in message) && message.id === id);
	}

	async function answerAsync(request: RequestMessage): Promise<void> {
		await Promise.resolve();
		if (request.method === "initialize") {
			if (behavior.initializeError === true) {
				events.onMessage({ id: request.id, error: { code: -1, message: "nope" }, jsonrpc: "2.0" });
				return;
			}
			const result = behavior.initializeResult ?? {
				capabilities: behavior.capabilities ?? { textDocumentSync: 1 },
			};
			events.onMessage({ id: request.id, jsonrpc: "2.0", result });
			return;
		}

		const handler = behavior.handlers?.[request.method];
		const outcome = handler === undefined ? null : await handler(asObject(request.params) ?? {});
		const failure = getString(asObject(outcome), "failure");
		events.onMessage(
			failure === undefined
				? { id: request.id, jsonrpc: "2.0", result: outcome }
				: { id: request.id, error: { code: -32_000, message: failure }, jsonrpc: "2.0" },
		);
	}

	return {
		crash: (reason = "boom"): void => {
			events.onExit(reason);
		},
		errorFor: (id) => getErrorOf(getResponseFor(id)),
		initializeParameter: (key) => getParametersOf("initialize")[0]?.[key],
		methods: () => received.flatMap((message) => ("method" in message ? [message.method] : [])),
		notify: (method, parameters): void => {
			events.onMessage({ jsonrpc: "2.0", method, params: parameters });
		},
		openedUris: () =>
			getParametersOf("textDocument/didOpen").map((parameters) =>
				getString(getObject(parameters, "textDocument"), "uri"),
			),
		parametersOf: getParametersOf,
		receive: (message): void => {
			received.push(message);
			if ("method" in message && "id" in message) detach(answerAsync(message));
		},
		request: (method, parameters): number => {
			const id = nextId++;
			events.onMessage({ id, jsonrpc: "2.0", method, params: parameters });
			return id;
		},
		resultFor: (id) => getResultOf(getResponseFor(id)),
		specification,
	};
}

type ClientReply = { readonly error: ResponseError } | { readonly result?: JsonValue };

interface HarnessOptions {
	readonly behaviors?: Readonly<Record<string, FakeBehavior>>;
	readonly configuration: LspMuxConfiguration;
	readonly files?: Readonly<Record<string, string>>;
	readonly maxRestarts?: number;
	readonly paths?: ReadonlyArray<string>;
	readonly searchPath?: ReadonlyArray<string>;
}

interface Harness {
	readonly errorAsync: (method: string, parameters: JsonValue) => Promise<string | undefined>;
	readonly exits: ReadonlyArray<number>;
	readonly logs: () => ReadonlyArray<string>;
	readonly mux: Mux;
	readonly notify: (method: string, parameters: JsonValue) => void;
	readonly published: (uri: string) => ReadonlyArray<JsonValue> | undefined;
	readonly replyToClient: (method: string, index: number, reply: ClientReply) => void;
	readonly requestAsync: (method: string, parameters: JsonValue) => Promise<Message | undefined>;
	readonly resultAsync: (method: string, parameters: JsonValue) => Promise<JsonValue | undefined>;
	readonly server: (name: string, index?: number) => FakeServer;
	readonly servers: ReadonlyArray<FakeServer>;
	readonly serversNamed: (name: string) => ReadonlyArray<FakeServer>;
}

async function settleAsync(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, 10);
	await promise;
}

function commandName(specification: SpawnSpecification): string {
	return specification.command.split("/").at(-1) ?? specification.command;
}

function parse(configuration: LspMuxConfiguration): ResolvedConfiguration {
	return resolveConfiguration(isConfiguration.assert(configuration));
}

/**
 * Runs every listed server, in the order given.
 *
 * @param options - Each server's definition, in priority order.
 * @returns A configuration running those servers.
 */
function serversOf(options: Readonly<Record<string, ServerOptions>>): LspMuxConfiguration {
	return { options, servers: Object.keys(options) };
}

function createHarness(options: HarnessOptions): Harness {
	const fromMux = new Array<Message>();
	const servers = new Array<FakeServer>();
	const exits = new Array<number>();
	const paths = new Set(options.paths);

	const mux = createMux({
		configuration: parse(options.configuration),
		createTransport: (specification, events) => {
			const fake = createFakeServer(specification, events, options.behaviors?.[commandName(specification)] ?? {});
			servers.push(fake);
			return {
				close: () => undefined,
				send: (message) => {
					fake.receive(message);
				},
			};
		},
		cwd: "/fallback",
		exists: (path) => paths.has(path),
		maxRestarts: options.maxRestarts ?? 3,
		onExit: (code) => {
			exits.push(code);
		},
		readFile: (path) => options.files?.[path],
		searchPath: options.searchPath ?? ["/usr/bin"],
		send: (message) => {
			fromMux.push(message);
		},
		shutdownTimeoutMilliseconds: 5,
	});

	let nextId = 1;
	async function requestAsync(method: string, parameters: JsonValue): Promise<Message | undefined> {
		const id = nextId++;
		receiveClientMessage(mux, { id, jsonrpc: "2.0", method, params: parameters });
		await settleAsync();
		return fromMux.find((message) => !("method" in message) && message.id === id);
	}

	function serversNamed(name: string): ReadonlyArray<FakeServer> {
		return servers.filter(({ specification }) => commandName(specification) === name);
	}

	function clientRequests(method: string): ReadonlyArray<RequestMessage> {
		return fromMux.filter(
			(message): message is RequestMessage => "method" in message && "id" in message && message.method === method,
		);
	}

	return {
		errorAsync: async (method, parameters) => getErrorOf(await requestAsync(method, parameters)),
		exits,
		logs: () =>
			fromMux.flatMap((message) =>
				"method" in message && message.method === "window/logMessage"
					? [getString(asObject(message.params), "message") ?? ""]
					: [],
			),
		mux,
		notify: (method, parameters): void => {
			receiveClientMessage(mux, { jsonrpc: "2.0", method, params: parameters });
		},
		published: (uri): ReadonlyArray<JsonValue> | undefined => {
			const last = fromMux
				.flatMap((message) =>
					"method" in message && message.method === "textDocument/publishDiagnostics"
						? [asObject(message.params)]
						: [],
				)
				.findLast((parameters) => getString(parameters, "uri") === uri);
			const diagnostics = last?.diagnostics;
			return isJsonArray(diagnostics) ? diagnostics : undefined;
		},
		replyToClient: (method, index, reply): void => {
			const request = clientRequests(method)[index];
			if (request === undefined) throw new Error(`no ${method} request #${index}`);
			receiveClientMessage(mux, { ...reply, id: request.id, jsonrpc: "2.0" });
		},
		requestAsync,
		resultAsync: async (method, parameters) => getResultOf(await requestAsync(method, parameters)),
		server: (name, index = 0): FakeServer => {
			const found = serversNamed(name)[index];
			if (found === undefined) throw new Error(`no ${name} server #${index}`);
			return found;
		},
		servers,
		serversNamed,
	};
}

const TS_AND_BIOME = serversOf({
	tsgo: { command: "tsgo", extensions: [".ts"], rootMarkers: ["package.json"] },
	// oxlint-disable-next-line perfectionist/sort-objects -- priority order.
	biome: { command: "biome", extensions: [".ts", ".json"], requireRootMarker: false, rootMarkers: ["biome.json"] },
});

const WORKSPACE = { rootUri: "file:///repo", workspaceFolders: [{ name: "repo", uri: "file:///repo" }] };
const POSITION = { position: { character: 0, line: 0 }, textDocument: { uri: "file:///repo/a.ts" } };

function openParameters(uri: string, text = "const value = 1;\n"): JsonValue {
	return { textDocument: { languageId: "typescript", text, uri, version: 1 } };
}

async function startAsync(options: HarnessOptions): Promise<Harness> {
	const harness = createHarness(options);
	await harness.requestAsync("initialize", WORKSPACE);
	harness.notify("textDocument/didOpen", openParameters("file:///repo/a.ts"));
	await settleAsync();
	return harness;
}

function answering(uri: string): FakeBehavior {
	return {
		capabilities: { definitionProvider: true, referencesProvider: true },
		handlers: { "textDocument/definition": () => [{ uri }], "textDocument/references": () => [{ uri }] },
	};
}

function incomingCallsFrom(parameters: JsonObject): JsonValue {
	return [{ from: { name: "caller" }, fromRanges: [], seen: parameters.item ?? null }];
}

function firstElement(value: JsonValue | undefined): JsonValue {
	return isJsonArray(value) ? (value[0] ?? null) : null;
}

function nextReport(reports: Array<JsonValue>): JsonValue {
	return reports.shift() ?? null;
}

async function hangAsync(): Promise<JsonValue> {
	return Promise.withResolvers<JsonValue>().promise;
}

describe("mux", () => {
	it("answers initialize with the combined capabilities", async () => {
		expect.assertions(2);

		const harness = createHarness({ configuration: TS_AND_BIOME });
		const result = asObject(await harness.resultAsync("initialize", WORKSPACE));

		expect(getObject(result, "serverInfo")).toStrictEqual({ name: packageName });
		expect(getObject(result, "capabilities")?.hoverProvider).toBe(true);
	});

	// Catches a monorepo package's server starting at the repo root with the
	// root's tool version instead of its own.
	it("starts each server in the nearest marked root with its local binary", async () => {
		expect.assertions(6);

		const harness = createHarness({
			behaviors: { tsgo: { capabilities: { textDocumentSync: 2 } } },
			configuration: serversOf({
				tsgo: {
					command: "tsgo",
					extensions: [".ts"],
					initializationOptions: { strict: true },
					rootMarkers: ["package.json"],
				},
				// oxlint-disable-next-line perfectionist/sort-objects -- priority order.
				biome: { command: "biome", extensions: [".ts"], rootMarkers: ["biome.json"] },
			}),
			paths: [
				"/repo/package.json",
				"/repo/biome.json",
				"/repo/packages/app/package.json",
				"/repo/node_modules/.bin/biome",
				"/repo/packages/app/node_modules/.bin/tsgo",
				"/repo/node_modules/.bin/tsgo",
			],
		});
		await harness.requestAsync("initialize", {
			...WORKSPACE,
			capabilities: { textDocument: { diagnostic: {}, hover: {} } },
			initializationOptions: { forMux: true },
		});
		harness.notify("textDocument/didOpen", openParameters("file:///repo/packages/app/src/index.ts"));
		harness.notify("textDocument/didOpen", openParameters("file:///repo/src/index.ts"));
		await settleAsync();

		expect(harness.serversNamed("tsgo").map(({ specification }) => specification.cwd)).toStrictEqual([
			"/repo/packages/app",
			"/repo",
		]);
		expect(harness.server("tsgo").specification.command).toBe("/repo/packages/app/node_modules/.bin/tsgo");
		expect(harness.server("biome").specification.command).toBe("/repo/node_modules/.bin/biome");
		expect(harness.server("tsgo").initializeParameter("initializationOptions")).toStrictEqual({ strict: true });
		expect(harness.server("tsgo").initializeParameter("capabilities")).toStrictEqual({
			textDocument: { hover: {} },
		});
		expect(harness.server("biome").openedUris()).toStrictEqual([
			"file:///repo/packages/app/src/index.ts",
			"file:///repo/src/index.ts",
		]);
	});

	// Catches one default configuration erroring in every project that lacks
	// one of its tools.
	it("skips servers that are not installed", async () => {
		expect.assertions(2);

		const harness = await startAsync({
			configuration: TS_AND_BIOME,
			paths: ["/opt/bin/tsgo"],
			searchPath: ["", "/opt/bin"],
		});

		expect(harness.servers.map(({ specification }) => specification.command)).toStrictEqual(["tsgo"]);
		expect(harness.logs()).toContain("[biome] biome is not installed for /repo");
	});

	it("starts servers that require a root marker only where one exists", async () => {
		expect.assertions(1);

		const harness = await startAsync({
			configuration: serversOf({
				biome: {
					command: "biome",
					extensions: [".ts"],
					requireRootMarker: true,
					rootMarkers: ["biome.json"],
				},
			}),
			paths: ["/usr/bin/biome", "/repo/pkg/biome.json"],
		});
		harness.notify("textDocument/didOpen", openParameters("file:///repo/pkg/b.ts"));
		await settleAsync();

		expect(harness.servers.map(({ specification }) => specification.cwd)).toStrictEqual(["/repo/pkg"]);
	});

	it("runs commands given as paths only when they exist", async () => {
		expect.assertions(1);

		const harness = await startAsync({
			configuration: serversOf({
				a: { command: "/tools/a", extensions: [".ts"] },
				b: { command: "/tools/b", extensions: [".ts"] },
			}),
			paths: ["/tools/a"],
		});

		expect(harness.servers.map(({ specification }) => specification.command)).toStrictEqual(["/tools/a"]);
	});

	it("uses the fallback directory and tolerates odd initialize parameters", async () => {
		expect.assertions(3);

		const other = createHarness({ configuration: TS_AND_BIOME, paths: ["/usr/bin/tsgo", "/usr/bin/biome"] });
		await other.requestAsync("initialize", { rootPath: "/other", rootUri: "https://example.com/x" });
		other.notify("textDocument/didOpen", openParameters("file:///other/a.ts"));
		other.notify("textDocument/didOpen", openParameters("file://%invalid/a.ts"));
		const empty = createHarness({ configuration: TS_AND_BIOME, paths: ["/usr/bin/tsgo", "/usr/bin/biome"] });
		await empty.requestAsync("initialize", null);
		empty.notify("textDocument/didOpen", openParameters("file:///fallback/a.ts"));
		await settleAsync();

		expect(other.server("tsgo").specification.cwd).toBe("/other");
		expect(other.server("tsgo").initializeParameter("capabilities")).toStrictEqual({});
		expect(empty.server("tsgo").specification.cwd).toBe("/fallback");
	});

	it("sends settings and answers workspace/configuration from them", async () => {
		expect.assertions(2);

		const harness = createHarness({
			configuration: serversOf({
				yaml: { command: "yaml", extensions: [".yaml"], settings: { yaml: { format: true } } },
			}),
			paths: ["/usr/bin/yaml"],
		});
		await harness.requestAsync("initialize", WORKSPACE);
		harness.notify("textDocument/didOpen", openParameters("file:///repo/a.yaml"));
		await settleAsync();
		const id = harness.server("yaml").request("workspace/configuration", {
			items: [{ section: "yaml.format" }, { section: "yaml.missing" }, {}, { section: "" }],
		});
		await settleAsync();

		expect(harness.server("yaml").parametersOf("workspace/didChangeConfiguration")).toStrictEqual([
			{ settings: { yaml: { format: true } } },
		]);
		expect(harness.server("yaml").resultFor(id)).toStrictEqual([
			true,
			null,
			{ yaml: { format: true } },
			{ yaml: { format: true } },
		]);
	});

	it("merges diagnostics from every server and labels their source", async () => {
		expect.assertions(3);

		const harness = await startAsync({ configuration: TS_AND_BIOME, paths: ["/usr/bin/tsgo", "/usr/bin/biome"] });
		harness.server("tsgo").notify("textDocument/publishDiagnostics", {
			diagnostics: [{ message: "type" }],
			uri: "file:///repo/a.ts",
		});
		harness.server("biome").notify("textDocument/publishDiagnostics", {
			diagnostics: [{ message: "lint", source: "biome(lint)" }],
			uri: "file:///repo/a.ts",
		});
		harness.server("biome").notify("textDocument/publishDiagnostics", { diagnostics: [] });

		expect(harness.published("file:///repo/a.ts")).toStrictEqual([
			{ message: "type", source: "tsgo" },
			{ message: "lint", source: "biome(lint)" },
		]);

		harness.server("tsgo").crash();
		await settleAsync();

		expect(harness.published("file:///repo/a.ts")).toStrictEqual([{ message: "lint", source: "biome(lint)" }]);
		expect(harness.logs()).toContain("[tsgo] exited (/repo): boom");
	});

	it("routes first-strategy requests to the highest-priority useful answer", async () => {
		expect.assertions(3);

		const harness = await startAsync({
			behaviors: {
				biome: { capabilities: { definitionProvider: true, hoverProvider: false } },
				tsgo: {
					capabilities: { definitionProvider: true, hoverProvider: true },
					handlers: {
						"textDocument/definition": () => [],
						"textDocument/hover": () => ({ contents: "number" }),
					},
				},
			},
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo", "/usr/bin/biome"],
		});

		await expect(harness.resultAsync("textDocument/hover", POSITION)).resolves.toStrictEqual({
			contents: "number",
		});
		expect(harness.server("biome").methods()).not.toContain("textDocument/hover");
		await expect(harness.resultAsync("textDocument/definition", POSITION)).resolves.toStrictEqual([]);
	});

	it("merges array answers from every server", async () => {
		expect.assertions(2);

		const behaviors = { biome: answering("b"), tsgo: answering("t") };
		const paths = ["/usr/bin/tsgo", "/usr/bin/biome"];
		const merged = await startAsync({ behaviors, configuration: TS_AND_BIOME, paths });

		await expect(merged.resultAsync("textDocument/references", POSITION)).resolves.toStrictEqual([
			{ uri: "t" },
			{ uri: "b" },
		]);
		await expect(merged.resultAsync("textDocument/definition", POSITION)).resolves.toStrictEqual([{ uri: "t" }]);
	});

	it("sends formatting to the configured formatters, in order", async () => {
		expect.assertions(1);

		const formatting = { documentFormattingProvider: true };
		const harness = await startAsync({
			behaviors: {
				biome: { capabilities: formatting, handlers: { "textDocument/formatting": () => [{ newText: "b" }] } },
				tsgo: { capabilities: formatting, handlers: { "textDocument/formatting": () => [{ newText: "t" }] } },
			},
			configuration: { ...TS_AND_BIOME, formatters: ["biome", "tsgo"] },
			paths: ["/usr/bin/tsgo", "/usr/bin/biome"],
		});

		await expect(
			harness.resultAsync("textDocument/formatting", { options: {}, textDocument: { uri: "file:///repo/a.ts" } }),
		).resolves.toStrictEqual([{ newText: "b" }]);
	});

	it("reports server errors and unknown methods", async () => {
		expect.assertions(4);

		const harness = await startAsync({
			behaviors: {
				tsgo: {
					capabilities: { hoverProvider: true },
					handlers: { "textDocument/hover": () => ({ failure: "bad" }) },
				},
			},
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo"],
		});

		await expect(harness.errorAsync("textDocument/hover", POSITION)).resolves.toBe("bad");
		await expect(harness.errorAsync("workspace/executeCommand", { command: "x" })).resolves.toBe(
			"unhandled method workspace/executeCommand",
		);
		await expect(
			harness.resultAsync("textDocument/hover", { textDocument: { uri: "untitled:1" } }),
		).resolves.toBeNull();
		await expect(
			harness.resultAsync("textDocument/hover", { textDocument: { uri: "file:///repo/a.md" } }),
		).resolves.toBeNull();
	});

	it("opens unknown documents from disk", async () => {
		expect.assertions(3);

		const harness = createHarness({
			behaviors: {
				tsgo: { capabilities: { hoverProvider: true }, handlers: { "textDocument/hover": () => "hi" } },
			},
			configuration: TS_AND_BIOME,
			files: { "/repo/disk.ts": "let disk = 1;" },
			paths: ["/usr/bin/tsgo"],
		});
		await harness.requestAsync("initialize", WORKSPACE);
		const disk = { position: { character: 0, line: 0 }, textDocument: { uri: "file:///repo/disk.ts" } };

		await expect(harness.resultAsync("textDocument/hover", disk)).resolves.toBe("hi");
		expect(harness.server("tsgo").parametersOf("textDocument/didOpen")).toStrictEqual([
			{ textDocument: { languageId: "ts", text: "let disk = 1;", uri: "file:///repo/disk.ts", version: 0 } },
		]);

		await harness.requestAsync("textDocument/hover", { textDocument: { uri: "file:///repo/missing.ts" } });

		expect(harness.server("tsgo").openedUris()).toHaveLength(1);
	});

	it("keeps every server in sync with full-text changes", async () => {
		expect.assertions(2);

		const harness = await startAsync({
			behaviors: { biome: { capabilities: { textDocumentSync: { change: 0 } } } },
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo", "/usr/bin/biome"],
		});
		harness.notify("textDocument/didChange", {
			contentChanges: [
				{ range: { end: { character: 11, line: 0 }, start: { character: 6, line: 0 } }, text: "bee" },
				{ range: { start: { line: 0 } }, text: "" },
				{ text: 5 },
			],
			textDocument: { uri: "file:///repo/a.ts", version: 2 },
		});
		await settleAsync();
		harness.notify("textDocument/didChange", { contentChanges: [], textDocument: { uri: "file:///repo/a.ts" } });
		harness.notify("textDocument/didChange", { contentChanges: [], textDocument: { uri: "file:///repo/none.ts" } });
		harness.notify("textDocument/didChange", {});
		harness.notify("textDocument/didOpen", { textDocument: { uri: "file:///repo/b.ts" } });
		await settleAsync();

		expect(harness.server("tsgo").parametersOf("textDocument/didChange")).toStrictEqual([
			{ contentChanges: [{ text: "const bee = 1;\n" }], textDocument: { uri: "file:///repo/a.ts", version: 2 } },
			{ contentChanges: [{ text: "const bee = 1;\n" }], textDocument: { uri: "file:///repo/a.ts", version: 3 } },
		]);
		expect(harness.server("biome").methods()).not.toContain("textDocument/didChange");
	});

	it("forwards saves, closes, and workspace notifications", async () => {
		expect.assertions(1);

		const harness = await startAsync({ configuration: TS_AND_BIOME, paths: ["/usr/bin/tsgo"] });
		harness.notify("textDocument/didSave", { textDocument: { uri: "file:///repo/a.ts" } });
		harness.notify("textDocument/didSave", { textDocument: { uri: "file:///repo/other.ts" } });
		harness.notify("textDocument/didSave", {});
		harness.notify("textDocument/didClose", { textDocument: { uri: "file:///repo/a.ts" } });
		harness.notify("textDocument/didClose", {});
		harness.notify("workspace/didChangeWatchedFiles", { changes: [] });
		harness.notify("$/setTrace", { value: "off" });
		harness.notify("initialized", {});
		await settleAsync();

		expect(harness.server("tsgo").methods().slice(-4)).toStrictEqual([
			"textDocument/didSave",
			"textDocument/didClose",
			"workspace/didChangeWatchedFiles",
			"$/setTrace",
		]);
	});

	it("tags call hierarchy items so follow-up calls reach their server", async () => {
		expect.assertions(3);

		const harness = await startAsync({
			behaviors: {
				tsgo: {
					capabilities: { callHierarchyProvider: true },
					handlers: {
						"callHierarchy/incomingCalls": incomingCallsFrom,
						"textDocument/prepareCallHierarchy": () => [{ name: "first", data: 1 }, 3],
					},
				},
			},
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo"],
		});
		const key = "tsgo@/repo";
		const prepared = await harness.resultAsync("textDocument/prepareCallHierarchy", POSITION);

		expect(prepared).toStrictEqual([{ name: "first", data: { data: 1, lspMux: key } }, 3]);
		await expect(
			harness.resultAsync("callHierarchy/incomingCalls", {
				item: firstElement(prepared),
			}),
		).resolves.toStrictEqual([
			{ from: { name: "caller", data: { lspMux: key } }, fromRanges: [], seen: { name: "first", data: 1 } },
		]);
		await expect(harness.resultAsync("callHierarchy/incomingCalls", { item: { name: "x" } })).resolves.toBeNull();
	});

	it("pulls diagnostics from servers that only support pull", async () => {
		expect.assertions(2);

		const reports: Array<JsonValue> = [{ items: [{ message: "pulled" }], kind: "full" }, { kind: "unchanged" }];
		let calls = 0;
		const harness = await startAsync({
			behaviors: {
				tsgo: {
					handlers: {
						"textDocument/diagnostic": () => {
							calls += 1;
							return nextReport(reports);
						},
					},
				},
			},
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo"],
		});
		harness.server("tsgo").request("client/registerCapability", {
			registrations: [{ id: "d", method: "textDocument/diagnostic" }, { id: 5 }],
		});
		await settleAsync();

		expect(harness.published("file:///repo/a.ts")).toStrictEqual([{ message: "pulled", source: "tsgo" }]);

		harness.server("tsgo").request("workspace/diagnostic/refresh", null);
		harness.server("tsgo").request("client/unregisterCapability", { unregisterations: [{ id: "d" }, {}] });
		await settleAsync();
		harness.server("tsgo").request("workspace/diagnostic/refresh", null);
		await settleAsync();

		expect(calls).toBe(2);
	});

	it("answers server requests the mux owns and forwards edits to the client", async () => {
		expect.assertions(5);

		const harness = await startAsync({ configuration: TS_AND_BIOME, paths: ["/usr/bin/tsgo"] });
		const tsgo = harness.server("tsgo");
		const folders = tsgo.request("workspace/workspaceFolders", null);
		const progress = tsgo.request("window/workDoneProgress/create", { token: 1 });
		const unknown = tsgo.request("custom/thing", null);
		const edit = tsgo.request("workspace/applyEdit", { edit: {} });
		const rejected = tsgo.request("workspace/applyEdit", { edit: {} });
		await settleAsync();

		harness.replyToClient("workspace/applyEdit", 0, { result: { applied: true } });
		harness.replyToClient("workspace/applyEdit", 1, { error: { code: 1, message: "no" } });
		await settleAsync();

		expect(tsgo.resultFor(folders)).toStrictEqual([{ name: "repo", uri: "file:///repo" }]);
		expect(tsgo.resultFor(progress)).toBeNull();
		expect(tsgo.errorFor(unknown)).toBe("unhandled method custom/thing");
		expect(tsgo.resultFor(edit)).toStrictEqual({ applied: true });
		expect(tsgo.errorFor(rejected)).toBe("no");
	});

	it("forwards important server log messages with the server name", async () => {
		expect.assertions(1);

		const harness = await startAsync({ configuration: TS_AND_BIOME, paths: ["/usr/bin/tsgo"] });
		harness.server("tsgo").notify("window/logMessage", { message: "hello", type: 2 });
		harness.server("tsgo").notify("window/logMessage", { message: "verbose", type: 4 });
		harness.server("tsgo").notify("$/progress", {});

		expect(harness.logs().filter((log) => log.startsWith("[tsgo]"))).toStrictEqual(["[tsgo] hello"]);
	});

	it("forwards cancellation to the servers working on a request", async () => {
		expect.assertions(1);

		const harness = await startAsync({
			behaviors: {
				tsgo: { capabilities: { hoverProvider: true }, handlers: { "textDocument/hover": hangAsync } },
			},
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo"],
		});
		receiveClientMessage(harness.mux, {
			id: "hover",
			jsonrpc: "2.0",
			method: "textDocument/hover",
			params: POSITION,
		});
		await settleAsync();
		harness.notify("$/cancelRequest", { id: "hover" });
		harness.notify("$/cancelRequest", { id: "unknown" });
		harness.notify("$/cancelRequest", { id: [] });

		expect(harness.server("tsgo").parametersOf("$/cancelRequest")).toHaveLength(1);
	});

	it("restarts crashed servers and gives up after too many crashes", async () => {
		expect.assertions(3);

		const harness = await startAsync({ configuration: TS_AND_BIOME, maxRestarts: 1, paths: ["/usr/bin/tsgo"] });
		harness.server("tsgo").crash();
		await settleAsync();

		expect(harness.server("tsgo", 1).openedUris()).toStrictEqual(["file:///repo/a.ts"]);

		harness.server("tsgo", 1).crash();
		await settleAsync();
		harness.notify("textDocument/didOpen", openParameters("file:///repo/b.ts"));
		await settleAsync();

		expect(harness.serversNamed("tsgo")).toHaveLength(2);
		expect(harness.logs()).toContain("[tsgo] disabled for /repo");
	});

	it("disables servers that fail to start", async () => {
		expect.assertions(2);

		const harness = createHarness({
			behaviors: { biome: { initializeError: true } },
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo", "/usr/bin/biome"],
		});
		await harness.requestAsync("initialize", WORKSPACE);
		harness.notify("textDocument/didOpen", openParameters("file:///repo/a.ts"));
		await settleAsync();
		harness.notify("textDocument/didOpen", openParameters("file:///repo/b.ts"));
		await settleAsync();

		expect(harness.serversNamed("biome")).toHaveLength(1);
		expect(harness.logs()).toContain("[biome] initialize failed (/repo): nope");
	});

	it("shuts every server down and exits cleanly, or with an error without shutdown", async () => {
		expect.assertions(4);

		const harness = await startAsync({
			behaviors: { biome: { handlers: { shutdown: hangAsync } } },
			configuration: TS_AND_BIOME,
			paths: ["/usr/bin/tsgo", "/usr/bin/biome"],
		});
		const response = await harness.requestAsync("shutdown", null);
		harness.notify("textDocument/didOpen", openParameters("file:///repo/b.ts"));
		harness.notify("exit", null);

		expect(getResultOf(response)).toBeNull();
		expect(harness.server("tsgo").methods()).toContain("exit");
		expect(harness.exits).toStrictEqual([0]);

		const abrupt = createHarness({ configuration: TS_AND_BIOME });
		abrupt.notify("exit", null);

		expect(abrupt.exits).toStrictEqual([1]);
	});
});
