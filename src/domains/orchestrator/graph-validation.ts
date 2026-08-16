import {isTerminalStatus, transitionNode} from "./lifecycle";
import {parseCoordinatorDecomposition, type Decomposition} from "./decomposition";
import type {GraphResult, NodeUpdate} from "./graph";
import type {OrchestratorConfig, OrchestratorJob, OrchestratorNode} from "./model";

export function parseGraphInput(value: string | Decomposition, config: OrchestratorConfig, fanOut: number) {
  return parseCoordinatorDecomposition(typeof value === "string" ? value : JSON.stringify(value), {fanOut, fanOutMode: config.fanOutMode, maxChars: config.limits.maxPromptChars, maxFieldChars: config.limits.maxPromptChars, maxArrayEntries: config.limits.maxNodes, maxAggregateChars: config.limits.maxPromptChars});
}

export function validateAppend(job: OrchestratorJob, nodeID: string, decomposition: string | Decomposition): {ok: true; parent: OrchestratorNode; value: Decomposition} | GraphResult {
  const parent = job.graph.nodes.find((item) => item.id === nodeID);

  if (!parent) {return {ok: false, errors: [`node ${nodeID} was not found`]};}
  if (parent.role !== "coordinator" || isTerminalStatus(parent.status)) {return {ok: false, errors: ["only a non-terminal coordinator may be expanded"]};}
  if (parent.childIDs.length > 0) {return {ok: false, errors: ["node already has children"]};}

  const fanOut = job.config.coordinators[parent.layer - 1]?.fanOut;

  if (fanOut === undefined) {return {ok: false, errors: ["node has no next configured layer"]};}

  const parsed = parseGraphInput(decomposition, job.config, fanOut);

  return parsed.ok ? {ok: true, parent, value: parsed.value} : parsed;
}

export function validateUpdate(node: OrchestratorNode | undefined, nodeID: string, update: NodeUpdate): GraphResult | undefined {
  if (!node) {return {ok: false, errors: [`node ${nodeID} was not found`]};}
  if (update.status !== undefined) {const transition = transitionNode(node, update.status);

 if (!transition.ok) {return {ok: false, errors: [transition.error]};}}
  if (update.attempt !== undefined && (!Number.isInteger(update.attempt) || update.attempt < 1)) {return {ok: false, errors: ["attempt must be a positive integer"]};}
  return undefined;
}
