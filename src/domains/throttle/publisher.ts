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

const classify = (task: ThrottleTask, callID: string, lists: {foreground: SnapshotTask[]; background: SnapshotTask[]; calls: SnapshotTask[]}) => {
    const detail = taskDetail(callID, task);

    if (task.phase === "queued") {
        lists.calls.push(detail);
    } else if (task.phase === "foreground") {
        lists.foreground.push(detail);
    } else {
        lists.background.push(detail);
    }
};

const taskLists = (tasks: Map<string, ThrottleTask>) => {
    const lists = {foreground: [] as SnapshotTask[], background: [] as SnapshotTask[], calls: [] as SnapshotTask[]};
    tasks.forEach((task, callID) => { classify(task, callID, lists); });
    return lists;
};

const doPublish = (
    permits: PermitPool,
    tasks: Map<string, ThrottleTask>,
    writer: ReturnType<typeof createSnapshotWriter>,
    sequenceRef: {value: number},
    inactive = false,
) => {
    const {foreground, background, calls} = taskLists(tasks);
    sequenceRef.value += 1;
    writer.publish(createSnapshot(sequenceRef.value, {
        count: permits.state().active,
        foreground,
        background,
    }, {count: permits.state().queued.length, calls}, inactive));
};

const doEmpty = (
    writer: ReturnType<typeof createSnapshotWriter>,
    sequenceRef: {value: number},
) => {
    sequenceRef.value += 1;
    writer.publish(emptySnapshot(sequenceRef.value));
};

const doAdmitted = (tasks: Map<string, ThrottleTask>, label: string) => {
    const task = tasks.get(label);

    if (task) {
        task.phase = "foreground";
    }
};

export const createThrottlePublisher = (
    permits: PermitPool,
    tasks: Map<string, ThrottleTask>,
    writer: ReturnType<typeof createSnapshotWriter>,
): Publisher => {
    const sequenceRef = {value: 0};

    return {
        publish: (inactive) => { doPublish(permits, tasks, writer, sequenceRef, inactive); },
        empty: () => { doEmpty(writer, sequenceRef); },
        admitted: (label) => { doAdmitted(tasks, label); },
    };
};
