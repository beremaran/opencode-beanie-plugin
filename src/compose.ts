import type { Hooks, Plugin, PluginInput, PluginOptions } from '@opencode-ai/plugin'

type ComposableHook = (...args: never[]) => Promise<void>
type ToolRegistry = NonNullable<Hooks['tool']>
type HookRegistry = Map<string, ComposableHook[]>

interface ComposeContext {
  tools: ToolRegistry
  toolOwners: Map<string, string>
  hooks: HookRegistry
  output: Record<string, unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const initErrorMessage = (error: unknown): string => {
  if (error instanceof Error && 'cause' in error) {
    const { cause } = error
    if (cause instanceof Error) {
      return cause.message
    }
    return String(cause)
  }
  return String(error)
}

const initFeature = async (
  feature: Plugin,
  input: PluginInput,
  featureOptions: unknown,
  featureName: string,
): Promise<Record<string, unknown>> => {
  try {
    return (await feature(input, featureOptions as PluginOptions)) as Record<string, unknown>
  } catch (error) {
    const message = initErrorMessage(error)
    throw new Error(`[opencode-beanie-plugin] feature "${featureName}" failed to initialize: ${message}`, {
      cause: error,
    })
  }
}

const mergeTools = (featureTools: unknown, featureName: string, context: ComposeContext): void => {
  if (!isRecord(featureTools)) {
    return
  }
  for (const toolName of Object.keys(featureTools)) {
    const owner = context.toolOwners.get(toolName)
    if (owner !== undefined) {
      throw new Error(
        `[opencode-beanie-plugin] tool "${toolName}" is defined by features "${owner}" and "${featureName}"`,
      )
    }
    context.tools[toolName] = featureTools[toolName] as ToolRegistry[string]
    context.toolOwners.set(toolName, featureName)
  }
}

const recordHookValue = (key: string, value: unknown, featureName: string, context: ComposeContext): void => {
  if (key === 'tool') {
    mergeTools(value, featureName, context)
    return
  }
  if (typeof value === 'function') {
    const featureHooks = context.hooks.get(key) ?? []
    featureHooks.push(value as unknown as ComposableHook)
    context.hooks.set(key, featureHooks)
    return
  }
  context.output[key] = value
}

export async function composePlugins(
  input: PluginInput,
  features: Record<string, Plugin>,
  options: Record<string, unknown>,
): Promise<Hooks> {
  const output: Record<string, unknown> = {}
  const tools: ToolRegistry = {}
  const toolOwners = new Map<string, string>()
  const hooks = new Map<string, ComposableHook[]>()
  const context: ComposeContext = { tools, toolOwners, hooks, output }

  for (const [featureName, feature] of Object.entries(features)) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential init keeps hook chain order and first-failure precedence; parallelizing would change behavior.
    const partial = await initFeature(feature, input, options[featureName] ?? {}, featureName)

    for (const key of Object.keys(partial)) {
      const value = partial[key]
      if (value !== undefined) {
        recordHookValue(key, value, featureName, context)
      }
    }
  }

  output.tool = tools

  for (const [key, featureHooks] of hooks) {
    output[key] = async (...args: unknown[]): Promise<void> => {
      const promises = featureHooks.map((hook) => Reflect.apply(hook, undefined, args))
      await Promise.all(promises)
    }
  }

  return output as unknown as Hooks
}
