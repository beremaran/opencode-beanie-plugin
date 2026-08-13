export const PLUGIN_ID = 'opencode-beanie-plugin'
export const DEFAULTS = { orchestratorAgent: 'Manager', blockedTools: ['edit', 'bash'] } as const
export const BUILTIN_SUBAGENTS = ['general', 'explore']
export const KNOWN_BUILTINS = ['build', 'plan', 'compaction', 'title', 'summary']
export const DIRECTIVE_TOOLS = ['task', 'todowrite', 'question', 'read', 'glob', 'grep', 'webfetch', 'websearch']
export const BLOCKED_TOOL_PATTERN = /^[a-z0-9_-]+$/
export const MODEL_PATTERN = /^[^\s/]+\/[^\s/]+$/
export const LEVEL1_DIRECTIVE_MARKER = '# Orchestrator Mode (enforced by opencode-beanie-plugin)'
