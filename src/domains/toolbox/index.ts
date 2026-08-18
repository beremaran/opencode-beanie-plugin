import type { Domain } from "../../shared/domain";
import { loadConfig } from "./config";
import { ConnectionManager } from "./connection";
import { createLogger } from "./logger";
import { resolveToolboxOptions } from "./options";
import { UpstreamRegistry } from "./registry-upstream";
import { ToolRegistry } from "./registry-tools";
import { createTools } from "./tools";

export * from "./types";
export { loadConfig, normalizeConfig } from "./config";
export { ConnectionManager } from "./connection";
export { UpstreamRegistry } from "./registry-upstream";
export { ToolRegistry, qualifiedName, splitQualified } from "./registry-tools";

export const ToolboxDomain: Domain = (input, rawOptions) => {
  const logger = createLogger(input.client);

  const options = resolveToolboxOptions(rawOptions);

  const config = loadConfig({ config: options.config, servers: options.servers, logger });

  if (!config) {
    return Promise.resolve({ tool: {} });
  }

  const upstream = new UpstreamRegistry(config);

  const registry = new ToolRegistry(upstream);

  const connection = new ConnectionManager(config, registry, logger);

  return Promise.resolve({
    tool: createTools(registry, connection, config, logger),
    dispose: async () => {
      await connection.closeAll();
      connection.forceKillStale();
    },
  });
};

export default ToolboxDomain;
