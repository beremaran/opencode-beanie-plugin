import {mkdir, rename, rm} from "node:fs/promises";
import {dirname, parse} from "node:path";
import type {ThrottleSnapshot} from "./snapshot";

export const readThrottleSnapshot = async (path: string) => {
    const parsed: unknown = await Bun.file(path).json();

    if (!isThrottleSnapshot(parsed)) {
        throw new Error("Invalid throttle snapshot.");
    }

    return parsed;
};

const isThrottleSnapshot = (value: unknown): value is ThrottleSnapshot => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const snapshot = value as {
        schema?: unknown
        capacity?: unknown
        sequence?: unknown
        active?: unknown
        queued?: unknown
        inactive?: unknown
    };

    const active = record(snapshot.active);

    const queued = record(snapshot.queued);

    return snapshot.schema === "opencode-beanie.throttle.v1" &&
        snapshot.capacity === 2 && integer(snapshot.sequence) &&
        active !== undefined && queued !== undefined && validTasks(active.foreground) &&
        validTasks(active.background) && validTasks(queued.calls) && integer(active.count) &&
        integer(queued.count) && active.count ===
        (active.foreground.length + active.background.length) &&
        queued.count === queued.calls.length && typeof snapshot.inactive === "boolean";
};

const record = (value: unknown) =>
    typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;

const integer = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0;

const validTasks = (value: unknown): value is readonly unknown[] =>
    Array.isArray(value) && value.every((task) => {
        const item = record(task);

        return typeof item?.callID === "string" &&
            (item.sessionID === undefined || typeof item.sessionID === "string");
    });

export const writeThrottleSnapshot = async (
    path: string,
    snapshot: ThrottleSnapshot,
): Promise<void> => {
    await mkdir(dirname(path), {recursive: true});
    const temporary = `${path}.${parse(path).name}.${crypto.randomUUID()}.tmp`;

    try {
        await Bun.write(temporary, `${JSON.stringify(snapshot)}\n`);
        await rename(temporary, path);
    } finally {
        await rm(temporary, {force: true});
    }
};

export const createSnapshotWriter = (path: string) => {
    let pending: ThrottleSnapshot | undefined;

    let writing: Promise<void> | undefined;

    const drain = async () => {
        while (pending) {
            const next = pending;
            pending = undefined;
            await writeThrottleSnapshot(path, next);
        }
    };

    const publish = (snapshot: ThrottleSnapshot) => {
        pending = snapshot;
        writing ??= drain().finally(() => {
            writing = undefined;
        });
    };

    return {
        publish,
        flush: async () => writing,
    };
};
