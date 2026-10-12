import { EnumType } from "@cliffy/command";

import { ConfigurationFormat } from "$utilities/configuration-file-utilities";

export const configurationFormatType = new EnumType([
	ConfigurationFormat.Jsonc,
	ConfigurationFormat.Json,
	ConfigurationFormat.TypeScript,
]);
