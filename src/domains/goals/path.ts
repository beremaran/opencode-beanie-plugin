import {createHash} from "node:crypto";
import {homedir} from "node:os";
import {isAbsolute, join, resolve} from "node:path";

const hash = (...values: string[]) => createHash("sha256").update(values.join("\0")).digest("hex");

const validateInputs = (worktree: string, projectID: string, sessionID?: string) => {
    if (!isAbsolute(worktree) || !projectID.trim() || (sessionID !== undefined && !sessionID.trim())) {
        throw new Error("Goals snapshot requires an absolute worktree, project ID, and session ID.");
    }
};

export const defaultStateRoot = (stateRoot?: string) => {
    if (stateRoot !== undefined) {
        return resolve(stateRoot, "opencode-beanie-plugin");
    }

    const stateHome = process.env.XDG_STATE_HOME?.trim();

    return resolve(stateHome || join(homedir(), ".local", "state"), "opencode-beanie-plugin");
};

export const scopedStateDirectory = (worktree: string, projectID: string, stateRoot?: string) => {
    validateInputs(worktree, projectID);
    return join(defaultStateRoot(stateRoot), hash(projectID, resolve(worktree)));
};

export const goalsSnapshotPath = (worktree: string, projectID: string, sessionID: string, stateRoot?: string) => {
    validateInputs(worktree, projectID, sessionID);
    return join(scopedStateDirectory(worktree, projectID, stateRoot), `${hash(sessionID)}.json`);
};
