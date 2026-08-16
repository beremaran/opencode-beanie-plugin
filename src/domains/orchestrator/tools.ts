import {tool} from "@opencode-ai/plugin";
import {parseCoordinatorDecomposition, type Decomposition} from "./decomposition";
import type {OrchestratorConfig, OrchestratorJob, OrchestratorStatus} from "./model";
import type {Scheduler, SchedulerInput} from "./scheduler-types";

const terminal = (status: OrchestratorStatus) => ["completed", "failed", "cancelled", "timeout", "interrupted"].includes(status);

const json = (value: unknown) => JSON.stringify(value);

const bounded = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0, limit) : undefined;

export const orchestrationReadOutputLimit = (config: OrchestratorConfig) => Math.max(1024, config.limits.maxPromptChars + config.limits.maxResultChars);

const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

const text = (limit: number) => tool.schema.string().trim().min(1).max(limit);

const list = (limit: number, itemLimit: number) => tool.schema.array(tool.schema.string().trim().min(1).max(itemLimit)).max(limit);

const childSchema = (config: OrchestratorConfig) => tool.schema.object({
  title: text(config.limits.maxPromptChars), objective: text(config.limits.maxPromptChars),
  constraints: list(config.limits.maxNodes, config.limits.maxPromptChars), verification: list(config.limits.maxNodes, config.limits.maxPromptChars),
});

export type OrchestrationToolsOptions = {
  readonly scheduler: Scheduler;
  readonly config: OrchestratorConfig;
  /** Schedule notification work only; its completion is intentionally not awaited. */
  readonly onStarted?: (rootSessionID: string, jobID: string) => void | Promise<void>;
};

export type OrchestrationTools = ReturnType<typeof createOrchestrationTools>;

const error = (code: string, message: string) => json({ok: false, error: {code, message}});

const success = (value: Record<string, unknown>) => json({ok: true, ...value});

function counts(jobs: readonly OrchestratorJob[]) {
  const byRole: Record<string, number> = {}, byStatus: Record<string, number> = {}, byDepth: Record<string, number> = {};

  for (const job of jobs) {
    for (const node of job.graph.nodes) {
      byRole[node.role] = (byRole[node.role] ?? 0) + 1;
      byStatus[node.status] = (byStatus[node.status] ?? 0) + 1;
      byDepth[String(node.layer)] = (byDepth[String(node.layer)] ?? 0) + 1;
    }
  }
  return {byRole, byStatus, byDepth};
}

function summary(job: OrchestratorJob, config: OrchestratorConfig) {
  const limit = config.limits.maxPromptChars;

  return {id: bounded(job.id, limit), rootSessionID: bounded(job.rootSessionID, limit), title: bounded(job.title, limit), status: job.status, createdAt: bounded(job.createdAt, limit), updatedAt: bounded(job.updatedAt, limit), startedAt: bounded(job.startedAt, limit), completedAt: bounded(job.completedAt, limit), counts: counts([job])};
}

function leafSummaries(job: OrchestratorJob, config: OrchestratorConfig, budget: number) {
  const leaves = job.graph.nodes.filter((node) => node.role === "build").slice(0, config.limits.maxNodes);

  const perLeaf = Math.max(1, Math.floor(budget / Math.max(1, leaves.length)));

  return leaves.map((node) => ({title: bounded(node.title, perLeaf), status: node.status, verification: node.verification.slice(0, config.limits.maxNodes).map((item) => bounded(item, perLeaf)), result: bounded(node.result ?? node.error, Math.min(config.limits.maxResultChars, perLeaf))}));
}

