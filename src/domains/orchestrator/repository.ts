import {mkdir, readdir, rename, rm} from "node:fs/promises";
import {dirname, parse} from "node:path";
import type {OrchestratorJob} from "./model";
import {orchestratorRootPath} from "./path";
import {DEFAULT_MAX_ARTIFACT_BYTES, parseArtifact} from "./schema";
import {discoverSession} from "./repository-discovery";
import {createRepositoryAPI} from "./repository-api";
import {recoverJobs} from "./repository-recovery";

export type OrchestratorJobRepository = {
    save(job: OrchestratorJob): Promise<void>;
    read(rootSessionID: string, jobID: string): Promise<OrchestratorJob | undefined>;
    list(rootSessionID: string): Promise<readonly OrchestratorJob[]>;
    markInterrupted(rootSessionID?: string): Promise<void>;
    flush(): Promise<void>;
    dispose(): Promise<void>;
};

type Options = {readonly worktree: string; readonly projectID: string; readonly maxArtifactBytes?: number};
const write = async (path: string, text: string) => {
    await mkdir(dirname(path), {recursive: true});
    const temporary = `${path}.${parse(path).name}.${crypto.randomUUID()}.tmp`;

    try {
        await Bun.write(temporary, text);
        await rename(temporary, path);
    } finally {
        await rm(temporary, {force: true});
    }
};

const readFile = async (path: string, maxBytes: number) => {
    const file = Bun.file(path);

    if (file.size > maxBytes) {return undefined;}
    try {
        return parseArtifact(await file.json());
    } catch {
        return undefined;
    }
};

const discover = async (options: Options) => {
    const jobs = new Map<string, OrchestratorJob>();

    let sessions;

    try { sessions = await readdir(orchestratorRootPath(options.worktree, options.projectID), {withFileTypes: true}); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {return jobs;}
        throw error;
    }
    for (const session of sessions) {
        if (!session.isDirectory() || !/^[a-f0-9]{64}$/.test(session.name)) {continue;}
        await discoverSession(options, session.name, jobs, readFile, options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES);
    }
    return jobs;
};

const terminal = (status: OrchestratorJob["status"]) => ["completed", "failed", "cancelled", "timeout", "interrupted"].includes(status);

export const createOrchestratorJobRepository = async (options: Options): Promise<OrchestratorJobRepository> => {
    const maxBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;

    const jobs = await discover({...options, maxArtifactBytes: maxBytes});

    let pending = Promise.resolve();

    const enqueue = (operation: () => Promise<void>) => {
        const next = pending.then(operation);
        pending = next.catch(() => undefined);
        return next;
    };
    await enqueue(() => recoverJobs({worktree: options.worktree, projectID: options.projectID, maxBytes, jobs, terminal, write}));
    return createRepositoryAPI({worktree: options.worktree, projectID: options.projectID, maxBytes, jobs, enqueue, terminal, getPending: () => pending, write, disposed: false});
};
