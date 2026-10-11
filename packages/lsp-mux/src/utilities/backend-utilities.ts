import { BackendState } from "$types/mux-types";
import { closeConnection, detach } from "$utilities/connection-utilities";
import { getSyncKind, supportsMethod } from "$utilities/routing-utilities";

import type { SyncKind } from "$meta/protocol-meta";
import type { ServerDefinition } from "$types/configuration-types";
import type { Backend, Connection } from "$types/mux-types";

export function getBackendKey(name: string, root: string): string {
	return `${name}@${root}`;
}

export function createBackend(name: string, server: ServerDefinition, root: string): Backend {
	return {
		key: getBackendKey(name, root),
		name,
		capabilities: {},
		connection: undefined,
		queue: Promise.resolve(),
		registrations: new Map(),
		root,
		sentVersions: new Map(),
		server,
		state: BackendState.Starting,
		transport: undefined,
	};
}

export function getConnection(backend: Backend): Connection {
	if (backend.connection === undefined) throw new Error(`${backend.key} has no transport`);
	return backend.connection;
}

/**
 * Runs work after everything queued before it, starting with the initialize
 * handshake, so nothing reaches a server before it is ready.
 *
 * @template TResult - What the task produces.
 * @param backend - The server to run the work against.
 * @param task - The work to run.
 * @returns The task's result.
 */
export async function enqueueAsync<TResult>(
	backend: Backend,
	task: () => Promise<TResult> | TResult,
): Promise<TResult> {
	const result = backend.queue.then(task);
	backend.queue = result.then(() => undefined).catch(() => undefined);
	return result;
}

export function enqueue(backend: Backend, task: () => Promise<void> | void): void {
	detach(enqueueAsync(backend, task));
}

/**
 * Stops the server process. Safe to call more than once.
 *
 * @param backend - The server to stop.
 * @param reason - Error message for callers still waiting on the server.
 */
export function stopBackend(backend: Backend, reason: string): void {
	backend.state = BackendState.Stopped;
	if (backend.connection !== undefined) closeConnection(backend.connection, reason);
	backend.transport?.close();
}

export function backendSupports(backend: Backend, method: string): boolean {
	return supportsMethod(backend.capabilities, backend.registrations, method);
}

export function getBackendSyncKind(backend: Backend): SyncKind {
	return getSyncKind(backend.capabilities);
}
