import { PLUGIN_NAME, resolveTargetPath } from './opencode-file.js'
import type { ValidationResult } from './validate.js'
export type BeanieAction = 'status' | 'help' | 'validate' | 'apply' | 'init' | 'unknown'
export type BeanieCommand = { action: BeanieAction; payload: string }

export function parseBeanie(raw: string): BeanieCommand {
  const trimmed = raw.trim()
  if (!trimmed) return { action: 'status', payload: '' }
  const first = trimmed.split(/\s+/, 1)[0] ?? ''
  const rest = trimmed.slice(first.length).trim()
  if (first === 'help' || first === '--help' || first === '-h') return { action: 'help', payload: '' }
  if (first === 'status') return { action: 'status', payload: rest }
  if (first === 'validate') return { action: 'validate', payload: rest }
  if (first === 'apply') return { action: 'apply', payload: rest }
  if (first === 'init') return { action: 'init', payload: rest }
  if (first.startsWith('{')) return { action: 'apply', payload: trimmed }
  return { action: 'unknown', payload: trimmed }
}

export function parseOptionsPayload(
  payload: string,
): { ok: true; options: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = payload.trim()
  if (trimmed === '') return { ok: true, options: {} }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return { ok: false, error: 'The config must be a JSON object of feature options.' }
    return { ok: true, options: parsed as Record<string, unknown> }
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export function renderValidation(result: ValidationResult): string {
  const lines = ['# opencode-beanie-plugin configuration validation', '']
  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push('No problems found.')
    return lines.join('\n')
  }
  if (result.errors.length > 0) {
    lines.push(
      'Errors:',
      ...result.errors.map(
        (report) => `${report.ok ? '✓' : '✗'} ${report.feature}${report.message ? ` — ${report.message}` : ''}`,
      ),
      '',
    )
  }
  if (result.warnings.length > 0) {
    lines.push('Warnings:', ...result.warnings.map((warning) => `! ${warning}`), '')
  }
  return lines.join('\n')
}

export function renderStatus(
  options: Record<string, unknown>,
  validation: ValidationResult,
  worktree: string,
  subagentDepth: number | undefined,
): string {
  const lines = ['# opencode-beanie-plugin configuration', '', `Target config file: ${resolveTargetPath(worktree)}`, '']
  lines.push(`Options: ${JSON.stringify(options, null, 2)}`, '')
  lines.push(renderValidation(validation))
  if (subagentDepth !== undefined) {
    lines.push(
      '',
      `Note: opencode \`subagent_depth\` is ${subagentDepth}; the orchestrator warns if \`orchestratorDepth\` exceeds it.`,
    )
  }
  lines.push('', 'Changes take effect after restarting opencode. Run /beanie init for a guided setup.')
  return lines.join('\n')
}

export function renderApply(
  options: Record<string, unknown>,
  result: { path: string; created: boolean },
  validation: ValidationResult,
): string {
  const lines = [
    '# opencode-beanie-plugin configuration applied',
    '',
    `Wrote options to ${result.path}${result.created ? ' (created)' : ''}.`,
    '',
    `Options: ${JSON.stringify(options, null, 2)}`,
    '',
    renderValidation(validation),
    '',
    'Restart opencode for the changes to take effect.',
  ]
  return lines.join('\n')
}

export function renderHelp(): string {
  return [
    `# /beanie — configure ${PLUGIN_NAME}`,
    '',
    'Usage:',
    '  /beanie                 Show current effective configuration and validation.',
    '  /beanie status          Same as above.',
    '  /beanie help            Show this help.',
    '  /beanie validate [json] Validate options (current config, or a JSON object).',
    '  /beanie apply <json>    Validate and write options to opencode.json.',
    '  /beanie init            Guided setup: the agent walks you through each feature,',
    '                          then writes the config for you.',
    '',
    'Feature names are camelCase (orchestrator, throttle, goal, providers, skillbox, toolbox, directives).',
    'The only required option is orchestrator.subagentModel, e.g. "anthropic/claude-sonnet-4-6".',
    '',
    'The agent can also do all of this via the configure_plugin tool.',
  ].join('\n')
}

export function renderInitDirective(): string {
  return [
    `# Plugin configuration wizard (${PLUGIN_NAME})`,
    '',
    'Walk the user through configuring the opencode-beanie-plugin, then write the config for them:',
    '',
    '1. Start with the required option: orchestrator.subagentModel (a provider/model id such as "anthropic/claude-sonnet-4-6").',
    '2. Briefly ask about each optional feature: throttle concurrency, goal budgets, providers, skillbox registry, toolbox MCP servers, and directives.',
    '3. Build the full options object (camelCase feature names) and call the configure_plugin tool with action "apply" and the config as JSON.',
    '   - If unsure of a shape, call configure_plugin with action "schema" first.',
    '   - If the plugin is already configured, start from action "status" and keep the user\'s existing settings.',
    '4. Tell the user the plugin options were written to opencode.json and that they must restart opencode for the changes to take effect.',
    '',
    'Required regardless: orchestrator.subagentModel. Validate before writing — configure_plugin refuses invalid configs.',
  ].join('\n')
}
