import {statuses} from "./schema";
import type {GoalSnapshot, GoalSnapshotGoal} from "./snapshot";

export type GoalsIdentity = Readonly<{
    projectID: string
    sessionID: string
}>;

export type GoalsTuiState = Readonly<{
    projectID: string
    sessionID: string
    goal: GoalSnapshotGoal
}>;

export type GoalsReadOutcome =
    | Readonly<{kind: "missing"}>
    | Readonly<{kind: "invalid"}>
    | Readonly<{kind: "valid"; state: GoalsTuiState}>;

const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const timestamp = (value: unknown): value is string =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));

const list = (value: unknown): value is readonly string[] =>
    Array.isArray(value) && value.every(text);

const status = (value: unknown): value is GoalSnapshotGoal["status"] =>
    typeof value === "string" && statuses.includes(value as GoalSnapshotGoal["status"]);

const optionalText = (item: Record<string, unknown>, key: string) =>
    item[key] === undefined || text(item[key]);

const validNumbers = (item: Record<string, unknown>) =>
    (item.turns === undefined || (typeof item.turns === "number" && item.turns >= 0)) &&
    (item.tokensUsed === undefined || (typeof item.tokensUsed === "number" && item.tokensUsed >= 0)) &&
    (item.tokenBudget === undefined || (typeof item.tokenBudget === "number" && item.tokenBudget > 0)) &&
    (item.maxTurns === undefined || (typeof item.maxTurns === "number" && item.maxTurns > 0));

const validGoal = (value: unknown): value is GoalSnapshotGoal => {
    const item = record(value);

    return item !== undefined && text(item.id) && text(item.sessionID) &&
        typeof item.version === "number" && Number.isInteger(item.version) && item.version > 0 &&
        timestamp(item.createdAt) && timestamp(item.updatedAt) &&
        (item.completedAt === undefined || timestamp(item.completedAt)) && status(item.status) &&
        text(item.outcome) && list(item.constraints) && list(item.verificationCriteria) &&
        list(item.verificationEvidence) && optionalText(item, "progress") &&
        optionalText(item, "nextAction") && optionalText(item, "blocker") &&
        optionalText(item, "lastEvaluatedMessageId") && optionalText(item, "lastReason") && validNumbers(item);
};

const validSnapshot = (value: unknown): value is GoalSnapshot => {
    const snapshot = record(value);

    const active = record(snapshot?.active);

    return snapshot?.schema === "opencode-beanie.goals.v1" && text(snapshot.projectID) &&
        text(snapshot.sessionID) && typeof snapshot.inactive === "boolean" && active !== undefined &&
        active.goal !== null && validGoal(active.goal) && active.goal.sessionID === snapshot.sessionID;
};

export const parseGoalsState = (value: unknown, identity?: GoalsIdentity): GoalsTuiState | undefined => {
    if (!validSnapshot(value) || value.inactive ||
        (identity !== undefined && (value.projectID !== identity.projectID || value.sessionID !== identity.sessionID))) {
        return undefined;
    }

    const goal = value.active.goal;

    if (goal === null) {return undefined;}
    return {projectID: value.projectID, sessionID: value.sessionID, goal};
};

export const readGoalsState = async (path: string, identity: GoalsIdentity): Promise<GoalsReadOutcome> => {
    try {
        const state = parseGoalsState(await Bun.file(path).json(), identity);

        return state === undefined ? {kind: "invalid"} : {kind: "valid", state};
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT" ? {kind: "missing"} : {kind: "invalid"};
    }
};
