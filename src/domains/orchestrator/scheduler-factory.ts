import {createOrchestratorJob, type GraphDependencies} from "./graph";
import {createOrchestratorRuntimeState, type OrchestratorRuntimeState} from "./runtime-state";
import {createExecutor} from "./executor";
import {createAbortSemaphore} from "./semaphore";
import {reasonStatus} from "./scheduler-helpers";
import type {OrchestratorJob} from "./model";
import type {Scheduler, SchedulerInput, SchedulerJobMetadata, SchedulerOptions} from "./scheduler-types";

type Active = {readonly controller: AbortController; readonly state: OrchestratorRuntimeState; readonly done: Promise<OrchestratorJob>};
type Runtime = {readonly options: SchedulerOptions; readonly now: () => string; readonly nowMs: () => number; readonly id: (kind: "job" | "node") => string; readonly active: Map<string, Active>; readonly builds: ReturnType<typeof createAbortSemaphore>; disposed: boolean};

const key = (root: string, job: string) => `${root}\u0000${job}`;

const metadata = (job: OrchestratorJob): SchedulerJobMetadata => ({id: job.id, rootSessionID: job.rootSessionID, title: job.title, status: job.status, createdAt: job.createdAt});

const text = (error: unknown, max: number) => (error instanceof Error ? error.message : typeof error === "string" ? error : "scheduler execution failed").slice(0, max);

const finish = async (runtime: Runtime, state: OrchestratorRuntimeState, controller: AbortController, failed: boolean) => {
  const snapshot = state.snapshot();

  const result = snapshot.graph.nodes[0]?.result?.slice(0, runtime.options.config.limits.maxResultChars);

  const hasFailed = snapshot.graph.nodes.some((node) => node.status === "failed");

  const summary = (snapshot.error ?? "one or more descendant nodes failed").slice(0, runtime.options.config.limits.maxResultChars);

  if (failed) { await state.markRemaining("failed"); await state.updateJob({result, error: snapshot.error?.slice(0, runtime.options.config.limits.maxResultChars) ?? summary}); await state.transitionJob("failed"); return state.snapshot(); }
  if (controller.signal.aborted) { const reason = reasonStatus(controller.signal.reason); await state.markRemaining(reason); await state.transitionJob(reason); return state.snapshot(); }
  await state.updateJob({result, ...(hasFailed ? {error: summary} : {})}); await state.transitionJob(hasFailed ? "failed" : "completed"); return state.snapshot();
};

const launchFailure = async (runtime: Runtime, state: OrchestratorRuntimeState, controller: AbortController, error: unknown) => {
  if (controller.signal.aborted && controller.signal.reason !== "failure") { return false; }

  const snapshot = state.snapshot();

  const first = snapshot.graph.nodes.find((node) => node.status === "failed")?.error;
  await state.updateJob({error: snapshot.error ?? first ?? text(error, runtime.options.config.limits.maxResultChars)});
  return true;
};

const launchCleanup = async (runtime: Runtime, state: OrchestratorRuntimeState, controller: AbortController, failed: boolean) => {
  try { await finish(runtime, state, controller, failed); } catch (error) {
    try { await state.updateJob({error: text(error, runtime.options.config.limits.maxResultChars)}); } catch { /* persistence may be unavailable */ }
  }
};

const launch = (runtime: Runtime, state: OrchestratorRuntimeState, controller: AbortController, executor: ReturnType<typeof createExecutor>) => (async () => {
  let failed = false;

  const root = state.snapshot().graph.nodes[0];

  if (!root) { throw new Error("job has no manager node"); }
  try { await state.transitionJob("running"); await executor.run(root); }
  catch (error) { failed = await launchFailure(runtime, state, controller, error); }
  finally { executor.dispose(); await launchCleanup(runtime, state, controller, failed); }
  return state.snapshot();
})().catch(async (error: unknown) => { try { await state.updateJob({error: text(error, runtime.options.config.limits.maxResultChars)}); } catch { /* persistence may be unavailable */ } return state.snapshot(); });

const createGraph = (runtime: Runtime, input: SchedulerInput) => {
  const {config} = runtime.options;

  const graph = createOrchestratorJob(input.rootSessionID, input.objective, input.title, input.constraints, input.verification, config, input.manager, {now: runtime.now, id: runtime.id} satisfies Partial<GraphDependencies>);

  if (!graph.ok) { throw new Error(graph.errors.join(" ")); }
  return graph.job;
};

const startExecution = (runtime: Runtime, job: OrchestratorJob, state: OrchestratorRuntimeState) => {
  const {config, dependencies} = runtime.options;

  const controller = new AbortController();

  const deadlineAt = runtime.nowMs() + config.limits.maxDurationMs;

  const timer = setTimeout(() => { controller.abort("timeout"); }, config.limits.maxDurationMs);

  const executor = createExecutor(config, state, dependencies.runner, controller.signal, runtime.builds, () => { controller.abort("failure"); }, () => { controller.abort("timeout"); }, deadlineAt, runtime.nowMs);

  const identity = key(job.rootSessionID, job.id);

  const done = launch(runtime, state, controller, executor).finally(() => { clearTimeout(timer); runtime.active.delete(identity); });
  runtime.active.set(identity, {controller, state, done});
};

const start = async (runtime: Runtime, input: SchedulerInput): Promise<SchedulerJobMetadata> => {
  if (runtime.disposed) { throw new Error("scheduler is disposed"); }

  const job = createGraph(runtime, input);

  const state = createOrchestratorRuntimeState(job, {repository: runtime.options.dependencies.repository, now: runtime.now});
  await state.persistInitialJob();
  startExecution(runtime, job, state);
  return metadata(job);
};

const wait = async (runtime: Runtime, root: string, jobID: string) => {
  const item = runtime.active.get(key(root, jobID));

  if (item && item.state.snapshot().rootSessionID === root) { return item.done; }

  const job = await runtime.options.dependencies.repository.read(root, jobID);

  if (!job) { throw new Error("job not found"); }
  return job;
};

const cancel = async (runtime: Runtime, root: string, jobID: string) => {
  const item = runtime.active.get(key(root, jobID));

  if (item?.state.snapshot().rootSessionID === root) { item.controller.abort("cancel"); await item.done; return; }
  if (!await runtime.options.dependencies.repository.read(root, jobID)) { throw new Error("job not found"); }
};

export function createScheduler(options: SchedulerOptions): Scheduler {
  const dependencies = options.dependencies;

  const runtime: Runtime = {options, now: dependencies.now ?? (() => new Date().toISOString()), nowMs: dependencies.nowMs ?? Date.now, id: dependencies.id ?? ((kind) => `${kind}-${crypto.randomUUID()}`), active: new Map(), builds: createAbortSemaphore(options.config.build.maxParallel), disposed: false};

  return {start: (input) => start(runtime, input), read: (root, job) => dependencies.repository.read(root, job), list: (root) => dependencies.repository.list(root), wait: (root, job) => wait(runtime, root, job), cancel: (root, job) => cancel(runtime, root, job), dispose: async () => { runtime.disposed = true; for (const item of runtime.active.values()) { item.controller.abort("dispose"); } runtime.builds.dispose(); await Promise.all([...runtime.active.values()].map((item) => item.done)); await dependencies.repository.flush(); }};
}
