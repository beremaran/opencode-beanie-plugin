import { expect, test } from "bun:test";
import type {
  Config,
  Hooks,
  PluginInput,
  ToolContext,
} from "@opencode-ai/plugin";
import BeaniePlugin, { composeCommandHooks } from "./index";

test("aggregates registered domain hooks", async () => {
  const hooks = await BeaniePlugin({} as PluginInput);

  expect(hooks.tool?.goal_set).toBeDefined();
  expect(hooks.tool?.goal_status).toBeDefined();
  expect(hooks.tool?.goal_update).toBeDefined();
  expect(hooks["tool.execute.before"]).toBeDefined();
  expect(hooks["tool.execute.after"]).toBeDefined();
  expect(hooks["command.execute.before"]).toBeDefined();
  expect(hooks.event).toBeDefined();
});

function rootInput(commands: string[]) {
  return {
    client: {
      session: {
        shell: ({ body }: { body: { command: string } }) => {
          commands.push(body.command);
          return Promise.resolve({});
        },
      },
    },
  } as unknown as PluginInput;
}

test("composes the root command hook with commit behavior", async () => {
  const commands: string[] = [];
  const hooks = await BeaniePlugin(rootInput(commands));
  const commandHook = hooks["command.execute.before"];
  await hooks.config?.({});

  if (!commandHook) {
    throw new Error("Expected composed command hook");
  }

  await runCommitCommand(commandHook, commands);
});

async function runCommitCommand(
  commandHook: NonNullable<Hooks["command.execute.before"]>,
  commands: string[],
) {
  await commandHook(
    { command: "commit", sessionID: "root", arguments: "" },
    { parts: [] },
  );

  expect(commands).toEqual([
    "git status --short",
    "git diff --stat && git diff --check && git log -10 --oneline",
  ]);
}

function commandHooks(output: string[]): Hooks[] {
  return [
    {
      "command.execute.before": async () => {
        await Promise.resolve();
        output.push("first");
      },
    },
    {
      "command.execute.before": async () => {
        await Promise.resolve();
        output.push("second");
      },
    },
  ];
}

test("composes multiple command hooks sequentially with shared output", async () => {
  const output: string[] = [];
  const commandHook = composeCommandHooks(commandHooks(output));

  if (!commandHook) {
    throw new Error("Expected composed command hook");
  }

  await runCommandHooks(commandHook, output);
});

async function runCommandHooks(
  commandHook: NonNullable<Hooks["command.execute.before"]>,
  output: string[],
) {
  await commandHook(
    { command: "status", sessionID: "test", arguments: "" },
    { parts: [] },
  );

  expect(output).toEqual(["first", "second"]);
}

test("runs both domain config hooks", async () => {
  const hooks = await BeaniePlugin({} as PluginInput);
  const config = {} as Config;

  await hooks.config?.(config);

  expect(config.command?.commit).toBeDefined();
  expect(config.command?.goal?.template).toContain("goal tools");
  expect(config.agent?.title?.disable).toBe(true);
});

const deletedEvent = (sessionID: string) => ({
  event: {
    type: "session.deleted" as const,
    properties: {
      info: {
        id: sessionID,
        projectID: "project",
        directory: "/",
        title: "Test",
        version: "1",
        time: { created: 0, updated: 0 },
      },
    },
  },
});

function requiredLifecycleHooks(hooks: Hooks) {
  if (
    !hooks.event ||
    !hooks.dispose ||
    !hooks.tool?.goal_set ||
    !hooks.tool.goal_status
  ) {
    throw new Error("Expected composed hooks and goal tools");
  }

  return {
    event: hooks.event,
    dispose: hooks.dispose,
    goalSet: hooks.tool.goal_set,
    goalStatus: hooks.tool.goal_status,
  };
}

test("composes domain event and dispose hooks", async () => {
  const hooks = await BeaniePlugin({} as PluginInput);
  const { event, dispose, goalSet, goalStatus } = requiredLifecycleHooks(hooks);

  const context = { sessionID: "composed" } as ToolContext;
  await goalSet.execute({ outcome: "Keep" }, context);
  await event(deletedEvent("composed"));

  const status = await goalStatus.execute({}, context);
  expect(status).toContain('"goal":null');
  await dispose();
});
