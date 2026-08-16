import type {PermitPool} from "./permits";
import {createSnapshot, emptySnapshot, type SnapshotTask} from "./snapshot";
import type {createSnapshotWriter} from "./storage";

export type ThrottleTask = {
    phase: "queued" | "foreground" | "background"
    sessionID?: string
};

type Publisher = {
    publish: (inactive?: boolean) => void
    empty: () => void
    admitted: (label: string) => void
};

const taskDetail = (callID: string, task: ThrottleTask): SnapshotTask => ({
    callID,
    ...(task.sessionID ? {sessionID: task.sessionID} : {}),
});

const taskLists = (tasks: Map<string, ThrottleTask>) => {
    const foreground: SnapshotTask[] = [];

    const background: SnapshotTask[] = [];

    const calls: SnapshotTask[] = [];

    tasks.forEach((task, callID) => {
        const detail = taskDetail(callID, task);

        if (task.phase === "queued") {
            calls.push(detail);
        } else if (task.phase === "foreground") {
            foreground.push(detail);
        } else {
            background.push(detail);
        }
    });

    return {foreground, background, calls};
};

export const createThrottlePublisher = (
    permits: PermitPool,
    tasks: Map<string, ThrottleTask>,
    writer: ReturnType<typeof createSnapshotWriter>,
): Publisher => {
    let sequence = 0;

    const publish = (inactive = false) => {
        const {foreground, background, calls} = taskLists(tasks);

        writer.publish(createSnapshot(sequence += 1, {
            count: permits.state().active,
            foreground,
            background,
        }, {count: permits.state().queued.length, calls}, inactive));
    };

    const empty = () => {
        writer.publish(emptySnapshot(sequence += 1));
    };

    const admitted = (label: string) => {
        const task = tasks.get(label);

        if (task) {
            task.phase = "foreground";
        }
    };

    return {publish, empty, admitted};
};
