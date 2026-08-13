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

    for (const [featureName, feature] of Object.entries(features)) {
    let partial: Hooks
    try {
      partial = await feature(input, options[featureName] ?? {}) as Record<string, unknown>
    } catch (error) {
      const message = error instanceof Error && 'cause' in error ? error.cause.message : String(error)
      throw new Error(`[opencode-beanie-plugin] feature "${featureName}" failed to initialize: ${message}`, { cause: error })
    }

    for (const key of Object.keys(partial)) {
      const value = (partial as unknown as Record<string, unknown>)[key]
      if (value === undefined) {
        continue
      }

      if (key === 'tool') {
        const featureTools = partial.tool
        if (!featureTools) {
          continue
        }
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

      if (typeof value === 'function') {
        const featureHooks = hooks.get(key) ?? []
        featureHooks.push(value as unknown as ComposableHook)
        hooks.set(key, featureHooks)
      } else {
        output[key] = value
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
