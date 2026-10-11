import nodePath from "node:path";
import { argv } from "node:process";
import { regex } from "arktype";
import { defineMacro } from "unplugin-macros";

import type { MacroContext } from "unplugin-macros";

const SUFFIXES_REGEXP = regex("-command$", "gu");

export const getScriptName = defineMacro(function getScriptName(
	this: MacroContext | undefined,
	// oxlint-disable-next-line typescript/no-inferrable-types -- clearly not?
	trimEnd: boolean = true,
	scriptPath?: string,
): string {
	const effectivePath = scriptPath ?? this?.id ?? argv[1] ?? import.meta.filename;
	let scriptName = nodePath.basename(effectivePath, nodePath.extname(effectivePath));
	if (scriptName === "index") {
		// Packages keep their entry at `src/index.ts`, so one level up is `src`,
		// not the package. Step past it to reach the manifest directory.
		let directory = nodePath.dirname(effectivePath);
		if (nodePath.basename(directory) === "src") directory = nodePath.dirname(directory);
		scriptName = nodePath.basename(directory);
	}
	return trimEnd ? scriptName.replaceAll(SUFFIXES_REGEXP, "") : scriptName;
});
