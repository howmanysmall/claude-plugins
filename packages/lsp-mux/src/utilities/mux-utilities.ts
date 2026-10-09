// oxlint-disable unicorn/no-null -- JSON-RPC results and ids are real null.

import { DEFAULT_SHUTDOWN_TIMEOUT_MS, METHOD_NOT_FOUND, name } from "$constants";
import { MUX_CAPABILITIES } from "$meta/protocol-meta";
import { getConnection, stopBackend } from "$utilities/backend-utilities";
import {
	closeConnection,
	createConnection,
	receiveMessage,
	sendNotification,
	sendRequest,
} from "$utilities/connection-utilities";
import {
	broadcast,
	changeDocument,
	closeDocument,
	openDocument,
	openFromDisk,
	saveDocument,
} from "$utilities/document-utilities";
import { asObject, getObject, getString, isJsonArray } from "$utilities/json-utilities";
import { getBackendsForDocument, toFilePath } from "$utilities/lifecycle-utilities";
import { createMessageReader, encodeMessage } from "$utilities/message-utilities";
import { callHierarchyCallsAsync, cancelRequest, routeAsync } from "$utilities/request-utilities";

import type { Except, JsonValue } from "type-fest";

import type { Mux, MuxOptions } from "$types/mux-types";
import type { Message, RequestMessage, RequestResult } from "$types/protocol-types";

async function delayAsync(milliseconds: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, milliseconds).unref();
	await promise;
}

function initialize(mux: Mux, request: RequestMessage): RequestResult {
	const parameters = asObject(request.params) ?? {};
	mux.initializeParameters = parameters;

	const folders = parameters.workspaceFolders;
	const folder = isJsonArray(folders) ? getString(asObject(folders[0]), "uri") : undefined;
	const rootUri = folder ?? getString(parameters, "rootUri");
	const root = (rootUri === undefined ? undefined : toFilePath(rootUri)) ?? getString(parameters, "rootPath");
	if (root !== undefined) mux.boundary = root;

	return { result: { capabilities: MUX_CAPABILITIES, serverInfo: { name } } };
}

async function shutdownAsync(mux: Mux): Promise<void> {
	mux.shuttingDown = true;
	const timeout = mux.options.shutdownTimeoutMilliseconds ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
	await Promise.all(
		Array.from(mux.backends.values(), async (backend) =>
			Promise.race([sendRequest(getConnection(backend), "shutdown").response, delayAsync(timeout)]),
		),
	);
}

function exit(mux: Mux): void {
	for (const backend of mux.backends.values()) {
		sendNotification(getConnection(backend), "exit");
		stopBackend(backend, "mux exited");
	}
	mux.backends.clear();
	closeConnection(mux.client, "mux exited");
	mux.options.onExit(mux.shuttingDown ? 0 : 1);
}

async function handleClientRequestAsync(mux: Mux, request: RequestMessage): Promise<RequestResult> {
	switch (request.method) {
		case "callHierarchy/incomingCalls":
		case "callHierarchy/outgoingCalls":
			return callHierarchyCallsAsync(mux, request);

		case "initialize":
			return initialize(mux, request);

		case "shutdown": {
			await shutdownAsync(mux);
			return { result: null };
		}

		case "workspace/symbol":
			return routeAsync(mux, request, [...mux.backends.values()]);

		default: {
			const uri = getString(getObject(asObject(request.params), "textDocument"), "uri");
			if (uri === undefined) {
				return { error: { code: METHOD_NOT_FOUND, message: `unhandled method ${request.method}` } };
			}

			if (!mux.documents.has(uri)) openFromDisk(mux, uri);
			const names = mux.options.configuration.routes?.[request.method]?.servers;
			return routeAsync(mux, request, getBackendsForDocument(mux, uri, names));
		}
	}
}

function handleClientNotification(mux: Mux, method: string, parameters?: JsonValue): void {
	const object = asObject(parameters);
	switch (method) {
		case "$/cancelRequest": {
			cancelRequest(mux, object);
			break;
		}

		case "$/setTrace":
		case "workspace/didChangeWatchedFiles": {
			broadcast(mux, method, parameters);
			break;
		}

		case "exit": {
			exit(mux);
			break;
		}

		case "textDocument/didChange": {
			changeDocument(mux, object);
			break;
		}

		case "textDocument/didClose": {
			closeDocument(mux, object);
			break;
		}

		case "textDocument/didOpen": {
			openDocument(mux, object);
			break;
		}

		case "textDocument/didSave": {
			saveDocument(mux, method, parameters);
			break;
		}

		default:
			break;
	}
}

/**
 * Creates a mux that presents several language servers to one LSP client as a
 * single server. Documents go to every configured server claiming their
 * extension, each started in the nearest root holding one of its markers.
 * Requests go to the servers that support them and are combined by strategy;
 * diagnostics are merged per document.
 *
 * @param options - The configuration and process hooks.
 * @returns The state to feed client messages into.
 */
export function createMux(options: MuxOptions): Mux {
	const mux: Mux = {
		backends: new Map(),
		boundary: options.cwd,
		cancellations: new Map(),
		// The handlers only run once messages arrive, after `mux` exists.
		client: createConnection(options.send, {
			onNotification: (method, parameters) => {
				handleClientNotification(mux, method, parameters);
			},
			onRequest: async (request) => handleClientRequestAsync(mux, request),
		}),
		diagnostics: new Map(),
		documents: new Map(),
		initializeParameters: {},
		options,
		restarts: new Map(),
		rootCache: new Map(),
		shuttingDown: false,
		unavailable: new Set(),
	};
	return mux;
}

export function receiveClientMessage(mux: Mux, message: Message): void {
	receiveMessage(mux.client, message);
}

export interface RunOptions extends Except<MuxOptions, "onExit" | "send"> {
	readonly exit: (code: number) => void;
	readonly input: NodeJS.ReadableStream;
	readonly output: NodeJS.WritableStream;
}

/**
 * Serves a mux over a pair of streams, normally the process's stdio.
 *
 * @param root0 - The configuration, streams, and process hooks.
 * @param root0.exit - Called once with the process exit code.
 * @param root0.input - Stream the client writes to.
 * @param root0.output - Stream the client reads from.
 * @returns The running mux.
 */
export function runMux({ exit: exitProcess, input, output, ...options }: RunOptions): Mux {
	let exited = false;
	const mux = createMux({
		...options,
		onExit: (code) => {
			if (exited) return;
			exited = true;
			exitProcess(code);
		},
		send: (message) => {
			output.write(encodeMessage(message));
		},
	});

	const read = createMessageReader((message) => {
		receiveClientMessage(mux, message);
	});
	input.on("data", (chunk: Buffer) => {
		read(chunk);
	});
	input.on("end", () => {
		receiveClientMessage(mux, { jsonrpc: "2.0", method: "exit" });
	});
	return mux;
}
