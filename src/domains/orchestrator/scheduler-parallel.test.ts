import {expect, test} from "bun:test";
import {createOrchestratorScheduler, type OrchestratorConfig, type OrchestratorJob, type SchedulerInput, type SessionRunner} from "./index";

const baseConfig = (maxParallel: number, failurePolicy: "fail-fast" | "collect"): OrchestratorConfig => ({
  enabled: true, manager: {agent: "manager", model: "provider/manager", fanOut: 3}, coordinators: [],
  build: {agent: "build", model: "provider/build", maxParallel}, fanOutMode: "exact", failurePolicy,
  limits: {maxNodes: 32, maxDurationMs: 1000, maxCoordinatorAttempts: 1, maxPromptChars: 10000, maxResultChars: 100},
});

const child = (title: string) => ({title, objective: title, constraints: [], verification: []});
const input = (children: readonly ReturnType<typeof child>[]): SchedulerInput => ({rootSessionID: "root", title: "job", objective: "objective", constraints: [], verification: [], manager: {children}});
const store = () => {
  const jobs = new Map<string, OrchestratorJob>();
  return {save: (job: OrchestratorJob) => { jobs.set(job.id, structuredClone(job)); return Promise.resolve(); }, read: (_root: string, id: string) => Promise.resolve(jobs.get(id)), list: () => Promise.resolve([...jobs.values()]), markInterrupted: () => Promise.resolve(), flush: () => Promise.resolve(), dispose: () => Promise.resolve()};
};

const scheduler = (maxParallel: number, failurePolicy: "fail-fast" | "collect", runner: SessionRunner) => createOrchestratorScheduler({config: baseConfig(maxParallel, failurePolicy), dependencies: {repository: store(), runner}});

test("fail-fast maxParallel=1 never starts queued siblings", async () => {
  const started: string[] = [];
  const runner: SessionRunner = (request) => { if (request.agent === "build") { started.push(request.prompt); return Promise.reject(new Error("first failure")); } return Promise.resolve({sessionID: "aggregate", text: "unused"}); };
  const schedulerInstance = scheduler(1, "fail-fast", runner);
  const result = await schedulerInstance.wait("root", (await schedulerInstance.start(input([child("one"), child("two"), child("three")]))).id);
  expect(started).toHaveLength(1);
  expect(result.graph.nodes.filter((node) => node.role === "build" && node.startedAt)).toHaveLength(1);
  expect(result.status).toBe("failed");
});

test("fail-fast maxParallel=2 starts two but no queued third after failure", async () => {
  const started: string[] = [];
  const runner: SessionRunner = (request) => {
    if (request.agent !== "build") { return Promise.resolve({sessionID: "aggregate", text: "unused"}); }
    started.push(request.prompt);
    if (request.prompt.includes("one")) { return Promise.reject(new Error("first failure")); }
    return new Promise((resolve, reject) => { request.signal?.addEventListener("abort", () => { reject(new Error("aborted")); }, {once: true}); void resolve; });
  };
  const schedulerInstance = scheduler(2, "fail-fast", runner);
  const result = await schedulerInstance.wait("root", (await schedulerInstance.start(input([child("one"), child("two"), child("three")]))).id);
  expect(started).toHaveLength(2);
  expect(started.some((prompt) => prompt.includes("three"))).toBe(false);
  expect(result.status).toBe("failed");
});

test("successful fail-fast work uses configured parallelism", async () => {
  let active = 0;
  let maximum = 0;
  let started = 0;
  const runner: SessionRunner = async (request) => {
    if (request.agent === "build") { started++; active++; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 5)); active--; }
    return {sessionID: "session", text: "result"};
  };
  const schedulerInstance = scheduler(3, "fail-fast", runner);
  const result = await schedulerInstance.wait("root", (await schedulerInstance.start(input([child("one"), child("two"), child("three")]))).id);
  expect(started).toBe(3);
  expect(maximum).toBe(3);
  expect(result.status).toBe("completed");
});

test("collect launches every sibling despite an early failure", async () => {
  const started: string[] = [];
  const runner: SessionRunner = (request) => {
    if (request.agent === "build") { started.push(request.prompt); if (request.prompt.includes("one")) { return Promise.reject(new Error("failure")); } }
    return Promise.resolve({sessionID: "session", text: "partial"});
  };
  const schedulerInstance = scheduler(1, "collect", runner);
  const result = await schedulerInstance.wait("root", (await schedulerInstance.start(input([child("one"), child("two"), child("three")]))).id);
  expect(started).toHaveLength(3);
  expect(result.status).toBe("failed");
  expect(result.result).toBe("partial");
});
