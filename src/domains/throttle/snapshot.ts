export const THROTTLE_CAPACITY = 2;

export type SnapshotTask = Readonly<{
    callID: string
    sessionID?: string
}>;

export type ThrottleSnapshot = Readonly<{
    schema: "opencode-beanie.throttle.v1"
    sequence: number
    capacity: 2
    active: Readonly<{
        count: number
        foreground: readonly SnapshotTask[]
        background: readonly SnapshotTask[]
    }>
    queued: Readonly<{
        count: number
        calls: readonly SnapshotTask[]
    }>
    inactive: boolean
}>;

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);

export const createSnapshot = (
    sequence: number,
    active: ThrottleSnapshot["active"],
    queued: ThrottleSnapshot["queued"],
    inactive = false,
): ThrottleSnapshot => freeze({
    schema: "opencode-beanie.throttle.v1",
    sequence,
    capacity: THROTTLE_CAPACITY,
    active: freeze({
        count: active.count,
        foreground: freeze(active.foreground.map((task) => freeze({...task}))),
        background: freeze(active.background.map((task) => freeze({...task}))),
    }),
    queued: freeze({
        count: queued.count,
        calls: freeze(queued.calls.map((task) => freeze({...task}))),
    }),
    inactive,
});

export const emptySnapshot = (sequence: number): ThrottleSnapshot =>
    createSnapshot(sequence, {count: 0, foreground: [], background: []}, {
        count: 0,
        calls: [],
    }, true);
