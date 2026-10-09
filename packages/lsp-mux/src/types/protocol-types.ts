import type { JsonValue } from "type-fest";

export type JsonRpcId = number | string;

export interface ResponseError {
	readonly code: number;
	readonly data?: JsonValue | undefined;
	readonly message: string;
}

export interface RequestMessage {
	readonly id: JsonRpcId;
	readonly jsonrpc: "2.0";
	readonly method: string;
	readonly params?: JsonValue | undefined;
}

export interface NotificationMessage {
	readonly jsonrpc: "2.0";
	readonly method: string;
	readonly params?: JsonValue | undefined;
}

export interface ResponseMessage {
	readonly id: JsonRpcId | null;
	readonly error?: ResponseError | undefined;
	readonly jsonrpc: "2.0";
	readonly result?: JsonValue | undefined;
}

export type Message = NotificationMessage | RequestMessage | ResponseMessage;

export type RequestResult = { readonly error: ResponseError } | { readonly result: JsonValue };

export interface Position {
	readonly character: number;
	readonly line: number;
}

export interface Range {
	readonly end: Position;
	readonly start: Position;
}

export interface ContentChange {
	readonly range?: Range | undefined;
	readonly text: string;
}
