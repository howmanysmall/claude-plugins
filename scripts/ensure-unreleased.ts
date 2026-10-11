import { readFileSync, writeFileSync } from "node:fs";

const path = "CHANGELOG.md";
const header = "All notable changes to `@pobammer-ts/lsp-mux` are documented here.";
const content = readFileSync(path, "utf8");

if (!content.includes("## [Unreleased]")) {
	writeFileSync(
		path,
		content.replace(header, () => `${header}\n\n## [Unreleased]`),
	);
	console.log("Inserted ## [Unreleased] into CHANGELOG.md");
}
