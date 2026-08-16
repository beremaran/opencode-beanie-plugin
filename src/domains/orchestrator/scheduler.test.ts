import {expect, test} from "bun:test";
import {createOrchestratorScheduler, type Decomposition, type OrchestratorConfig, type OrchestratorJob, type SessionRunner} from "./index";

const config = (overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig => ({
  enabled: true, manager: {agent: "manager", model: "provider/manager", fanOut: 3}, coordinators: [],
  build: {agent: "build", model: "provider/build", maxParallel: 2}, fanOutMode: "exact", failurePolicy: "collect",
  limits: {maxNodes: 32, maxDurationMs: 1000, maxCoordinatorAttempts: 2, maxPromptChars: 10000, maxResultChars: 1000}, ...overrides,
});

const child = (title: string) => ({title, objective: title, constraints: [], verification: []});
const repository = () => {
  const jobs = new Map<string, OrchestratorJob>();
  const saves: OrchestratorJob[] = [];
  return {jobs, saves, save: (job: OrchestratorJob) => { saves.push(structuredClone(job)); jobs.set(`${job.rootSessionID}/${job.id}`, structuredClone(job)); return Promise.resolve(); }, read: (root: string, id: string) => Promise.resolve(jobs.get(`${root}/${id}`)), list: (root: string) => Promise.resolve([...jobs.values()].filter((job) => job.rootSessionID === root)), markInterrupted: () => Promise.resolve(), flush: () => Promise.resolve(), dispose: () => Promise.resolve()};
};

const runner = (calls: string[], delay = 0): SessionRunner => async (request) => {
  calls.push(request.prompt);
  const wait = delay ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
  return wait.then(() => ({sessionID: `session-${String(calls.length)}`, text: request.prompt.includes("strict JSON") ? JSON.stringify({children: [child("one"), child("two")].slice(0, request.agent === "coord" ? 2 : 3)}) : `${request.agent}-result`}));
};

const startInput = (manager: string | Decomposition = {children: [child("one"), child("two"), child("three")]}) => ({rootSessionID: "root", title: "job", objective: "objective", constraints: [], verification: [], manager});

test("persists before execution and completes no-coordinator flow", async () => {
  const store = repository();
  const calls: string[] = [];
  let nextID = 0;
  const scheduler = createOrchestratorScheduler({config: config({manager: {...config().manager, fanOut: 1}}), dependencies: {repository: store, runner: runner(calls), id: (kind) => `${kind}-${String(nextID++)}`, now: () => "now"}});
  const metadata = await scheduler.start(startInput({children: [child("one")]}));
  expect(calls).toHaveLength(0);
  const result = await scheduler.wait("root", metadata.id);
  expect(result.status).toBe("completed");
  expect(result.graph.nodes.filter((node) => node.role === "build")).toHaveLength(1);
  expect(store.saves.length).toBeGreaterThan(1);
});

test("expands one coordinator layer and aggregates", async () => {
  const store = repository();
  const calls: string[] = [];
  const scheduler = createOrchestratorScheduler({config: config({coordinators: [{agent: "coord", model: "provider/coord", fanOut: 2}]}), dependencies: {repository: store, runner: runner(calls)}});
  const result = await scheduler.wait("root", (await scheduler.start(startInput())).id);
  expect(result.graph.nodes.filter((node) => node.role === "coordinator")).toHaveLength(3);
  expect(result.graph.nodes.filter((node) => node.role === "build")).toHaveLength(6);
  expect(calls.filter((call) => call.includes("strict JSON"))).toHaveLength(3);
  expect(calls.filter((call) => call.includes("Synthesize"))).toHaveLength(4);
  expect(result.result).toBe("manager-result");
  expect(result.startedAt).toBeDefined();
  expect(result.completedAt).toBeDefined();
  expect(result.graph.nodes.every((node) => node.startedAt && node.completedAt)).toBe(true);
});

test("retries malformed coordinator output exactly", async () => {
  const store = repository();
  let decompositionCalls = 0;
  const runnerWithRetry: SessionRunner = (request) => {
    if (request.prompt.includes("strict JSON")) { decompositionCalls++; if (decompositionCalls === 1) { return Promise.resolve({sessionID: "bad", text: "{}"}); } return Promise.resolve({sessionID: "good", text: JSON.stringify({children: [child("leaf")]})}); }
    return Promise.resolve({sessionID: "ok", text: "result"});
  };
  const scheduler = createOrchestratorScheduler({config: config({manager: {...config().manager, fanOut: 1}, coordinators: [{agent: "coord", model: "provider/coord", fanOut: 1}]}), dependencies: {repository: store, runner: runnerWithRetry}});
  const result = await scheduler.wait("root", (await scheduler.start(startInput({children: [child("branch")]}))).id);
  expect(result.status).toBe("completed");
  expect(decompositionCalls).toBe(2);
});

test("scopes reads and enforces build concurrency", async () => {
  const store = repository();
  let running = 0;
  let maximum = 0;
  const buildRunner: SessionRunner = async (request) => {
    if (request.agent === "build") { running++; maximum = Math.max(maximum, running); await new Promise((resolve) => setTimeout(resolve, 5)); running--; }
    return {sessionID: "s", text: "result"};
  };
  const scheduler = createOrchestratorScheduler({config: config(), dependencies: {repository: store, runner: buildRunner}});
  const id = (await scheduler.start(startInput())).id;
  const result = await scheduler.wait("root", id);
  expect(maximum).toBe(2);
  expect(await scheduler.read("other", id)).toBeUndefined();
  expect((await scheduler.list("root")).map((job) => job.id)).toContain(id);
  expect(result.status).toBe("completed");
});

const blockingRunner: SessionRunner = (request) => new Promise((resolve, reject) => {
  const stop = () => { reject(new Error("aborted")); };
  request.signal?.addEventListener("abort", stop, {once: true});
  if (request.signal?.aborted) { stop(); }
  void resolve;
});

test("classifies cancellation, timeout, and dispose interruption", async () => {
  const make = (maxDurationMs: number) => {
    const store = repository();
    return {store, scheduler: createOrchestratorScheduler({config: config({manager: {...config().manager, fanOut: 1}, limits: {...config().limits, maxDurationMs}}), dependencies: {repository: store, runner: blockingRunner}})};
  };
  const cancelled = make(1000);
  const cancelID = (await cancelled.scheduler.start(startInput({children: [child("one")]}))).id;
  await cancelled.scheduler.cancel("root", cancelID);
  expect((await cancelled.scheduler.read("root", cancelID))?.status).toBe("cancelled");
  const timed = make(1);
  const timeoutID = (await timed.scheduler.start(startInput({children: [child("one")]}))).id;
  expect((await timed.scheduler.wait("root", timeoutID)).status).toBe("timeout");
  const interrupted = make(1000);
  const disposeID = (await interrupted.scheduler.start(startInput({children: [child("one")]}))).id;
  await interrupted.scheduler.dispose();
  expect((await interrupted.scheduler.read("root", disposeID))?.status).toBe("interrupted");
});

test("same job IDs remain isolated by root session", async () => {
  const store = repository();
  let release: (() => void) | undefined;
  let nodeID = 0;
  const runner: SessionRunner = (request) => new Promise((resolve, reject) => {
    if (request.agent === "manager") { resolve({sessionID: request.parentSessionID, text: request.parentSessionID}); return; }
    const abort = () => { reject(new Error("cancelled")); };
    request.signal?.addEventListener("abort", abort, {once: true});
    release = () => { request.signal?.removeEventListener("abort", abort); resolve({sessionID: request.parentSessionID, text: request.parentSessionID}); };
  });
  const scheduler = createOrchestratorScheduler({config: config({manager: {...config().manager, fanOut: 1}}), dependencies: {repository: store, runner, id: (kind) => kind === "job" ? "job-same" : `node-${String(nodeID++)}`}});
  const first = await scheduler.start({...startInput({children: [child("one")]}), rootSessionID: "first"});
  const second = await scheduler.start({...startInput({children: [child("one")]}), rootSessionID: "second"});
  await scheduler.cancel("first", first.id);
  expect((await scheduler.read("first", first.id))?.status).toBe("cancelled");
  release?.();
  expect((await scheduler.wait("second", second.id)).status).toBe("completed");
});

test("collect preserves partial aggregate while fail-fast stops aggregation", async () => {
  const run = async (failurePolicy: "collect" | "fail-fast") => {
    const store = repository();
    let builds = 0;
    let aggregations = 0;
    const runner: SessionRunner = (request) => {
      if (request.agent === "build") { builds++; return request.prompt.includes("bad") ? Promise.reject(new Error("x".repeat(100))) : Promise.resolve({sessionID: "build", text: "good"}); }
      aggregations++;
      return Promise.resolve({sessionID: "aggregate", text: "partial aggregate"});
    };
    const scheduler = createOrchestratorScheduler({config: config({failurePolicy, build: {...config().build, maxParallel: failurePolicy === "fail-fast" ? 1 : 2}, manager: {...config().manager, fanOut: 2}}), dependencies: {repository: store, runner}});
    const result = await scheduler.wait("root", (await scheduler.start(startInput({children: [child("bad"), child("good")] }))).id);
    return {result, builds, aggregations};
  };
  const collected = await run("collect");
  expect(collected.builds).toBe(2);
  expect(collected.aggregations).toBe(1);
  expect(collected.result.status).toBe("failed");
  expect(collected.result.result).toBe("partial aggregate");
  expect(collected.result.error?.length).toBeLessThanOrEqual(1000);
    const fast = await run("fail-fast");
    expect(fast.result.status).toBe("failed");
    expect(fast.builds).toBe(1);
    expect(fast.aggregations).toBe(0);
    expect(fast.result.graph.nodes.filter((node) => node.status === "failed")).not.toHaveLength(0);
    expect(fast.result.graph.nodes.find((node) => node.objective === "good")?.startedAt).toBeUndefined();
  });

test("bounds injected results, cleanup diagnostics, prompts, and passes remaining timeout", async () => {
  const store = repository();
  const requests: number[] = [];
  const promptLengths: number[] = [];
  const scheduler = createOrchestratorScheduler({config: config({manager: {...config().manager, fanOut: 1}, limits: {...config().limits, maxPromptChars: 100, maxResultChars: 10, maxDurationMs: 50}}), dependencies: {repository: store, runner: (request) => { requests.push(request.timeoutMs ?? 0); promptLengths.push(request.prompt.length); return Promise.resolve({sessionID: "s", text: "r".repeat(100), cleanupError: "e".repeat(100)}); }}});
  const result = await scheduler.wait("root", (await scheduler.start(startInput({children: [child("one")]}))).id);
  const build = result.graph.nodes.find((node) => node.role === "build");
  expect(build?.result?.length).toBe(10);
  expect(build?.error?.length).toBeLessThanOrEqual(10);
  expect(requests.length).toBeGreaterThan(0);
  expect(promptLengths.every((length) => length <= 100)).toBe(true);
  expect(requests.every((timeout) => timeout > 0 && timeout <= 50)).toBe(true);
});
