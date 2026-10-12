// oxlint-disable prefer-destructuring -- not here because of bundler funnies.

import packageJson from "../package.json" with { type: "json" };

export const description = packageJson.description;
export const name = packageJson.name;
export const version = packageJson.version;

/**
 * Configuration name: c12 looks for `lsp-mux.config.*` and
 * `.config/lsp-mux.*`.
 */
export const CONFIGURATION_NAME = "lsp-mux";
/** Names a user configuration file, overriding the XDG location. */
export const USER_CONFIGURATION_VARIABLE = "LSP_MUX_CONFIG";
/** Set to `1` to run a project's `lsp-mux.config.ts`, which is code. */
export const TRUST_PROJECT_CONFIGS_VARIABLE = "LSP_MUX_TRUST_PROJECT_CONFIGS";

export const METHOD_NOT_FOUND = -32_601;
export const INTERNAL_ERROR = -32_603;

/** Key the mux stores its routing tag under in call hierarchy items. */
export const MUX_DATA_KEY = "lspMux";

export const DEFAULT_MAX_RESTARTS = 3;
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3000;

export const CONTENT_LENGTH_REGEXP = /^content-length:\s*(?<length>\d+)\s*$/imu;
export const HEADER_SEPARATOR = Buffer.from("\r\n\r\n");
export const LINE_BREAK_REGEXP = /\r\n|\r|\n/gu;
