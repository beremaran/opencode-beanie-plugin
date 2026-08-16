import {afterEach, expect, test} from "bun:test";
import type {Hooks, PluginInput} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ThrottleDomain} from "./index";
import {throttleSnapshotPath} from "./path";
import {readThrottleSnapshot} from "./storage";

type Call = {tool: string; sessionID: string; callID: string};
type Output = {title: string; output: string; metadata: unknown};
type Before = (input: Call) => Promise<void>;
type After = (input: Call, output: Output) => Promise<void>;
type EventHook = (input: {event: Event}) => Promise<void>;

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const call = (callID: string): Call => ({tool: "task", sessionID: "parent", callID});

const output = (metadata: unknown): Output => ({title: "task", output: "done", metadata});

const terminal = (sessionID: string) => ({
    event: {type: "session.idle", properties: {sessionID}} as Event,
});

const hook = (hooks: Hooks, name: string): unknown => hooks[name as keyof Hooks];

async function readUntil(path: string, matches: (sequence: Awaited<ReturnType<typeof readThrottleSnapshot>>) => boolean) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const snapshot = await readThrottleSnapshot(path);
            if (matches(snapshot)) {
                return snapshot;
            }
        } catch {
            // The initial atomic write may not have created the file yet.
        }
        await Bun.sleep(1);
    }

    throw new Error("Timed out waiting for throttle snapshot.");
}

async function setup() {
    const directory = await mkdtemp(join(tmpdir(), "beanie-throttle-domain-"));
    directories.push(directory);
    const projectID = "snapshot-project";
    const hooks = await ThrottleDomain({worktree: directory, project: {id: projectID}} as PluginInput);
    return {hooks, path: throttleSnapshotPath(directory, projectID)};
}

test("publishes foreground completion and background handoff transitions", async () => {
    const {hooks, path} = await setup();
    const before = hook(hooks, "tool.execute.before") as Before;
    const after = hook(hooks, "tool.execute.after") as After;
    const event = hook(hooks, "event") as EventHook;

    await readUntil(path, (snapshot) => snapshot.sequence === 1 && !snapshot.inactive);
    await Promise.all([before(call("one")), before(call("two"))]);
    const queued = before(call("three"));
    await readUntil(path, (snapshot) => snapshot.queued.calls.some(({callID}) => callID === "three"));

    await after(call("one"), output({}));
    await queued;
    await readUntil(path, (snapshot) => snapshot.active.foreground.some(({callID}) => callID === "three") &&
        !snapshot.active.foreground.some(({callID}) => callID === "one"));

    await after(call("two"), output({background: true, sessionId: "child"}));
    await readUntil(path, (snapshot) => snapshot.active.background.some(({sessionID}) => sessionID === "child"));

    const handoff = before(call("four"));
    const extra = before(call("five"));
    const waiting = before(call("six"));
    await readUntil(path, (snapshot) => snapshot.queued.calls.some(({callID}) => callID === "six"));
    await event(terminal("child"));
    await handoff;
    await after(call("four"), output({}));
    await extra;
    await after(call("five"), output({}));
    await waiting;
    await readUntil(path, (snapshot) => snapshot.active.foreground.some(({callID}) => callID === "six") &&
        !snapshot.active.background.some(({sessionID}) => sessionID === "child"));
});

test("handles an early terminal event and publishes inactive disposal", async () => {
    const {hooks, path} = await setup();
    const before = hook(hooks, "tool.execute.before") as Before;
    const after = hook(hooks, "tool.execute.after") as After;
    const event = hook(hooks, "event") as EventHook;
    const dispose = hooks.dispose as (() => Promise<void>);

    await event(terminal("early-child"));
    await before(call("early"));
    await after(call("early"), output({background: true, sessionId: "early-child"}));
    await readUntil(path, (snapshot) => snapshot.active.count === 0 && snapshot.queued.count === 0);

    await dispose();
    const inactive = await readThrottleSnapshot(path);
    expect(inactive).toMatchObject({inactive: true, active: {count: 0}, queued: {count: 0}});
});
