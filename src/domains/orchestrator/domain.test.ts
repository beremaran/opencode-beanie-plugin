import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import type {PluginInput, ToolContext} from "@opencode-ai/plugin";
import {OrchestratorDomain} from "./domain";
import {derivedOrchestratorArtifactBytes} from "./budget";
import {notificationTimeoutMs} from "./notification";

const options = {orchestrator: {enabled: true, manager: {agent: "manager", model: "provider/manager", fanOut: 1}, build: {agent: "build", model: "provider/build", maxParallel: 1}}};

function fakeClient(promptAsync: (input: unknown) => Promise<void> = () => Promise.resolve(), prompt = (request?: unknown) => {
  void request;
  return Promise.resolve({data: {info: {role: "assistant"}, parts: [{type: "text", text: "result"}]}});
}, log?: (input: unknown) => Promise<void>) {
  return {
    session: {
      create: () => Promise.resolve({data: {id: "child"}}),
      prompt,
      delete: () => Promise.resolve({data: true}),
      promptAsync,
    },
    ...(log ? {app: {log}} : {}),
  };
}

async function input(client = fakeClient()) {
  const worktree = await mkdtemp(`${tmpdir()}/beanie-orchestrator-`);
  return {worktree, value: {client, worktree, project: {id: "project"}} as unknown as PluginInput};
}

test("is inactive unless orchestrator is explicitly configured", async () => {
  const {value} = await input();
  expect(await OrchestratorDomain(value)).toEqual({});
  expect(await OrchestratorDomain(value, {orchestrator: {enabled: false}})).toEqual({});
});

test("rejects invalid opt-in configuration and missing startup context", async () => {
  const {value} = await input();
  expect(OrchestratorDomain(value, {orchestrator: {unknown: true}})).rejects.toThrow("invalid configuration");
  const missing = {...value, worktree: "relative"};
  expect(OrchestratorDomain(missing, options)).rejects.toThrow("absolute worktree");
});

test("registers tools, config mutation, and bounded compaction", async () => {
  const {value, worktree} = await input();
  const hooks = await OrchestratorDomain(value, options);
  expect(Object.keys(hooks.tool ?? {})).toEqual(["orchestration_start", "orchestration_status", "orchestration_read", "orchestration_cancel"]);
  const config = {};
  await hooks.config?.(config);
  expect(config).toMatchObject({agent: {manager: {model: "provider/manager"}}, command: {orchestrate: {agent: "manager"}}});
  const output = {context: [] as string[]};
  await hooks["experimental.session.compacting"]?.({sessionID: "root"}, output);
  expect(output.context[0]).toContain("orchestration_read");
  expect(output.context[0]).not.toContain("provider/build");
  const parsed = JSON.parse(output.context[0] ?? "") as {jobs: unknown[]; truncated: boolean; hint: string};
  expect(parsed).toMatchObject({jobs: [], truncated: false});
  expect(parsed.hint).toContain("orchestration_read");
  await hooks.dispose?.();
  await rm(worktree, {recursive: true, force: true});
});

test("notifies the originating session with a bounded marker and no result", async () => {
  const notifications: unknown[] = [];
  const {value, worktree} = await input(fakeClient((request) => {
    notifications.push(request);
    return Promise.resolve();
  }));
  const hooks = await OrchestratorDomain(value, options);
  const start = hooks.tool?.orchestration_start;
  if (!start) {throw new Error("orchestration_start was not registered");}
  await start.execute({title: "title", objective: "objective", constraints: [], verification: [], manager: {children: [{title: "child", objective: "work", constraints: [], verification: []}]}}, {sessionID: "root"} as ToolContext);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(JSON.stringify(notifications)).toContain("orchestration_read");
  expect(JSON.stringify(notifications)).toContain("status=completed");
  expect(JSON.stringify(notifications)).not.toContain("result");
  const request = notifications[0] as {body: {noReply?: boolean; parts: [{type: string; text: string}]}; signal: AbortSignal};
  expect(request.body.noReply).toBeUndefined();
  expect(request.body.parts[0].type).toBe("text");
  expect(request.signal).toBeInstanceOf(AbortSignal);
  expect(request).toMatchObject({path: {id: "root"}, query: {directory: worktree}, throwOnError: true});
  await hooks.dispose?.();
  await rm(worktree, {recursive: true, force: true});
});

