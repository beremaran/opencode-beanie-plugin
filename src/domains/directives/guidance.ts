import {DEFAULT_MECHANISM_NOTES, DEFAULT_TOOL_GUIDANCE, MECHANISMS, SERVICE} from "./defaults";
import type {MechanismName, ResolvedDirectivesOptions} from "./types";

export function mechanismNotes(options: ResolvedDirectivesOptions): string[] {
  const keys: MechanismName[] =
    options.mechanisms.length > 0
      ? (options.mechanisms as MechanismName[])
      : [...MECHANISMS];

  return keys.map((key) => DEFAULT_MECHANISM_NOTES[key]);
}

export function systemDirective(options: ResolvedDirectivesOptions): string {
  const notes = mechanismNotes(options).join("\n");

  return `# Plugin capabilities (${SERVICE})
This plugin adds tools and background mechanisms. Prefer them over manual work when the mechanism applies.

## Mechanisms
${notes}

## Tool usage
- The plugin appends "when to use" guidance to the descriptions of its tools; read it before calling them.
- Track multi-turn objectives with durable goal tools and consult goal_status/goal_update as you progress.
- Delegate decomposition-ready work to a subagent with the \`task\` tool instead of doing it inline.
- Before writing boilerplate, run search_skills then load_skill to reuse an existing agent skill.`;
}

export function toolGuidance(options: ResolvedDirectivesOptions, toolId: string): string | undefined {
  const parts: string[] = [];

  if (options.defaults && DEFAULT_TOOL_GUIDANCE[toolId]) {
    parts.push(DEFAULT_TOOL_GUIDANCE[toolId]);
  }

  if (options.tools[toolId]) {
    parts.push(options.tools[toolId]);
  }

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return undefined;
}
