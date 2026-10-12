import { describe, expect, it } from "vitest";

import { ConfigurationLocation } from "$validators/configuration-location-type";

import { addServer, describeServers, removeServer } from "./server-list-utilities";

const USER = { formatters: ["oxfmt"], servers: ["typescript", "oxfmt"] };

describe("addServer", () => {
	// Catches `lsp add` in a project silently dropping the user's servers,
	// since a project `servers` list replaces the user's.
	it("starts a project list from the user list", () => {
		expect.assertions(1);

		expect(addServer({}, { name: "eslint", formatter: false, inheritFrom: USER })).toStrictEqual({
			configuration: { servers: ["typescript", "oxfmt", "eslint"] },
			inherited: ["servers"],
		});
	});

	it("keeps a layer's own list and adds formatters and options", () => {
		expect.assertions(1);

		const edit = addServer(
			{ servers: ["yaml"] },
			{ name: "biome", formatter: true, inheritFrom: USER, options: { args: ["lsp-proxy", "--x"] } },
		);

		expect(edit).toStrictEqual({
			configuration: {
				formatters: ["oxfmt", "biome"],
				options: { biome: { args: ["lsp-proxy", "--x"] } },
				servers: ["yaml", "biome"],
			},
			inherited: ["formatters"],
		});
	});
});

describe("removeServer", () => {
	it("removes a server from every list and drops its options", () => {
		expect.assertions(1);

		const edit = removeServer(
			{ formatters: ["oxfmt"], options: { oxfmt: { args: ["--lsp"] } }, servers: ["typescript", "oxfmt"] },
			"oxfmt",
		);

		expect(edit).toStrictEqual({ configuration: { formatters: [], servers: ["typescript"] }, inherited: [] });
	});

	// Catches `lsp remove --location local` being unable to stop a user server
	// in one project.
	it("starts a project list from the user list minus the server", () => {
		expect.assertions(1);

		expect(removeServer({}, "oxfmt", USER)).toStrictEqual({
			configuration: { formatters: [], servers: ["typescript"] },
			inherited: ["servers", "formatters"],
		});
	});
});

describe("describeServers", () => {
	it("marks user servers shadowed once the project lists its own", () => {
		expect.assertions(1);

		const entries = describeServers({ project: { servers: ["yaml"] }, user: USER });

		expect(
			entries.map(({ name, formatter, scope, shadowed }) => ({ name, formatter, scope, shadowed })),
		).toStrictEqual([
			{ name: "yaml", formatter: false, scope: ConfigurationLocation.Local, shadowed: false },
			{ name: "typescript", formatter: false, scope: ConfigurationLocation.Global, shadowed: true },
			{ name: "oxfmt", formatter: true, scope: ConfigurationLocation.Global, shadowed: true },
		]);
	});

	it("reports a custom server with no command instead of throwing", () => {
		expect.assertions(2);

		const [entry] = describeServers({ project: { servers: ["mystery"] }, user: {} });

		expect(entry?.definition).toBeUndefined();
		expect(entry?.error).toContain("mystery");
	});
});
