import { EnumType } from "@cliffy/command";

import { listCatalogServers } from "$meta/server-catalog";

export const catalogServerType = new EnumType(listCatalogServers());
