import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { describe, expect, it } from "vitest";

import { getUserConfigurationLocation, loadConfigurationAsync, mergeLayers } from "./load-configuration-async";

async function withWorkspaceAsync<TValue>(runAsync: (workspace: string) => Promise<TValue>): Promise<TValue> {
	const workspace = await mkdtemp(nodePath.join(tmpdir(), "lsp-mux-configuration-"));
	try {
		return await runAsync(workspace);
	} finally {
		await rm(workspace, { force: true, recursive: true });
	}
}

async function writeAsync(workspace: string, relativePath: string, contents: string): Promise<string> {
	const path = nodePath.join(workspace, relativePath);
	await mkdir(nodePath.dirname(path), { recursive: true });
	await writeFile(path, contents);
	return path;
}

const TYPESCRIPT = { args: ["--lsp", "--stdio"], command: "tsgo", extensions: [".ts", ".tsx"] };

describe("mergeLayers", () => {
	// Catches c12's default defu concatenating a project's args onto the
	// defaults'.
	it("replaces arrays and merges objects, leftmost winning", () => {
		expect.assertions(1);

		expect(
			mergeLayers({ servers: { typescript: { args: ["--x"] } } }, undefined, {
				servers: { typescript: TYPESCRIPT },
			}),
		).toStrictEqual({ servers: { typescript: { ...TYPESCRIPT, args: ["--x"] } } });
	});
});

describe("getUserConfigurationLocation", () => {
	it("prefers LSP_MUX_CONFIG, then XDG_CONFIG_HOME, then ~/.config", () => {
		expect.assertions(3);

		expect(getUserConfigurationLocation({ LSP_MUX_CONFIG: "mux.jsonc" }, "/home")).toStrictEqual({
			configFile: "mux.jsonc",
			cwd: "/home",
		});
		expect(getUserConfigurationLocation({ XDG_CONFIG_HOME: "/xdg" }, "/home")).toStrictEqual({
			configFile: "lsp-mux",
			cwd: "/xdg",
		});
		expect(getUserConfigurationLocation({ LSP_MUX_CONFIG: "", XDG_CONFIG_HOME: "" }, "/home")).toStrictEqual({
			configFile: "lsp-mux",
			cwd: nodePath.join("/home", ".config"),
		});
	});
});

describe("loadConfigurationAsync", () => {
	// Catches a project or user tweak replacing the whole default server list.
	it("layers the defaults, the user configuration, and the project configuration", async () => {
		expect.assertions(1);

		const configuration = await withWorkspaceAsync(async (workspace) => {
			// Entry order is the server priority order.
			const servers = Object.fromEntries([
				["typescript", TYPESCRIPT],
				["oxfmt", { args: ["--lsp"], command: "oxfmt", extensions: [".ts"] }],
				["biome", { args: ["lsp-proxy"], command: "biome", extensions: [".ts"] }],
			]);
			const defaults = await writeAsync(
				workspace,
				"plugin/lsp-mux.json",
				JSON.stringify({ routes: { "textDocument/formatting": { servers: ["oxfmt", "biome"] } }, servers }),
			);
			await writeAsync(
				workspace,
				"config/lsp-mux.jsonc",
				'{\n\t// mine\n\t"servers": { "biome": { "enabled": false } },\n}\n',
			);
			await writeAsync(
				workspace,
				"project/lsp-mux.config.json",
				JSON.stringify({ servers: { typescript: { args: ["--run", "tsc", "--", "--lsp"], command: "node" } } }),
			);

			return loadConfigurationAsync({
				cwd: nodePath.join(workspace, "project"),
				defaults,
				environment: { XDG_CONFIG_HOME: nodePath.join(workspace, "config") },
				home: workspace,
			});
		});

		const { servers = {} } = configuration;

		expect(
			Object.entries(servers).map(([name, { args, command, enabled }]) => [name, command, args, enabled]),
		).toStrictEqual([
			["typescript", "node", ["--run", "tsc", "--", "--lsp"], true],
			["oxfmt", "oxfmt", ["--lsp"], true],
			["biome", "biome", ["lsp-proxy"], false],
		]);
	});

	it("works without any configuration file", async () => {
		expect.assertions(1);

		const configuration = await withWorkspaceAsync(async (workspace) =>
			loadConfigurationAsync({ cwd: workspace, environment: {}, home: workspace }),
		);

		expect(configuration).toStrictEqual({});
	});

	it("rejects an invalid configuration", async () => {
		expect.assertions(1);

		await expect(
			withWorkspaceAsync(async (workspace) => {
				await writeAsync(
					workspace,
					"lsp-mux.config.json",
					JSON.stringify({ servers: { typescript: { command: "" } } }),
				);
				return loadConfigurationAsync({ cwd: workspace, environment: {}, home: workspace });
			}),
		).rejects.toThrow("invalid lsp-mux configuration");
	});
});
