import type {Decomposition, DecompositionChild} from "./decomposition";
import type {GraphDependencies} from "./graph";
import type {OrchestratorConfig, OrchestratorJob, OrchestratorNode, OrchestratorRole} from "./model";

export function buildJob(rootSessionID: string, objective: string, title: string, constraints: readonly string[], verification: readonly string[], config: OrchestratorConfig, decomposition: Decomposition, role: OrchestratorRole, dependencies: GraphDependencies): OrchestratorJob {
  const timestamp = dependencies.now();

 const jobID = dependencies.id("job");

  const manager: OrchestratorNode = {id: dependencies.id("node"), jobID, childIDs: [], role: "manager", layer: 0, objective, title, constraints: [...constraints], verification: [...verification], rootSessionID, attempt: 1, createdAt: timestamp, updatedAt: timestamp, status: "registered"};

  const job: OrchestratorJob = {id: jobID, rootSessionID, objective, title, constraints: [...constraints], verification: [...verification], config, graph: {nodes: [manager], edges: []}, attempt: 1, createdAt: timestamp, updatedAt: timestamp, status: "registered"};

  return addChildren(job, manager, decomposition.children, role, 1, dependencies);
}

function addChildren(job: OrchestratorJob, parent: OrchestratorNode, children: readonly DecompositionChild[], role: OrchestratorRole, layer: number, dependencies: GraphDependencies): OrchestratorJob {
  const created = children.map((child) => {const timestamp = dependencies.now();

 return {id: dependencies.id("node"), jobID: job.id, parentID: parent.id, childIDs: [], role, layer, objective: child.objective, title: child.title, constraints: [...child.constraints], verification: [...child.verification], rootSessionID: job.rootSessionID, attempt: 1, createdAt: timestamp, updatedAt: timestamp, status: "registered" as const};});

  const updated = {...parent, childIDs: created.map((child) => child.id), updatedAt: dependencies.now()};

  return {...job, graph: {nodes: job.graph.nodes.map((item) => item.id === parent.id ? updated : item).concat(created), edges: job.graph.edges.concat(created.map((child) => ({from: parent.id, to: child.id})))}, updatedAt: updated.updatedAt};
}

export function appendJobChildren(job: OrchestratorJob, parent: OrchestratorNode, decomposition: Decomposition, role: OrchestratorRole, dependencies: GraphDependencies): OrchestratorJob {
  return addChildren(job, parent, decomposition.children, role, parent.layer + 1, dependencies);
}

export function updateJobNode(job: OrchestratorJob, node: OrchestratorNode, update: Partial<OrchestratorNode>, now: string): OrchestratorJob {
  const changed = {...node, ...update, updatedAt: now};

  return {...job, graph: {...job.graph, nodes: job.graph.nodes.map((item) => item.id === node.id ? changed : item)}, updatedAt: now};
}
