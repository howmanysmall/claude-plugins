import { EnumType } from "@cliffy/command";

export const enum ConfigurationLocation {
	Global = "global",
	Local = "local",
}

export const configurationLocationType = new EnumType([ConfigurationLocation.Global, ConfigurationLocation.Local]);
