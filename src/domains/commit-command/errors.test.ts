import { expect, test } from "bun:test";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { AssistantMessage } from "@opencode-ai/sdk";
import { CommitCommandDomain } from "./index";

const calls: unknown[] = [];

function input(shell: (options: unknown) => Promise<unknown>) {
  const trackedShell = async (options: unknown) => {
    calls.push(options);
    return shell(options);
  };

  return {
    client: { session: { shell: trackedShell } },
  } as unknown as PluginInput;
}

async function setup(shell: (options: unknown) => Promise<unknown>) {
  calls.length = 0;
  const hooks = await CommitCommandDomain(input(shell));
  await hooks.config?.({});
  return hooks;
}

function beforeHook(hooks: Hooks) {
  if (!hooks["command.execute.before"]) {
    throw new Error("missing command hook");
  }

  return hooks["command.execute.before"];
}

function commitInvocation(hooks: Hooks) {
  return beforeHook(hooks)(
    { command: "commit", sessionID: "session", arguments: "" },
    { parts: [] },
  );
}

async function assertContextError(invocation: Promise<void>) {
  expect(invocation).rejects.toThrow(
    "Commit context gathering failed: shell request returned an error",
  );
  await invocation.catch(() => undefined);
  expect(calls).toHaveLength(1);
}

function failedMessage(): AssistantMessage {
  return {
    id: "message",
    sessionID: "session",
    role: "assistant",
    time: { created: 0 },
    parentID: "parent",
    modelID: "model",
    providerID: "provider",
    mode: "build",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    error: { name: "UnknownError", data: { message: "command failed" } },
  };
}

test("surfaces shell rejection and does not proceed", async () => {
  const hooks = await setup(() =>
    Promise.reject(new Error("shell unavailable")),
  );
  const invocation = beforeHook(hooks)(
    { command: "commit", sessionID: "session", arguments: "" },
    { parts: [] },
  );

  expect(invocation).rejects.toThrow(
    "Commit context gathering failed: shell unavailable",
  );
});

test("surfaces a resolved SDK error envelope and stops before the second call", async () => {
  const hooks = await setup(() =>
    Promise.resolve({
      error: {
        name: "BadRequest",
        data: { message: "HTTP failed" },
      },
    }),
  );
  await assertContextError(commitInvocation(hooks));
});

test("surfaces an AssistantMessage error without an execution status assumption", async () => {
  const hooks = await setup(() => Promise.resolve({ data: failedMessage() }));

  await assertContextError(commitInvocation(hooks));
});
