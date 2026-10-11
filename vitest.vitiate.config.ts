import { sharedConfiguration } from "@howmanysmall/vite-configuration";
import { vitiateConfiguration } from "@howmanysmall/vite-configuration/vitiate";
import { mergeConfig } from "vitest/config";

const configuration = mergeConfig(sharedConfiguration, vitiateConfiguration);

export default configuration;
