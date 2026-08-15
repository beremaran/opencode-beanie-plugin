import { expect, test } from "bun:test";
import type { Config, Hooks, PluginInput, ToolContext, ToolResult } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { GoalsDomain } from "./index";

type Goal = {
  id: string
  sessionID: string
  status: string
  outcome: string
  constraints: string[]
  verificationCriteria: string[]
  verificationEvidence: string[]
  version: number
  createdAt: string
  updatedAt: string
  completedAt?: string
  progress?: string
  nextAction?: string
  blocker?: string
}

const input = {} as PluginInput;
const context = (sessionID: string) => ({ sessionID } as ToolContext);

const result = (value: ToolResult): Record<string, unknown> => JSON.parse(typeof value === "string" ? value : value.output) as Record<string, unknown>;

const event = (sessionID: string): { event: Event } => ({
  event: {
    type: "session.deleted",
    properties: {
      info: {
        id: sessionID, projectID: "project", directory: "/", title: "Test session", version: "1",
        time: { created: 0, updated: 0 },
      },
    },
  },
});

async function createDomain() {
  return GoalsDomain(input);
}

function tools(hooks: Hooks) {
  const registered = hooks.tool;
  if (!registered) {
    throw new Error("Goals tools were not registered");
  }
  return registered;
}

function configHook(hooks: Hooks) {
  if (!hooks.config) {
    throw new Error("Goals config hook was not registered");
  }
  return hooks.config;
}

function goalSet(hooks: Hooks) {
  const definition = tools(hooks).goal_set;
  if (!definition) {
    throw new Error("goal_set was not registered");
  }
  return definition;
}

function goalStatus(hooks: Hooks) {
  const definition = tools(hooks).goal_status;
  if (!definition) {
    throw new Error("goal_status was not registered");
  }
  return definition;
}

function goalUpdate(hooks: Hooks) {
  const definition = tools(hooks).goal_update;
  if (!definition) {
    throw new Error("goal_update was not registered");
  }
  return definition;
}

test("registers all goal tools", async () => {
  const hooks = await createDomain();
  expect(Object.keys(tools(hooks))).toEqual(["goal_set", "goal_status", "goal_update"]);
});

test("sets active goals with stable defaults and isolates sessions", async () => {
  const hooks = await createDomain();
  const set = goalSet(hooks);
  const status = goalStatus(hooks);
  const first = result(await set.execute({ outcome: "Ship it" }, context("one"))) as { goal: Goal };
  const second = result(await set.execute({
    outcome: "Ship another thing",
    constraints: ["No regressions"],
    verification: ["Run tests"],
  }, context("two"))) as { goal: Goal };

  expect(first.goal.sessionID).toBe("one");
  expect(first.goal.status).toBe("active");
  expect(first.goal.outcome).toBe("Ship it");
  expect(first.goal.version).toBe(1);
  expect(first.goal.constraints).toEqual([]);
  expect(first.goal.verificationCriteria).toEqual([]);
  expect(first.goal.verificationEvidence).toEqual([]);
  expect(first.goal.id).toBeTruthy();
  expect(first.goal.createdAt).toBeTruthy();
  expect(first.goal.updatedAt).toBeTruthy();
  expect((result(await status.execute({}, context("one"))) as { goal: Goal | null }).goal?.outcome).toBe("Ship it");
  expect(second.goal.sessionID).toBe("two");
  expect((result(await status.execute({}, context("missing"))) as { goal: Goal | null }).goal).toBeNull();
});

