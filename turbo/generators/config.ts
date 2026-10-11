import { existsSync } from "node:fs";
import nodePath from "node:path";
import { cwd, execPath } from "node:process";
import { type } from "arktype";
import { Predicate } from "effect";
import { exec } from "tinyexec";

import type { PlopTypes } from "@turbo/gen";

const PACKAGE_NAME_REGEXP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SCOPE_REGEXP = /^@[a-z0-9][a-z0-9-]*$/u;

const isGeneratorAnswers = type({
	name: "string",
	"+": "ignore",
	description: "string",
	scope: "string",
	"turbo?": { "paths?": { "root?": "unknown" } },
});

type GeneratorAnswers = typeof isGeneratorAnswers.infer;

function validateName(input: string): boolean | string {
	return PACKAGE_NAME_REGEXP.test(input) || "Use kebab-case, like my-package.";
}

function validateDescription(input: string): boolean | string {
	return input.trim().length > 0 || "Describe the package in one line.";
}

function validateScope(input: string): boolean | string {
	return SCOPE_REGEXP.test(input) || "Use an npm scope, like @howmanysmall.";
}

function readRoot(answers: GeneratorAnswers): string {
	const root = answers.turbo?.paths?.root;
	return Predicate.isString(root) && root.length > 0 ? root : cwd();
}

function createPrompts(defaultScope: string): Array<PlopTypes.PromptQuestion> {
	return [
		{
			name: "name",
			message: "Package name? This becomes packages/<name> and the binary name for CLIs.",
			type: "input",
			validate: validateName,
		},
		{
			name: "description",
			message: "One-line package description?",
			type: "input",
			validate: validateDescription,
		},
		{
			name: "scope",
			default: defaultScope,
			message: "npm scope?",
			type: "input",
			validate: validateScope,
		},
	];
}

const ensureDirectoryAvailable: PlopTypes.CustomActionFunction = function ensureDirectoryAvailable(answers) {
	const validAnswers = isGeneratorAnswers.assert(answers);
	if (!PACKAGE_NAME_REGEXP.test(validAnswers.name)) {
		throw new Error(`Invalid package name "${validAnswers.name}": use kebab-case.`);
	}

	const directory = nodePath.join(readRoot(validAnswers), "packages", validAnswers.name);
	if (existsSync(directory)) {
		throw new Error(`packages/${validAnswers.name} already exists.`);
	}

	return `packages/${validAnswers.name} is available.`;
};

const syncTsconfigReferencesAsync: PlopTypes.CustomActionFunction = async function syncTsconfigReferencesAsync(
	answers,
) {
	const validAnswers = isGeneratorAnswers.assert(answers);
	await exec(execPath, ["scripts/sync-tsconfig-references.ts"], {
		nodeOptions: {
			cwd: readRoot(validAnswers),
		},
	});
	return `Synced tsconfig references. Next: pnpm install, then build on packages/${validAnswers.name}.`;
};

function createAddAction(template: string, target: string): PlopTypes.AddActionConfig {
	return {
		path: `packages/{{kebabCase name}}/${target}`,
		templateFile: `templates/${template}.hbs`,
		type: "add",
	};
}

function stringifyJson(value: string): string {
	return JSON.stringify(value);
}

function renderShebang(): string {
	return "#!/usr/bin/env node";
}

/**
 * Scaffolds new workspace packages: private libraries shaped like
 * cli-utilities, and built CLIs shaped like lsp-mux.
 *
 * @param plop - The generator API Turborepo provides.
 */
export default function generator(plop: PlopTypes.NodePlopAPI): void {
	plop.setHelper("json", stringifyJson);
	plop.setHelper("shebang", renderShebang);
	plop.setGenerator("package", {
		actions: [
			ensureDirectoryAvailable,
			createAddAction("package/package", "package.json"),
			createAddAction("package/tsconfig", "tsconfig.json"),
			createAddAction("package/vitest-config", "vitest.config.ts"),
			createAddAction("package/src-index", "src/index.ts"),
			createAddAction("package/src-index-test", "src/index.test.ts"),
			syncTsconfigReferencesAsync,
		],
		description: "A private library package, like packages/cli-utilities.",
		prompts: createPrompts("@howmanysmall"),
	});

	plop.setGenerator("cli", {
		actions: [
			ensureDirectoryAvailable,
			createAddAction("cli/package", "package.json"),
			createAddAction("cli/tsconfig", "tsconfig.json"),
			createAddAction("cli/tsconfig-lib", "tsconfig.lib.json"),
			createAddAction("cli/tsdown-config", "tsdown.config.ts"),
			createAddAction("cli/vitest-config", "vitest.config.ts"),
			createAddAction("cli/src-cli", "src/cli.ts"),
			createAddAction("cli/src-constants", "src/constants.ts"),
			createAddAction("cli/src-index", "src/index.ts"),
			createAddAction("cli/src-index-test", "src/index.test.ts"),
			syncTsconfigReferencesAsync,
		],
		description: "A built CLI package, like packages/lsp-mux.",
		prompts: createPrompts("@pobammer-ts"),
	});
}
