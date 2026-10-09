#!/usr/bin/env node

import { argv } from "node:process";

import { runAsync } from "./index.ts";

await runAsync(argv.slice(2));