test("isolates notification failure and cancels jobs when the root session is deleted", async () => {
  const logs: unknown[] = [];
  const completed = await input(fakeClient(() => Promise.reject(new Error("notification unavailable")), undefined, (request) => {
    logs.push(request);
    return Promise.resolve();
  }));
  const completedHooks = await OrchestratorDomain(completed.value, options);
  const completedStart = completedHooks.tool?.orchestration_start;
  if (!completedStart) {throw new Error("orchestration_start was not registered");}
  await completedStart.execute({title: "title", objective: "objective", constraints: [], verification: [], manager: {children: [{title: "child", objective: "work", constraints: [], verification: []}]}}, {sessionID: "root"} as ToolContext);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({body: {message: "orchestration notification failed", extra: {status: "completed"}}});
  expect(JSON.stringify(logs[0])).not.toContain("notification unavailable");
  await completedHooks.dispose?.();
  await rm(completed.worktree, {recursive: true, force: true});

  const notifications: unknown[] = [];
  const pending = (request: unknown) => new Promise<never>((_resolve, reject) => {
    const signal = (request as {signal: AbortSignal}).signal;
    if (signal.aborted) {reject(new Error("aborted")); return;}
    signal.addEventListener("abort", () => {reject(new Error("aborted"));}, {once: true});
  });
  const {value, worktree} = await input(fakeClient((request) => {
    notifications.push(request);
    return Promise.resolve();
  }, pending));
  const hooks = await OrchestratorDomain(value, options);
  const start = hooks.tool?.orchestration_start;
  if (!start) {throw new Error("orchestration_start was not registered");}
  const result = await start.execute({title: "title", objective: "objective", constraints: [], verification: [], manager: {children: [{title: "child", objective: "work", constraints: [], verification: []}]}}, {sessionID: "root"} as ToolContext);
  const raw = typeof result === "string" ? result : result.output;
  const jobID = (JSON.parse(raw) as {job: {id: string}}).job.id;
  await hooks.event?.({event: {type: "session.deleted", properties: {info: {id: "root"}}} as never});
  const status = await hooks.tool?.orchestration_status?.execute({}, {sessionID: "root"} as ToolContext);
  expect(status).toContain(jobID);
  expect(status).toContain("cancelled");
  expect(notifications).toHaveLength(0);
  await hooks.dispose?.();
  await rm(worktree, {recursive: true, force: true});
});

test("compaction is ordered, capped, and valid JSON within its bound", async () => {
  const boundedOptions = {orchestrator: {...options.orchestrator, limits: {maxNodes: 2, maxPromptChars: 220}}};
  const {value, worktree} = await input();
  const hooks = await OrchestratorDomain(value, boundedOptions);
  const start = hooks.tool?.orchestration_start;
  if (!start) {throw new Error("orchestration_start was not registered");}
  for (let index = 0; index < 3; index += 1) {
    await start.execute({title: `title-${String(index)}`, objective: "objective", constraints: [], verification: [], manager: {children: [{title: "child", objective: "work", constraints: [], verification: []}]}}, {sessionID: "root"} as ToolContext);
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  const first = {context: [] as string[]};
  const second = {context: [] as string[]};
  await hooks["experimental.session.compacting"]?.({sessionID: "root"}, first);
  await hooks["experimental.session.compacting"]?.({sessionID: "root"}, second);
  expect(first.context[0]).toBe(second.context[0]);
  expect(first.context[0]?.length).toBeLessThanOrEqual(220);
  expect(JSON.parse(first.context[0] ?? "")).toMatchObject({truncated: true});
  await hooks.dispose?.();
  await rm(worktree, {recursive: true, force: true});
});

test("does not notify after disposal", async () => {
  const notifications: unknown[] = [];
  const {value, worktree} = await input(fakeClient((request) => {
    notifications.push(request);
    return Promise.resolve();
  }));
  const hooks = await OrchestratorDomain(value, options);
  const start = hooks.tool?.orchestration_start;
  if (!start) {throw new Error("orchestration_start was not registered");}
  await start.execute({title: "title", objective: "objective", constraints: [], verification: [], manager: {children: [{title: "child", objective: "work", constraints: [], verification: []}]}}, {sessionID: "root"} as ToolContext);
  await hooks.dispose?.();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(notifications).toHaveLength(0);
  await rm(worktree, {recursive: true, force: true});
});

test("bounds notification timeout to five seconds and configured duration", () => {
  expect(notificationTimeoutMs(60_000)).toBe(5_000);
  expect(notificationTimeoutMs(3)).toBe(3);
});

test("derives a deterministic bounded artifact budget", () => {
  const config = {enabled: true, manager: {agent: "manager", model: "provider/manager", fanOut: 1}, coordinators: [], build: {agent: "build", model: "provider/build", maxParallel: 1}, fanOutMode: "exact" as const, failurePolicy: "fail-fast" as const, limits: {maxNodes: 64, maxDurationMs: 100, maxCoordinatorAttempts: 2, maxPromptChars: 48000, maxResultChars: 12000}};
  const first = derivedOrchestratorArtifactBytes(config);
  expect(first).toBe(derivedOrchestratorArtifactBytes({...config}));
  expect(first).toBeGreaterThan(20 * 1024 * 1024);
  expect(first).toBeLessThan(64 * 1024 * 1024);
  expect(Number.isSafeInteger(first)).toBe(true);
});
