import type {Decomposition} from "./decomposition";
import type {ChildResult} from "./prompts";
import type {OrchestratorConfig, OrchestratorJob, OrchestratorNode, OrchestratorRole} from "./model";
import {appendJobChildren, buildJob} from "./graph-builders";
import {parseGraphInput, validateAppend, validateUpdate} from "./graph-validation";

export type GraphClock = () => string;
export type GraphID = (kind: "job" | "node") => string;
export type GraphDependencies = {readonly now: GraphClock; readonly id: GraphID};
export type GraphResult = {ok: true; job: OrchestratorJob} | {ok: false; errors: readonly string[]};
export type NodeUpdate = Partial<Pick<OrchestratorNode, "title" | "objective" | "constraints" | "verification" | "status" | "result" | "error" | "startedAt" | "completedAt" | "childSessionID" | "attempt">>;

const defaults: GraphDependencies = {now: () => new Date().toISOString(), id: (kind) => `${kind}-${crypto.randomUUID()}`};

function promptErrors(title: string, objective: string, constraints: readonly string[], verification: readonly string[], config: OrchestratorConfig): string[] {
  const values = [title, objective, ...constraints, ...verification];

  const errors = values.some((value) => value.trim() === "") ? ["prompt fields must be non-empty"] : [];

  if (constraints.length > config.limits.maxNodes || verification.length > config.limits.maxNodes) {errors.push("prompt lists exceed maxNodes");}
  if (values.some((value) => value.length > config.limits.maxPromptChars)) {errors.push("prompt field exceeds maxPromptChars");}
  if (values.reduce((total, value) => total + value.length, 0) > config.limits.maxPromptChars) {errors.push("prompt content exceeds maxPromptChars");}
  return errors;
}

function validIDs(job: OrchestratorJob): string[] {
  const seen = new Set<string>();

  const errors: string[] = [];

  for (const id of [job.id, ...job.graph.nodes.map((item) => item.id)]) {
    if (seen.has(id)) {errors.push(`duplicate id ${id}`);}
    seen.add(id);
  }
  if (job.graph.nodes.length > job.config.limits.maxNodes) {errors.push("maxNodes exceeded");}

  return errors;
}

export function createOrchestratorJob(rootSessionID: string, objective: string, title: string, constraints: readonly string[], verification: readonly string[], config: OrchestratorConfig, decomposition: string | Decomposition, injected: Partial<GraphDependencies> = {}): GraphResult {
  const dependencies = {...defaults, ...injected};

  const rootErrors = promptErrors(title, objective, constraints, verification, config);

  if (rootErrors.length > 0) {return {ok: false, errors: rootErrors};}

  const parsed = parseGraphInput(decomposition, config, config.manager.fanOut);

  if (!parsed.ok) {return parsed;}

  const role: OrchestratorRole = config.coordinators.length > 0 ? "coordinator" : "build";

  const result = buildJob(rootSessionID, objective, title, constraints, verification, config, parsed.value, role, dependencies);

  const errors = validIDs(result);

  return errors.length === 0 ? {ok: true, job: result} : {ok: false, errors};
}

export function updateOrchestratorNode(job: OrchestratorJob, nodeID: string, update: NodeUpdate, injected: Partial<GraphDependencies> = {}): GraphResult {
  const current = job.graph.nodes.find((item) => item.id === nodeID);

  const validation = validateUpdate(current, nodeID, update);

  if (validation) {return validation;}

  const now = (injected.now ?? defaults.now)();

  if (!current) {return {ok: false, errors: [`node ${nodeID} was not found`]};}

  return applyNodeUpdate(job, nodeID, current, update, now);
}

function applyNodeUpdate(job: OrchestratorJob, nodeID: string, current: OrchestratorNode, update: NodeUpdate, now: string): GraphResult {
  const changed = {...current, ...update, updatedAt: now};

  const contentErrors = promptErrors(changed.title, changed.objective, changed.constraints, changed.verification, job.config);

  if (contentErrors.length > 0) {return {ok: false, errors: contentErrors};}

  const nodes = job.graph.nodes.map((item) => item.id === nodeID ? changed : item);

  return {ok: true, job: {...job, graph: {...job.graph, nodes}, updatedAt: now}};
}

export function appendDecomposition(job: OrchestratorJob, nodeID: string, decomposition: string | Decomposition, injected: Partial<GraphDependencies> = {}): GraphResult {
  const prepared = validateAppend(job, nodeID, decomposition);

  if (!("parent" in prepared)) {return prepared;}

  const {parent, value} = prepared;

  const needed = job.graph.nodes.length + value.children.length;

  if (needed > job.config.limits.maxNodes) {return {ok: false, errors: ["maxNodes exceeded"]};}

  const role: OrchestratorRole = parent.layer < job.config.coordinators.length ? "coordinator" : "build";

  const result = appendJobChildren(job, parent, value, role, {...defaults, ...injected});

  const errors = validIDs(result);

  return errors.length === 0 ? {ok: true, job: result} : {ok: false, errors};
}

export function deriveChildResultSummaries(job: OrchestratorJob, nodeID: string): readonly ChildResult[] {
  const parent = job.graph.nodes.find((item) => item.id === nodeID);

  if (!parent) {return [];}

  const nodes = new Map(job.graph.nodes.map((item) => [item.id, item]));

  return parent.childIDs.flatMap((id) => {
    const child = nodes.get(id);

    return child ? [{title: child.title, result: (child.result ?? child.error ?? "").slice(0, job.config.limits.maxResultChars)}] : [];
  });
}
