import { describe, expect, it } from "vitest";

import { moveChoice, toggleChoice } from "./ordered-checkbox-prompt";

const CHOICES = ["biome", "eslint", "oxfmt", "typescript"];

describe("toggleChoice", () => {
	it("lists checked choices first, in the order they were checked", () => {
		expect.assertions(1);

		const { order } = toggleChoice(CHOICES, ["typescript"], "eslint");

		expect(toggleChoice(CHOICES, order, "biome")).toStrictEqual({
			items: ["typescript", "eslint", "biome", "oxfmt"],
			order: ["typescript", "eslint", "biome"],
		});
	});

	it("returns an unchecked choice to its original place", () => {
		expect.assertions(1);

		expect(toggleChoice(CHOICES, ["typescript", "eslint"], "typescript")).toStrictEqual({
			items: ["eslint", "biome", "oxfmt", "typescript"],
			order: ["eslint"],
		});
	});
});

describe("moveChoice", () => {
	it("swaps a checked choice with its neighbour", () => {
		expect.assertions(1);

		expect(moveChoice(CHOICES, ["typescript", "eslint", "oxfmt"], "oxfmt", -1).order).toStrictEqual([
			"typescript",
			"oxfmt",
			"eslint",
		]);
	});

	it("leaves the order alone at either end and for unchecked choices", () => {
		expect.assertions(3);

		const order = ["typescript", "eslint"];

		expect(moveChoice(CHOICES, order, "typescript", -1).order).toStrictEqual(order);
		expect(moveChoice(CHOICES, order, "eslint", 1).order).toStrictEqual(order);
		expect(moveChoice(CHOICES, order, "biome", 1).order).toStrictEqual(order);
	});
});
