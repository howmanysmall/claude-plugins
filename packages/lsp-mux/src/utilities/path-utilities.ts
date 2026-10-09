import nodePath from "node:path";

export type PathExists = (path: string) => boolean;

function isWithin(directory: string, boundary: string): boolean {
	const path = nodePath.relative(boundary, directory);
	return path.length === 0 || (!path.startsWith("..") && !nodePath.isAbsolute(path));
}

function* ancestorsWithin(directory: string, boundary: string): Generator<string> {
	if (!isWithin(directory, boundary)) return;

	let current = directory;
	for (;;) {
		yield current;
		if (current === boundary) return;
		current = nodePath.dirname(current);
	}
}

/**
 * Finds the directory that owns a file for one language server: the nearest
 * directory up to the workspace boundary holding any marker, else the
 * boundary, or nothing when a marker is required.
 *
 * @param directory - The directory of the file being opened.
 * @param markers - File names that mark a project root for the server.
 * @param boundary - The workspace root; the search never leaves it.
 * @param exists - Checks whether a path exists.
 * @param required - Whether the server only runs where a marker exists.
 * @returns The project root to start the server in, or `undefined` when a
 *   required marker is missing.
 */
export function findProjectRoot(
	directory: string,
	markers: ReadonlyArray<string>,
	boundary: string,
	exists: PathExists,
	required = false,
): string | undefined {
	if (markers.length === 0) return boundary;

	for (const candidate of ancestorsWithin(directory, boundary)) {
		if (markers.some((marker) => exists(nodePath.join(candidate, marker)))) return candidate;
	}

	return required ? undefined : boundary;
}

/**
 * Resolves a command to the nearest `node_modules/.bin` copy between the
 * project root and the workspace boundary, so each workspace runs the version
 * it pins, then to the first match on the search path.
 *
 * @param command - The configured command.
 * @param root - The project root the server runs in.
 * @param boundary - The workspace root.
 * @param searchPath - Directories to look the command up in, like `PATH`.
 * @param exists - Checks whether a path exists.
 * @returns The command to spawn, or `undefined` when it is not installed.
 */
export function resolveCommand(
	command: string,
	root: string,
	boundary: string,
	searchPath: ReadonlyArray<string>,
	exists: PathExists,
): string | undefined {
	if (command.includes("/") || command.includes(nodePath.sep)) {
		return exists(command) ? command : undefined;
	}

	for (const candidate of ancestorsWithin(root, boundary)) {
		const binary = nodePath.join(candidate, "node_modules", ".bin", command);
		if (exists(binary)) return binary;
	}

	for (const directory of searchPath) {
		if (directory.length > 0 && exists(nodePath.join(directory, command))) return command;
	}
	return undefined;
}
