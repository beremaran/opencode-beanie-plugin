import type {OrchestratorJob, OrchestratorNode, OrchestratorStatus} from "./model";

const terminalStatuses = new Set<OrchestratorStatus>([
  "completed",
  "failed",
  "cancelled",
  "timeout",
  "interrupted",
]);

const transitions: Record<OrchestratorStatus, readonly OrchestratorStatus[]> = {
  registered: ["registered", "running", "cancelled", "interrupted"],
  running: ["running", "completed", "failed", "cancelled", "timeout", "interrupted"],
  completed: ["completed"],
  failed: ["failed"],
  cancelled: ["cancelled"],
  timeout: ["timeout"],
  interrupted: ["interrupted"],
};

export function canTransitionNode(from: OrchestratorStatus, to: OrchestratorStatus): boolean {
  return transitions[from].includes(to);
}

export type TransitionResult =
  | {ok: true; node: OrchestratorNode}
  | {ok: false; error: string};

export function transitionNode(node: OrchestratorNode, status: OrchestratorStatus): TransitionResult {
  if (!canTransitionNode(node.status, status)) {
    return {ok: false, error: `Cannot transition ${node.status} to ${status}.`};
  }

  return {ok: true, node: {...node, status}};
}

export type JobTransitionResult =
  | {ok: true; job: OrchestratorJob}
  | {ok: false; error: string};

export function canTransitionJob(from: OrchestratorStatus, to: OrchestratorStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionJob(job: OrchestratorJob, status: OrchestratorStatus): JobTransitionResult {
  if (!canTransitionJob(job.status, status)) {
    return {ok: false, error: `Cannot transition ${job.status} to ${status}.`};
  }

  return {ok: true, job: {...job, status}};
}

export function isTerminalStatus(status: OrchestratorStatus): boolean {
  return terminalStatuses.has(status);
}
