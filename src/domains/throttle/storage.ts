import {mkdir, rename, rm} from "node:fs/promises";
import {dirname, parse} from "node:path";
import type {ThrottleSnapshot} from "./snapshot";

export const readThrottleSnapshot = async (path: string) => {
    const parsed: unknown = await Bun.file(path).json();

    if (!hasRequiredFields(parsed)) {
        throw new Error("Invalid throttle snapshot.");
    }

    return parsed;
};

const validateSnapshot = (snapshot: {schema?: unknown; capacity?: unknown; sequence?: unknown; active?: unknown; queued?: unknown; inactive?: unknown}) =>
    snapshot.schema === "opencode-beanie.throttle.v1" &&
    snapshot.capacity === 2 && integer(snapshot.sequence) &&
    typeof snapshot.inactive === "boolean";

const validateCounts = (active: Record<string, unknown> | undefined, queued: Record<string, unknown> | undefined) =>
    active !== undefined && queued !== undefined &&
    validTasks(active.foreground) && validTasks(active.background) &&
    validTasks(queued.calls) && integer(active.count) &&
    integer(queued.count) &&
    active.count === active.foreground.length + active.background.length &&
    queued.count === queued.calls.length;

const hasRequiredFields = (value: unknown): value is ThrottleSnapshot => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const snapshot = value as {
        schema?: unknown; capacity?: unknown; sequence?: unknown;
        active?: unknown; queued?: unknown; inactive?: unknown;
    };

    const active = record(snapshot.active);

    const queued = record(snapshot.queued);

    return validateSnapshot(snapshot) && validateCounts(active, queued);
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

const drain = (path: string, getPending: () => ThrottleSnapshot | undefined, setPending: (v: ThrottleSnapshot | undefined) => void) =>
    async () => {
        while (getPending()) {
            const next = getPending();
            setPending(undefined);
            if (next) {
                await writeThrottleSnapshot(path, next);
            }
        }
    };

export const createSnapshotWriter = (path: string) => {
    let pending: ThrottleSnapshot | undefined;

    let writing: Promise<void> | undefined;

    const publish = (snapshot: ThrottleSnapshot) => {
        pending = snapshot;
        writing ??= drain(path, () => pending, (v) => { pending = v; })().finally(() => {
            writing = undefined;
        });
    };

    return {
        publish,
        flush: async () => writing,
    };
};
