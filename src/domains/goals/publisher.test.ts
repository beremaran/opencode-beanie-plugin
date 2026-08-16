import {afterEach, expect, test} from "bun:test";
import type {Hooks, PluginInput, ToolContext, ToolResult} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {GoalsDomain} from "./index";
import {goalsSnapshotPath} from "./path";
import type {GoalSnapshot} from "./snapshot";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const context = (sessionID: string) => ({sessionID} as ToolContext);

const event = (sessionID: string): {event: Event} => ({
    event: {type: "session.deleted", properties: {info: {id: sessionID}}} as Event,
});

const hooksTools = (hooks: Hooks) => {
    if (!hooks.tool) {
        throw new Error("Goals tools were not registered");
    }

    return hooks.tool;
};

const result = (value: ToolResult) => JSON.parse(typeof value === "string" ? value : value.output) as {
    goal?: {progress?: string};
};

async function snapshot(path: string, matches: (value: GoalSnapshot) => boolean) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const value = await Bun.file(path).json() as GoalSnapshot;

            if (matches(value)) {
                return value;
            }
        } catch {
            // The initial atomic write may not have created the file yet.
        }

        await Bun.sleep(1);
    }

    throw new Error("Timed out waiting for goal snapshot.");
}

async function setup() {
    const worktree = await mkdtemp(join(tmpdir(), "beanie-goals-domain-"));
    directories.push(worktree);
    const projectID = "goals-project";
    const hooks = await GoalsDomain({worktree, project: {id: projectID}} as PluginInput);
    return {hooks, projectID, worktree};
}

test("publishes goal set and successful updates for the matching session", async () => {
    const {hooks, projectID, worktree} = await setup();
    const sessionID = "session-one";
    const tools = hooksTools(hooks);
    const path = goalsSnapshotPath(worktree, projectID, sessionID);

    if (!tools.goal_set || !tools.goal_update) {
        throw new Error("Goals tools were not registered");
    }

    await tools.goal_set.execute({outcome: "Ship it"}, context(sessionID));
    await snapshot(path, (value) => value.active.goal?.outcome === "Ship it");
    const updated = await tools.goal_update.execute({progress: "Half done"}, context(sessionID));

    expect(result(updated).goal?.progress).toBe("Half done");
    await snapshot(path, (value) => value.active.goal?.progress === "Half done");
});

test("publishes inactive state on deletion and dispose", async () => {
    const {hooks, projectID, worktree} = await setup();
    const deleted = "deleted-session";
    const retained = "retained-session";
    const tools = hooksTools(hooks);
    const eventHook = hooks.event;
    const dispose = hooks.dispose;

    if (!eventHook || !dispose) {
        throw new Error("Goals lifecycle hooks were not registered");
    }

    if (!tools.goal_set) {
        throw new Error("Goals tools were not registered");
    }

    await tools.goal_set.execute({outcome: "Delete me"}, context(deleted));
    await eventHook(event(deleted));
    const deletedPath = goalsSnapshotPath(worktree, projectID, deleted);
    await snapshot(deletedPath, (value) => value.inactive && value.active.goal === null);

    await tools.goal_set.execute({outcome: "Dispose me"}, context(retained));
    await dispose();
    const retainedPath = goalsSnapshotPath(worktree, projectID, retained);
    await snapshot(retainedPath, (value) => value.inactive && value.active.goal === null);
});
