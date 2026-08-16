import {expect, test} from "bun:test";
import type {Hooks, PluginInput} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {ThrottleDomain} from "./index";

type Call = { tool: string; sessionID: string; callID: string };
type Output = { title: string; output: string; metadata: unknown };
type Before = (input: Call) => Promise<void>;
type After = (input: Call, output: Output) => Promise<void>;
type EventHook = (input: { event: Event }) => Promise<void>;

const input = {} as PluginInput;

const call = (callID: string, tool = "task"): Call => ({
    tool, sessionID: "parent", callID,
});

const output = (metadata: unknown): Output => ({
    title: "task", output: "done", metadata,
});

const hook = (hooks: Hooks, name: string): unknown => {
    const registered = hooks[name as keyof Hooks];
    if (!registered) {
        throw new Error(`Throttle hook was not registered: ${name}`);
    }
    return registered;
};

const terminal = (type: "session.idle" | "session.error" | "session.deleted", sessionID: string) => ({
    event: (type === "session.deleted"
        ? {type, properties: {info: {id: sessionID}}}
        : {type, properties: {sessionID}}) as Event,
});

async function domainHooks() {
    return ThrottleDomain(input);
}

async function background(hooks: Hooks, callID: string, sessionID: string) {
    const before = hook(hooks, "tool.execute.before") as Before;
    const after = hook(hooks, "tool.execute.after") as After;
    await before(call(callID));
    await after(call(callID), output({background: true, sessionId: sessionID}));
}

test("allows two task calls concurrently and queues a third", async () => {
    const hooks = await domainHooks();
    const before = hook(hooks, "tool.execute.before") as Before;
    const first = before(call("one"));
    const second = before(call("two"));
    await Promise.all([first, second]);
    let settled = false;
    const third = before(call("three")).then(() => {
        settled = true;
    });

    await Bun.sleep(0);
    expect(settled).toBe(false);
    await (hook(hooks, "tool.execute.after") as After)(call("one"), output({}));
    await third;
    expect(settled).toBe(true);
});

test("does not consume permits for non-task tools", async () => {
    const hooks = await domainHooks();
    const before = hook(hooks, "tool.execute.before") as Before;
    const after = hook(hooks, "tool.execute.after") as After;
    await before(call("other", "shell"));
    await before(call("one"));
    await before(call("two"));
    let settled = false;
    const third = before(call("three")).then(() => {
        settled = true;
    });

    await Bun.sleep(0);
    expect(settled).toBe(false);
    await after(call("other", "shell"), output({}));
    await after(call("one"), output({}));
    await third;
});

test("foreground after releases its permit", async () => {
    const hooks = await domainHooks();
    const before = hook(hooks, "tool.execute.before") as Before;
    const after = hook(hooks, "tool.execute.after") as After;
    await Promise.all([before(call("one")), before(call("two"))]);
    const third = before(call("three"));

    await after(call("one"), output({background: false}));
    await third;
});

test("background task releases on idle, error, and deletion", async () => {
    for (const type of ["session.idle", "session.error", "session.deleted"] as const) {
        const hooks = await domainHooks();
        await Promise.all([background(hooks, "one", "child"), background(hooks, "two", "other")]);
        const third = (hook(hooks, "tool.execute.before") as Before)(call("three"));

        await (hook(hooks, "event") as EventHook)(terminal(type, "child"));
        await third;
    }
});

test("duplicate terminal events and releases cannot exceed capacity", async () => {
    const hooks = await domainHooks();
    await background(hooks, "one", "child");
    const event = hook(hooks, "event") as EventHook;
    const after = hook(hooks, "tool.execute.after") as After;
    await event(terminal("session.idle", "child"));
    await event(terminal("session.idle", "child"));
    await after(call("one"), output({}));
    await after(call("one"), output({}));
    const before = hook(hooks, "tool.execute.before") as Before;
    const first = before(call("two"));
    const second = before(call("three"));
    await Promise.all([first, second]);
    let settled = false;
    const third = before(call("four")).then(() => {
        settled = true;
    });

    await Bun.sleep(0);
    expect(settled).toBe(false);
    await (hook(hooks, "tool.execute.after") as After)(call("two"), output({}));
    await third;
});
