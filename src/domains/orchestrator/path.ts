import {createHash} from "node:crypto";
import {isAbsolute, relative, resolve} from "node:path";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const safeID = (value: string, label: string) => {
    if (!value.trim() || value === "." || value === ".." || /[\\/\0]/.test(value)) {
        throw new Error(`Orchestrator ${label} must be a safe path segment.`);
    }
    return value;
};

export const validateOrchestratorJobID = (jobID: string) => safeID(jobID, "job ID");

export const orchestratorRootPath = (worktree: string, projectID: string) => {
    if (!isAbsolute(worktree) || !projectID.trim()) {
        throw new Error("Orchestrator storage requires an absolute worktree and project ID.");
    }
    return resolve(worktree, ".opencode", "beanie", "orchestrator", hash(projectID));
};

export const orchestratorJobPath = (
    worktree: string,
    projectID: string,
    rootSessionID: string,
    jobID: string,
) => {
    const root = resolve(worktree);

    const path = resolve(orchestratorRootPath(worktree, projectID), hash(safeID(rootSessionID, "root session ID")), `${validateOrchestratorJobID(jobID)}.json`);

    if (relative(root, path).startsWith("..")) {
        throw new Error("Orchestrator artifact path escaped the worktree.");
    }
    return path;
};

export const orchestratorSessionPath = (worktree: string, projectID: string, rootSessionID: string) =>
    resolve(orchestratorRootPath(worktree, projectID), hash(safeID(rootSessionID, "root session ID")));

export const orchestratorProjectHash = (projectID: string) => hash(projectID);
export const orchestratorSessionHash = (rootSessionID: string) => hash(safeID(rootSessionID, "root session ID"));
