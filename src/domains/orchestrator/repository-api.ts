import type {OrchestratorJob} from "./model";
import type {OrchestratorJobRepository} from "./repository";
import {artifactJSON, isOrchestratorJob} from "./schema";
import {orchestratorJobPath, orchestratorSessionHash, validateOrchestratorJobID} from "./path";

export type RepositoryContext = {readonly worktree: string; readonly projectID: string; readonly maxBytes: number; readonly jobs: Map<string, OrchestratorJob>; readonly enqueue: (operation: () => Promise<void>) => Promise<void>; readonly terminal: (status: OrchestratorJob["status"]) => boolean; readonly getPending: () => Promise<void>; disposed: boolean; readonly write: (path: string, text: string) => Promise<void>};

const identity = (rootSessionID: string, jobID: string) => `${rootSessionID}\0${jobID}`;

function save(context: RepositoryContext, job: OrchestratorJob) {
  if (context.disposed) {return Promise.reject(new Error("Orchestrator job repository is disposed."));}
  orchestratorJobPath(context.worktree, context.projectID, job.rootSessionID, job.id);
  if (!isOrchestratorJob(job)) {return Promise.reject(new Error("Invalid orchestrator job."));}
  return context.enqueue(async () => {await context.write(orchestratorJobPath(context.worktree, context.projectID, job.rootSessionID, job.id), artifactJSON(job, context.maxBytes)); context.jobs.set(identity(job.rootSessionID, job.id), job);});
}

export function createRepositoryAPI(context: RepositoryContext): OrchestratorJobRepository {
  return {
    save: (job) => save(context, job),
    read: (rootSessionID, jobID) => {orchestratorSessionHash(rootSessionID); validateOrchestratorJobID(jobID); return Promise.resolve(context.jobs.get(identity(rootSessionID, jobID)));},
    list: (rootSessionID) => {orchestratorSessionHash(rootSessionID); return Promise.resolve([...context.jobs.values()].filter((job) => job.rootSessionID === rootSessionID));},
    markInterrupted: (rootSessionID) => context.enqueue(async () => {
      if (rootSessionID !== undefined) {orchestratorSessionHash(rootSessionID);}
      for (const [key, job] of context.jobs) {if ((!rootSessionID || job.rootSessionID === rootSessionID) && !context.terminal(job.status)) {
        const timestamp = new Date().toISOString();

 const recovered = {...job, status: "interrupted" as const, updatedAt: timestamp, completedAt: timestamp};
        await context.write(orchestratorJobPath(context.worktree, context.projectID, recovered.rootSessionID, recovered.id), artifactJSON(recovered, context.maxBytes)); context.jobs.set(key, recovered);
      }}
    }),
    flush: () => context.getPending(),
    dispose: async () => {await context.getPending(); context.disposed = true;},
  };
}
