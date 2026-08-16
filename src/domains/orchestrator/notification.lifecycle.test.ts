import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import type {PluginInput, ToolContext} from "@opencode-ai/plugin";
import {OrchestratorDomain} from "./domain";

const baseOptions = {enabled: true, manager: {agent: "manager", model: "provider/manager", fanOut: 1}, build: {agent: "build", model: "provider/build", maxParallel: 1}};

function client(promptAsync: (input: unknown) => Promise<void>, log: unknown[] = [], appLog: (request: unknown) => Promise<unknown> = (request) => {log.push(request); return Promise.resolve({});}) {
  return {session: {
    create: () => Promise.resolve({data: {id: "child"}}),
    prompt: () => Promise.resolve({data: {info: {role: "assistant"}, parts: [{type: "text", text: "result"}]}}),
    delete: () => Promise.resolve({data: true}), promptAsync,
  }, app: {log: appLog}};
}

async function setup(promptAsync: (input: unknown) => Promise<void>, maxDurationMs = 5, appLog?: (request: unknown) => Promise<unknown>) {
  const worktree = await mkdtemp(`${tmpdir()}/beanie-notification-`);
  const logs: unknown[] = [];
  const value = {client: client(promptAsync, logs, appLog), worktree, project: {id: "project"}} as unknown as PluginInput;
  const hooks = await OrchestratorDomain(value, {orchestrator: {...baseOptions, limits: {maxDurationMs}}});
  return {hooks, worktree, logs};
}

const start = async (hooks: Awaited<ReturnType<typeof OrchestratorDomain>>) => {
  const tool = hooks.tool?.orchestration_start;
  if (!tool) {throw new Error("orchestration_start was not registered");}
  await tool.execute({title: "title", objective: "objective", constraints: [], verification: [], manager: {children: [{title: "child", objective: "work", constraints: [], verification: []}]}}, {sessionID: "root"} as ToolContext);
};

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("times out ignored promptAsync and handles its late rejection", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {unhandled.push(reason);};
  process.on("unhandledRejection", onUnhandled);
  const {hooks, worktree, logs} = await setup(() => new Promise<void>((_resolve, reject) => {setTimeout(() => {reject(new Error("late"));}, 30);}));
  try {
    await start(hooks);
    await pause(60);
    expect(logs).toHaveLength(1);
    const status = (logs[0] as {body: {extra: {status: string}}}).body.extra.status;
    expect(["completed", "timeout"]).toContain(status);
    expect(unhandled).toHaveLength(0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    await hooks.dispose?.();
    await rm(worktree, {recursive: true, force: true});
  }
});

test("aborts an in-flight notification on session deletion without logging", async () => {
  let signal: AbortSignal | undefined;
  const {hooks, worktree, logs} = await setup((request) => {
    signal = (request as {signal: AbortSignal}).signal;
    return new Promise<void>(() => {});
  }, 5_000);
  try {
    await start(hooks);
    await pause(20);
    await hooks.event?.({event: {type: "session.deleted", properties: {info: {id: "root"}}} as never});
    expect(signal?.aborted).toBe(true);
    expect(logs).toHaveLength(0);
  } finally {
    await hooks.dispose?.();
    await rm(worktree, {recursive: true, force: true});
  }
});

test("aborts in-flight notification before disposal settles", async () => {
  let signal: AbortSignal | undefined;
  const {hooks, worktree} = await setup((request) => {
    signal = (request as {signal: AbortSignal}).signal;
    return new Promise<void>(() => {});
  }, 5_000);
  try {
    await start(hooks);
    await pause(20);
    await Promise.race([hooks.dispose?.() ?? Promise.resolve(), pause(100).then(() => {throw new Error("dispose timed out");})]);
    expect(signal?.aborted).toBe(true);
  } finally {
    await hooks.dispose?.();
    await rm(worktree, {recursive: true, force: true});
  }
});

test("does not await a never-resolving app.log during disposal", async () => {
  const neverLog = () => new Promise<unknown>(() => {});
  const {hooks, worktree} = await setup(() => Promise.reject(new Error("notification failed")), 20, neverLog);
  try {
    await start(hooks);
    await pause(30);
    await Promise.race([hooks.dispose?.() ?? Promise.resolve(), pause(100).then(() => {throw new Error("dispose timed out");})]);
  } finally {
    await hooks.dispose?.();
    await rm(worktree, {recursive: true, force: true});
  }
});
