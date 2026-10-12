import { styleText } from "node:util";
import {
	createPrompt,
	isDownKey,
	isEnterKey,
	isSpaceKey,
	isUpKey,
	makeTheme,
	useKeypress,
	usePagination,
	usePrefix,
	useState,
} from "@inquirer/core";

import type { KeypressEvent } from "@inquirer/core";

export interface OrderedCheckboxConfiguration {
	readonly choices: ReadonlyArray<string>;
	readonly message: string;
	readonly pageSize?: number | undefined;
	/** Require at least one choice. */
	readonly required?: boolean | undefined;
}

export interface OrderedSelection {
	/** Every choice, checked ones first in priority order. */
	readonly items: ReadonlyArray<string>;
	/** The checked choices, in priority order. */
	readonly order: ReadonlyArray<string>;
}

const CURSOR_HIDE = "\u001B[?25l";

/**
 * Lists checked choices first, in priority order, then the rest in their
 * original order.
 *
 * @param choices - Every choice.
 * @param order - The checked choices, in priority order.
 * @returns The choices in display order, and the checked ones.
 */
export function createSelection(choices: ReadonlyArray<string>, order: ReadonlyArray<string>): OrderedSelection {
	const checked = new Set(order);
	return { items: [...order, ...choices.filter((choice) => !checked.has(choice))], order };
}

/**
 * Checks or unchecks a choice. A newly checked choice goes last.
 *
 * @param choices - Every choice.
 * @param order - The checked choices, in priority order.
 * @param choice - The choice to toggle.
 * @returns The new selection.
 */
export function toggleChoice(
	choices: ReadonlyArray<string>,
	order: ReadonlyArray<string>,
	choice: string,
): OrderedSelection {
	const next = order.includes(choice) ? order.filter((entry) => entry !== choice) : [...order, choice];
	return createSelection(choices, next);
}

/**
 * Moves a checked choice one place up or down in priority.
 *
 * @param choices - Every choice.
 * @param order - The checked choices, in priority order.
 * @param choice - The choice to move.
 * @param offset - `-1` for up, `1` for down.
 * @returns The new selection, unchanged at either end or for unchecked choices.
 */
export function moveChoice(
	choices: ReadonlyArray<string>,
	order: ReadonlyArray<string>,
	choice: string,
	offset: -1 | 1,
): OrderedSelection {
	const index = order.indexOf(choice);
	const target = index + offset;
	if (index === -1 || target < 0 || target >= order.length) {
		return createSelection(choices, order);
	}

	const next = [...order];
	[next[index], next[target]] = [order[target] ?? choice, choice];
	return createSelection(choices, next);
}

function getMoveOffset(key: KeypressEvent): -1 | 1 | undefined {
	if (!key.shift) return undefined;
	if (key.name === "up") return -1;
	if (key.name === "down") return 1;
	return undefined;
}

/**
 * A checkbox whose checked choices can be reordered with Shift+↑/↓. It
 * resolves to the checked choices in priority order.
 */
export const orderedCheckbox = createPrompt<ReadonlyArray<string>, OrderedCheckboxConfiguration>((config, done) => {
	const { choices, pageSize = 10, required = false } = config;
	const theme = makeTheme();
	const [status, setStatus] = useState<"done" | "idle">("idle");
	const prefix = usePrefix({ status, theme });
	const [selection, setSelection] = useState(createSelection(choices, []));
	const [active, setActive] = useState(0);
	const [error, setError] = useState<string | undefined>(undefined);

	const { items, order } = selection;
	const activeChoice = items[active] ?? "";

	function select(next: OrderedSelection): void {
		setSelection(next);
		setActive(Math.max(0, next.items.indexOf(activeChoice)));
	}

	useKeypress((key) => {
		const offset = getMoveOffset(key);
		if (isEnterKey(key)) {
			if (required && order.length === 0) {
				setError("Select at least one.");
				return;
			}
			setStatus("done");
			done(order);
		} else if (offset !== undefined) {
			select(moveChoice(choices, order, activeChoice, offset));
		} else if (isUpKey(key, theme.keybindings) || isDownKey(key, theme.keybindings)) {
			setError(undefined);
			const step = isUpKey(key, theme.keybindings) ? -1 : 1;
			setActive((active + step + items.length) % items.length);
		} else if (isSpaceKey(key)) {
			setError(undefined);
			select(toggleChoice(choices, order, activeChoice));
		}
	});

	const message = theme.style.message(config.message, status);
	const page = usePagination({
		active,
		items,
		loop: true,
		pageSize,
		renderItem({ isActive, item }) {
			const rank = order.indexOf(item);
			const cursor = isActive ? "❯" : " ";
			const box = rank === -1 ? "◯" : styleText("green", "◉");
			const position = rank === -1 ? " ".repeat(3) : styleText("dim", `${String(rank + 1).padStart(2)}.`);
			const line = `${cursor}${box} ${position} ${item}`;
			return isActive ? theme.style.highlight(line) : line;
		},
	});

	if (status === "done") return `${prefix} ${message} ${theme.style.answer(order.join(", ") || "none")}`;

	const help = [
		["↑↓", "navigate"],
		["space", "select"],
		["shift+↑↓", "reorder"],
		["⏎", "submit"],
	]
		.map(([key, action]) => `${styleText("bold", key ?? "")} ${styleText("dim", action ?? "")}`)
		.join(styleText("dim", " • "));

	const lines = [`${prefix} ${message}`, page, " ", error === undefined ? "" : theme.style.error(error), help];
	return `${lines.filter(Boolean).join("\n")}${CURSOR_HIDE}`;
});
