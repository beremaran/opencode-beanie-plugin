import type {Config, Hooks, PluginInput, PluginOptions} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {isAbsolute} from "node:path";
import type {Domain} from "../../shared/domain";
import {configureOrchestratorAgents} from "./directives";
import {createOrchestratorJobRepository} from "./repository";
import {derivedOrchestratorArtifactBytes} from "./budget";
import {parseOrchestratorConfig} from "./config";
import {createSdkSessionGateway, createSessionRunner} from "./session-runner";
import {createOrchestratorScheduler} from "./scheduler";
import {isTerminalStatus} from "./lifecycle";
import {createOrchestrationTools} from "./tools";
import type {OrchestratorJob, OrchestratorStatus} from "./model";
import {logNotificationFailure, notifyCompletion, notificationTimeoutMs, type NotificationResult} from "./notification";

const emptyHooks = (): Hooks => ({});

const hasConfiguredObject = (options: PluginOptions | undefined): options is PluginOptions & {orchestrator: unknown} =>
  options !== undefined && Object.prototype.hasOwnProperty.call(options, "orchestrator") && options.orchestrator !== undefined;

const context = (input: PluginInput) => {
  if (!isAbsolute(input.worktree)) {
    throw new Error("Orchestrator startup failed: an absolute worktree is required.");
  }

  const projectID = input.project.id;

  if (typeof projectID !== "string" || !projectID.trim()) {
    throw new Error("Orchestrator startup failed: a project ID is required.");
  }

  return {worktree: input.worktree, projectID};
};

const nodeCounts = (job: OrchestratorJob) => job.graph.nodes.reduce<Record<string, number>>((counts, node) => {
  counts[node.status] = (counts[node.status] ?? 0) + 1;
  return counts;
}, {});

const compactCandidates = (jobs: OrchestratorJob[], maxJobs: number) => jobs.slice(0, maxJobs).map((job) => ({id: job.id, status: job.status, counts: nodeCounts(job)}));

const compactOutput = (selected: ReturnType<typeof compactCandidates>, truncated: boolean) => JSON.stringify({jobs: selected, truncated, hint: "Call orchestration_read once for terminal details."});

const selectCompactCandidates = (candidates: ReturnType<typeof compactCandidates>, limit: number, truncated: boolean) => {
  const selected: typeof candidates = [];

  for (const candidate of candidates) {
    selected.push(candidate);
    if (compactOutput(selected, truncated).length > limit) {selected.pop(); truncated = true; break;}
  }

  while (selected.length > 0 && compactOutput(selected, truncated).length > limit) {selected.pop();}
  return {selected, truncated};
};

const compact = async (sessionID: string, output: {context: string[]}, scheduler: ReturnType<typeof createOrchestratorScheduler>, limit: number, maxJobs: number) => {
  const jobs = [...await scheduler.list(sessionID)].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));

  const candidates = compactCandidates(jobs, maxJobs);

  const result = selectCompactCandidates(candidates, limit, jobs.length > candidates.length);
  output.context.push(compactOutput(result.selected, result.truncated));
};

function createRuntime(input: PluginInput, config: ReturnType<typeof parseOrchestratorConfig> & {ok: true}, worktree: string, projectID: string) {
  return createOrchestratorJobRepository({worktree, projectID, maxArtifactBytes: derivedOrchestratorArtifactBytes(config.value)}).then((repository) => {
    const gateway = createSdkSessionGateway(input.client, worktree);

    const runner = createSessionRunner(gateway, {maxPromptChars: config.value.limits.maxPromptChars, maxResultChars: config.value.limits.maxResultChars});

    const scheduler = createOrchestratorScheduler({config: config.value, dependencies: {repository, runner}});

    return {repository, scheduler};
  });
}

type DomainState = {disposed: boolean; deletedRoots: Set<string>; notifications: Set<Promise<void>>; controllers: Map<string, Set<AbortController>>};

type StartedHandlerOptions = {input: PluginInput; worktree: string; scheduler: ReturnType<typeof createOrchestratorScheduler>; limit: number; timeoutMs: number; state: DomainState};

const rootControllers = (state: DomainState, rootSessionID: string) => {
  const controllers = state.controllers.get(rootSessionID) ?? new Set<AbortController>();
  state.controllers.set(rootSessionID, controllers);
  return controllers;
};

const removeController = (state: DomainState, rootSessionID: string, controller: AbortController) => {
  const controllers = state.controllers.get(rootSessionID);
  controllers?.delete(controller);
  if (controllers?.size === 0) {state.controllers.delete(rootSessionID);}
};