test("updates progress, validates lifecycle changes, and supports replacement", async () => {
  const hooks = await createDomain();
  const set = goalSet(hooks);
  const update = goalUpdate(hooks);
  const status = goalStatus(hooks);
  const session = context("lifecycle");
  await set.execute({ outcome: "Finish work" }, session);
  const progress = result(await update.execute({
  progress: "Half done", nextAction: "Write tests",
  }, session)) as { goal: Goal };
  expect(progress.goal.status).toBe("active");
  expect(progress.goal.progress).toBe("Half done");
  expect(progress.goal.nextAction).toBe("Write tests");
  const blocked = result(await update.execute({ status: "blocked", blocker: "Dependency" }, session)) as { goal: Goal };
  expect(blocked.goal.status).toBe("blocked");
  const blockedCompletion = result(await update.execute({ status: "completed", verificationEvidence: ["Not yet"] }, session)) as { error: { code: string; message: string } };
  expect(blockedCompletion.error.message).toContain("Cannot transition blocked to completed");
  await update.execute({ status: "active" }, session);
  const completedWithoutEvidence = result(await update.execute({ status: "completed" }, session)) as { error: { code: string; message: string } };
  expect(completedWithoutEvidence.error.message).toContain("verificationEvidence");
  const completed = result(await update.execute({
    status: "completed", verificationEvidence: ["Tests passed"],
  }, session)) as { goal: Goal };
  expect(completed.goal.status).toBe("completed");
  expect(completed.goal.verificationEvidence).toEqual(["Tests passed"]);
  expect(completed.goal.completedAt).toBeTruthy();
  const terminal = result(await update.execute({ progress: "late" }, session)) as { error: { code: string; message: string } };
  expect(terminal.error.message).toContain("Terminal goals");
  await set.execute({ outcome: "Replacement" }, session);
  expect((result(await status.execute({}, session)) as { goal: Goal }).goal.outcome).toBe("Replacement");
});

test("adds the goal command without replacing existing commands", async () => {
  const hooks = await createDomain();
  const existing = { description: "Existing goal command", template: "Keep this" };
  const config = { command: { help: { description: "Help", template: "Help" }, goal: existing } } as unknown as Config;
  await configHook(hooks)(config);
  expect(config.command?.help).toEqual({ description: "Help", template: "Help" });
  expect(config.command?.goal).toBe(existing);
  const freshConfig = { command: { help: { description: "Help", template: "Help" } } } as unknown as Config;
  await configHook(hooks)(freshConfig);
  expect(freshConfig.command?.help).toBeTruthy();
  expect(freshConfig.command?.goal?.template).toContain("goal tools");
});

test("recovers only the matching session and removes deleted goals", async () => {
  const hooks = await createDomain();
  const set = goalSet(hooks);
  const compact = hooks["experimental.session.compacting"];
  if (!compact) {
    throw new Error("Goals compaction hook was not registered");
  }
  const session = context("kept");
  await set.execute({ outcome: "Recover me", constraints: ["No regressions"], verification: ["Check output"] }, session);
  await goalUpdate(hooks).execute({ verificationEvidence: ["Output checked"] }, session);
  const otherOutput = { context: [] as string[] };
  await compact({ sessionID: "other" }, otherOutput);
  expect(otherOutput.context).toEqual([]);
  const matchingOutput = { context: [] as string[] };
  await compact({ sessionID: "kept" }, matchingOutput);
  expect(matchingOutput.context).toHaveLength(1);
  expect(matchingOutput.context[0]?.length).toBeLessThanOrEqual(1_500);
  expect(matchingOutput.context[0]).toContain("Recover me");
  expect(matchingOutput.context[0]).toContain("No regressions");
  expect(matchingOutput.context[0]).toContain("Output checked");
  const eventHook = hooks.event;
  if (!eventHook) {
    throw new Error("Goals event hook was not registered");
  }
  await eventHook(event("kept"));
  const status = result(await goalStatus(hooks).execute({}, session)) as { goal: Goal | null };
  expect(status.goal).toBeNull();
});

test("dispose clears process state", async () => {
  const hooks = await createDomain();
  const session = context("disposed");
  await goalSet(hooks).execute({ outcome: "Temporary" }, session);
  const dispose = hooks.dispose;
  if (!dispose) {
    throw new Error("Goals dispose hook was not registered");
  }
  await dispose();
  expect((result(await goalStatus(hooks).execute({}, session)) as { goal: Goal | null }).goal).toBeNull();
});
