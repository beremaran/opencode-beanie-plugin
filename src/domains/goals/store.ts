import {unlink} from "node:fs/promises";
import type {Goal} from "./model";
import {goalsSnapshotPath} from "./path";
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

const statuses = ["active", "paused", "blocked", "completed", "cancelled"] as const;

const timestamp = (value: unknown): value is string => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value));

const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;

const exact = (value: Record<string, unknown>, keys: string[]) =>
    Object.keys(value).every((key) => keys.includes(key));

const validGoal = (value: unknown, sessionID: string): value is GoalSnapshotGoal => {
    const item = record(value);

    if (!item || !exact(item, ["id", "sessionID", "version", "createdAt", "updatedAt", "completedAt", "status",
        "outcome", "constraints", "verificationCriteria", "verificationEvidence", "progress", "nextAction", "blocker"])) {return false;}
    return item.sessionID === sessionID && text(item.id) && Number.isInteger(item.version) && (item.version as number) > 0 &&
        timestamp(item.createdAt) && timestamp(item.updatedAt) &&
        (item.completedAt === undefined || timestamp(item.completedAt)) &&
        typeof item.status === "string" && statuses.includes(item.status as Goal["status"]) && text(item.outcome) &&
        Array.isArray(item.constraints) && item.constraints.every(text) && Array.isArray(item.verificationCriteria) &&
        item.verificationCriteria.every(text) && Array.isArray(item.verificationEvidence) && item.verificationEvidence.every(text) &&
        (item.progress === undefined || text(item.progress)) && (item.nextAction === undefined || text(item.nextAction)) &&
        (item.blocker === undefined || text(item.blocker));
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

const cloneGoal = (goal: GoalSnapshotGoal): Goal => ({...goal, constraints: [...goal.constraints],
    verificationCriteria: [...goal.verificationCriteria], verificationEvidence: [...goal.verificationEvidence]});

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
            const current = await this.read();

            const next = await change(current);

            if (next === undefined) { await this.unlink(); return undefined; }
            if (next.sessionID !== this.options.sessionID) {throw new Error("Goal session does not match the store session.");}
            await writeAtomically(this.path, `${JSON.stringify(createSnapshot(this.options.projectID, next))}\n`);
            return next;
        });
    }

    private async read() { try { return parse(await Bun.file(this.path).json(), this.options); } catch { return undefined; } }
    private async unlink() { try { await unlink(this.path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") {throw error;} } }
}
