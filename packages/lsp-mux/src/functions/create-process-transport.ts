import { spawn } from "node:child_process";
import { env } from "node:process";

import { createMessageReader, encodeMessage } from "$utilities/message-utilities";

import type { TransportFactory } from "$types/mux-types";

/**
 * Starts a language server as a child process speaking LSP over stdio.
 *
 * @param specification - What to run and where.
 * @param events - Receives decoded messages and the single exit event.
 * @returns A transport that writes framed messages to the server.
 */
export const createProcessTransport: TransportFactory = function createProcessTransport(specification, events) {
	const child = spawn(specification.command, [...specification.args], {
		cwd: specification.cwd,
		env: { ...env, ...specification.env },
		stdio: ["pipe", "pipe", "pipe"],
	});

	let exited = false;
	function finish(reason: string): void {
		if (exited) return;
		exited = true;
		events.onExit(reason);
	}

	const read = createMessageReader(events.onMessage);
	child.stdout.on("data", (chunk: Buffer) => {
		read(chunk);
	});
	// The servers' own logs are noise; drain them so a full pipe never blocks.
	child.stderr.resume();
	// A server that dies mid-write raises EPIPE here; its exit event reports it.
	child.stdin.on("error", () => undefined);
	child.on("error", (error) => {
		finish(error.message);
	});
	child.on("exit", (code, signal) => {
		finish(signal === null ? `exit code ${String(code)}` : `signal ${signal}`);
	});

	return {
		close: () => {
			if (!exited) child.kill();
		},
		send: (message) => {
			if (!exited && child.stdin.writable) child.stdin.write(encodeMessage(message));
		},
	};
};
