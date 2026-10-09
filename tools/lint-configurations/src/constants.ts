export const baseIgnores = [
	"!**/.opencode",
	"!**/.opencode/**",
	"**/.opencode/goals",
	"**/*.js",
	".mise/**",
	"**/generated/**",
	".vale/**",
	"plugins/*/.lsp.json",
] satisfies ReadonlyArray<string>;

export const projectType: "app" | "game" | "package" = "package";
