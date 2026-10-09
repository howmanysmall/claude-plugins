import type { JsonObject, JsonValue } from "type-fest";

import type { ResolvedConfiguration } from "$functions/resolve-configuration";
import type { JsonRpcId, Message, RequestMessage, RequestResult, ResponseMessage } from "$types/protocol-types";
import type { PathExists } from "$utilities/path-utilities";
import type { ServerDefinition } from "$validators/configuration-type";

export interface Transport {
	readonly close: () => void;
	readonly send: (message: Message) => void;
}

export interface SpawnSpecification extends Pick<ServerDefinition, "args" | "env"> {
	/** The resolved command, which may differ from the configured one. */
	readonly command: string;
	readonly cwd: string;
}

export interface TransportEvents {
	/** Called once when the process ends or cannot start. */
	readonly onExit: (reason: string) => void;
	readonly onMessage: (message: Message) => void;
}

export type TransportFactory = (specification: SpawnSpecification, events: TransportEvents) => Transport;

export interface ConnectionHandlers {
	readonly onNotification: (method: string, parameters?: JsonValue) => void;
	readonly onRequest: (request: RequestMessage) => Promise<RequestResult>;
}

/** One side of a JSON-RPC conversation. */
export interface Connection {
	closed: boolean;
	readonly handlers: ConnectionHandlers;
	nextId: number;
	readonly pending: Map<number, (response: ResponseMessage) => void>;
	readonly send: (message: Message) => void;
}

export interface PendingRequest {
	readonly id: number;
	readonly response: Promise<ResponseMessage>;
}

export const enum BackendState {
	Ready = "ready",
	Starting = "starting",
	Stopped = "stopped",
}

/** One running language server for one server configuration in one root. */
export interface Backend {
	readonly key: string;
	readonly name: string;
	capabilities: JsonObject;
	connection: Connection | undefined;
	/** Work runs in order, starting with the initialize handshake. */
	queue: Promise<void>;
	/** Dynamically registered methods, by registration id. */
	readonly registrations: Map<string, string>;
	readonly root: string;
	/** Document versions this server has seen, by URI. */
	readonly sentVersions: Map<string, number>;
	readonly server: ServerDefinition;
	state: BackendState;
	transport: Transport | undefined;
}

export interface OpenDocument {
	readonly languageId: string;
	readonly text: string;
	readonly version: number;
}

export interface ForwardedRequest {
	readonly id: number;
	readonly backend: Backend;
}

export interface MuxOptions {
	readonly configuration: ResolvedConfiguration;
	readonly createTransport: TransportFactory;
	/** Directory used as the workspace when the client names none. */
	readonly cwd: string;
	readonly exists: PathExists;
	/** Crashes tolerated per server after a successful start. */
	readonly maxRestarts?: number;
	readonly onExit: (code: number) => void;
	readonly readFile: (path: string) => string | undefined;
	/** Directories commands are looked up in, like `PATH`. */
	readonly searchPath: ReadonlyArray<string>;
	readonly send: (message: Message) => void;
	/** How long each server gets to answer `shutdown`. */
	readonly shutdownTimeoutMilliseconds?: number;
}

/** The mux's whole state, passed around explicitly. */
export interface Mux {
	readonly backends: Map<string, Backend>;
	boundary: string;
	readonly cancellations: Map<JsonRpcId, Array<ForwardedRequest>>;
	readonly client: Connection;
	/** Diagnostics by document URI, then by backend key. */
	readonly diagnostics: Map<string, Map<string, ReadonlyArray<JsonObject>>>;
	readonly documents: Map<string, OpenDocument>;
	initializeParameters: JsonObject;
	readonly options: MuxOptions;
	readonly restarts: Map<string, number>;
	readonly rootCache: Map<string, string | undefined>;
	shuttingDown: boolean;
	readonly unavailable: Set<string>;
}
