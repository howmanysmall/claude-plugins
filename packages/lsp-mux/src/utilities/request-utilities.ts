// oxlint-disable unicorn/no-null -- JSON-RPC results and ids are real null.

import { RouteStrategy } from "$meta/protocol-meta";
import { BackendState } from "$types/mux-types";
import { backendSupports, enqueueAsync, getConnection } from "$utilities/backend-utilities";
import { tagResponse, untagItem } from "$utilities/call-hierarchy-utilities";
import { forwardAsync } from "$utilities/client-utilities";
import { sendNotification } from "$utilities/connection-utilities";
import { asObject, getObject, isJsonRpcId } from "$utilities/json-utilities";
import { combineResponses, getDefaultStrategy } from "$utilities/routing-utilities";

import type { JsonObject } from "type-fest";

import type { Backend, Mux } from "$types/mux-types";
import type { RequestMessage, RequestResult, ResponseMessage } from "$types/protocol-types";

interface BackendResponse {
	readonly backend: Backend;
	readonly response: ResponseMessage;
}

async function collectAsync(
	mux: Mux,
	backends: ReadonlyArray<Backend>,
	request: RequestMessage,
): Promise<ReadonlyArray<BackendResponse>> {
	// Waits out each server's queue so a just-started server can answer.
	await Promise.all(backends.map(async (backend) => enqueueAsync(backend, () => undefined)));
	const capable = backends.filter(
		(backend) => backend.state === BackendState.Ready && backendSupports(backend, request.method),
	);
	return Promise.all(
		capable.map(async (backend) => ({
			backend,
			response: await forwardAsync(mux, backend, request.method, request.params, request.id),
		})),
	);
}

/**
 * Sends a request to every capable server and combines their answers by the
 * method's configured or default strategy.
 *
 * @param mux - State shared by every handler.
 * @param request - The client's request.
 * @param backends - Candidate servers, in priority order.
 * @returns The combined answer.
 */
export async function routeAsync(
	mux: Mux,
	request: RequestMessage,
	backends: ReadonlyArray<Backend>,
): Promise<RequestResult> {
	const responses = await collectAsync(mux, backends, request);
	return combineResponses(
		getDefaultStrategy(request.method),
		responses.map(({ backend, response }) => tagResponse(request.method, backend.key, response)),
	);
}

export async function callHierarchyCallsAsync(mux: Mux, request: RequestMessage): Promise<RequestResult> {
	const parameters = asObject(request.params);
	const untagged = untagItem(getObject(parameters, "item"));
	const backend = untagged === undefined ? undefined : mux.backends.get(untagged.key);
	if (untagged === undefined || backend === undefined) {
		return { result: null };
	}

	const forwarded = { ...parameters, item: untagged.item };
	const response = await forwardAsync(mux, backend, request.method, forwarded, request.id);
	return combineResponses(RouteStrategy.First, [tagResponse(request.method, backend.key, response)]);
}

export function cancelRequest(mux: Mux, parameters?: JsonObject): void {
	const id = parameters?.id;
	if (!isJsonRpcId(id)) return;

	const forwarded = mux.cancellations.get(id) ?? [];
	for (const { id: backendId, backend } of forwarded) {
		sendNotification(getConnection(backend), "$/cancelRequest", { id: backendId });
	}
}
