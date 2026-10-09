import { LINE_BREAK_REGEXP } from "$constants";

import type { ContentChange, Position } from "$types/protocol-types";

function computeLineStarts(text: string): ReadonlyArray<number> {
	const starts = [0];
	for (const match of text.matchAll(LINE_BREAK_REGEXP)) starts.push(match.index + match[0].length);
	return starts;
}

function getLineEndAt(text: string, nextLineStart?: number): number {
	if (nextLineStart === undefined) return text.length;
	return text.slice(nextLineStart - 2, nextLineStart) === "\r\n" ? nextLineStart - 2 : nextLineStart - 1;
}

/**
 * A character past the end of its line clamps to the line's end, before the
 * line break, as the LSP specification requires.
 *
 * @param text - The document.
 * @param lineStarts - Offsets where each line starts.
 * @param position - The position to convert.
 * @returns The offset into `text`.
 */
function getOffsetAt(text: string, lineStarts: ReadonlyArray<number>, position: Position): number {
	const lineStart = lineStarts[position.line];
	if (lineStart === undefined) return text.length;

	return Math.min(lineStart + position.character, getLineEndAt(text, lineStarts[position.line + 1]));
}

/**
 * Applies LSP content changes. Positions are UTF-16 code units, which is how
 * JavaScript strings are indexed, so no transcoding is needed.
 *
 * @param text - The document before the changes.
 * @param changes - Changes in the order the client sent them.
 * @returns The document after every change.
 */
export function applyContentChanges(text: string, changes: ReadonlyArray<ContentChange>): string {
	let current = text;
	for (const change of changes) {
		if (change.range === undefined) {
			current = change.text;
			continue;
		}

		const lineStarts = computeLineStarts(current);
		const start = getOffsetAt(current, lineStarts, change.range.start);
		const end = getOffsetAt(current, lineStarts, change.range.end);
		current = current.slice(0, start) + change.text + current.slice(end);
	}
	return current;
}