function hasTruncatedReadContent(job: OrchestratorJob, config: OrchestratorConfig): boolean {
  const leaves = job.graph.nodes.filter((node) => node.role === "build");

  const perLeaf = Math.max(1, Math.floor(config.limits.maxPromptChars / Math.max(1, Math.min(leaves.length, config.limits.maxNodes))));

  const resultLimit = Math.floor(config.limits.maxResultChars / 2);

  const errorLimit = config.limits.maxResultChars - resultLimit;

  return (job.result?.length ?? 0) > resultLimit || (job.error?.length ?? 0) > errorLimit || leaves.length > config.limits.maxNodes || leaves.some((node) => node.title.length > perLeaf || node.verification.length > config.limits.maxNodes || node.verification.some((item) => item.length > perLeaf) || (node.result ?? node.error ?? "").length > Math.min(config.limits.maxResultChars, perLeaf));
}

function boundedRead(job: OrchestratorJob, config: OrchestratorConfig) {
  const limit = orchestrationReadOutputLimit(config);

  const base = readBase(job, config);

  const truncated = hasTruncatedReadContent(job, config);

  const output = trimReadOutput(base, truncated, limit);

  return output ?? json(success({job: {id: bounded(job.id, config.limits.maxPromptChars), status: job.status, truncated: true}}));
}

const readBase = (job: OrchestratorJob, config: OrchestratorConfig) => {
  const resultBudget = Math.floor(config.limits.maxResultChars / 2), errorBudget = config.limits.maxResultChars - resultBudget;

  return {id: bounded(job.id, config.limits.maxPromptChars), status: job.status, timestamps: {createdAt: bounded(job.createdAt, config.limits.maxPromptChars), updatedAt: bounded(job.updatedAt, config.limits.maxPromptChars), startedAt: bounded(job.startedAt, config.limits.maxPromptChars), completedAt: bounded(job.completedAt, config.limits.maxPromptChars)}, result: bounded(job.result, resultBudget), error: bounded(job.error, errorBudget), leaves: leafSummaries(job, config, config.limits.maxPromptChars), counts: counts([job])};
};

const trimReadOutput = (base: ReturnType<typeof readBase>, initialTruncated: boolean, limit: number) => {
  let leaves = base.leaves, truncated = initialTruncated, output = json(success({job: {...base, leaves, truncated}}));

  while (bytes(output) > limit && leaves.length > 0) {
    leaves = leaves.slice(0, -1);
    truncated = true;
    output = json(success({job: {...base, leaves, truncated}}));
  }
  return bytes(output) <= limit ? output : undefined;
};

function input(args: StartArgs, rootSessionID: string): SchedulerInput {
  return {rootSessionID, title: args.title, objective: args.objective, constraints: args.constraints, verification: args.verification, manager: args.manager};
}

function validStart(args: StartArgs, config: OrchestratorConfig): boolean {
  const validList = (value: unknown) => Array.isArray(value) && value.length <= config.limits.maxNodes && value.every((item) => typeof item === "string" && item.trim() !== "" && item.length <= config.limits.maxPromptChars);

  const aggregate = (value: unknown) => Array.isArray(value) ? value.reduce<number>((total, item) => total + (typeof item === "string" ? item.length : 0), 0) : 0;

  return typeof args.title === "string" && args.title.trim() !== "" && args.title.length <= config.limits.maxPromptChars && typeof args.objective === "string" && args.objective.trim() !== "" && args.objective.length <= config.limits.maxPromptChars && validList(args.constraints) && validList(args.verification) && args.title.length + args.objective.length + aggregate(args.constraints) + aggregate(args.verification) <= config.limits.maxPromptChars;
}

type StartArgs = {title: string; objective: string; constraints: string[]; verification: string[]; manager: Decomposition};
type Context = {readonly sessionID: string};

function startTool(options: OrchestrationToolsOptions) {
  const {config} = options;

  return tool({description: "Start one asynchronous orchestration job. The manager decomposition is sequenced through configured roles; starting persists a job and has side effects. The optional notification callback only schedules completion work and is not awaited. Do not poll: use the eventual completion notification or orchestration_read when needed.", args: {title: text(config.limits.maxPromptChars), objective: text(config.limits.maxPromptChars), constraints: list(config.limits.maxNodes, config.limits.maxPromptChars), verification: list(config.limits.maxNodes, config.limits.maxPromptChars), manager: tool.schema.object({children: tool.schema.array(childSchema(config)).min(1).max(config.limits.maxNodes)})}, execute: (args, context) => startExecute(args, context, options)});
}

