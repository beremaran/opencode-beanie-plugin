import {expect, test} from "bun:test";
import type {Goal} from "./index";
import {createSnapshot, emptySnapshot} from "./snapshot";

const goal = (status: Goal["status"]): Goal => ({
    id: "goal-1",
    sessionID: "session-1",
    version: 4,
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:05:00.000Z",
    completedAt: status === "completed" ? "2026-08-16T10:06:00.000Z" : undefined,
    status,
    outcome: "Ship the snapshot",
    constraints: ["Keep the API small"],
    verificationCriteria: ["Run focused tests"],
    verificationEvidence: ["Tests passed"],
    progress: "Implemented",
    nextAction: "Review",
    blocker: status === "blocked" ? "Waiting on review" : undefined,
});

test("creates an immutable v1 projection with the complete goal", () => {
    const source = goal("active");
    const snapshot = createSnapshot("project-1", source);

    expect(snapshot).toEqual({
        schema: "opencode-beanie.goals.v1",
        projectID: "project-1",
        sessionID: "session-1",
        active: {goal: source},
        inactive: false,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.active)).toBe(true);
    expect(Object.isFrozen(snapshot.active.goal)).toBe(true);
    expect(Object.isFrozen(snapshot.active.goal?.constraints)).toBe(true);
    expect(snapshot.active.goal).not.toBe(source);
});

test("preserves every supported goal status and lifecycle fields", () => {
    for (const status of ["active", "paused", "blocked", "completed", "cancelled"] as const) {
        const projected = createSnapshot("project-1", goal(status)).active.goal;

        expect(projected?.status).toBe(status);
        expect(projected?.createdAt).toBe("2026-08-16T10:00:00.000Z");
        expect(projected?.updatedAt).toBe("2026-08-16T10:05:00.000Z");
        expect(projected?.constraints).toEqual(["Keep the API small"]);
        expect(projected?.verificationCriteria).toEqual(["Run focused tests"]);
        expect(projected?.verificationEvidence).toEqual(["Tests passed"]);
        expect(projected?.progress).toBe("Implemented");
        expect(projected?.nextAction).toBe("Review");
    }
});

test("creates an inactive empty projection for cleanup", () => {
    expect(emptySnapshot("project-1", "session-1")).toEqual({
        schema: "opencode-beanie.goals.v1",
        projectID: "project-1",
        sessionID: "session-1",
        active: {goal: null},
        inactive: true,
    });
});
