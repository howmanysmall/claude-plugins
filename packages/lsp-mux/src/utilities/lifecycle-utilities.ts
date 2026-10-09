import nodePath from "node:path";
import { pid } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEFAULT_MAX_RESTARTS } from "$constants";
import { MessageType } from "$meta/protocol-meta";
import { BackendState } from "$types/mux-types";
import { createBackend, enqueue, getBackendKey, getConnection, stopBackend } from "$utilities/backend-utilities";
import { logToClient } from "$utilities/client-utilities";
import { createConnection, receiveMessage, sendNotification, sendRequest } from "$utilities/connection-utilities";
import { clearBackendDiagnostics } from "$utilities/diagnostic-utilities";
import { asObject, getObject, withoutKeys } from "$utilities/json-utilities";
import { findProjectRoot, resolveCommand } from "$utilities/path-utilities";
import { handleServerNotification, handleServerRequestAsync } from "$utilities/server-message-utilities";
import { syncDocument } from "$utilities/sync-utilities";

import type { JsonObject } from "type-fest";

import type { Backend, Mux } from "$types/mux-types";
import type { ResponseMessage } from "$types/protocol-types";
import type { ServerDefinition } from "$validators/configuration-type";

interface Owner {
	readonly name: string;
	readonly root: string;
	readonly server: ServerDefinition;
}

const INITIALIZATION_OPTIONS: ReadonlySet<string> = new Set(["initializationOptions"]);
const DIAGNOSTIC: ReadonlySet<string> = new Set(["diagnostic"]);

export function toFilePath(uri: string): string | undefined {
	if (!uri.startsWith("file:")) return undefined;
	try {
		return fileURLToPath(uri);
	} catch {
		return undefined;
	}
}

/**
 * Removes pull-diagnostic support from the capabilities forwarded to servers
 * so they publish diagnostics instead, which the mux can merge.
 *
 * @param capabilities - The client's capabilities.
 * @returns The capabilities to send each server.
 */
function forServer(capabilities?: JsonObject): JsonObject {
	if (capabilities === undefined) return {};

	const textDocument = getObject(capabilities, "textDocument");
	if (textDocument === undefined) return capabilities;
	return { ...capabilities, textDocument: withoutKeys(textDocument, DIAGNOSTIC) };
}

function getRoot(
	mux: Mux,
	name: string,
	{ requireRootMarker, rootMarkers }: ServerDefinition,
	directory: string,
): string | undefined {
	const cacheKey = `${name}\0${directory}`;
	if (mux.rootCache.has(cacheKey)) return mux.rootCache.get(cacheKey);

	const root = findProjectRoot(directory, rootMarkers, mux.boundary, mux.options.exists, requireRootMarker);
	mux.rootCache.set(cacheKey, root);
	return root;
}

/**
 * Lists the servers that claim a document and the root each runs in.
 *
 * @param mux - State shared by every handler.
 * @param uri - Identifies the document whose servers are wanted.
 * @param names - Servers allowed to claim it, in priority order.
 * @returns The owners, in priority order.
 */
export function getOwners(mux: Mux, uri: string, names?: ReadonlyArray<string>): ReadonlyArray<Owner> {
	const path = toFilePath(uri);
	if (path === undefined) return [];

	const extension = nodePath.extname(path);
	const directory = nodePath.dirname(path);
	const { servers } = mux.options.configuration;
	const candidates =
		names === undefined ? servers : names.flatMap((name) => servers.filter((server) => server.name === name));

	return candidates.flatMap((server) => {
		if (!server.extensions.includes(extension)) return [];

		const root = getRoot(mux, server.name, server, directory);
		return root === undefined ? [] : [{ name: server.name, root, server }];
	});
}

export function isOwnedBy(mux: Mux, uri: string, backend: Backend): boolean {
	return getOwners(mux, uri).some(({ name, root }) => name === backend.name && root === backend.root);
}

function completeInitialization(mux: Mux, backend: Backend, response: ResponseMessage): void {
	const { name, root, server } = backend;
	if (response.error !== undefined) {
		logToClient(mux, MessageType.Error, `[${name}] initialize failed (${root}): ${response.error.message}`);
		mux.unavailable.add(backend.key);
		mux.backends.delete(backend.key);
		stopBackend(backend, "initialize failed");
		return;
	}

	backend.capabilities = getObject(asObject(response.result), "capabilities") ?? {};
	backend.state = BackendState.Ready;

	const connection = getConnection(backend);
	sendNotification(connection, "initialized", {});
	const { settings } = server;
	if (settings !== undefined) sendNotification(connection, "workspace/didChangeConfiguration", { settings });

	for (const uri of mux.documents.keys()) if (isOwnedBy(mux, uri, backend)) syncDocument(mux, backend, uri);
}

