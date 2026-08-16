import {deriveChildResultSummaries} from "./graph";
import {renderBuildExecution, renderCoordinatorAggregation, renderCoordinatorDecomposition} from "./prompts";
import {buildToolPolicy, coordinatorToolPolicy, type SessionRunResult} from "./session-runner";
import type {OrchestratorNode, OrchestratorStatus} from "./model";
import type {OrchestratorRuntimeState} from "./runtime-state";
import {createAbortSemaphore} from "./semaphore";
import {childrenOf, modelParts} from "./scheduler-helpers";
import type {SessionRunner} from "./scheduler-types";

type Context = {readonly state: OrchestratorRuntimeState; readonly runner: SessionRunner; readonly signal: AbortSignal; readonly builds: ReturnType<typeof createAbortSemaphore>; readonly onFailure: () => void; readonly onDeadline: () => void; readonly deadlineAt: number; readonly nowMs: () => number; readonly maxPromptChars: number};
type Config = {readonly manager: {readonly agent: string; readonly model: string}; readonly coordinators: readonly {readonly agent: string; readonly model: string; readonly fanOut: number}[]; readonly build: {readonly agent: string; readonly model: string; readonly maxParallel: number}; readonly failurePolicy: "fail-fast" | "collect"; readonly limits: {readonly maxCoordinatorAttempts: number; readonly maxPromptChars: number; readonly maxResultChars: number; readonly maxDurationMs: number}};

const promptInput = (node: OrchestratorNode) => ({objective: node.objective, constraints: node.constraints, verification: node.verification});

const errorMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === "string" ? error : "execution failed";

const fail = async (state: OrchestratorRuntimeState, node: OrchestratorNode, error: unknown, maxChars: number, status: OrchestratorStatus = "failed") => { await state.transitionNode(node.id, status, {error: errorMessage(error).slice(0, maxChars)}); };

const cleanupMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === "string" ? error : "cleanup failed";

const complete = async (state: OrchestratorRuntimeState, node: OrchestratorNode, run: SessionRunResult, maxChars: number) => { await state.transitionNode(node.id, "completed", {result: run.text.slice(0, maxChars), ...(run.cleanupError === undefined ? {} : {error: `cleanup failed: ${cleanupMessage(run.cleanupError)}`.slice(0, maxChars)})}); };

async function runSession(ctx: Context, node: OrchestratorNode, config: {readonly agent: string; readonly model: string}, prompt: string, tools: Record<string, boolean>): Promise<SessionRunResult> {
  const parts = modelParts(config.model);

  const remaining = ctx.deadlineAt - ctx.nowMs();

  if (remaining <= 0) { ctx.onDeadline(); throw new Error("job deadline exceeded"); }

  return ctx.runner({parentSessionID: node.rootSessionID, title: node.title, agent: config.agent, provider: parts.provider, model: parts.model, prompt: prompt.slice(0, ctx.maxPromptChars), tools, timeoutMs: remaining, signal: ctx.signal});
}

async function expand(ctx: Context, node: OrchestratorNode, config: Config): Promise<void> {
  const split = config.coordinators[node.layer - 1];

  if (!split) { throw new Error("missing coordinator configuration"); }

  let last: unknown;

  for (let attempt = 1; attempt <= config.limits.maxCoordinatorAttempts; attempt++) {
    try {
      const run = await runSession(ctx, node, split, renderCoordinatorDecomposition(promptInput(node)), coordinatorToolPolicy());
      await ctx.state.appendDecomposition(node.id, run.text);
      return;
    } catch (error) {
      if (ctx.signal.aborted) { throw error; }
      last = error;
      if (attempt < config.limits.maxCoordinatorAttempts) { await ctx.state.updateNode(node.id, {}, {incrementAttempt: true}); }
    }
  }
  throw last;
}

