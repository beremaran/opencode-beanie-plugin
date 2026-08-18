import {unlink} from "node:fs/promises";
import type {Goal, GoalStatus} from "./model";
import {goalsSnapshotPath} from "./path";
import {statuses} from "./schema";
import {createSnapshot, type GoalSnapshotGoal} from "./snapshot";
import {writeAtomically} from "./storage";

export type GoalStore = Readonly<{
    get: () => Promise<Goal | undefined>
    set: (goal: Goal) => Promise<void>
    clear: () => Promise<void>
    mutate: (change: (goal: Goal | undefined) => Goal | undefined | Promise<Goal | undefined>) => Promise<Goal | undefined>
}>;

export type FileGoalStoreOptions = Readonly<{
    projectID: string
    worktree: string
    sessionID: string
    stateRoot?: string
}>;

const locks = new Map<string, Promise<void>>();

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const timestamp = (value: unknown): value is string => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value));

const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;

const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((k) => keys.includes(k));

const GOAL_KEYS = [
    "id", "sessionID", "version", "createdAt", "updatedAt", "completedAt", "status", "outcome",
    "constraints", "verificationCriteria", "verificationEvidence", "progress", "nextAction", "blocker",
    "turns", "tokensUsed", "tokenBudget", "maxTurns", "lastEvaluatedMessageId", "lastReason", "completionClaim",
];

const validClaim = (claim: unknown) => {
    const item = record(claim);

    return item !== undefined && exact(item, ["reason", "createdAt"]) && text(item.reason) && text(item.createdAt);
};

const validNumbers = (item: Record<string, unknown>) =>
    (item.turns === undefined || (typeof item.turns === "number" && item.turns >= 0)) &&
    (item.tokensUsed === undefined || (typeof item.tokensUsed === "number" && item.tokensUsed >= 0)) &&
    (item.tokenBudget === undefined || (typeof item.tokenBudget === "number" && item.tokenBudget > 0)) &&
    (item.maxTurns === undefined || (typeof item.maxTurns === "number" && item.maxTurns > 0));

const validStrings = (item: Record<string, unknown>) =>
    (item.progress === undefined || text(item.progress)) &&
    (item.nextAction === undefined || text(item.nextAction)) &&
    (item.blocker === undefined || text(item.blocker)) &&
    (item.lastEvaluatedMessageId === undefined || text(item.lastEvaluatedMessageId)) &&
    (item.lastReason === undefined || text(item.lastReason)) &&
    (item.completionClaim === undefined || validClaim(item.completionClaim));

const validGoal = (value: unknown, sessionID: string): value is GoalSnapshotGoal => {
    const item = record(value);

    if (!item || !exact(item, GOAL_KEYS)) {return false;}
    return item.sessionID === sessionID && text(item.id) && Number.isInteger(item.version) && (item.version as number) > 0 &&
        timestamp(item.createdAt) && timestamp(item.updatedAt) &&
        (item.completedAt === undefined || timestamp(item.completedAt)) &&
        typeof item.status === "string" && statuses.includes(item.status as GoalStatus) && text(item.outcome) &&
        Array.isArray(item.constraints) && item.constraints.every(text) && Array.isArray(item.verificationCriteria) &&
        item.verificationCriteria.every(text) && Array.isArray(item.verificationEvidence) && item.verificationEvidence.every(text) &&
        validNumbers(item) && validStrings(item);
};

const parse = (value: unknown, options: FileGoalStoreOptions): Goal | undefined => {
    const snapshot = record(value);

    const active = record(snapshot?.active);

    if (!snapshot || !active || !exact(snapshot, ["schema", "projectID", "sessionID", "active", "inactive"]) ||
        !exact(active, ["goal"]) || snapshot.schema !== "opencode-beanie.goals.v1" || snapshot.projectID !== options.projectID ||
        snapshot.sessionID !== options.sessionID || typeof snapshot.inactive !== "boolean" || snapshot.inactive ||
        !validGoal(active.goal, options.sessionID)) {return undefined;}
    return cloneGoal(active.goal);
};

const cloneGoal = (goal: GoalSnapshotGoal): Goal => ({
    ...goal,
    turns: goal.turns ?? 0,
    tokensUsed: goal.tokensUsed ?? 0,
    constraints: [...goal.constraints],
    verificationCriteria: [...goal.verificationCriteria],
    verificationEvidence: [...goal.verificationEvidence],
});

const withLock = async <T>(path: string, action: () => Promise<T>): Promise<T> => {
    const previous = locks.get(path) ?? Promise.resolve();

    let release!: () => void;

    const current = new Promise<void>((resolve) => { release = resolve; });

    const queued = previous.then(() => current);
    locks.set(path, queued);
    await previous;
    try { return await action(); } finally { release(); if (locks.get(path) === queued) {locks.delete(path);} }
};

export class FileGoalStore implements GoalStore {
    private readonly path: string;
    constructor(private readonly options: FileGoalStoreOptions) {
        this.path = goalsSnapshotPath(options.worktree, options.projectID, options.sessionID, options.stateRoot);
    }
    async get(): Promise<Goal | undefined> {
        return withLock(this.path, async () => { try { return parse(await Bun.file(this.path).json(), this.options); } catch { return undefined; } });
    }
    async set(goal: Goal): Promise<void> {
        await withLock(this.path, async () => {
            if (goal.sessionID !== this.options.sessionID) {throw new Error("Goal session does not match the store session.");}
            await writeAtomically(this.path, `${JSON.stringify(createSnapshot(this.options.projectID, goal))}\n`);
        });
    }
    async clear(): Promise<void> {
        await withLock(this.path, async () => { try { await unlink(this.path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") {throw error;} } });
    }
    async mutate(change: (goal: Goal | undefined) => Goal | undefined | Promise<Goal | undefined>): Promise<Goal | undefined> {
        return withLock(this.path, async () => {
            const next = await change(await this.read());

            if (next === undefined) { await this.unlink(); return undefined; }
            if (next.sessionID !== this.options.sessionID) {throw new Error("Goal session does not match the store session.");}
            await writeAtomically(this.path, `${JSON.stringify(createSnapshot(this.options.projectID, next))}\n`);
            return next;
        });
    }
    private async read() { try { return parse(await Bun.file(this.path).json(), this.options); } catch { return undefined; } }
    private async unlink() { try { await unlink(this.path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") {throw error;} } }
}
