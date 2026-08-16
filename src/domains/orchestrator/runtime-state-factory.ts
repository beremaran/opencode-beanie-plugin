import {appendDecomposition, type GraphClock, type GraphResult, updateOrchestratorNode, type NodeUpdate} from "./graph";
import type {Decomposition} from "./decomposition";
import {isTerminalStatus, transitionJob} from "./lifecycle";
import type {OrchestratorJob, OrchestratorStatus} from "./model";
import type {OrchestratorRuntimeState, RuntimeStateDependencies} from "./runtime-state";

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) { freeze(child); } }
  return value;
};

const failure = (result: GraphResult): never => { throw new Error(result.ok ? "Unexpected graph result" : result.errors.join(" ")); };

const nodeUpdate = (node: OrchestratorJob["graph"]["nodes"][number], status: OrchestratorStatus, update: NodeUpdate, timestamp: string): NodeUpdate => ({...update, status, ...(status === "running" && !node.startedAt ? {startedAt: timestamp} : {}), ...(isTerminalStatus(status) && !node.completedAt ? {completedAt: timestamp} : {})});

type Access = {get(): OrchestratorJob; set(job: OrchestratorJob): void};
type Run = (operation: () => OrchestratorJob | Promise<OrchestratorJob>) => Promise<void>;

const persistInitial = (access: Access, repository: RuntimeStateDependencies["repository"], getQueue: () => Promise<void>, setQueue: (queue: Promise<void>) => void, persisted: {value: boolean}, initial: {value?: Promise<void>}) => {
  if (persisted.value) { return getQueue().then(() => undefined); }
  if (initial.value) { return initial.value; }
  initial.value = getQueue().then(async () => { await repository.save(access.get()); persisted.value = true; });
  setQueue(initial.value.catch(() => undefined));
  return initial.value;
};

const createQueue = (access: Access, dependencies: RuntimeStateDependencies) => {
  let queue = Promise.resolve();

  const persisted = {value: false};

  const initialPersistence: {value?: Promise<void>} = {};

  const run: Run = (operation) => {
    const next = queue.then(async () => { const result = await operation(); await dependencies.repository.save(result); access.set(result); });
    queue = next.then(() => undefined, () => undefined);
    return next.then(() => undefined);
  };

  const persistInitialJob = () => persistInitial(access, dependencies.repository, () => queue, (value) => { queue = value; }, persisted, initialPersistence);

  return {run, persistInitialJob};
};

const updateNode = (access: Access, run: Run, dependencies: RuntimeStateDependencies, nodeID: string, update: NodeUpdate, incrementAttempt: boolean) => run(() => {
  const current = access.get();

  const node = current.graph.nodes.find((item) => item.id === nodeID);

  const attempt = incrementAttempt ? (node?.attempt ?? 0) + 1 : update.attempt;

  const result = updateOrchestratorNode(current, nodeID, attempt === undefined ? update : {...update, attempt}, {now: dependencies.now});

  return result.ok ? result.job : failure(result);
});

const transitionNode = (access: Access, run: Run, dependencies: RuntimeStateDependencies, nodeID: string, status: OrchestratorStatus, update: NodeUpdate) => run(() => {
  const current = access.get();

  const node = current.graph.nodes.find((item) => item.id === nodeID);

  if (!node) { throw new Error(`node ${nodeID} was not found`); }

  const timestamp = dependencies.now();

  const result = updateOrchestratorNode(current, nodeID, nodeUpdate(node, status, update, timestamp), {now: () => timestamp});

  return result.ok ? result.job : failure(result);
});

const append = (access: Access, run: Run, dependencies: RuntimeStateDependencies, nodeID: string, decomposition: string | Decomposition) => run(() => {
  const result = appendDecomposition(access.get(), nodeID, decomposition, {now: dependencies.now});

  return result.ok ? result.job : failure(result);
});

const updateJob = (access: Access, run: Run, now: GraphClock, update: Partial<Pick<OrchestratorJob, "result" | "error" | "startedAt" | "completedAt">>) => run(() => ({...access.get(), ...update, updatedAt: now()}));

const transition = (access: Access, run: Run, now: GraphClock, status: OrchestratorStatus) => run(() => {
  const current = access.get();

  const result = transitionJob(current, status);

  if (!result.ok) { throw new Error(result.error); }

  const timestamp = now();

  const timestamps = status === "running" && !current.startedAt ? {startedAt: timestamp} : isTerminalStatus(status) && !current.completedAt ? {completedAt: timestamp} : {};

  return {...result.job, ...timestamps, updatedAt: timestamp};
});

const markRemaining = (access: Access, run: Run, now: GraphClock, status: Extract<OrchestratorStatus, "cancelled" | "failed" | "timeout" | "interrupted">) => run(() => {
  const timestamp = now();

  const nodes = access.get().graph.nodes.map((node) => node.status === "registered" || node.status === "running" ? {...node, status, updatedAt: timestamp, completedAt: node.completedAt ?? timestamp} : node);

  return {...access.get(), graph: {...access.get().graph, nodes}, updatedAt: timestamp};
});

export const createRuntimeOperations = (access: Access, run: Run, dependencies: RuntimeStateDependencies) => ({
  updateNode: (nodeID: string, update: NodeUpdate, options: {readonly incrementAttempt?: boolean} = {}) => updateNode(access, run, dependencies, nodeID, update, options.incrementAttempt ?? false),
  transitionNode: (nodeID: string, status: OrchestratorStatus, update: NodeUpdate = {}) => transitionNode(access, run, dependencies, nodeID, status, update),
  appendDecomposition: (nodeID: string, value: string | Decomposition) => append(access, run, dependencies, nodeID, value),
  updateJob: (update: Partial<Pick<OrchestratorJob, "result" | "error" | "startedAt" | "completedAt">>) => updateJob(access, run, dependencies.now, update),
  transitionJob: (status: OrchestratorStatus) => transition(access, run, dependencies.now, status),
  markRemaining: (status: Extract<OrchestratorStatus, "cancelled" | "failed" | "timeout" | "interrupted">) => markRemaining(access, run, dependencies.now, status),
});

export const createRuntimeState = (initial: OrchestratorJob, dependencies: RuntimeStateDependencies): OrchestratorRuntimeState => {
  let current = freeze(structuredClone(initial));

  const access: Access = {get: () => current, set: (job) => { current = freeze(job); }};

  const queue = createQueue(access, dependencies);

  return {snapshot: () => current, persistInitialJob: queue.persistInitialJob, ...createRuntimeOperations(access, queue.run, dependencies)};
};
