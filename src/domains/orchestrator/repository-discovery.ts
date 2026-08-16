import {readdir} from "node:fs/promises";
import {resolve} from "node:path";
import type {OrchestratorJob} from "./model";
import {orchestratorRootPath, orchestratorSessionHash} from "./path";
import {isOrchestratorJob} from "./schema";

type Options = {readonly worktree: string; readonly projectID: string; readonly maxArtifactBytes?: number};
type ReadArtifact = (path: string, maxBytes: number) => Promise<OrchestratorJob | undefined>;

const key = (rootSessionID: string, jobID: string) => `${rootSessionID}\0${jobID}`;

export async function discoverSession(options: Options, sessionHash: string, jobs: Map<string, OrchestratorJob>, readFile: ReadArtifact, maxBytes: number) {
  const sessionPath = resolve(orchestratorRootPath(options.worktree, options.projectID), sessionHash);

  let entries;

  try {entries = await readdir(sessionPath, {withFileTypes: true});} catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {return;}
    throw error;
  }
  await loadEntries(entries, sessionPath, jobs, readFile, maxBytes, sessionHash);
}

async function loadEntries(entries: readonly import("node:fs").Dirent[], sessionPath: string, jobs: Map<string, OrchestratorJob>, readFile: ReadArtifact, maxBytes: number, sessionHash: string) {
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {continue;}

    const id = entry.name.slice(0, -5);

    const job = await readFile(resolve(sessionPath, entry.name), maxBytes);

    if (job && job.id === id && isOrchestratorJob(job) && orchestratorSessionHash(job.rootSessionID) === sessionHash) {jobs.set(key(job.rootSessionID, job.id), job);}
  }
}