const abortRootNotifications = (state: DomainState, rootSessionID: string) => {
  state.controllers.get(rootSessionID)?.forEach((controller) => { controller.abort("session deleted"); });
};

const abortAllNotifications = (state: DomainState) => {
  state.controllers.forEach((controllers) => { controllers.forEach((controller) => { controller.abort("dispose"); }); });
};

const notificationFailure = async (options: StartedHandlerOptions, rootSessionID: string, jobID: string) => {
  if (options.state.disposed || options.state.deletedRoots.has(rootSessionID)) {return;}

  let status: OrchestratorStatus = "failed";

  try {status = (await options.scheduler.read(rootSessionID, jobID))?.status ?? status;} catch { /* shutdown can remove the repository */ }
  logNotificationFailure(options.input, options.worktree, jobID, status);
};

const createStartedHandler = (options: StartedHandlerOptions) => (rootSessionID: string, jobID: string) => {
  if (options.state.disposed || options.state.deletedRoots.has(rootSessionID)) {return;}

  const controller = new AbortController();
  rootControllers(options.state, rootSessionID).add(controller);
  const task = options.scheduler.wait(rootSessionID, jobID).then((job) => notifyCompletion({input: options.input, worktree: options.worktree, rootSessionID, job, limit: options.limit, timeoutMs: options.timeoutMs, controller, shouldDispatch: () => !options.state.disposed && !options.state.deletedRoots.has(rootSessionID)})).then((result: NotificationResult) => {
    if (result === "timeout") {return notificationFailure(options, rootSessionID, jobID);}
  }).catch(() => notificationFailure(options, rootSessionID, jobID));
  options.state.notifications.add(task);
  void task.then(() => options.state.notifications.delete(task), () => options.state.notifications.delete(task));
  void task.then(() => { removeController(options.state, rootSessionID, controller); }, () => { removeController(options.state, rootSessionID, controller); });
};

const createDomainHooks = (input: PluginInput, runtime: Awaited<ReturnType<typeof createRuntime>>, config: ReturnType<typeof parseOrchestratorConfig> & {ok: true}, state: DomainState) => {
  const onStarted = createStartedHandler({input, worktree: input.worktree, scheduler: runtime.scheduler, limit: config.value.limits.maxPromptChars, timeoutMs: notificationTimeoutMs(config.value.limits.maxDurationMs), state});

  const tools = createOrchestrationTools({scheduler: runtime.scheduler, config: config.value, onStarted});

  const event = async ({event: received}: {event: Event}) => handleDomainEvent(received, runtime.scheduler, state);

  const dispose = async () => disposeDomain(runtime, state);

  const configHook = (value: Config) => {
    configureOrchestratorAgents(value, config.value);
    return Promise.resolve();
  };

  const compactHook = (value: {sessionID: string}, output: {context: string[]}) => compact(value.sessionID, output, runtime.scheduler, config.value.limits.maxPromptChars, config.value.limits.maxNodes);

  return {tool: tools, config: configHook, event, dispose, "experimental.session.compacting": compactHook};
};

const handleDomainEvent = async (received: Event, scheduler: ReturnType<typeof createOrchestratorScheduler>, state: DomainState) => {
  if (received.type !== "session.deleted") {return;}

  const rootSessionID = received.properties.info.id;
  state.deletedRoots.add(rootSessionID);
  abortRootNotifications(state, rootSessionID);
  const jobs = await scheduler.list(rootSessionID);
  await Promise.all(jobs.filter((job) => !isTerminalStatus(job.status)).map((job) => scheduler.cancel(job.rootSessionID, job.id)));
};

const disposeDomain = async (runtime: Awaited<ReturnType<typeof createRuntime>>, state: DomainState) => {
  if (state.disposed) {return;}
  state.disposed = true;
  abortAllNotifications(state);
  await runtime.scheduler.dispose();
  await Promise.allSettled(state.notifications);
  await runtime.repository.flush();
  await runtime.repository.dispose();
};

export const OrchestratorDomain: Domain = async (input, options) => {
  if (!hasConfiguredObject(options)) {return emptyHooks();}

  const parsed = parseOrchestratorConfig(options.orchestrator);

  if (!parsed.ok) {throw new Error(`Orchestrator startup failed: invalid configuration: ${parsed.errors.join(" ")}`);}
  if (!parsed.value.enabled) {return emptyHooks();}

  const {worktree, projectID} = context(input);

  const {repository, scheduler} = await createRuntime(input, parsed, worktree, projectID);

  const state: DomainState = {disposed: false, deletedRoots: new Set(), notifications: new Set(), controllers: new Map()};

  return createDomainHooks(input, {repository, scheduler}, parsed, state);
};
