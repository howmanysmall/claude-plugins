import type { JsonObject } from "type-fest";

export const enum MessageType {
	Error = 1,
	Warning = 2,
	Info = 3,
	Log = 4,
}

export const enum RouteStrategy {
	First = "first",
	Merge = "merge",
}

export const enum SyncKind {
	None = 0,
	Full = 1,
	Incremental = 2,
}

/** The server capability each request needs, checked before forwarding. */
export const PROVIDERS: ReadonlyMap<string, string> = new Map([
	["callHierarchy/incomingCalls", "callHierarchyProvider"],
	["callHierarchy/outgoingCalls", "callHierarchyProvider"],
	["textDocument/codeAction", "codeActionProvider"],
	["textDocument/completion", "completionProvider"],
	["textDocument/declaration", "declarationProvider"],
	["textDocument/definition", "definitionProvider"],
	["textDocument/diagnostic", "diagnosticProvider"],
	["textDocument/documentHighlight", "documentHighlightProvider"],
	["textDocument/documentSymbol", "documentSymbolProvider"],
	["textDocument/formatting", "documentFormattingProvider"],
	["textDocument/hover", "hoverProvider"],
	["textDocument/implementation", "implementationProvider"],
	["textDocument/prepareCallHierarchy", "callHierarchyProvider"],
	["textDocument/prepareRename", "renameProvider"],
	["textDocument/rangeFormatting", "documentRangeFormattingProvider"],
	["textDocument/references", "referencesProvider"],
	["textDocument/rename", "renameProvider"],
	["textDocument/signatureHelp", "signatureHelpProvider"],
	["textDocument/typeDefinition", "typeDefinitionProvider"],
	["workspace/symbol", "workspaceSymbolProvider"],
]);

/**
 * Requests whose answers are concatenated across servers unless routed
 * otherwise.
 */
export const MERGED_BY_DEFAULT: ReadonlySet<string> = new Set([
	"textDocument/codeAction",
	"textDocument/references",
	"workspace/symbol",
]);

/**
 * What the mux advertises to the client; requests are filtered per server
 * later.
 */
export const MUX_CAPABILITIES: JsonObject = {
	callHierarchyProvider: true,
	codeActionProvider: true,
	completionProvider: { triggerCharacters: [".", '"', "'", "/", "@", "<", ":"] },
	definitionProvider: true,
	documentFormattingProvider: true,
	documentHighlightProvider: true,
	documentRangeFormattingProvider: true,
	documentSymbolProvider: true,
	hoverProvider: true,
	implementationProvider: true,
	referencesProvider: true,
	renameProvider: true,
	signatureHelpProvider: { triggerCharacters: ["(", ","] },
	textDocumentSync: { change: SyncKind.Incremental, openClose: true, save: { includeText: false } },
	typeDefinitionProvider: true,
	workspaceSymbolProvider: true,
};

/** Requests answered by the configured `formatters`. */
export const FORMATTING_METHODS: ReadonlySet<string> = new Set([
	"textDocument/formatting",
	"textDocument/rangeFormatting",
]);
