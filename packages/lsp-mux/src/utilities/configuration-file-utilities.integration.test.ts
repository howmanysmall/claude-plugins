import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfigurationAsync } from "$functions/load-configuration-async";

import {
	ConfigurationFormat,
	editConfigurationSource,
	readConfigurationSource,
	renderConfiguration,
} from "./configuration-file-utilities";

import type { Configuration } from "$types/configuration-types";

const SPACE_INDENTATION_REGEXP = /^\t* /mu;
const CONFIGURATION = { formatters: ["oxfmt"], servers: ["typescript", "oxfmt"] };

async function withWorkspaceAsync<TValue>(runAsync: (workspace: string) => Promise<TValue>): Promise<TValue> {
	const workspace = await mkdtemp(nodePath.join(tmpdir(), "lsp-mux-configuration-"));
	try {
		return await runAsync(workspace);
	} finally {
		await rm(workspace, { force: true, recursive: true });
	}
}

function addEslint(configuration: Configuration): Configuration {
	return { ...configuration, servers: [...(configuration.servers ?? []), "eslint"] };
}

describe("renderConfiguration", () => {
	it.each([ConfigurationFormat.Json, ConfigurationFormat.Jsonc, ConfigurationFormat.TypeScript])(
		"writes a %s file that reads back as the same configuration",
		(format) => {
			expect.assertions(1);

			const path = `lsp-mux.config.${format}`;

			expect(readConfigurationSource(path, renderConfiguration(CONFIGURATION, format))).toStrictEqual(
				CONFIGURATION,
			);
		},
	);

	// Catches a scaffolded TypeScript configuration failing to load in a
	// project that doesn't install the package, like the user config in
	// ~/.config.
	it("writes a TypeScript configuration that loads without the package installed", async () => {
		expect.assertions(1);

		const configuration = await withWorkspaceAsync(async (workspace) => {
			await writeFile(
				nodePath.join(workspace, "lsp-mux.config.ts"),
				renderConfiguration(CONFIGURATION, ConfigurationFormat.TypeScript),
			);
			return loadConfigurationAsync({
				cwd: workspace,
				environment: { LSP_MUX_TRUST_PROJECT_CONFIGS: "1" },
				home: workspace,
			});
		});

		expect(configuration.servers.map(({ name }) => name)).toStrictEqual(["typescript", "oxfmt"]);
	});
});

describe("editConfigurationSource", () => {
	it("keeps comments in a JSONC configuration", () => {
		expect.assertions(2);

		const edited = editConfigurationSource(
			"lsp-mux.config.jsonc",
			'{\n\t// why these servers\n\t"servers": ["typescript"],\n}\n',
			addEslint,
		);

		expect(edited).toContain("// why these servers");
		expect(readConfigurationSource("lsp-mux.config.jsonc", edited)).toStrictEqual({
			servers: ["typescript", "eslint"],
		});
	});

	it("edits a TypeScript configuration without running it", () => {
		expect.assertions(2);

		const source = [
			'import { defineConfiguration } from "@pobammer-ts/lsp-mux";',
			"",
			"// why these servers",
			'export default defineConfiguration({ servers: ["typescript"] });',
			"",
		].join("\n");
		const edited = editConfigurationSource("lsp-mux.config.ts", source, addEslint);

		expect(edited).toContain("// why these servers");
		expect(readConfigurationSource("lsp-mux.config.ts", edited)).toStrictEqual({
			servers: ["typescript", "eslint"],
		});
	});

	// Catches recast misaligning the tab indentation it reprints.
	it("keeps tab indentation in a TypeScript configuration", () => {
		expect.assertions(1);

		const source = renderConfiguration({ servers: ["typescript"] }, ConfigurationFormat.TypeScript);
		const edited = editConfigurationSource("lsp-mux.config.ts", source, (configuration) => ({
			...configuration,
			options: { yaml: { env: { FOO: "bar" } } },
		}));

		expect(edited).not.toMatch(SPACE_INDENTATION_REGEXP);
	});

	it("refuses a TypeScript configuration it can't edit statically", () => {
		expect.assertions(1);

		expect(() =>
			editConfigurationSource(
				"lsp-mux.config.ts",
				'const configuration = { servers: ["typescript"] };\nexport default configuration;\n',
				addEslint,
			),
		).toThrow("edit it by hand");
	});

	it("refuses formats it can't edit", () => {
		expect.assertions(1);

		expect(() => editConfigurationSource("lsp-mux.config.yaml", "servers: []\n", addEslint)).toThrow(
			"edit lsp-mux.config.yaml by hand",
		);
	});
});
