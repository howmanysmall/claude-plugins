import { sharedConfiguration } from "@howmanysmall/project-configurations/vitest";
import { vitiateConfiguration } from "@howmanysmall/project-configurations/vitest/vitiate";
import { mergeConfig } from "vitest/config";

const configuration = mergeConfig(sharedConfiguration, vitiateConfiguration);

export default configuration;
