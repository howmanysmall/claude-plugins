import { describe, expect, it } from "vitest";
import ansis, { Ansis } from "ansis";

import { renderHighlight } from "./cliffy-highlight";

const { blueBright, bold, cyan, dim, italic, magentaBright, strikethrough, underline } = new Ansis(1);

describe("renderHighlight plain and block markup", () => {
	it("returns plain text unchanged when there is no markup", () => {
		expect.assertions(1);

		expect(renderHighlight("hello world")).toBe("hello world");
	});

	it("renders headings, with h1 underlined", () => {
		expect.assertions(2);

		expect(renderHighlight("# Title")).toBe(`${dim("#")} ${bold(underline("Title"))}`);
		expect(renderHighlight("## Section")).toBe(`${dim("##")} ${bold("Section")}`);
	});

	it("renders blockquotes, bullets, ordered lists, and rules", () => {
		expect.assertions(8);

		expect(renderHighlight("> quoted")).toBe(`${dim(">")} quoted`);
		expect(renderHighlight("- item")).toBe(`${dim("-")} item`);
		expect(renderHighlight("* item")).toBe(`${dim("*")} item`);
		expect(renderHighlight("+ item")).toBe(`${dim("+")} item`);
		expect(renderHighlight("1. first")).toBe(`${dim("1.")} first`);
		expect(renderHighlight("---")).toBe(dim("---"));
		expect(renderHighlight("***")).toBe(dim("***"));
		expect(renderHighlight("___")).toBe(dim("___"));
	});
});

describe("renderHighlight inline markup", () => {
	it("renders bold, italic, strikethrough, code, and links", () => {
		expect.assertions(5);

		expect(renderHighlight("**bold**")).toBe(bold("bold"));
		expect(renderHighlight("*italic*")).toBe(italic("italic"));
		expect(renderHighlight("~~gone~~")).toBe(strikethrough("gone"));
		expect(renderHighlight("`code`")).toBe(cyan("code"));
		expect(renderHighlight("[label](https://example.com)")).toBe(
			`${underline(cyan("label"))}${dim(" (https://example.com)")}`,
		);
	});

	it("renders nested inline markup inside block constructs", () => {
		expect.assertions(4);

		const boldHeading = bold(`has ${bold("bold")}`);

		expect(renderHighlight("> **bold quote**")).toBe(`${dim(">")} ${bold("bold quote")}`);
		expect(renderHighlight("- `code item`")).toBe(`${dim("-")} ${cyan("code item")}`);
		expect(renderHighlight("1. *italic item*")).toBe(`${dim("1.")} ${italic("italic item")}`);
		expect(renderHighlight("### has **bold**")).toBe(`${dim("###")} ${boldHeading}`);
	});
});

describe("renderHighlight fenced code", () => {
	it("renders multi-line fenced code blocks and keeps blank lines", () => {
		expect.assertions(1);

		const input = ["```", "const value = 1;", "", "value", "```"].join("\n");

		expect(renderHighlight(input)).toBe([dim("const value = 1;"), "", dim("value"), ""].join("\n"));
	});

	it("renders unclosed fences as code through the end of the text", () => {
		expect.assertions(1);

		const input = ["```", "still code"].join("\n");

		expect(renderHighlight(input)).toBe(dim("still code"));
	});

	it("renders same-line fences and leftover text after the closing marker", () => {
		expect.assertions(2);

		expect(renderHighlight("```inline```")).toBe(dim("inline"));
		expect(renderHighlight("```inline```trail")).toBe(`${dim("inline")}\ntrail`);
	});

	it("renders multi-line fences closed mid-line with leftover text", () => {
		expect.assertions(1);

		const input = ["```", "body", "```trail"].join("\n");

		expect(renderHighlight(input)).toBe(`${dim("body")}\n\ntrail`);
	});

	it("supports tilde fences and CRLF line endings", () => {
		expect.assertions(2);

		expect(renderHighlight("~~~\nbody\n~~~")).toBe(`${dim("body")}\n`);
		expect(renderHighlight("# One\r\n## Two")).toBe(
			[`${dim("#")} ${bold(underline("One"))}`, `${dim("##")} ${bold("Two")}`].join("\n"),
		);
	});
});

describe("renderHighlight command syntax", () => {
	// Bug: help text buries the runnable binary in flat cyan so `pkl` blends
	// into `download-package`. Expected colors from Cliffy help palette (binary
	// magenta, args cyan). Survives renames/splits of internal helpers because it
	// asserts via the public string seam only.
	it("paints the binary magenta so `pkl download-package` does not melt into one cyan span", () => {
		expect.assertions(2);

		expect(renderHighlight("use `pkl download-package` now")).toBe(
			`use ${magentaBright("pkl")} ${cyan("download-package")} now`,
		);
		expect(ansis.strip(renderHighlight("use `pkl download-package` now"))).toBe("use pkl download-package now");
	});

	// Bug: a runnable example with flags blends the binary into its args so
	// users miss what to type first. Expected colors from Cliffy help palette
	// (binary magenta, args cyan, flags bright blue).
	it("paints binary, args, and flags distinctly for `pkl download-package --help`", () => {
		expect.assertions(2);

		expect(renderHighlight("run `pkl download-package --help` now")).toBe(
			`run ${magentaBright("pkl")} ${cyan("download-package")} ${blueBright("--help")} now`,
		);
		expect(ansis.strip(renderHighlight("run `pkl download-package --help` now"))).toBe(
			"run pkl download-package --help now",
		);
	});

	// Bug: fenced runnable examples stay flat dim so the binary blends into args
	// and flags. Expected colors from Cliffy help palette; plain code lines stay
	// dim.
	it("paints commands inside fenced blocks while leaving plain code dim", () => {
		expect.assertions(3);

		expect(renderHighlight("```\nskills list --json\n```")).toBe(
			`${magentaBright("skills")} ${cyan("list")} ${blueBright("--json")}\n`,
		);
		expect(renderHighlight("```\nconst value = 1;\n```")).toBe(`${dim("const value = 1;")}\n`);
		expect(ansis.strip(renderHighlight("```\nskills list --json\n```"))).toBe("skills list --json\n");
	});
});

describe("renderHighlight", () => {
	it("paints --json the same bright blue as Options flags so it does not melt into the command words", () => {
		expect.assertions(4);

		const output = renderHighlight("slow `skills list --json` command");

		expect(output).toContain(magentaBright("skills"));
		expect(output).toContain(cyan("list"));
		expect(output).toContain(blueBright("--json"));
		expect(ansis.strip(output)).toBe("slow skills list --json command");
	});

	it("does not recolor inline code that is not a command example", () => {
		expect.assertions(2);

		const code = "Promise.all";
		const input = `x \`${code}\` y`;

		expect(renderHighlight(input)).toContain(cyan(code));
		expect(renderHighlight(input)).toBe(`x ${cyan(code)} y`);
	});

	it("treats a lone -- as prose, not a flag", () => {
		expect.assertions(2);

		const output = renderHighlight("see `a -- b`");

		expect(output).toContain(cyan("a -- b"));
		expect(output).toBe(`see ${cyan("a -- b")}`);
	});
});
