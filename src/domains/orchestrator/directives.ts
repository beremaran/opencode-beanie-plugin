import type {Config} from "@opencode-ai/plugin";
import type {OrchestratorConfig} from "./model";

const DENIED_TOOLS = ["edit", "bash", "task"] as const;

const COMMAND_TEMPLATE = "Use the Manager agent to orchestrate this implementation objective: $ARGUMENTS";

type AgentRecord = Record<string, unknown>;
type ConfigRecord = {agent?: Record<string, AgentRecord>; command?: Record<string, AgentRecord>};

function record(value: unknown): AgentRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? {...value as AgentRecord} : {};
}

function deniedTools(value: unknown): Record<string, boolean> {
  const tools = record(value);

  for (const tool of DENIED_TOOLS) {
    tools[tool] = false;
  }

  return tools as Record<string, boolean>;
}

function deniedPermission(value: unknown): AgentRecord {
  const permission = record(value);
  permission.edit = "deny";
  permission.bash = "deny";
  permission.task = "deny";
  return permission;
}

function coordinatorPermission(): AgentRecord {
  return {"*": "deny"};
}

function managerPrompt(config: OrchestratorConfig): string {
  const layers = config.coordinators.slice(0, 32).map((item) => item.fanOut).join(", ") || "none";

  return `You are the Manager. For every implementation objective, construct the configured first decomposition with ${String(config.manager.fanOut)} children and MUST call orchestration_start; do not implement directly, use native task, or edit files. Cardinality mode is ${config.fanOutMode}: manager fan-out ${String(config.manager.fanOut)}, coordinator layer fan-outs [${layers}]. exact requires the configured cardinality; atMost permits no more than it.`;
}

function coordinatorPrompt(): string {
  return "You are a coordinator. Produce data-only decomposition or aggregation. Do no direct work, edit files, call tools, or delegate; return only the requested structured result.";
}

function configureAgent(existing: unknown, model: string, mode: "primary" | "subagent", prompt: string): AgentRecord {
  const agent = record(existing);
  agent.model = model;
  agent.mode = mode;
  agent.hidden = mode === "subagent";
  agent.prompt = prompt;
  agent.tools = deniedTools(agent.tools);
  agent.permission = deniedPermission(agent.permission);
  return agent;
}

function configureCoordinator(existing: unknown, model: string): AgentRecord {
  const agent = configureAgent(existing, model, "subagent", coordinatorPrompt());
  agent.tools = {"*": false};
  agent.permission = coordinatorPermission();
  return agent;
}

export function configureOrchestratorAgents(config: Config, orchestrator: OrchestratorConfig): void {
  if (!orchestrator.enabled) {
    return;
  }

  const target = config as unknown as ConfigRecord;
  target.agent = configureAgents(target.agent, orchestrator);
  target.command = configureCommand(target.command, orchestrator);
}

function configureAgents(existing: unknown, orchestrator: OrchestratorConfig) {
  const agents = {...record(existing)} as Record<string, AgentRecord>;
  agents[orchestrator.manager.agent] = configureAgent(agents[orchestrator.manager.agent], orchestrator.manager.model, "primary", managerPrompt(orchestrator));
  const registered = new Set<string>();

  for (const coordinator of orchestrator.coordinators) {
    if (registered.has(coordinator.agent)) {continue;}
    registered.add(coordinator.agent);
    agents[coordinator.agent] = configureCoordinator(agents[coordinator.agent], coordinator.model);
  }
  return agents;
}

function configureCommand(existing: unknown, orchestrator: OrchestratorConfig) {
  const commands = {...record(existing)} as Record<string, AgentRecord>;

  if (!commands.orchestrate) {
    commands.orchestrate = {description: "Route an implementation objective to the orchestration Manager.", template: COMMAND_TEMPLATE, agent: orchestrator.manager.agent};
  }
  return commands;
}
