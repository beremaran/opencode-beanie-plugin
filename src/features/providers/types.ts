export interface ModelOverride {
  id?: string
  name?: string
  limit?: { context?: number; input?: number; output?: number }
  temperature?: boolean
  reasoning?: boolean
  attachment?: boolean
  // biome-ignore lint/style/useNamingConvention: tool_call is the provider-config field name used in opencode.json (snake_case).
  tool_call?: boolean
  modalities?: { input?: string[]; output?: string[] }
  options?: Record<string, unknown>
  headers?: Record<string, string>
}

export type ProviderKind = 'auto' | 'openai' | 'ollama' | 'unsloth' | 'lmstudio'

export interface ProviderSource {
  id: string
  name?: string
  // biome-ignore lint/style/useNamingConvention: baseURL is the provider-config field name used in opencode.json.
  baseURL: string
  apiKey?: string
  headers?: Record<string, string>
  npm?: string
  kind?: ProviderKind
  // biome-ignore lint/style/useNamingConvention: modelsURL is the provider-config field name used in opencode.json.
  modelsURL?: string
  fetchModels?: boolean
  staticModels?: Record<string, ModelOverride>
  overrides?: Record<string, ModelOverride>
  include?: string[]
  exclude?: string[]
  defaultLimit?: { context?: number; output?: number }
  env?: boolean
  timeout?: number
}

export interface PluginOptions {
  providers?: ProviderSource[]
  model?: string
  smallModel?: string
  timeout?: number
  npm?: string
  env?: boolean
}

export type ResolvedProvider = ProviderSource & { fetchModels: boolean; timeoutMs: number }
export interface DiscoveredModel {
  id: string
  name?: string
  limit?: { context?: number; output?: number }
  attachment?: boolean
  vendor?: Record<string, unknown>
}
export type Logger = (level: 'info' | 'warn' | 'error' | 'debug', message: string, extra?: unknown) => void
