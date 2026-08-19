import type {MechanismName} from "./types";

export const SERVICE = "opencode-beanie-plugin";

export const MECHANISMS: readonly MechanismName[] = [
  "goal",
  "orchestrator",
  "throttle",
  "skillbox",
  "toolbox",
  "providers",
  "configurator",
];

export const DEFAULT_TOOL_GUIDANCE: Record<string, string> = {
  goal_set:
    "Use to create or replace this session's durable goal before starting multi-step work.",
  goal_status:
    "Use to check the active goal, its progress, blockers, and verification state for this session.",
  goal_update:
    "Use to update goal progress, record blockers, capture verification evidence, or mark the goal completed.",
  list_skills:
    "Use to browse available agent skills before hand-writing common, reusable logic.",
  search_skills:
    "Use to find a matching agent skill before implementing a well-known pattern; prefer loading a found skill over writing from scratch.",
  load_skill:
    "Use to read the full SKILL.md and optional supporting files for a skill you intend to follow.",
  list_tools:
    "Use to search and inspect aggregated tools across configured MCP servers.",
  get_tool_schema:
    "Use to retrieve the parameter schema for an upstream MCP tool before invoking it.",
  invoke_tool:
    "Use to execute a tool on a configured upstream MCP server.",
  configure_plugin:
    "Use to inspect, validate, or write the plugin's own configuration in opencode.json (status/schema/validate/apply).",
  orchestrate_start:
    "Use to launch a multi-agent decomposition graph for complex, multi-phase tasks.",
  orchestrate_status:
    "Use to monitor active orchestrator jobs and check leaf execution status.",
  orchestrate_read:
    "Use to read bounded execution output and aggregate results from completed orchestrator jobs.",
  orchestrate_cancel:
    "Use to cancel an active orchestrator job.",
};

export const DEFAULT_MECHANISM_NOTES: Record<MechanismName, string> = {
  goal:
    "- Persistent goals: track multi-turn objectives with durable goal tools (or /goal); status, progress, blockers, and verification evidence persist across turns.",
  orchestrator:
    "- Orchestration: decompose requests into small, independently verifiable subtasks and delegate each to child subagents; never do hands-on work you can delegate.",
  throttle:
    "- Concurrency: `task` invocations are throttled (default maxParallel 2) and may queue; keep delegation briefs small and self-contained, and fan out independent subtasks.",
  skillbox:
    "- Skill discovery: before implementing a common pattern, run search_skills then load_skill to reuse an existing agent skill.",
  toolbox:
    "- Tool aggregation: tools from configured MCP servers are aggregated and available alongside built-ins; prefer them when they match the task.",
  providers:
    "- Providers: manage OpenAI-compatible providers with /add-provider and /providers; the plugin auto-configures their models.",
  configurator:
    "- Configuration: run /beanie status, /beanie validate, or /beanie apply to inspect or write the plugin's options, or /beanie init for a guided setup; the configure_plugin tool does the same programmatically.",
};