async function initializeBackendAsync(mux: Mux, backend: Backend): Promise<void> {
	const { root, server } = backend;
	const rootUri = pathToFileURL(root).href;
	const base: JsonObject = {
		...withoutKeys(mux.initializeParameters, INITIALIZATION_OPTIONS),
		capabilities: forServer(getObject(mux.initializeParameters, "capabilities")),
		// The mux is each server's parent, so servers watch its process.
		processId: pid,
		rootPath: root,
		rootUri,
		workspaceFolders: [{ name: nodePath.basename(root), uri: rootUri }],
	};
	const { initializationOptions } = server;
	const parameters = initializationOptions === undefined ? base : { ...base, initializationOptions };

	const response = await sendRequest(getConnection(backend), "initialize", parameters).response;
	if (backend.state !== BackendState.Stopped) completeInitialization(mux, backend, response);
}

function handleBackendExit(mux: Mux, backend: Backend, reason: string): void {
	const { key, name, root, server } = backend;
	if (mux.backends.get(key) === backend) mux.backends.delete(key);
	if (backend.state === BackendState.Stopped) return;

	const wasReady = backend.state === BackendState.Ready;
	stopBackend(backend, `${name} exited`);
	clearBackendDiagnostics(mux, backend);
	logToClient(mux, MessageType.Error, `[${name}] exited (${root}): ${reason}`);

	const restarts = (mux.restarts.get(key) ?? 0) + 1;
	mux.restarts.set(key, restarts);
	if (!wasReady || restarts > (mux.options.maxRestarts ?? DEFAULT_MAX_RESTARTS)) {
		mux.unavailable.add(key);
		logToClient(mux, MessageType.Warning, `[${name}] disabled for ${root}`);
		return;
	}

	if (mux.documents.keys().some((uri) => isOwnedBy(mux, uri, backend))) spawnBackend(mux, { name, root, server });
}

function spawnBackend(mux: Mux, { name, root, server }: Owner): Backend | undefined {
	const { createTransport, exists, searchPath } = mux.options;
	const command = resolveCommand(server.command, root, mux.boundary, searchPath, exists);
	if (command === undefined) {
		// Not installed here: skip quietly, so one default configuration can
		// list every server a project might use.
		mux.unavailable.add(getBackendKey(name, root));
		logToClient(mux, MessageType.Log, `[${name}] ${server.command} is not installed for ${root}`);
		return undefined;
	}

	const backend = createBackend(name, server, root);
	mux.backends.set(backend.key, backend);

	const transport = createTransport(
		{ ...server, command, cwd: root },
		{
			onExit: (reason) => {
				handleBackendExit(mux, backend, reason);
			},
			onMessage: (message) => {
				if (backend.connection !== undefined) receiveMessage(backend.connection, message);
			},
		},
	);
	backend.transport = transport;
	backend.connection = createConnection(
		(message) => {
			transport.send(message);
		},
		{
			onNotification: (method, parameters) => {
				handleServerNotification(mux, backend, method, parameters);
			},
			onRequest: async (request) => handleServerRequestAsync(mux, backend, request),
		},
	);
	enqueue(backend, async () => initializeBackendAsync(mux, backend));
	return backend;
}

function getBackend(mux: Mux, owner: Owner): Backend | undefined {
	const key = getBackendKey(owner.name, owner.root);
	const existing = mux.backends.get(key);
	if (existing !== undefined) return existing;
	if (mux.shuttingDown || mux.unavailable.has(key)) return undefined;
	return spawnBackend(mux, owner);
}

/**
 * Finds or starts the servers for a document.
 *
 * @param mux - State shared by every handler.
 * @param uri - Identifies the document whose servers are wanted.
 * @param names - Servers allowed to answer, in priority order.
 * @returns The running servers, in priority order.
 */
export function getBackendsForDocument(mux: Mux, uri: string, names?: ReadonlyArray<string>): ReadonlyArray<Backend> {
	const backends = new Array<Backend>();
	for (const owner of getOwners(mux, uri, names)) {
		const backend = getBackend(mux, owner);
		if (backend !== undefined) backends.push(backend);
	}
	return backends;
}
