import {expect, test} from "bun:test";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDomainAt, eventHook, goalSet, goalStatus, mockClient, result, type Goal} from "./test-helpers";

test("completes active goal on idle when evaluator marks complete", async () => {
    const mock = mockClient();
    mock.client.session.messages = (() => Promise.resolve({
        data: [
            {info: {id: "msg-1", role: "assistant", time: {created: Date.now() + 1000}, tokens: {input: 100, output: 50, reasoning: 0}}, parts: [{type: "text", text: "Finished"}]},
        ],
    })) as never;
    mock.client.session.prompt = (() => Promise.resolve({
        data: {parts: [{type: "text", text: '{"complete": true, "reason": "All tasks verified"}'}]},
    })) as never;

    const stateRoot = await mkdtemp(join(tmpdir(), "beanie-goals-idle-"));
    const hooks = await createDomainAt(stateRoot, undefined, mock.client);
    await goalSet(hooks).execute({outcome: "Build app"}, {sessionID: "idle-session"} as never);

    const onEvent = eventHook(hooks);
    await onEvent({event: {type: "session.idle", properties: {sessionID: "idle-session"}} as never});

    const status = result(await goalStatus(hooks).execute({}, {sessionID: "idle-session"} as never)) as {goal: Goal};
    expect(status.goal.status).toBe("completed");
    expect(status.goal.lastReason).toBe("All tasks verified");
    expect(status.goal.completedAt).toBeDefined();
    expect(mock.toasts.some((t) => t.variant === "success" && t.message.includes("Goal complete"))).toBe(true);
});

test("continues active goal and sends promptAsync when incomplete", async () => {
    const mock = mockClient();
    mock.client.session.messages = (() => Promise.resolve({
        data: [
            {info: {id: "msg-1", role: "assistant", time: {created: Date.now() + 1000}}, parts: [{type: "text", text: "In progress"}]},
        ],
    })) as never;
    mock.client.session.prompt = (() => Promise.resolve({
        data: {parts: [{type: "text", text: '{"complete": false, "reason": "Need more tests"}'}]},
    })) as never;

    const stateRoot = await mkdtemp(join(tmpdir(), "beanie-goals-idle-"));
    const hooks = await createDomainAt(stateRoot, undefined, mock.client);
    await goalSet(hooks).execute({outcome: "Build app"}, {sessionID: "idle-session"} as never);

    const onEvent = eventHook(hooks);
    await onEvent({event: {type: "session.idle", properties: {sessionID: "idle-session"}} as never});

    const status = result(await goalStatus(hooks).execute({}, {sessionID: "idle-session"} as never)) as {goal: Goal};
    expect(status.goal.status).toBe("active");
    expect(status.goal.lastReason).toBe("Need more tests");
    expect(mock.prompted.some((p) => p.sessionId === "idle-session")).toBe(true);
});

test("enforces token and turn limits on idle", async () => {
    const mock = mockClient();
    mock.client.session.messages = (() => Promise.resolve({
        data: [
            {info: {id: "msg-1", role: "assistant", time: {created: Date.now() + 1000}, tokens: {input: 500, output: 600, reasoning: 0}}, parts: [{type: "text", text: "Working"}]},
        ],
    })) as never;
    mock.client.session.prompt = (() => Promise.resolve({
        data: {parts: [{type: "text", text: '{"complete": false, "reason": "Still going"}'}]},
    })) as never;

    const stateRoot = await mkdtemp(join(tmpdir(), "beanie-goals-idle-"));
    const hooks = await createDomainAt(stateRoot, undefined, mock.client);
    await goalSet(hooks).execute({outcome: "Build app", tokenBudget: 1000}, {sessionID: "budget-session"} as never);

    const onEvent = eventHook(hooks);
    await onEvent({event: {type: "session.idle", properties: {sessionID: "budget-session"}} as never});

    const status = result(await goalStatus(hooks).execute({}, {sessionID: "budget-session"} as never)) as {goal: Goal};
    expect(status.goal.status).toBe("budget_limited");
    expect(mock.toasts.some((t) => t.variant === "warning" && t.message.includes("token budget"))).toBe(true);
});

test("pauses active goal on MessageAbortedError", async () => {
    const mock = mockClient();
    const stateRoot = await mkdtemp(join(tmpdir(), "beanie-goals-idle-"));
    const hooks = await createDomainAt(stateRoot, undefined, mock.client);
    await goalSet(hooks).execute({outcome: "Build app"}, {sessionID: "abort-session"} as never);

    const onEvent = eventHook(hooks);
    await onEvent({
        event: {
            type: "session.error",
            properties: {sessionID: "abort-session", error: {name: "MessageAbortedError"}},
        } as never,
    });

    const status = result(await goalStatus(hooks).execute({}, {sessionID: "abort-session"} as never)) as {goal: Goal};
    expect(status.goal.status).toBe("paused");
    expect(status.goal.lastReason).toContain("interrupted");
    expect(mock.toasts.some((t) => t.variant === "warning" && t.message.includes("interruption"))).toBe(true);
});
