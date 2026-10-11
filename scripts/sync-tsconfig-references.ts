import { readdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { argv, cwd, exit } from "node:process";
import { parseArgs } from "node:util";
import { type } from "arktype";

// `tsc --build` skips a project it cannot reach through `references`, and the
// import still resolves through the root `node_modules`, so a missing
// reference is silent. References come from the `workspace:` entries in each
// package.json instead of being maintained by hand.

const TSCONFIG_JSON = "tsconfig.json";

/** Workspace directories whose children are projects in the solution graph. */
const PROJECT_PARENTS = ["packages", "tools"] as const;

/**
 * Root configurations the solution references in addition to workspace
 * projects.
 */
const ROOT_CONFIGURATION_FILES = ["tsconfig.node.json"] as const;

const isDependencyMap = type({ "[string]": "string" }).readonly();

const isManifest = type({
	name: "string",
	"+": "ignore",
	"dependencies?": isDependencyMap,
	"devDependencies?": isDependencyMap,
	"optionalDependencies?": isDependencyMap,
	"peerDependencies?": isDependencyMap,
}).readonly();

const isTsConfig = type({
	"+": "ignore",
	"references?": type({ "+": "ignore", "path?": "string" }).readonly().array().readonly(),
}).readonly();

const parseJson = type("string.json.parse");

interface Project {
	readonly name: string;
	readonly directory: string;
	readonly workspaceDependencies: ReadonlyArray<string>;
}

interface ConfigurationFile {
	readonly expectedReferences: ReadonlyArray<string>;
	readonly path: string;
}

interface StaleReferences {
	readonly actualReferences: ReadonlyArray<string>;
	readonly expectedReferences: ReadonlyArray<string>;
	readonly path: string;
}

async function readTextAsync(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
		throw error;
	}
}

function compareUsingLocale(stringA: string, stringB: string): number {
	return stringA.localeCompare(stringB);
}

function collectWorkspaceDependencies(manifest: typeof isManifest.infer): ReadonlyArray<string> {
	const names = new Set<string>();
	for (const dependencies of [
		manifest.dependencies,
		manifest.devDependencies,
		manifest.optionalDependencies,
		manifest.peerDependencies,
	]) {
		if (dependencies === undefined) continue;
		for (const [name, specifier] of Object.entries(dependencies)) {
			if (specifier.startsWith("workspace:")) names.add(name);
		}
	}
	return [...names];
}

async function readProjectAsync(rootDirectory: string, directory: string): Promise<Project | undefined> {
	const manifestText = await readTextAsync(nodePath.join(rootDirectory, directory, "package.json"));
	if (manifestText === undefined) return undefined;
	if ((await readTextAsync(nodePath.join(rootDirectory, directory, TSCONFIG_JSON))) === undefined) return undefined;

	const manifest = isManifest.assert(parseJson.assert(manifestText));
	return { name: manifest.name, directory, workspaceDependencies: collectWorkspaceDependencies(manifest) };
}

async function findProjectsAsync(rootDirectory: string): Promise<ReadonlyArray<Project>> {
	const candidates = new Array<string>();
	for (const parent of PROJECT_PARENTS) {
		// oxlint-disable-next-line no-await-in-loop -- parents are read in declaration order
		const children = await readdir(nodePath.join(rootDirectory, parent), { withFileTypes: true });
		for (const child of children) if (child.isDirectory()) candidates.push(`${parent}/${child.name}`);
	}

	const projects = await Promise.all(
		candidates.toSorted(compareUsingLocale).map(async (directory) => readProjectAsync(rootDirectory, directory)),
	);
	return projects.filter((project) => project !== undefined);
}

async function readReferencesAsync(filePath: string): Promise<ReadonlyArray<string>> {
	const tsconfig = isTsConfig.assert(parseJson.assert(await readFile(filePath, "utf8")));
	return (tsconfig.references ?? []).map((reference) => reference.path ?? "").toSorted(compareUsingLocale);
}

async function writeReferencesAsync(filePath: string, referencePaths: ReadonlyArray<string>): Promise<void> {
	const tsconfig = isTsConfig.assert(parseJson.assert(await readFile(filePath, "utf8")));

	// Keep `extends` and `compilerOptions` first, as in every tsconfig here.
	const entries = Object.entries(tsconfig).filter(([key]) => key !== "references");
	const leading = entries.filter(([key]) => key === "extends" || key === "compilerOptions");
	const trailing = entries.filter(([key]) => key !== "extends" && key !== "compilerOptions");
	// `references` is owned by this script; an empty expected list removes the
	// key instead of leaking the stale one back through.
	const references: ReadonlyArray<readonly [string, unknown]> =
		referencePaths.length > 0 ? [["references", referencePaths.map((path) => ({ path }))]] : [];
	const ordered = Object.fromEntries([...leading, ...references, ...trailing]);

	await writeFile(filePath, `${JSON.stringify(ordered, undefined, "\t")}\n`, "utf8");
}

