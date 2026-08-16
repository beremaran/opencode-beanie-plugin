import type {GraphClock, NodeUpdate} from "./graph";
import type {Decomposition} from "./decomposition";
import type {OrchestratorJob, OrchestratorStatus} from "./model";
import type {OrchestratorJobRepository} from "./repository";
import {createRuntimeState} from "./runtime-state-factory";

export type OrchestratorRuntimeState = {
  snapshot(): OrchestratorJob;
  persistInitialJob(): Promise<void>;
  updateNode(nodeID: string, update: NodeUpdate, options?: {readonly incrementAttempt?: boolean}): Promise<void>;
  transitionNode(nodeID: string, status: OrchestratorStatus, update?: NodeUpdate): Promise<void>;
  appendDecomposition(nodeID: string, decomposition: string | Decomposition): Promise<void>;
  updateJob(update: Partial<Pick<OrchestratorJob, "result" | "error" | "startedAt" | "completedAt">>): Promise<void>;
  transitionJob(status: OrchestratorStatus): Promise<void>;
  markRemaining(status: Extract<OrchestratorStatus, "cancelled" | "failed" | "timeout" | "interrupted">): Promise<void>;
};

export type RuntimeStateDependencies = {readonly repository: OrchestratorJobRepository; readonly now: GraphClock};

export const createOrchestratorRuntimeState = (initial: OrchestratorJob, dependencies: RuntimeStateDependencies): OrchestratorRuntimeState => createRuntimeState(initial, dependencies);
