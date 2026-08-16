import type {Event} from "@opencode-ai/sdk";
import type {Domain} from "../../shared/domain";
import {createPermitPool} from "./permits";
import {throttleSnapshotPath} from "./path";
import {createThrottlePublisher, type ThrottleTask} from "./publisher";
import {createSnapshotWriter} from "./storage";

type TaskCall = {tool: string; sessionID: string; callID: string};
type TaskOutput = {title: string; output: string; metadata: unknown};
type TaskMetadata = {background?: boolean; sessionId?: string};
type Child = {callID: string; release: () => void};

const MAX_TERMINAL_CHILDREN = 1024;

const isTaskMetadata = (metadata: unknown): metadata is TaskMetadata =>
    typeof metadata === "object" && metadata !== null;

const childSessionID = (metadata: unknown) =>
    isTaskMetadata(metadata) && typeof metadata.sessionId === "string"
        ? metadata.sessionId
        : undefined;

const isBackground = (metadata: unknown) =>
    isTaskMetadata(metadata) && metadata.background === true;

const terminalSessionID = (event: Event) => {
    if (event.type === "session.idle" || event.type === "session.error") {
        return event.properties.sessionID;
    }

    return event.type === "session.deleted" ? event.properties.info.id : undefined;
};

const snapshotLocation = (input: unknown) => {
    const candidate = input as {worktree?: unknown; project?: {id?: unknown}};

    const worktree = typeof candidate.worktree === "string" ? candidate.worktree : undefined;

    const projectID = typeof candidate.project?.id === "string" ? candidate.project.id : undefined;

    return worktree && projectID ? throttleSnapshotPath(worktree, projectID) : undefined;
};

const createWriter = (input: unknown) => {
    const path = snapshotLocation(input);

    return path ? createSnapshotWriter(path) : {publish: () => {}, flush: async () => {}};
};

export const ThrottleDomain: Domain = (input) => {
    const permits = createPermitPool();

    const writer = createWriter(input);

    const tasks = new Map<string, ThrottleTask>();

    const publisher = createThrottlePublisher(permits, tasks, writer);

    const calls = new Map<string, () => void>();

    const children = new Map<string, Child>();

    const terminalChildren = new Set<string>();

    let disposed = false;

    permits.onChange(({type, label}) => {
        if (type === "admitted" && label) {
            publisher.admitted(label);
        }

        if (!disposed || type === "disposed") {
            publisher.publish(type === "disposed");
        }
    });

    publisher.publish();

    const before = async (inputCall: TaskCall) => {
        if (inputCall.tool !== "task") {
            return;
        }

        tasks.set(inputCall.callID, {phase: "queued"});

        try {
            calls.set(inputCall.callID, await permits.acquire(inputCall.callID));
        } catch (error) {
            tasks.delete(inputCall.callID);
            publisher.publish();
            throw error;
        }
    };

    const after = (inputCall: TaskCall, output: TaskOutput) => {
        if (inputCall.tool !== "task") {
            return Promise.resolve();
        }

        const release = calls.get(inputCall.callID);
        calls.delete(inputCall.callID);

        if (!release) {
            return Promise.resolve();
        }

        const sessionID = childSessionID(output.metadata);

        if (!isBackground(output.metadata) || !sessionID) {
            tasks.delete(inputCall.callID);
            release();
            return Promise.resolve();
        }

        if (terminalChildren.delete(sessionID)) {
            tasks.delete(inputCall.callID);
            release();
            return Promise.resolve();
        }

        tasks.set(inputCall.callID, {phase: "background", sessionID});
        children.set(sessionID, {callID: inputCall.callID, release});
        publisher.publish();
        return Promise.resolve();
    };

    const event = ({event: received}: {event: Event}) => {
        const sessionID = terminalSessionID(received);

        if (!sessionID) {
            return Promise.resolve();
        }

        const child = children.get(sessionID);

        if (child) {
            children.delete(sessionID);
            tasks.delete(child.callID);
            child.release();
        } else {
            if (terminalChildren.size >= MAX_TERMINAL_CHILDREN) {
                const oldest = terminalChildren.values().next().value;

                if (oldest) {
                    terminalChildren.delete(oldest);
                }
            }
            terminalChildren.add(sessionID);
            publisher.publish();
        }

        return Promise.resolve();
    };

    const dispose = async () => {
        disposed = true;
        calls.forEach((release, callID) => {
            tasks.delete(callID);
            release();
        });
        children.forEach(({callID, release}) => {
            tasks.delete(callID);
            release();
        });
        calls.clear();
        children.clear();
        terminalChildren.clear();
        permits.dispose();
        tasks.clear();
        publisher.empty();
        await writer.flush();
    };

    return Promise.resolve({
        "tool.execute.before": before,
        "tool.execute.after": after,
        event,
        dispose,
    });
};
