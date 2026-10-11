import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { describe, expect, it } from "vitest";

import { mergeLayers } from "$utilities/merge-utilities";

import { getUserConfigurationLocation, loadConfigurationAsync } from "./load-configuration-async";

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

// The package resolves from `node_modules` in real projects; the test imports
// the source directly.
const DEFINE_CONFIGURATION_PATH = nodePath.join(import.meta.dirname, "define-config.ts");

const TRUSTED = { LSP_MUX_TRUST_PROJECT_CONFIGS: "1" };
const TYPESCRIPT_CONFIGURATION = [
	`import { defineConfiguration } from "${DEFINE_CONFIGURATION_PATH}";`,
	"",
	'export default defineConfiguration({ servers: ["yaml"] });',
].join("\n");

function namesOf(servers: ReadonlyArray<{ readonly name: string }>): ReadonlyArray<string> {
	return servers.map(({ name }) => name);
}

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
	// Catches a project's `lsp-mux.config.ts` failing to load where the package
	// isn't installed.
	it("loads a TypeScript configuration that uses defineConfiguration", async () => {
		expect.assertions(2);

		const configuration = await withWorkspaceAsync(async (workspace) => {
			await writeAsync(
				workspace,
				"lsp-mux.config.ts",
				[
					`import { defineConfiguration } from "${DEFINE_CONFIGURATION_PATH}";`,
					"",
					"export default defineConfiguration({",
					'\tservers: ["typescript", "biome"],',
					'\toptions: { typescript: { command: "tsc" } },',
					"});",
				].join("\n"),
			);
			return loadConfigurationAsync({ cwd: workspace, environment: TRUSTED, home: workspace });
		});

		expect(namesOf(configuration.servers)).toStrictEqual(["typescript", "biome"]);
		expect(configuration.servers[0]).toMatchObject({ args: ["--lsp", "--stdio"], command: "tsc" });
	});

	// Catches a user's personal servers being lost, or overriding the project.
	it("layers the project configuration over the user configuration", async () => {
		expect.assertions(2);

		const configuration = await withWorkspaceAsync(async (workspace) => {
			await writeAsync(
				workspace,
				"config/lsp-mux.jsonc",
				'{\n\t// mine\n\t"servers": ["yaml"],\n\t"options": { "yaml": { "args": ["--x"] } },\n}\n',
			);
			await writeAsync(workspace, "project/.config/lsp-mux.json", JSON.stringify({ formatters: ["biome"] }));
			return loadConfigurationAsync({
				cwd: nodePath.join(workspace, "project"),
				environment: { XDG_CONFIG_HOME: nodePath.join(workspace, "config") },
				home: workspace,
			});
		});

		expect(configuration.formatters).toStrictEqual(["biome"]);
		expect(configuration.servers).toMatchObject([{ name: "yaml", args: ["--x"], command: "yaml-language-server" }]);
	});

	// Catches an untrusted repository's config code running as soon as Claude
	// Code starts the plugin.
	it("skips a project's code configuration unless trusted, and says why", async () => {
		expect.assertions(2);

		const configuration = await withWorkspaceAsync(async (workspace) => {
			await writeAsync(workspace, "lsp-mux.config.ts", TYPESCRIPT_CONFIGURATION);
			return loadConfigurationAsync({ cwd: workspace, environment: {}, home: workspace });
		});

		expect(configuration.servers).toStrictEqual([]);
		expect(configuration.warnings).toStrictEqual([
			expect.stringContaining("set LSP_MUX_TRUST_PROJECT_CONFIGS=1 to run project configuration code"),
		]);
	});

	it("always runs the user's own code configuration", async () => {
		expect.assertions(1);

		const configuration = await withWorkspaceAsync(async (workspace) => {
			await writeAsync(workspace, "config/lsp-mux.ts", TYPESCRIPT_CONFIGURATION);
			return loadConfigurationAsync({
				cwd: nodePath.join(workspace, "project"),
				environment: { XDG_CONFIG_HOME: nodePath.join(workspace, "config") },
				home: workspace,
			});
		});

		expect(namesOf(configuration.servers)).toStrictEqual(["yaml"]);
	});

	it("runs nothing without a configuration", async () => {
		expect.assertions(1);

		const configuration = await withWorkspaceAsync(async (workspace) =>
			loadConfigurationAsync({ cwd: workspace, environment: {}, home: workspace }),
		);

		expect(configuration).toStrictEqual({ formatters: [], servers: [], warnings: [] });
	});

	it("rejects an unknown server without a command", async () => {
		expect.assertions(1);

		await expect(
			withWorkspaceAsync(async (workspace) => {
				await writeAsync(workspace, "lsp-mux.config.json", JSON.stringify({ servers: ["mystery"] }));
				return loadConfigurationAsync({ cwd: workspace, environment: {}, home: workspace });
			}),
		).rejects.toThrow('lsp-mux server "mystery"');
	});
});
