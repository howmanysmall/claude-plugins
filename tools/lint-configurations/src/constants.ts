export const baseIgnores = [
	"**/*.js",
	".mise/**",
	"**/generated/**",
	".vale/**",
	"plugins/*/.lsp.json",
] satisfies ReadonlyArray<string>;

export const projectType: "app" | "game" | "package" = "package";
