import {expect, mock, test} from "bun:test";
import {mkdir, mkdtemp, rename, rm} from "node:fs/promises";
import {join} from "node:path";
import {createSnapshot} from "./domains/goals/snapshot";
import {goalsSnapshotPath} from "./domains/goals/path";
import type {GoalsReadOutcome, GoalsTuiState} from "./domains/goals/tui-state";
import {createMockTuiApi} from "./tui/test-helpers";

const element = (type: unknown, props: Record<string, unknown>) => ({type, props});
await mock.module("@opentui/solid/jsx-runtime", () => ({
    Fragment: "fragment", jsx: element, jsxs: element, jsxDEV: element,
}));

const plugin = await import("./tui");
const {createGoalsController} = await import("./tui/register-goals-footer");
const tui = plugin.default.tui as unknown as (value: unknown) => Promise<void>;
const wait = (milliseconds = 30) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const goal = (sessionID: string, outcome: string) => ({
    id: `goal-${sessionID}`, sessionID, version: 1,
    createdAt: "2026-08-16T10:00:00.000Z", updatedAt: "2026-08-16T10:05:00.000Z",
    status: "active" as const, outcome, constraints: [], verificationCriteria: [], verificationEvidence: [],
});

type FooterRegistration = {
    order: number
    dispose?: () => void
    slots: {sidebar_footer: (context: object, props: {session_id: string}) => unknown}
};

const setup = async (getLocation?: () => {data?: {project?: {id?: string}}}) => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-tui-"));
    const mock = createMockTuiApi({
        worktree: root,
        location: getLocation ?? (() => ({data: {project: {id: "tui-test"}}})),
    });
    await tui(mock.api);
    return {root, mock, registrations: mock.slotRegistrations as FooterRegistration[]};
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
    expect(result.registrations.map((registration) => typeof registration.dispose)).toEqual(["function", "function"]);
    result.registrations.forEach((registration) => { registration.dispose?.(); });
    await rm(result.root, {recursive: true, force: true});
});

test("registers empty footers when project identity lookup fails", async () => {
    const result = await setup(() => { throw new Error("lookup failed"); });

    expect(result.registrations.map(({order}) => order)).toEqual([300, 301]);
    expect(result.registrations.map(({dispose}) => dispose)).toEqual([undefined, undefined]);
    expect(result.registrations[0]?.slots.sidebar_footer({}, {session_id: "session-1"})).toEqual({type: "box", props: {height: 0}});
    expect(result.registrations[1]?.slots.sidebar_footer({}, {session_id: "session-1"})).toEqual({type: "box", props: {height: 0}});
    await rm(result.root, {recursive: true, force: true});
});

test("reads goals initially, isolates session switches, and refreshes atomic writes", async () => {
    await assertGoalRefresh(await setup());
});

async function assertGoalRefresh(result: Awaited<ReturnType<typeof setup>>) {
    const footer = result.registrations[1]?.slots.sidebar_footer;
    if (!footer) {
        throw new Error("Missing goals footer.");
    }
    await writeSnapshot(result.root, "session-1", "First goal");
    await writeSnapshot(result.root, "session-2", "Second goal");

    await assertInitialGoals(footer);

    await writeSnapshot(result.root, "session-2", "Updated goal");
    await assertUpdatedGoal(footer, "Updated goal");
    result.registrations.forEach((registration) => { registration.dispose?.(); });
    await writeSnapshot(result.root, "session-2", "After cleanup");
    await assertUpdatedGoal(footer, "Updated goal");
    await rm(result.root, {recursive: true, force: true});
}

async function assertInitialGoals(footer: GoalsFooter) {
    expect(footer({}, {session_id: "session-1"})).toEqual({type: "box", props: {height: 0}});
    await wait();
    expect(JSON.stringify(footer({}, {session_id: "session-1"}))).toContain("First goal");
    expect(footer({}, {session_id: "session-2"})).toEqual({type: "box", props: {height: 0}});
    await wait();
    expect(JSON.stringify(footer({}, {session_id: "session-2"}))).toContain("Second goal");
}

async function assertUpdatedGoal(
    footer: GoalsFooter,
    outcome: string,
) {
    await wait(80);
    expect(JSON.stringify(footer({}, {session_id: "session-2"}))).toContain(outcome);
}

const controllerApi = {state: {path: {worktree: "/tmp/worktree"}}} as Parameters<typeof createGoalsController>[0];
const controllerState = (sessionID: string, outcome: string): GoalsTuiState => ({
    projectID: "project-1", sessionID, goal: goal(sessionID, outcome),
});
type GoalsFooter = NonNullable<Awaited<ReturnType<typeof setup>>["registrations"][number]["slots"]["sidebar_footer"]>;

test("applies only the newest same-session read and retains valid state on invalid data", async () => {
    const controlled = controlledController();

    controlled.controller.select("session-1");
    controlled.change();
    controlled.pending[1]?.({kind: "valid", state: controllerState("session-1", "new")});
    await wait(0);
    controlled.pending[0]?.({kind: "valid", state: controllerState("session-1", "old")});
    await wait(0);
    expect(controlled.current()?.goal.outcome).toBe("new");

    controlled.change();
    controlled.pending[2]?.({kind: "invalid"});
    await wait(0);
    expect(controlled.current()?.goal.outcome).toBe("new");
    controlled.controller.dispose();
});

test("deletion clears state, rejects cross-session data, and invalidates disposal", async () => {
    await assertDeletionBehavior();
});

async function assertDeletionBehavior() {
    const controlled = controlledController();

    await assertDeletedGoalClears(controlled);
    await assertCrossSessionDataIsIgnored(controlled);
    await assertDisposedControllerIgnoresLateData(controlled);
}

async function assertDeletedGoalClears(controlled: ReturnType<typeof controlledController>) {
    controlled.controller.select("session-1");
    controlled.pending[0]?.({kind: "valid", state: controllerState("session-1", "goal")});
    await wait(0);
    controlled.change();
    controlled.pending[1]?.({kind: "missing"});
    await wait(0);
    expect(controlled.current()).toBeUndefined();
}

async function assertCrossSessionDataIsIgnored(controlled: ReturnType<typeof controlledController>) {
    controlled.controller.select("session-2");
    controlled.pending[2]?.({kind: "invalid"});
    await wait(0);
    expect(controlled.current()).toBeUndefined();
}

async function assertDisposedControllerIgnoresLateData(controlled: ReturnType<typeof controlledController>) {
    controlled.controller.select("session-3");
    controlled.controller.dispose();
    controlled.pending[3]?.({kind: "valid", state: controllerState("session-3", "late")});
    await wait(0);
    expect(controlled.current()).toBeUndefined();
}

function controlledController() {
    let current: GoalsTuiState | undefined;
    let change: (() => void) | undefined;
    const pending: ((outcome: GoalsReadOutcome) => void)[] = [];
    const read = () => new Promise<GoalsReadOutcome>((resolve) => { pending.push(resolve); });
    const controller = createGoalsController(controllerApi, "project-1", (state) => { current = state; }, read,
        (_path, onChange) => { change = onChange; return () => { change = undefined; }; });

    return {controller, pending, current: () => current, change: () => change?.()};
}
