import {expect, test} from "bun:test";
import {createOrchestrationTools, createOrchestratorJob, orchestrationReadOutputLimit, parseOrchestratorConfig, type OrchestratorConfig, type OrchestratorJob, type Scheduler} from "./index";

const config = (): OrchestratorConfig => {
  const result = parseOrchestratorConfig({manager: {fanOut: 1}, limits: {maxPromptChars: 500, maxResultChars: 5, maxNodes: 4}});
  if (!result.ok) { throw new Error(result.errors.join(" ")); }
  return result.value;
};

const child = {title: "child", objective: "objective", constraints: ["safe"], verification: ["test"]};
const context = {sessionID: "session-a"};
const call = async (tool: unknown, args: unknown, sessionID = context.sessionID) => (tool as {execute: (value: unknown, context: {sessionID: string}) => Promise<string>}).execute(args, {sessionID});
type Response = {ok?: boolean; error?: {code: string}; jobs?: readonly unknown[]; counts?: {byRole: Record<string, number>; byStatus: Record<string, number>; byDepth: Record<string, number>}; job?: {result?: string; error?: string; truncated?: boolean; leaves?: readonly {result?: string}[]}};
const decode = (value: string): Response => {
  const parsed: unknown = JSON.parse(value);
  return (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as Response;
};

function job(sessionID: string, status: OrchestratorJob["status"] = "completed"): OrchestratorJob {
  let nextID = 0;
  const result = createOrchestratorJob(sessionID, "objective", "title", [], [], config(), {children: [child]}, {id: (kind) => kind === "job" ? "job-1" : `node-${String(nextID++)}`, now: () => "now"});
  if (!result.ok) { throw new Error(result.errors.join(" ")); }
  return {...result.job, status, result: "result-too-long", error: "error-too-long", graph: {...result.job.graph, nodes: result.job.graph.nodes.map((node) => ({...node, result: "result-too-long", error: "error-too-long"}))}};
}

function scheduler(jobs: readonly OrchestratorJob[], hooks: {start?: (input: unknown) => void; cancel?: () => void} = {}): Scheduler {
  return {start: (input) => { hooks.start?.(input); return Promise.resolve({id: "job-1", rootSessionID: input.rootSessionID, title: input.title, status: "registered", createdAt: "now"}); }, read: (sessionID, id) => Promise.resolve(jobs.find((item) => item.rootSessionID === sessionID && item.id === id)), list: (sessionID) => Promise.resolve(jobs.filter((item) => item.rootSessionID === sessionID)), wait: () => Promise.resolve(jobs[0] as OrchestratorJob), cancel: () => { hooks.cancel?.(); return Promise.resolve(); }, dispose: () => Promise.resolve()};
}

test("schema/runtime validation rejects empty and invalid manager input", async () => {
  const tools = createOrchestrationTools({scheduler: scheduler([]), config: config()});
  const result = decode(await call(tools.orchestration_start, {title: "", objective: "x", constraints: [], verification: [], manager: {children: [child]}}));
  expect(result.error?.code).toBe("invalid_input");
  const invalid = decode(await call(tools.orchestration_start, {title: "title", objective: "objective", constraints: [], verification: [], manager: {children: []}}));
  expect(invalid.error?.code).toBe("invalid_input");
  const aggregate = decode(await call(tools.orchestration_start, {title: "title", objective: "objective", constraints: ["x".repeat(500)], verification: [], manager: {children: [child]}}));
  expect(aggregate.error?.code).toBe("invalid_input");
});

test("start maps the exact manager decomposition and callback runs after start", async () => {
  const events: string[] = [];
  let received: unknown;
  const tools = createOrchestrationTools({scheduler: scheduler([], {start: (input) => { received = input; events.push("persisted"); }}), config: config(), onStarted: () => { events.push("callback"); }});
  const result = decode(await call(tools.orchestration_start, {title: "title", objective: "objective", constraints: [], verification: [], manager: {children: [child]}}));
  expect(result.ok).toBe(true);
  expect(received).toMatchObject({rootSessionID: "session-a", title: "title", objective: "objective", manager: {children: [child]}});
  expect(events).toEqual(["persisted", "callback"]);
});

test("status and read are session-scoped and bounded", async () => {
  const tools = createOrchestrationTools({scheduler: scheduler([job("session-a")]), config: config()});
  const status = decode(await call(tools.orchestration_status, {}));
  expect(status.jobs).toHaveLength(1);
  expect(status.counts?.byRole.manager).toBe(1);
  expect(status.counts?.byStatus.registered).toBe(2);
  expect(status.counts?.byDepth["1"]).toBe(1);
  const missing = decode(await call(tools.orchestration_read, {jobID: "job-1"}, "session-b"));
  expect(missing.error?.code).toBe("not_found");
  const read = decode(await call(tools.orchestration_read, {jobID: "job-1"}));
  expect(read.job?.result).toBe("re");
  expect(read.job?.error).toBe("err");
  expect(read.job?.leaves?.[0]?.result).toBe("resul");
});

test("status sorts newest first, caps jobs, and counts every scoped job", async () => {
  const jobs = ["1", "3", "2"].map((id, index) => ({...job("session-a"), id: `job-${id}`, createdAt: `2026-01-0${String(index + 1)}`}));
  const limited = {...config(), limits: {...config().limits, maxNodes: 2}};
  const tools = createOrchestrationTools({scheduler: scheduler(jobs), config: limited});
  const result = decode(await call(tools.orchestration_status, {}));
  expect(result.jobs?.map((item) => (item as {id: string}).id)).toEqual(["job-2", "job-3"]);
  expect(result.counts?.byRole.manager).toBe(3);
});

test("read bounds the serialized envelope and marks omitted leaf data", async () => {
  const source = job("session-a");
  const template = source.graph.nodes.find((node) => node.role === "build");
  if (!template) { throw new Error("missing leaf fixture"); }
  const nodes = Array.from({length: 100}, (_, index) => ({...template, id: `leaf-${String(index)}`, layer: index + 1, title: "t".repeat(1000), verification: ["v".repeat(1000)], result: "r".repeat(10000)}));
  const oversized = {...source, graph: {nodes: [...source.graph.nodes, ...nodes], edges: source.graph.edges}};
  const small = {...config(), limits: {...config().limits, maxPromptChars: 20, maxResultChars: 10, maxNodes: 100}};
  const tools = createOrchestrationTools({scheduler: scheduler([oversized]), config: small});
  const value = await call(tools.orchestration_read, {jobID: "job-1"});
  const serialized = JSON.parse(value) as string;
  expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(orchestrationReadOutputLimit(small));
  expect(serialized).toContain('"truncated":true');
});

test("terminal cancel is idempotent and caller failures use envelopes", async () => {
  let cancelled = false;
  const tools = createOrchestrationTools({scheduler: scheduler([job("session-a")], {cancel: () => { cancelled = true; }}), config: config(), onStarted: () => Promise.reject(new Error("notification"))});
  const result = decode(await call(tools.orchestration_cancel, {jobID: "job-1"}));
  expect(result.ok).toBe(true);
  expect(cancelled).toBe(false);
  const missing = decode(await call(tools.orchestration_cancel, {jobID: "missing"}));
  expect(missing.ok).toBe(false);
  expect(missing.error?.code).toBe("not_found");
});

test("a never-resolving notification callback cannot delay start", async () => {
  const tools = createOrchestrationTools({scheduler: scheduler([]), config: config(), onStarted: () => {
    return new Promise<void>(() => undefined);
  }});
  const result = await Promise.race([call(tools.orchestration_start, {title: "title", objective: "objective", constraints: [], verification: [], manager: {children: [child]}}), new Promise<string>((resolve) => setTimeout(() => { resolve("timeout"); }, 20))]);
  expect(result).not.toBe("timeout");
});
