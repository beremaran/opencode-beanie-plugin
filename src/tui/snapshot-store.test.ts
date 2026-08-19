import {expect, test} from "bun:test";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {createSnapshot} from "../domains/goals/snapshot";
import {goalsSnapshotPath} from "../domains/goals/path";
import {throttleSnapshotPath} from "../domains/throttle/path";
import {createSnapshotStore} from "./snapshot-store";
import {createMockTuiApi, type MockSession} from "./test-helpers";

const wait = (milliseconds = 50) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const goal = (sessionID: string, outcome: string) => ({
    id: `goal-${sessionID}`, sessionID, version: 1,
    createdAt: "2026-08-16T10:00:00.000Z", updatedAt: "2026-08-16T10:05:00.000Z",
    status: "active" as const, outcome, constraints: [], verificationCriteria: [], verificationEvidence: [],
});

const sessionState = (status?: string): MockSession => ({
    slug: "S", status, todos: [], diff: [], permissions: [], questions: [],
});

test("returns a live snapshot per session and refreshes on events", () => {
    const mock = createMockTuiApi();
    const store = createSnapshotStore(mock.api);
    const get = store.snapshot("s1");

    expect(get()?.session.status).toBeUndefined();
    mock.sessions.set("s1", sessionState("idle"));
    mock.fire("session.status");

    expect(get()?.session).toEqual({status: "idle", slug: "S"});
    store.dispose();
});

test("caches one store per api", () => {
    const mock = createMockTuiApi();
    const store = createSnapshotStore(mock.api);

    expect(createSnapshotStore(mock.api)).toBe(store);
});

test("dispose stops refreshes and allows a fresh store", () => {
    const mock = createMockTuiApi();
    const store = createSnapshotStore(mock.api);
    const get = store.snapshot("s1");
    store.dispose();

    mock.sessions.set("s1", sessionState("idle"));
    mock.fire("session.status");

    expect(get()?.session.status).toBeUndefined();
    expect(createSnapshotStore(mock.api)).not.toBe(store);
});

const waitFor = async (predicate: () => boolean, timeout = 500) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (predicate()) {return;}
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

test("merges goals state written to the snapshot file", async () => {
    const root = await mkdtemp(join(tmpdir(), "beanie-snapshot-"));
    const mock = createMockTuiApi({worktree: root});
    const goalsPath = goalsSnapshotPath(root, "p1", "s1");
    await mkdir(dirname(goalsPath), {recursive: true});
    const store = createSnapshotStore(mock.api, {projectID: "p1", worktree: root});
    const get = store.snapshot("s1");
    await Bun.write(goalsPath, JSON.stringify(createSnapshot("p1", goal("s1", "Ship it"))));
    await waitFor(() => get()?.goals?.goal.outcome === "Ship it");

    expect(get()?.goals?.goal.outcome).toBe("Ship it");
    store.dispose();
    await rm(root, {recursive: true, force: true});
});

test("merges throttle status written to the snapshot file", async () => {
    const root = await mkdtemp(join(tmpdir(), "beanie-snapshot-"));
    const mock = createMockTuiApi({worktree: root});
    const throttlePath = throttleSnapshotPath(root, "p1");
    await mkdir(dirname(throttlePath), {recursive: true});
    const store = createSnapshotStore(mock.api, {projectID: "p1", worktree: root});
    const get = store.snapshot("s1");
    await Bun.write(throttlePath, JSON.stringify({
        schema: "opencode-beanie.throttle.v1",
        capacity: 2,
        sequence: 1,
        inactive: false,
        active: {count: 1, foreground: [{callID: "call-1"}], background: []},
        queued: {count: 0, calls: []},
    }));
    await waitFor(() => Boolean(get()?.throttle));
    await wait();

    expect(get()?.throttle).toEqual({active: 1, capacity: 2, queued: 0, foreground: 1, background: 0});
    store.dispose();
    await rm(root, {recursive: true, force: true});
});
