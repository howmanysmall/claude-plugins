import nodePath from "node:path";
import { argv } from "node:process";
import { defineMacro } from "unplugin-macros";

import type { MacroContext } from "unplugin-macros";

const SUFFIXES_REGEXP = /-command$/gu;
const GENERIC_ENTRY_NAMES = new Set(["cli", "index", "main"]);

export const getScriptName = defineMacro(function getScriptName(
	this: MacroContext | undefined,
	// oxlint-disable-next-line typescript/no-inferrable-types -- clearly not?
	trimEnd: boolean = true,
	scriptPath?: string,
): string {
	const effectivePath = scriptPath ?? this?.id ?? argv[1] ?? import.meta.filename;
	let scriptName = nodePath.basename(effectivePath, nodePath.extname(effectivePath));
	if (GENERIC_ENTRY_NAMES.has(scriptName)) {
		// Packages keep their entry at `src/cli.ts` or `src/index.ts`, so one
		// level up is `src`, not the package. Step past it to reach the
		// manifest directory.
		let directory = nodePath.dirname(effectivePath);
		if (nodePath.basename(directory) === "src") directory = nodePath.dirname(directory);
		scriptName = nodePath.basename(directory);
	}
	return trimEnd ? scriptName.replaceAll(SUFFIXES_REGEXP, "") : scriptName;
});
