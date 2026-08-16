import type {OrchestratorJob} from "./model";
import {artifactJSON} from "./schema";
import {orchestratorJobPath} from "./path";

type RecoveryContext = {readonly worktree: string; readonly projectID: string; readonly maxBytes: number; readonly jobs: Map<string, OrchestratorJob>; readonly write: (path: string, text: string) => Promise<void>; readonly terminal: (status: OrchestratorJob["status"]) => boolean};

export async function recoverJobs(context: RecoveryContext) {
  for (const [identity, job] of context.jobs) {if (!context.terminal(job.status) && job.status !== "interrupted") {
    const timestamp = new Date().toISOString();

    const recovered = {...job, status: "interrupted" as const, updatedAt: timestamp, completedAt: timestamp};
    await context.write(orchestratorJobPath(context.worktree, context.projectID, recovered.rootSessionID, recovered.id), artifactJSON(recovered, context.maxBytes));
    context.jobs.set(identity, recovered);
  }}
}
