import type {Goal, GoalStatus, UpdateArgs} from "./model";
import {maxItems} from "./schema";

const json = (value: unknown) => JSON.stringify(value);

const error = (message: string) => json({error: {code: "invalid_goal_update", message}});

const now = () => new Date().toISOString();

const canTransition = (from: GoalStatus, to: GoalStatus) => {
    if (from === "completed" || from === "cancelled") {return false;}
    if (from === "active") {
        return ["active", "paused", "blocked", "completed", "cancelled", "budget_limited", "turn_limited"].includes(to);
    }
    return [from, "active", "cancelled"].includes(to);
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
    if (status === "completed" && evidence.length === 0 && !goal.completionClaim) {
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
    if (args.reason !== undefined) {goal.lastReason = args.reason;}
    if (args.tokenBudget !== undefined) {goal.tokenBudget = args.tokenBudget;}
    if (args.maxTurns !== undefined) {goal.maxTurns = args.maxTurns;}
    if (args.completionClaim !== undefined) {goal.completionClaim = args.completionClaim;}
    return goal;
};

export const updateGoal = (goal: Goal, args: UpdateArgs): Goal | string => {
    const status = args.status ?? goal.status;

    const evidence = evidenceFor(goal, args);

    const validation = validateUpdate(goal, status, args, evidence);

    return validation ?? applyUpdate(goal, args, status, evidence);
};

export const createGoal = (
    sessionID: string,
    outcome: string,
    constraints: string[] = [],
    verificationCriteria: string[] = [],
    tokenBudget?: number,
    maxTurns?: number,
): Goal => {
    const timestamp = now();

    const goal: Goal = {
        id: crypto.randomUUID(), sessionID, version: 1, createdAt: timestamp, updatedAt: timestamp,
        status: "active", outcome, constraints, verificationCriteria, verificationEvidence: [],
        turns: 0, tokensUsed: 0,
    };

    if (tokenBudget !== undefined) {goal.tokenBudget = tokenBudget;}
    if (maxTurns !== undefined) {goal.maxTurns = maxTurns;}
    return goal;
};

export const remainingTokens = (goal: Goal): number | undefined => {
    if (goal.tokenBudget === undefined) {return undefined;}
    return Math.max(goal.tokenBudget - (goal.tokensUsed ?? 0), 0);
};

export const formatDuration = (milliseconds: number): string => {
    const seconds = Math.max(Math.floor(milliseconds / 1000), 0);

    const hours = Math.floor(seconds / 3600);

    const minutes = Math.floor((seconds % 3600) / 60);

    const rest = seconds % 60;

    if (hours > 0) {return `${String(hours)}h ${String(minutes)}m`;}
    if (minutes > 0) {return `${String(minutes)}m ${String(rest)}s`;}
    return `${String(rest)}s`;
};

const formatBudget = (goal: Goal): string => {
    const used = goal.tokensUsed ?? 0;

    return goal.tokenBudget === undefined
        ? `${used.toLocaleString()} tokens`
        : `${used.toLocaleString()} / ${goal.tokenBudget.toLocaleString()} tokens`;
};

const formatTurns = (goal: Goal): string => {
    const turns = goal.turns ?? 0;

    return goal.maxTurns === undefined ? `${String(turns)} turns` : `${String(turns)} / ${String(goal.maxTurns)} turns`;
};

export const goalSummary = (goal: Goal, nowTimestamp = Date.now()): string => {
    const elapsed = formatDuration(nowTimestamp - Date.parse(goal.createdAt));

    const reason = goal.lastReason ? `\nLast evaluation: ${goal.lastReason}` : "";

    return [
        `Goal status: ${goal.status}`,
        `Objective: ${goal.outcome}`,
        `Progress: ${formatTurns(goal)}; ${formatBudget(goal)}; ${elapsed} elapsed`,
    ].join("\n") + reason;
};
