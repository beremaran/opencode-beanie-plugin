import {mkdir, rename, rm} from "node:fs/promises";
import {dirname, parse} from "node:path";
import type {GoalSnapshot} from "./snapshot";

export const writeGoalSnapshot = async (path: string, snapshot: GoalSnapshot): Promise<void> => {
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
    let pending: GoalSnapshot | undefined;

    let writing: Promise<void> | undefined;

    const drain = async () => {
        while (pending) {
            const next = pending;
            pending = undefined;
            await writeGoalSnapshot(path, next);
        }
    };

    const publish = (snapshot: GoalSnapshot) => {
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
