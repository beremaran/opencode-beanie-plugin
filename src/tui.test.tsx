import {expect, mock, test} from "bun:test";
import {mkdir, mkdtemp, rename, rm} from "node:fs/promises";
import {join} from "node:path";
import {createSnapshot} from "./domains/goals/snapshot";
import {goalsSnapshotPath} from "./domains/goals/path";

const element = (type: unknown, props: Record<string, unknown>) => ({type, props});
await mock.module("@opentui/solid/jsx-runtime", () => ({
    Fragment: "fragment", jsx: element, jsxs: element, jsxDEV: element,
}));

const plugin = await import("./tui");
const tui = plugin.default.tui as unknown as (value: unknown) => Promise<void>;
const wait = (milliseconds = 30) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const goal = (sessionID: string, outcome: string) => ({
    id: `goal-${sessionID}`, sessionID, version: 1,
    createdAt: "2026-08-16T10:00:00.000Z", updatedAt: "2026-08-16T10:05:00.000Z",
    status: "active" as const, outcome, constraints: [], verificationCriteria: [], verificationEvidence: [],
});

const setup = async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-tui-"));
    const cleanups: (() => void)[] = [];
    const registrations: {order: number; slots: Record<string, (context: object, props: {session_id: string}) => unknown>}[] = [];
    const api = {
        client: {v2: {location: {get: () => ({data: {project: {id: "tui-test"}}})}}},
        state: {path: {worktree: root}},
        lifecycle: {onDispose: (cleanup: () => void) => { cleanups.push(cleanup); return cleanup; }},
        slots: {register: (registration: typeof registrations[number]) => registrations.push(registration)},
    } as unknown as Parameters<NonNullable<typeof plugin.default.tui>>[0];
    await tui(api);
    return {root, cleanups, registrations};
};

const writeSnapshot = async (root: string, sessionID: string, outcome: string) => {
    const directory = join(root, ".opencode", "beanie", "goals");
    await mkdir(directory, {recursive: true});
    const path = goalsSnapshotPath(root, "tui-test", sessionID);
    const temporary = `${path}.tmp`;
    await Bun.write(temporary, JSON.stringify(createSnapshot("tui-test", goal(sessionID, outcome))));
    await rename(temporary, path);
};

test("registers throttle and goals footers in adjacent order", async () => {
    const result = await setup();
    const throttleFooter = result.registrations[0]?.slots.sidebar_footer;
    const goalsFooter = result.registrations[1]?.slots.sidebar_footer;

    if (!throttleFooter || !goalsFooter) {
        throw new Error("Missing registered footer.");
    }

    expect(result.registrations.map(({order}) => order)).toEqual([300, 301]);
    expect(throttleFooter({}, {session_id: "session-1"})).toEqual({type: "box", props: {height: 0}});
    expect(goalsFooter({}, {session_id: "session-1"})).toEqual({type: "box", props: {height: 0}});
    expect(result.cleanups).toHaveLength(2);
    result.cleanups.forEach((cleanup) => { cleanup(); });
    await rm(result.root, {recursive: true, force: true});
});

test("reads goals initially, isolates session switches, and refreshes atomic writes", async () => {
    const result = await setup();
    const footer = result.registrations[1]?.slots.sidebar_footer;
    await writeSnapshot(result.root, "session-1", "First goal");
    await writeSnapshot(result.root, "session-2", "Second goal");

    expect(footer?.({}, {session_id: "session-1"})).toEqual({type: "box", props: {height: 0}});
    await wait();
    expect(JSON.stringify(footer?.({}, {session_id: "session-1"}))).toContain("First goal");
    expect(footer?.({}, {session_id: "session-2"})).toEqual({type: "box", props: {height: 0}});
    await wait();
    expect(JSON.stringify(footer?.({}, {session_id: "session-2"}))).toContain("Second goal");

    await writeSnapshot(result.root, "session-2", "Updated goal");
    await wait(80);
    expect(JSON.stringify(footer?.({}, {session_id: "session-2"}))).toContain("Updated goal");
    result.cleanups.forEach((cleanup) => { cleanup(); });
    await writeSnapshot(result.root, "session-2", "After cleanup");
    await wait(80);
    expect(JSON.stringify(footer?.({}, {session_id: "session-2"}))).toContain("Updated goal");
    await rm(result.root, {recursive: true, force: true});
});
