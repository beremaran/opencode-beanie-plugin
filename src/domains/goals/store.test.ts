import {afterEach, expect, test} from "bun:test";
import {mkdir, mkdtemp, readFile, stat, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {createGoal} from "./lifecycle";
import type {Goal} from "./model";
import {FileGoalStore} from "./store";

const roots: string[] = [];
const options = (root: string, sessionID = "session-1") => ({projectID: "project-1", worktree: "/tmp/worktree", sessionID, stateRoot: root});

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true}))));

const setup = async () => {
    const root = await mkdtemp(join(tmpdir(), "beanie-goal-store-"));
    roots.push(root);
    return root;
};

const increment = (goal: Goal | undefined): Goal => {
    if (!goal) {throw new Error("Expected an existing goal");}
    return {...goal, version: goal.version + 1};
};

test("persists active goals and recovers them through a fresh store", async () => {
    const root = await setup();
    const goal = createGoal("session-1", "Ship it", [], []);
    const first = new FileGoalStore(options(root));

    await first.set(goal);

    expect(await new FileGoalStore(options(root)).get()).toEqual(goal);
    const path = (await import("./path")).goalsSnapshotPath("/tmp/worktree", "project-1", "session-1", root);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
});

test("rejects malformed, inactive, and cross-identity snapshots without deleting them", async () => {
    const root = await setup();
    const store = new FileGoalStore(options(root));
    const {goalsSnapshotPath} = await import("./path");
    const path = goalsSnapshotPath("/tmp/worktree", "project-1", "session-1", root);
    const malformed = "not json";

    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, malformed);
    expect(await store.get()).toBeUndefined();
    expect(await readFile(path, "utf8")).toBe(malformed);
    await writeFile(path, JSON.stringify({schema: "opencode-beanie.goals.v1", projectID: "other", sessionID: "session-1", inactive: true, active: {goal: null}}));
    expect(await store.get()).toBeUndefined();
    expect(await Bun.file(path).exists()).toBe(true);
});

test("isolates sessions and clear tolerates missing files", async () => {
    const root = await setup();
    const first = new FileGoalStore(options(root, "session-1"));
    const second = new FileGoalStore(options(root, "session-2"));
    const goal = createGoal("session-1", "Ship it", [], []);

    await first.set(goal);
    expect(await second.get()).toBeUndefined();
    await second.clear();
    await first.clear();
    expect(await first.get()).toBeUndefined();
});

test("serializes complete concurrent read-modify-write transactions", async () => {
    const root = await setup();
    const first = new FileGoalStore(options(root));
    const second = new FileGoalStore(options(root));
    await first.set(createGoal("session-1", "Ship it", [], []));

    await Promise.all([first.mutate(async (goal) => { await Bun.sleep(5); return increment(goal); }), second.mutate(increment)]);

    expect((await first.get())?.version).toBe(3);
});
