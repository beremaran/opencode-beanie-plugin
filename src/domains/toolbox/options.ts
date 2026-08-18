import type { PluginOptions } from "@opencode-ai/plugin";

export interface ResolvedToolboxOptions {
  config?: unknown;
  servers?: unknown;
}

function extractRaw(raw: PluginOptions | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  const candidate = raw.toolbox;

  if (typeof candidate === "object" && candidate !== null) {
    return candidate as Record<string, unknown>;
  }
  return raw;
}

export function resolveToolboxOptions(raw?: PluginOptions): ResolvedToolboxOptions {
  const source = extractRaw(raw);

  return {
    config: source.config,
    servers: source.servers,
  };
}
