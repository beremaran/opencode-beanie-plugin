import {createHash} from "node:crypto";
import {isAbsolute, relative, resolve} from "node:path";

const hash = (projectID: string, sessionID: string) => createHash("sha256").update(`${projectID}\0${sessionID}`).digest("hex");

export const goalsSnapshotPath = (worktree: string, projectID: string, sessionID: string) => {
    const root = resolve(worktree);

    if (!isAbsolute(worktree) || !projectID.trim() || !sessionID.trim()) {
        throw new Error("Goals snapshot requires an absolute worktree, project ID, and session ID.");
    }

    const path = resolve(root, ".opencode", "beanie", "goals", `${hash(projectID, sessionID)}.json`);

    if (relative(root, path).startsWith("..")) {
        throw new Error("Goals snapshot path escaped the worktree.");
    }

    return path;
};
