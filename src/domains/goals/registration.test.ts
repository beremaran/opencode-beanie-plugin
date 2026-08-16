import {expect, test} from "bun:test";
import type {Config} from "@opencode-ai/plugin";
import {configHook, context, createDomain, goalSet, goalStatus, result, tools, type Goal} from "./test-helpers";

test("registers all goal tools", async () => {
    const hooks = await createDomain();
    expect(Object.keys(tools(hooks))).toEqual(["goal_set", "goal_status", "goal_update"]);
});

test("sets active goals with stable defaults", async () => {
    const hooks = await createDomain();
    const set = goalSet(hooks);
    const first = result(await set.execute({outcome: "Ship it"}, context("one"))) as {goal: Goal};

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
});

test("isolates goals between sessions", async () => {
    const hooks = await createDomain();
    const set = goalSet(hooks);
    const status = goalStatus(hooks);
    await set.execute({outcome: "Ship it"}, context("one"));
    const second = result(await set.execute({
        outcome: "Ship another thing",
        constraints: ["No regressions"],
        verification: ["Run tests"],
    }, context("two"))) as {goal: Goal};

    expect((result(await status.execute({}, context("one"))) as {goal: Goal | null}).goal?.outcome).toBe("Ship it");
    expect(second.goal.sessionID).toBe("two");
    expect((result(await status.execute({}, context("missing"))) as {goal: Goal | null}).goal).toBeNull();
});

test("adds the goal command without replacing existing commands", async () => {
    const hooks = await createDomain();
    const existing = {description: "Existing goal command", template: "Keep this"};
    const config = {command: {help: {description: "Help", template: "Help"}, goal: existing}} as unknown as Config;
    await configHook(hooks)(config);
    expect(config.command?.help).toEqual({description: "Help", template: "Help"});
    expect(config.command?.goal).toBe(existing);
    const freshConfig = {command: {help: {description: "Help", template: "Help"}}} as unknown as Config;
    await configHook(hooks)(freshConfig);
    expect(freshConfig.command?.help).toBeTruthy();
    expect(freshConfig.command?.goal?.template).toContain("goal tools");
});
