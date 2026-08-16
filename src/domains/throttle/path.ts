import {createHash} from "node:crypto";
import {isAbsolute, relative, resolve} from "node:path";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export const throttleSnapshotPath = (worktree: string, projectID: string) => {
    const root = resolve(worktree);

    if (!isAbsolute(worktree) || !projectID.trim()) {
        throw new Error("Throttle snapshot requires an absolute worktree and project ID.");
    }

    const path = resolve(root, ".opencode", "beanie", "throttle", `${hash(projectID)}.json`);

    if (relative(root, path).startsWith("..")) {
        throw new Error("Throttle snapshot path escaped the worktree.");
    }

    return path;
};
