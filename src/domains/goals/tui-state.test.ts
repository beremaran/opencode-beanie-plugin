import {expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import type {GoalSnapshotGoal} from "./snapshot";
import {parseGoalsState, readGoalsState} from "./tui-state";

const identity = {projectID: "project-1", sessionID: "session-1"};
const goal: GoalSnapshotGoal = {
    id: "goal-1", sessionID: "session-1", version: 4,
    createdAt: "2026-08-16T10:00:00.000Z", updatedAt: "2026-08-16T10:05:00.000Z",
    completedAt: "2026-08-16T10:06:00.000Z", status: "completed", outcome: "Ship it",
    constraints: ["Keep it small"], verificationCriteria: ["Run tests"],
    verificationEvidence: ["Focused tests passed"], progress: "Done", nextAction: "Review",
    blocker: "Resolved",
};

const snapshot = (overrides: Record<string, unknown> = {}) => ({
    schema: "opencode-beanie.goals.v1", ...identity, active: {goal}, inactive: false, ...overrides,
});

test("parses the complete active goal and optional fields", () => {
    expect(parseGoalsState(snapshot())).toEqual({...identity, goal});
});

test("accepts every goal status and empty arrays", () => {
    for (const status of ["active", "paused", "blocked", "completed", "cancelled"]) {
        expect(parseGoalsState(snapshot({active: {goal: {...goal, status: status as GoalSnapshotGoal["status"], completedAt: undefined,
            constraints: [], verificationCriteria: [], verificationEvidence: []}}}))).toBeDefined();
    }
});

test("rejects inactive, malformed, incomplete, and invalid snapshots", () => {
    expect(parseGoalsState(snapshot({inactive: true}))).toBeUndefined();
    expect(parseGoalsState(undefined)).toBeUndefined();
    for (const change of [
        {schema: "wrong"}, {active: {goal: null}}, {sessionID: "other"},
        {active: {goal: {...goal, sessionID: "other"}}},
        {active: {goal: {...goal, status: "unknown"}}},
        {active: {goal: {...goal, createdAt: "not-a-time"}}},
        {active: {goal: {...goal, constraints: [1]}}},
        {active: {goal: {...goal, progress: null}}},
    ]) {
        expect(parseGoalsState(snapshot(change))).toBeUndefined();
    }
});

test("reader rejects missing files and cross-session snapshots", async () => {
    expect(await readGoalsState("/missing/goals.json", identity)).toEqual({kind: "missing"});
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "beanie-goals-"));
    const path = join(root, "snapshot.json");
    try {
        await writeFile(path, JSON.stringify(snapshot()));
        expect(await readGoalsState(path, identity)).toEqual({kind: "valid", state: {...identity, goal}});
        expect(await readGoalsState(path, {projectID: "other", sessionID: identity.sessionID})).toEqual({kind: "invalid"});
        expect(await readGoalsState(path, {projectID: identity.projectID, sessionID: "other"})).toEqual({kind: "invalid"});
        await writeFile(path, "malformed");
        expect(await readGoalsState(path, identity)).toEqual({kind: "invalid"});
    } finally {
        await rm(root, {recursive: true, force: true});
    }
});
