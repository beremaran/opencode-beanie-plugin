import type {PluginInput} from "@opencode-ai/plugin";
import type {Goal} from "./model";
import {goalsSnapshotPath} from "./path";
import {createSnapshot, emptySnapshot} from "./snapshot";
import {createSnapshotWriter} from "./storage";

type Writer = ReturnType<typeof createSnapshotWriter>;

const snapshotLocation = (input: PluginInput, sessionID: string) => {
    const candidate = input as unknown as {worktree?: unknown; project?: {id?: unknown}};

    const worktree = typeof candidate.worktree === "string" ? candidate.worktree : undefined;

    const projectID = typeof candidate.project?.id === "string" ? candidate.project.id : undefined;

    return worktree && projectID ? goalsSnapshotPath(worktree, projectID, sessionID) : undefined;
};

export const createGoalPublisher = (input: PluginInput) => {
    const writers = new Map<string, Writer>();

    const candidate = input as unknown as {project?: {id?: unknown}};

    const projectID = typeof candidate.project?.id === "string" ? candidate.project.id : undefined;

    const writerFor = (sessionID: string) => {
        const existing = writers.get(sessionID);

        if (existing) {
            return existing;
        }

        const path = snapshotLocation(input, sessionID);

        if (!path) {
            return;
        }

        const writer = createSnapshotWriter(path);
        writers.set(sessionID, writer);
        return writer;
    };

    const publish = (goal: Goal) => {
        if (!projectID) {
            return;
        }

        writerFor(goal.sessionID)?.publish(createSnapshot(projectID, goal));
    };

    const empty = (sessionID: string) => {
        if (!projectID) {
            return;
        }

        writerFor(sessionID)?.publish(emptySnapshot(projectID, sessionID));
    };

    const dispose = async () => {
        if (projectID) {
            writers.forEach((writer, sessionID) => {
                writer.publish(emptySnapshot(projectID, sessionID));
            });
        }

        try {
            await Promise.all([...writers.values()].map((writer) => writer.flush()));
        } finally {
            writers.clear();
        }
    };

    return {publish, empty, dispose};
};
