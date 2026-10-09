import { describe, expect, it } from "vitest";

import { findProjectRoot, resolveCommand } from "./path-utilities";

function createExists(paths: ReadonlySet<string>): (path: string) => boolean {
	return (path) => paths.has(path);
}

describe("findProjectRoot", () => {
	it("stops at the nearest marker and never leaves the boundary", () => {
		expect.assertions(3);

		const exists = createExists(new Set(["/package.json", "/repo/pkg/package.json"]));

		expect(findProjectRoot("/repo/pkg/src", ["package.json"], "/repo", exists)).toBe("/repo/pkg");
		expect(findProjectRoot("/repo/src", ["package.json"], "/repo", exists)).toBe("/repo");
		expect(findProjectRoot("/elsewhere", ["package.json"], "/repo", exists)).toBe("/repo");
	});

	// Catches eslint or vale starting in projects that do not use them.
	it("finds nothing without a marker when one is required", () => {
		expect.assertions(2);

		const exists = createExists(new Set(["/repo/pkg/biome.json"]));

		expect(findProjectRoot("/repo/pkg/src", ["biome.json"], "/repo", exists, true)).toBe("/repo/pkg");
		expect(findProjectRoot("/repo/src", ["biome.json"], "/repo", exists, true)).toBeUndefined();
	});
});

describe("resolveCommand", () => {
	// Catches the project's pinned tsgo/oxlint being ignored for whatever is on
	// PATH.
	it("prefers the nearest node_modules/.bin, then PATH, else nothing", () => {
		expect.assertions(4);

		const paths = new Set(["/bin/biome", "/repo/node_modules/.bin/tsgo"]);
		const exists = createExists(paths);

		expect(resolveCommand("tsgo", "/repo/pkg", "/repo", ["/bin"], exists)).toBe("/repo/node_modules/.bin/tsgo");
		expect(resolveCommand("biome", "/repo/pkg", "/repo", ["", "/bin"], exists)).toBe("biome");
		expect(resolveCommand("missing", "/repo/pkg", "/repo", ["/bin"], exists)).toBeUndefined();
		expect(resolveCommand("/bin/biome", "/repo", "/repo", [], exists)).toBe("/bin/biome");
	});
});
