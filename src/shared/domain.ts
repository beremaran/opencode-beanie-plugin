import type { Hooks, PluginInput, PluginOptions } from "@opencode-ai/plugin";

export type Domain = (
  input: PluginInput,
  options?: PluginOptions,
) => Promise<Hooks>
