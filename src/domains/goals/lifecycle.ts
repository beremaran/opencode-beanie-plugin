import type {Goal, GoalStatus, UpdateArgs} from "./model";
import {maxItems} from "./schema";

const json = (value: unknown) => JSON.stringify(value);

const error = (message: string) => json({error: {code: "invalid_goal_update", message}});

const now = () => new Date().toISOString();

const canTransition = (from: GoalStatus, to: GoalStatus) => {
    if (from === "completed" || from === "cancelled") {
        return false;
    }

    if (from === "active") {
        return ["active", "paused", "blocked", "completed", "cancelled"].includes(to);
    }

    if (from === "paused") {
        return ["paused", "active", "cancelled"].includes(to);
    }

    return ["blocked", "active", "cancelled"].includes(to);
};

const validateUpdate = (goal: Goal, status: GoalStatus, args: UpdateArgs, evidence: string[]) => {
    if (goal.status === "completed" || goal.status === "cancelled") {
        return error("Terminal goals cannot be updated; use goal_set to replace them.");
    }
    if (!canTransition(goal.status, status)) {
        return error(`Cannot transition ${goal.status} to ${status}.`);
    }
    if (status === "blocked" && !(args.blocker?.trim() || goal.blocker)) {
        return error("A blocker is required when setting a goal to blocked.");
    }
    if (evidence.length > maxItems) {
        return error(`verificationEvidence cannot contain more than ${String(maxItems)} items.`);
    }
    if (status === "completed" && evidence.length === 0) {
        return error("Non-empty verificationEvidence is required when completing a goal.");
    }
};

const evidenceFor = (goal: Goal, args: UpdateArgs) => args.verificationEvidence?.length
    ? [...goal.verificationEvidence, ...args.verificationEvidence] : goal.verificationEvidence;

const applyUpdate = (goal: Goal, args: UpdateArgs, status: GoalStatus, evidence: string[]) => {
    const timestamp = now();

    goal.status = status;

    goal.updatedAt = timestamp;

    goal.progress = args.progress ?? goal.progress;

    goal.nextAction = args.nextAction ?? goal.nextAction;
    goal.blocker = status === "blocked" ? args.blocker?.trim() || goal.blocker : undefined;
    goal.verificationEvidence = evidence;
    goal.completedAt = status === "completed" ? timestamp : undefined;
    return goal;
};

export const updateGoal = (goal: Goal, args: UpdateArgs): Goal | string => {
    const status = args.status ?? goal.status;

    const evidence = evidenceFor(goal, args);

    const validation = validateUpdate(goal, status, args, evidence);

    return validation ?? applyUpdate(goal, args, status, evidence);
};

export const createGoal = (sessionID: string, outcome: string, constraints: string[], verificationCriteria: string[]): Goal => {
    const timestamp = now();

    return {id: crypto.randomUUID(), sessionID, version: 1, createdAt: timestamp, updatedAt: timestamp,
        status: "active", outcome, constraints, verificationCriteria, verificationEvidence: []};
};
