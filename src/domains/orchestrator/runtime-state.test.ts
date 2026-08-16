import {expect, test} from "bun:test";
import {createOrchestratorJob, createOrchestratorRuntimeState, type OrchestratorConfig, type OrchestratorJob} from "./index";

const config: OrchestratorConfig = {
  enabled: true, manager: {agent: "manager", model: "model", fanOut: 2},
  coordinators: [{agent: "one", model: "model", fanOut: 2}, {agent: "two", model: "model", fanOut: 1}],
  build: {agent: "build", model: "model", maxParallel: 2}, fanOutMode: "exact", failurePolicy: "collect",
  limits: {maxNodes: 20, maxDurationMs: 1000, maxCoordinatorAttempts: 2, maxPromptChars: 1000, maxResultChars: 100},
};

const makeJob = (): OrchestratorJob => {
  let id = 0;
  const result = createOrchestratorJob("root", "objective", "title", [], [], config, {children: [{title: "a", objective: "a", constraints: [], verification: []}, {title: "b", objective: "b", constraints: [], verification: []}]}, {now: () => "created", id: (kind) => `${kind}-${String(id++)}`});
  if (!result.ok) {throw new Error(result.errors.join(","));}
  return result.job;
};

const setup = () => {
  const saves: OrchestratorJob[] = [];
  let tick = 0;
  const repository = {save: (job: OrchestratorJob) => {saves.push(job); return Promise.resolve();}, read: () => Promise.resolve(undefined), list: () => Promise.resolve([]), markInterrupted: () => Promise.resolve(), flush: () => Promise.resolve(), dispose: () => Promise.resolve()};
  const state = createOrchestratorRuntimeState(makeJob(), {repository, now: () => `time-${String(++tick)}`});
  return {state, saves};
};

test("serializes racing node updates and persists each result in order", async () => {
  const {state, saves} = setup();
  await state.persistInitialJob();
  const nodes = state.snapshot().graph.nodes;
  await Promise.all(nodes.map((node) => state.updateNode(node.id, {result: node.id}, {incrementAttempt: true})));
  expect(state.snapshot().graph.nodes.every((node) => node.result === node.id && node.attempt === 2)).toBe(true);
  expect(saves).toHaveLength(nodes.length + 1);
  expect(saves.at(-1)?.graph.nodes.every((node) => node.result === node.id)).toBe(true);
});

test("serializes concurrent coordinator appends without losing children", async () => {
  const {state} = setup();
  await state.persistInitialJob();
  const coordinators = state.snapshot().graph.nodes.filter((node) => node.role === "coordinator");
  await Promise.all(coordinators.map((node) => state.appendDecomposition(node.id, {children: [{title: `${node.id}-a`, objective: "child", constraints: [], verification: []}, {title: `${node.id}-b`, objective: "child", constraints: [], verification: []}]})));
  expect(state.snapshot().graph.nodes).toHaveLength(7);
  expect(state.snapshot().graph.edges).toHaveLength(6);
  expect(state.snapshot().graph.nodes.filter((node) => node.parentID).map((node) => node.title)).toEqual(["a", "b", ...coordinators.flatMap((node) => [`${node.id}-a`, `${node.id}-b`])]);
});

test("rejects invalid transitions without changing or persisting state", async () => {
  const {state, saves} = setup();
  await state.persistInitialJob();
  const before = state.snapshot();
  expect(state.transitionJob("completed")).rejects.toThrow("Cannot transition registered to completed.");
  expect(state.snapshot()).toBe(before);
  expect(saves).toHaveLength(1);
});

test("protects terminal jobs and nodes from late regressions", async () => {
  const {state} = setup();
  await state.persistInitialJob();
  const nodeID = state.snapshot().graph.nodes[0]?.id;
  if (!nodeID) {throw new Error("missing node");}
  await state.transitionNode(nodeID, "running");
  await state.transitionNode(nodeID, "completed");
  expect(state.transitionNode(nodeID, "running", {result: "late"})).rejects.toThrow();
  await state.transitionJob("running");
  await state.transitionJob("completed");
  expect(state.transitionJob("running")).rejects.toThrow();
  expect(state.snapshot().status).toBe("completed");
  expect(state.snapshot().graph.nodes[0]?.status).toBe("completed");
});

test("marks only registered and running nodes terminal", async () => {
  const {state} = setup();
  await state.persistInitialJob();
  const first = state.snapshot().graph.nodes[0]?.id;
  if (!first) {throw new Error("missing node");}
  await state.transitionNode(first, "running");
  await state.markRemaining("cancelled");
  expect(state.snapshot().graph.nodes.every((node) => node.status === "cancelled")).toBe(true);
  expect(state.snapshot().graph.nodes.every((node) => node.completedAt === node.updatedAt)).toBe(true);
});

test("sets transition timestamps once and preserves them on idempotent transitions", async () => {
  const {state} = setup();
  await state.persistInitialJob();
  const nodeID = state.snapshot().graph.nodes[0]?.id;
  if (!nodeID) {throw new Error("missing node");}
  await state.transitionNode(nodeID, "running");
  const started = state.snapshot().graph.nodes[0]?.startedAt;
  await state.transitionNode(nodeID, "running");
  expect(state.snapshot().graph.nodes[0]?.startedAt).toBe(started);
  await state.transitionNode(nodeID, "completed");
  const completed = state.snapshot().graph.nodes[0]?.completedAt;
  await state.transitionNode(nodeID, "completed");
  expect(state.snapshot().graph.nodes[0]?.completedAt).toBe(completed);
  await state.transitionJob("running");
  const jobStarted = state.snapshot().startedAt;
  await state.transitionJob("running");
  expect(state.snapshot().startedAt).toBe(jobStarted);
  await state.transitionJob("completed");
  const jobCompleted = state.snapshot().completedAt;
  await state.transitionJob("completed");
  expect(state.snapshot().completedAt).toBe(jobCompleted);
});
