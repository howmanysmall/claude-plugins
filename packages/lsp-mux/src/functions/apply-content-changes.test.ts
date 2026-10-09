import { describe, expect, it } from "vitest";

import { applyContentChanges } from "./apply-content-changes";

describe("applyContentChanges", () => {
	// Catches servers that started mid-edit seeing a different document than the
	// client.
	it("applies ranged and full changes in order, clamping positions past the end", () => {
		expect.assertions(1);

		expect(
			applyContentChanges("one\r\ntwo\nthree", [
				{ range: { end: { character: 3, line: 1 }, start: { character: 0, line: 1 } }, text: "2" },
				{ range: { end: { character: 99, line: 0 }, start: { character: 1, line: 0 } }, text: "!" },
				{ range: { end: { character: 0, line: 9 }, start: { character: 0, line: 9 } }, text: "." },
			]),
		).toBe("o!\r\n2\nthree.");
	});

	it("replaces the whole document on a full change", () => {
		expect.assertions(1);

		expect(applyContentChanges("old", [{ text: "new" }])).toBe("new");
	});
});
