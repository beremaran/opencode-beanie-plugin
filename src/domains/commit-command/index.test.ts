import { expect, test } from "bun:test";
import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";
import { CommitCommandDomain } from "./index";

const calls: Array<{ options: unknown; order: number }> = [];
let order = 0;

function input(
  shell: (options: unknown) => Promise<unknown> = () => Promise.resolve({}),
) {
  const trackedShell = async (options: unknown) => {
    calls.push({ options, order: order++ });
    return shell(options);
  };

  return {
    client: { session: { shell: trackedShell } },
  } as unknown as PluginInput;
}

async function hooksFor(value = input()) {
  calls.length = 0;
  order = 0;
  return CommitCommandDomain(value);
}

function configHook(hooks: Hooks) {
  if (!hooks.config) {
    throw new Error("missing config hook");
  }
  return hooks.config;
}

function beforeHook(hooks: Hooks) {
  if (!hooks["command.execute.before"]) {
    throw new Error("missing command hook");
  }
  return hooks["command.execute.before"];
}

async function runCommit(hooks: Hooks) {
  await configHook(hooks)({});
  await beforeHook(hooks)(
    { command: "commit", sessionID: "session-1", arguments: "--scope api" },
    { parts: [] },
  );
}

function expectedStatusCall() {
  return {
    order: 0,
    options: {
      path: { id: "session-1" },
      body: { agent: "build", command: "git status --short" },
      throwOnError: true,
    },
  };
}

function expectedContextCall() {
  return {
    order: 1,
    options: {
      path: { id: "session-1" },
      body: {
        agent: "build",
        command: "git diff --stat && git diff --check && git log -10 --oneline",
      },
      throwOnError: true,
    },
  };
}

test("registers commit on a fresh config and preserves unrelated commands", async () => {
  const hooks = await hooksFor();
  const config = {
    command: { help: { template: "help" } },
  } as unknown as Config;
  await configHook(hooks)(config);

  expect(config.command?.help?.template).toBe("help");
  expect(config.command?.commit?.description).toContain("verified");
  expect(config.command?.commit?.agent).toBe("build");
});

test("preserves a user-defined commit command", async () => {
  const hooks = await hooksFor();
  const existing = { description: "Keep me", template: "custom" };
  const config = {
    command: { commit: existing, other: { template: "other" } },
  } as unknown as Config;
  await configHook(hooks)(config);

  expect(config.command?.commit).toBe(existing);
  expect(config.command?.other?.template).toBe("other");
});

test("does not intercept a preserved user-defined commit command", async () => {
  const hooks = await hooksFor();
  const config = {
    command: { commit: { template: "custom" } },
  } as unknown as Config;
  await configHook(hooks)(config);

  await beforeHook(hooks)(
    { command: "commit", sessionID: "session", arguments: "" },
    { parts: [] },
  );
  expect(calls).toEqual([]);
});

test("prompt contains the safe commit workflow and arguments placeholder", async () => {
  const hooks = await hooksFor();
  const config = {} as Config;
  await configHook(hooks)(config);
  const prompt = config.command?.commit?.template ?? "";

  for (const phrase of [
    "logical, focused groupings",
    "git add .",
    "git add -A",
    "80%",
    "Conventional Commits",
    "make commit",
    "bun run commit",
    "$ARGUMENTS",
    "untrusted data",
  ]) {
    expect(prompt).toContain(phrase);
  }
});

test("unrelated commands are a no-op", async () => {
  const hooks = await hooksFor();
  await beforeHook(hooks)(
    { command: "status", sessionID: "session", arguments: "" },
    { parts: [] },
  );
  expect(calls).toEqual([]);
});

test("exact commit gathers sequential context with fixed commands", async () => {
  const hooks = await hooksFor();
  await runCommit(hooks);

  expect(calls).toEqual([expectedStatusCall(), expectedContextCall()]);
});

test("arguments are never interpolated into shell commands", async () => {
  const hooks = await hooksFor();
  await configHook(hooks)({});
  await beforeHook(hooks)(
    { command: "commit", sessionID: "session", arguments: "$(touch unsafe)" },
    { parts: [] },
  );

  expect(
    calls.every(
      ({ options }) => !JSON.stringify(options).includes("$(touch unsafe)"),
    ),
  ).toBe(true);
});