function toRelativeReference(fromDirectory: string, toDirectory: string): string {
	const relative = nodePath.posix.relative(fromDirectory, toDirectory);
	return relative.startsWith(".") ? relative : `./${relative}`;
}

function toProjectReferences(
	directory: string,
	workspaceDependencies: ReadonlyArray<string>,
	directoriesByName: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
	const references = new Array<string>();
	for (const name of workspaceDependencies) {
		const dependencyDirectory = directoriesByName.get(name);
		if (dependencyDirectory !== undefined) references.push(toRelativeReference(directory, dependencyDirectory));
	}
	return references.toSorted(compareUsingLocale);
}

function toConfigurationFile(
	{ directory, workspaceDependencies }: Project,
	directoriesByName: ReadonlyMap<string, string>,
): ConfigurationFile {
	return {
		expectedReferences: toProjectReferences(directory, workspaceDependencies, directoriesByName),
		path: nodePath.posix.join(directory, TSCONFIG_JSON),
	};
}

async function collectConfigurationFilesAsync(rootDirectory: string): Promise<ReadonlyArray<ConfigurationFile>> {
	const projects = await findProjectsAsync(rootDirectory);
	const directoriesByName = new Map(projects.map((project) => [project.name, project.directory]));

	return [
		...projects.map((project) => toConfigurationFile(project, directoriesByName)),
		{
			expectedReferences: [...projects.map((project) => project.directory), ...ROOT_CONFIGURATION_FILES]
				.map((directory) => `./${directory}`)
				.toSorted(compareUsingLocale),
			path: TSCONFIG_JSON,
		},
	];
}

function isSameReferences(actual: ReadonlyArray<string>, expected: ReadonlyArray<string>): boolean {
	return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function findStaleReferencesAsync(rootDirectory: string): Promise<ReadonlyArray<StaleReferences>> {
	const configurationFiles = await collectConfigurationFilesAsync(rootDirectory);
	const staleReferences = new Array<StaleReferences>();

	for (const { expectedReferences, path } of configurationFiles) {
		// oxlint-disable-next-line no-await-in-loop -- sequential reads keep the report ordered
		const actualReferences = await readReferencesAsync(nodePath.join(rootDirectory, path));
		if (isSameReferences(actualReferences, expectedReferences)) continue;
		staleReferences.push({ actualReferences, expectedReferences, path });
	}
	return staleReferences;
}

async function syncTsconfigReferencesAsync(rootDirectory: string): Promise<ReadonlyArray<StaleReferences>> {
	const staleReferences = await findStaleReferencesAsync(rootDirectory);
	for (const { expectedReferences, path } of staleReferences) {
		// oxlint-disable-next-line no-await-in-loop -- sequential writes keep the report ordered
		await writeReferencesAsync(nodePath.join(rootDirectory, path), expectedReferences);
	}
	return staleReferences;
}

async function runAsync(): Promise<void> {
	const { values } = parseArgs({
		args: argv.slice(2),
		options: { check: { default: false, short: "c", type: "boolean" } },
	});
	const rootDirectory = cwd();

	if (values.check) {
		const staleReferences = await findStaleReferencesAsync(rootDirectory);
		for (const { actualReferences, expectedReferences, path } of staleReferences) {
			console.error(`${path} references are stale`);
			console.error(`  expected: ${expectedReferences.join(", ") || "(none)"}`);
			console.error(`  actual:   ${actualReferences.join(", ") || "(none)"}`);
		}

		if (staleReferences.length === 0) {
			console.log("all tsconfig references are in sync");
			return;
		}

		console.error(`${staleReferences.length} tsconfig file(s) out of sync; run \`node --run references:sync\``);
		exit(1);
	}

	const staleReferences = await syncTsconfigReferencesAsync(rootDirectory);
	for (const { path } of staleReferences) console.log(`updated ${path}`);
	console.log(
		staleReferences.length === 0
			? "all tsconfig references are in sync"
			: `synced ${staleReferences.length} tsconfig file(s)`,
	);
}

await runAsync();
