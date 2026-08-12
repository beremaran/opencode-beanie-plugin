import { type Config, type Plugin, tool } from '@opencode-ai/plugin'
import {
  parseBeanie,
  parseOptionsPayload,
  renderApply,
  renderHelp,
  renderInitDirective,
  renderStatus,
  renderValidation,
} from './commands.js'
import { applyOptionsToFile, isPluginEntryName, PLUGIN_NAME, resolveTargetPath } from './opencode-file.js'
import { PLUGIN_OPTIONS_SCHEMA } from './schema.js'
import { validateFullOptions } from './validate.js'

const SERVICE = 'opencode-beanie-plugin'
function replaceTextPart(parts: Array<{ type: string; text?: string }>, text: string): void {
  const part = parts.find((candidate) => candidate.type === 'text')
  if (part) {
    part.text = text
  } else {
    parts.push({ type: 'text', text })
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface BeanieState {
  options: Record<string, unknown>
  hasEntry: boolean
  subagentDepth?: number
}
function pluginEntryOf(config: Config): { options: Record<string, unknown>; hasEntry: boolean } {
  for (const entry of config.plugin ?? []) {
    if (isPluginEntryName(entry)) {
      return { options: {}, hasEntry: true }
    }
    if (Array.isArray(entry) && isPluginEntryName(entry[0])) {
      return { options: isRecord(entry[1]) ? entry[1] : {}, hasEntry: true }
    }
  }
  return { options: {}, hasEntry: false }
}
function parseConfigArgument(
  config: string | undefined,
): { ok: true; options: Record<string, unknown> } | { ok: false; error: string } {
  return parseOptionsPayload(config ?? '')
}

const Configurator: Plugin = async ({ client, worktree }, _options = {}) => {
  const state: BeanieState = { options: {}, hasEntry: false }
  const warn = async (message: string): Promise<void> => {
    await client.app.log({ body: { service: SERVICE, level: 'warn', message } }).catch(() => undefined)
  }
  return {
    config: async (cfg) => {
      cfg.command ??= {}
      cfg.command.beanie ??= {
        description: 'Inspect, validate, or write the opencode-beanie-plugin configuration',
        template: '<beanie-command>$ARGUMENTS</beanie-command>',
      }
      const found = pluginEntryOf(cfg)
      state.options = found.options
      state.hasEntry = found.hasEntry
      const subagentDepth = (cfg as Config & { subagent_depth?: unknown }).subagent_depth
      state.subagentDepth = typeof subagentDepth === 'number' ? subagentDepth : undefined
      const validation = validateFullOptions(state.options)
      if (!state.hasEntry) {
        await warn(
          'The configurator could not find the plugin entry in the loaded config; /beanie and configure_plugin will operate on empty options.',
        )
      }
      for (const error of validation.errors) {
        await warn(`Existing configuration problem in "${error.feature}": ${error.message ?? ''}`)
      }
    },
    'command.execute.before': async (command, output) => {
      if (command.command !== 'beanie') {
        return
      }
      const parsed = parseBeanie(command.arguments)
      if (parsed.action === 'help') {
        replaceTextPart(output.parts, renderHelp())
        return
      }
      if (parsed.action === 'init') {
        replaceTextPart(output.parts, renderInitDirective())
        return
      }
      if (parsed.action === 'status') {
        replaceTextPart(
          output.parts,
          renderStatus(state.options, validateFullOptions(state.options), worktree, state.subagentDepth),
        )
        return
      }
      if (parsed.action === 'validate') {
        const decoded = parseOptionsPayload(parsed.payload)
        if (!decoded.ok) {
          replaceTextPart(output.parts, decoded.error)
          return
        }
        const result = validateFullOptions(parsed.payload.trim() === '' ? state.options : decoded.options)
        replaceTextPart(output.parts, renderValidation(result))
        return
      }
      if (parsed.action === 'apply') {
        const decoded = parseOptionsPayload(parsed.payload)
        if (!decoded.ok) {
          replaceTextPart(output.parts, decoded.error)
          return
        }
        const candidate = decoded.options
        const validation = validateFullOptions(candidate)
        if (validation.errors.length > 0) {
          replaceTextPart(output.parts, `Refusing to write invalid configuration.\n\n${renderValidation(validation)}`)
          return
        }
        try {
          const result = applyOptionsToFile(worktree, 'auto', candidate)
          state.options = candidate
          state.hasEntry = true
          replaceTextPart(output.parts, renderApply(candidate, result, validation))
        } catch (error) {
          replaceTextPart(
            output.parts,
            `Failed to write configuration: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        return
      }
      replaceTextPart(output.parts, `Unknown /beanie subcommand.\n\n${renderHelp()}`)
    },
    tool: {
      configure_plugin: tool({
        description:
          'Inspect, validate, or write the opencode-beanie-plugin configuration. Options are nested per camelCase feature name (orchestrator, throttle, goal, providers, skillbox, toolbox, directives); orchestrator.subagentModel is required. Changes take effect after opencode restarts.',
        args: {
          action: tool.schema
            .enum(['status', 'schema', 'validate', 'apply'])
            .describe(
              'status: current effective options; schema: full JSON schema; validate: check options for errors; apply: validate then write to opencode.json.',
            ),
          config: tool.schema
            .string()
            .optional()
            .describe(
              'Full plugin options as a JSON object string. Required for validate/apply; omit to use the currently loaded options.',
            ),
          scope: tool.schema
            .enum(['auto', 'project', 'global'])
            .optional()
            .default('auto')
            .describe(
              'auto: update the config file that already registers the plugin, else the project config; project: <worktree>/opencode.json; global: ~/.config/opencode/opencode.json.',
            ),
        },
        async execute(args, _context) {
          if (args.action === 'schema') {
            return JSON.stringify(PLUGIN_OPTIONS_SCHEMA, null, 2)
          }
          if (args.action === 'status') {
            return JSON.stringify(
              {
                plugin: PLUGIN_NAME,
                registered: state.hasEntry,
                targetFile: resolveTargetPath(worktree, args.scope),
                options: state.options,
                subagentDepth: state.subagentDepth,
                validation: validateFullOptions(state.options),
              },
              null,
              2,
            )
          }
          const decoded =
            args.config === undefined ? { ok: true as const, options: state.options } : parseConfigArgument(args.config)
          if (!decoded.ok) {
            return JSON.stringify({ error: decoded.error }, null, 2)
          }
          const candidate = decoded.options
          const validation = validateFullOptions(candidate)
          if (args.action === 'validate') {
            return JSON.stringify(validation, null, 2)
          }
          if (validation.errors.length > 0) {
            return JSON.stringify(
              { applied: false, error: 'Refusing to write invalid configuration.', validation },
              null,
              2,
            )
          }
          try {
            const result = applyOptionsToFile(worktree, args.scope, candidate)
            state.options = candidate
            state.hasEntry = true
            return JSON.stringify({ applied: true, ...result, options: candidate, validation }, null, 2)
          } catch (error) {
            return JSON.stringify(
              { applied: false, error: error instanceof Error ? error.message : String(error) },
              null,
              2,
            )
          }
        },
      }),
    },
  }
}

export default Configurator
export type { ConfigScope } from './opencode-file.js'
export { applyOptionsToFile, resolveTargetPath, upsertPluginEntry } from './opencode-file.js'
export { PLUGIN_OPTIONS_SCHEMA } from './schema.js'
export type { FeatureReport, ValidationResult } from './validate.js'
export { validateFullOptions } from './validate.js'
