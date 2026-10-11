import { env } from "node:process";

const DEFAULT_PROPERTY_RUNS = 100;

function parsePropertyRuns(value?: string): number {
	const runs = Number(value);
	return Number.isInteger(runs) && runs > 0 ? runs : DEFAULT_PROPERTY_RUNS;
}

/**
 * Runs per property test. Pull requests use the fixed default so they stay
 * fast; the scheduled deep-tests workflow raises it through `PROPERTY_RUNS`.
 */
export const PROPERTY_RUNS = parsePropertyRuns(env.PROPERTY_RUNS);
