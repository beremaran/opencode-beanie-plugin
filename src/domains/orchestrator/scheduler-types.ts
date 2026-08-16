import type {Decomposition} from "./decomposition";
import type {OrchestratorConfig, OrchestratorJob} from "./model";
import type {OrchestratorJobRepository} from "./repository";
import type {SessionRunResult, SessionRunnerRequest} from "./session-runner";

export type SchedulerInput = {readonly rootSessionID: string; readonly title: string; readonly objective: string; readonly constraints: readonly string[]; readonly verification: readonly string[]; readonly manager: string | Decomposition};
export type SchedulerJobMetadata = Pick<OrchestratorJob, "id" | "rootSessionID" | "title" | "status" | "createdAt">;
export type SessionRunner = (request: SessionRunnerRequest) => Promise<SessionRunResult>;
export type SchedulerDependencies = {readonly repository: OrchestratorJobRepository; readonly runner: SessionRunner; readonly now?: () => string; readonly nowMs?: () => number; readonly id?: (kind: "job" | "node") => string};
export type SchedulerOptions = {readonly config: OrchestratorConfig; readonly dependencies: SchedulerDependencies};
export type Scheduler = {start(input: SchedulerInput): Promise<SchedulerJobMetadata>; read(rootSessionID: string, jobID: string): Promise<OrchestratorJob | undefined>; list(rootSessionID: string): Promise<readonly OrchestratorJob[]>; wait(rootSessionID: string, jobID: string): Promise<OrchestratorJob>; cancel(rootSessionID: string, jobID: string): Promise<void>; dispose(): Promise<void>};
