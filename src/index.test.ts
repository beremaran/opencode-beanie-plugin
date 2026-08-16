import {expect, test} from "bun:test";
import type {Config, PluginInput, ToolContext} from "@opencode-ai/plugin";
import BeaniePlugin from "./index";

test("aggregates registered domain hooks", async () => {
    const hooks = await BeaniePlugin({} as PluginInput);

    expect(hooks.tool?.goal_set).toBeDefined();
    expect(hooks.tool?.goal_status).toBeDefined();
    expect(hooks.tool?.goal_update).toBeDefined();
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
    expect(hooks.event).toBeDefined();
});

test("runs both domain config hooks", async () => {
    const hooks = await BeaniePlugin({} as PluginInput);
    const config = {} as Config;

    await hooks.config?.(config);

    expect(config.command?.goal?.template).toContain("goal tools");
    expect(config.agent?.title?.disable).toBe(true);
});

const deletedEvent = (sessionID: string) => ({
    event: {
        type: "session.deleted" as const,
        properties: {
            info: {
                id: sessionID, projectID: "project", directory: "/", title: "Test", version: "1",
                time: {created: 0, updated: 0},
            },
        },
    },
});

test("composes domain event and dispose hooks", async () => {
    const hooks = await BeaniePlugin({} as PluginInput);
    const event = hooks.event;
    const dispose = hooks.dispose;

    if (!event || !dispose || !hooks.tool || !hooks.tool.goal_set || !hooks.tool.goal_status) {
        throw new Error("Expected composed hooks and goal tools");
    }

    const context = {sessionID: "composed"} as ToolContext;
    await hooks.tool.goal_set.execute({outcome: "Keep"}, context);
    await event(deletedEvent("composed"));

    const status = await hooks.tool.goal_status.execute({}, context);
    expect(status).toContain('"goal":null');
    await dispose();
});
