import type {ThrottleSnapshot} from "./snapshot";

export type ThrottleStatus = Readonly<{
    active: number
    capacity: number
    queued: number
    foreground: number
    background: number
}>;

const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null
        ? value as Record<string, unknown>
        : undefined;

const count = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0;

const validSnapshot = (value: unknown): value is ThrottleSnapshot => {
    const snapshot = record(value);

    const active = record(snapshot?.active);

    const queued = record(snapshot?.queued);

    return snapshot?.schema === "opencode-beanie.throttle.v1" &&
        snapshot.capacity === 2 && count(snapshot.sequence) &&
        typeof snapshot.inactive === "boolean" && active !== undefined &&
        validTasks(active.foreground) && validTasks(active.background) &&
        count(active.count) && queued !== undefined && validTasks(queued.calls) &&
        count(queued.count) && active.count === active.foreground.length + active.background.length &&
        queued.count === queued.calls.length;
};

const validTasks = (value: unknown): value is readonly unknown[] =>
    Array.isArray(value) && value.every((task) => {
        const item = record(task);

        return typeof item?.callID === "string" &&
            (item.sessionID === undefined || typeof item.sessionID === "string");
    });

export const parseThrottleStatus = (value: unknown): ThrottleStatus | undefined => {
    if (!validSnapshot(value) || value.inactive) {
        return undefined;
    }

    return {
        active: value.active.count,
        capacity: value.capacity,
        queued: value.queued.count,
        foreground: value.active.foreground.length,
        background: value.active.background.length,
    };
};

export const readThrottleStatus = async (path: string) => {
    try {
        return parseThrottleStatus(await Bun.file(path).json());
    } catch {
        return undefined;
    }
};