async function aggregate(ctx: Context, node: OrchestratorNode, config: {readonly agent: string; readonly model: string}): Promise<void> {
  const run = await runSession(ctx, node, config, renderCoordinatorAggregation(promptInput(node), deriveChildResultSummaries(ctx.state.snapshot(), node.id)), coordinatorToolPolicy());
  await complete(ctx.state, node, run, ctx.state.snapshot().config.limits.maxResultChars);
}

async function build(ctx: Context, node: OrchestratorNode, config: Config): Promise<void> {
  const release = await ctx.builds.acquire(ctx.signal);

  try {
    const run = await runSession(ctx, node, config.build, renderBuildExecution(promptInput(node)), buildToolPolicy());
    await complete(ctx.state, node, run, config.limits.maxResultChars);
  } finally { release(); }
}

export async function executeNode(ctx: Context, node: OrchestratorNode, config: Config): Promise<void> {
  await ctx.state.transitionNode(node.id, "running");
  try {
    if (node.role === "build") { await build(ctx, node, config); return; }
    if (node.role === "coordinator") { await expand(ctx, node, config); }

    const current = ctx.state.snapshot().graph.nodes.find((item) => item.id === node.id) ?? node;
    await executeChildren(ctx, current, config);
    const aggregateConfig = node.role === "manager" ? config.manager : config.coordinators[current.layer - 1];

    if (!aggregateConfig) { throw new Error("missing coordinator configuration"); }
    await aggregate(ctx, current, aggregateConfig);
  } catch (error) { if (ctx.signal.aborted) { throw error; } await fail(ctx.state, node, error, config.limits.maxResultChars); throw error; }
}

async function executeChildren(ctx: Context, node: OrchestratorNode, config: Config): Promise<void> {
  const children = childrenOf(ctx.state.snapshot().graph.nodes, node);

  if (config.failurePolicy === "fail-fast") {
    await executeFailFastChildren(ctx, children, config);
    return;
  }

  await Promise.allSettled(children.map((child) => executeNode(ctx, child, config)));
}

type WorkerState = {next: number; stopped: boolean; failed: boolean; firstFailure?: unknown};

function stopWorker(ctx: Context, state: WorkerState, error: unknown): void {
  if (state.stopped) { return; }
  state.stopped = true;
  state.failed = true;
  state.firstFailure = error;
  ctx.onFailure();
}

async function failFastWorker(ctx: Context, children: readonly OrchestratorNode[], config: Config, state: WorkerState): Promise<void> {
  while (!state.stopped) {
    const index = state.next++;

    if (index >= children.length) { return; }
    try { await executeNode(ctx, children[index] as OrchestratorNode, config); }
    catch (error) { if (ctx.signal.aborted) { return; } stopWorker(ctx, state, error); return; }
  }
}

async function executeFailFastChildren(ctx: Context, children: readonly OrchestratorNode[], config: Config): Promise<void> {
  const state: WorkerState = {next: 0, stopped: false, failed: false};

  const workers = Math.min(config.build.maxParallel, children.length);

  await Promise.all(Array.from({length: workers}, () => failFastWorker(ctx, children, config, state)));
  if (state.failed) { throw state.firstFailure instanceof Error ? state.firstFailure : new Error(errorMessage(state.firstFailure)); }
}

export function createExecutor(config: Config, state: OrchestratorRuntimeState, runner: SessionRunner, signal: AbortSignal, sharedBuilds?: ReturnType<typeof createAbortSemaphore>, onFailure?: () => void, onDeadline?: () => void, deadlineAt = Date.now() + config.limits.maxDurationMs, nowMs = Date.now) {
  const builds = sharedBuilds ?? createAbortSemaphore(config.build.maxParallel);

  const ownsBuilds = sharedBuilds === undefined;

  return {run: (node: OrchestratorNode) => executeNode({state, runner, signal, builds, onFailure: onFailure ?? (() => {}), onDeadline: onDeadline ?? (() => {}), deadlineAt, nowMs, maxPromptChars: config.limits.maxPromptChars}, node, config), dispose: () => { if (ownsBuilds) { builds.dispose(); } }};
}
