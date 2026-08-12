import type { Hooks, Plugin, PluginInput } from '@opencode-ai/plugin'

type ComposableHook = (...args: never[]) => Promise<void>

export async function composePlugins(
  input: PluginInput,
  features: Record<string, Plugin>,
  options: Record<string, unknown>,
): Promise<Hooks> {
  const output: Record<string, unknown> = {}
  const tools: NonNullable<Hooks['tool']> = {}
  const toolOwners = new Map<string, string>()
  const hooks = new Map<string, ComposableHook[]>()
  let hasTools = false

  for (const [featureName, feature] of Object.entries(features)) {
    let partial: Hooks
    try {
      partial = await feature(input, (options?.[featureName] ?? {}) as Record<string, unknown>)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`[opencode-beanie-plugin] feature "${featureName}" failed to initialize: ${message}`)
    }

    for (const key of Object.keys(partial)) {
      const value = (partial as unknown as Record<string, unknown>)[key]
      if (value === undefined) {
        continue
      }

      if (key === 'tool') {
        const featureTools = partial.tool
        if (featureTools) {
          hasTools = true
          for (const toolName of Object.keys(featureTools)) {
            const owner = toolOwners.get(toolName)
            if (owner !== undefined) {
              throw new Error(
                `[opencode-beanie-plugin] tool "${toolName}" is defined by features "${owner}" and "${featureName}"`,
              )
            }
            tools[toolName] = featureTools[toolName]
            toolOwners.set(toolName, featureName)
          }
        }
        continue
      }

      if (typeof value === 'function') {
        const featureHooks = hooks.get(key) ?? []
        featureHooks.push(value as unknown as ComposableHook)
        hooks.set(key, featureHooks)
        continue
      }

      output[key] = value
    }
  }

  if (hasTools) {
    output.tool = tools
  }

  for (const [key, featureHooks] of hooks) {
    output[key] = async (...args: unknown[]) => {
      for (const hook of featureHooks) {
        await Reflect.apply(hook, undefined, args)
      }
    }
  }

  return output as unknown as Hooks
}