async function startExecute(args: StartArgs, context: Context, options: OrchestrationToolsOptions) {
  const {config} = options;

  if (!validStart(args, config)) {return error("invalid_input", "title, objective, constraints, and verification are invalid.");}

  const parsed = parseCoordinatorDecomposition(JSON.stringify(args.manager), {fanOut: config.manager.fanOut, fanOutMode: config.fanOutMode, maxFieldChars: config.limits.maxPromptChars, maxArrayEntries: config.limits.maxNodes, maxAggregateChars: config.limits.maxPromptChars});

  if (!parsed.ok) {return error("invalid_input", parsed.errors.join(" "));}
  try {return await persistStart(args, context, parsed.value, options);} catch {return error("start_failed", "Unable to start orchestration job.");}
}

async function persistStart(args: StartArgs, context: Context, manager: Decomposition, options: OrchestrationToolsOptions) {
  const metadata = await options.scheduler.start(input({...args, manager}, context.sessionID));

  if (options.onStarted) {void Promise.resolve().then(() => options.onStarted?.(context.sessionID, metadata.id)).catch(() => undefined);}

  return success({job: {id: bounded(metadata.id, options.config.limits.maxPromptChars), rootSessionID: bounded(metadata.rootSessionID, options.config.limits.maxPromptChars), title: bounded(metadata.title, options.config.limits.maxPromptChars), status: metadata.status, createdAt: bounded(metadata.createdAt, options.config.limits.maxPromptChars)}});
}

function statusTool(options: OrchestrationToolsOptions) {
  const {config, scheduler} = options;

  return tool({
    description: "Return bounded orchestration summaries for this session. Listing has read side effects only and is asynchronous; do not poll, use completion notification or orchestration_read when needed.",
    args: {},
    async execute(_args, context: Context) {
      try { const jobs = await scheduler.list(context.sessionID);

  const ordered = [...jobs].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));

  return success({jobs: ordered.slice(0, config.limits.maxNodes).map((job) => summary(job, config)), counts: counts(jobs)}); }
      catch { return error("status_failed", "Unable to read orchestration status."); }
    },
  });
}

function readTool(options: OrchestrationToolsOptions) {
  const {config, scheduler} = options;

  return tool({
    description: "Read a bounded terminal or partial orchestration result for this session. This is an asynchronous read with no execution side effect; do not poll, use completion notification when available.",
    args: {jobID: text(config.limits.maxPromptChars)},
    async execute(args, context: Context) {
      try {
        const job = await scheduler.read(context.sessionID, args.jobID);

        if (!job) { return error("not_found", "Orchestration job not found."); }
        return boundedRead(job, config);
      } catch { return error("read_failed", "Unable to read orchestration job."); }
    },
  });
}

function cancelTool(options: OrchestrationToolsOptions) {
  const {scheduler, config} = options;

  return tool({
    description: "Cancel an orchestration job in this session. Cancellation is asynchronous and has side effects; terminal jobs are idempotent. Do not poll, use completion notification or orchestration_read.",
    args: {jobID: text(config.limits.maxPromptChars)},
    async execute(args, context: Context) {
      try {
        const job = await scheduler.read(context.sessionID, args.jobID);

        if (!job) { return error("not_found", "Orchestration job not found."); }
        if (!terminal(job.status)) { await scheduler.cancel(context.sessionID, args.jobID); }
        return success({job: {id: bounded(job.id, config.limits.maxPromptChars), status: terminal(job.status) ? job.status : "cancelled"}});
      } catch { return error("cancel_failed", "Unable to cancel orchestration job."); }
    },
  });
}

export function createOrchestrationTools(options: OrchestrationToolsOptions) {return {orchestration_start: startTool(options), orchestration_status: statusTool(options), orchestration_read: readTool(options), orchestration_cancel: cancelTool(options)};}
