import type {OrchestratorConfig, OrchestratorNode} from "./model";
import {edgeMap, hasCycle, validEdges, validRelationships} from "./artifact-relationships";

type RecordValue = Record<string, unknown>;
type NodeValidator = (value: unknown, job: RecordValue, config: OrchestratorConfig) => value is OrchestratorNode;

const roleLayer = (node: OrchestratorNode, config: OrchestratorConfig) => {
    if (node.layer === 0) {return node.role === "manager";}
    if (node.layer <= config.coordinators.length) {return node.role === "coordinator";}
    return node.layer === config.coordinators.length + 1 && node.role === "build";
};

export const validArtifactGraph = (job: RecordValue, graph: RecordValue, config: OrchestratorConfig, validateNode: NodeValidator): boolean => {
    const nodes = graph.nodes;

    const edges = graph.edges;

    if (!validGraphShape(nodes, edges, config)) {return false;}

    const byID = collectNodes(nodes, job, config, validateNode);

    if (!byID) {return false;}

    const typedNodes = [...byID.values()];

    if (!validGraphNodes(typedNodes, config)) {return false;}

    const valid = validEdges(edges as unknown[], byID) && validRelationships(byID, edges as unknown[]);

    return valid && !typedNodes.some((node) => hasCycle(edgeMap(edges as unknown[]), node.id, new Set(), new Set()));
};

function collectNodes(values: unknown[], job: RecordValue, config: OrchestratorConfig, validateNode: NodeValidator) {
    const nodes = new Map<string, OrchestratorNode>();

    for (const value of values) {
        if (!validateNode(value, job, config) || nodes.has(value.id)) {return undefined;}
        nodes.set(value.id, value);
    }
    return nodes;
}

function validGraphNodes(nodes: OrchestratorNode[], config: OrchestratorConfig) {
    const roots = nodes.filter((node) => node.parentID === undefined);

    const root = roots[0];

    return !!root && roots.length === 1 && root.role === "manager" && root.layer === 0 && nodes.every((node) => node.id === root.id || (node.parentID !== undefined && node.role !== "manager")) && nodes.every((node) => roleLayer(node, config) && (node.role !== "build" || node.childIDs.length === 0));
}

function validGraphShape(nodes: unknown, edges: unknown, config: OrchestratorConfig): nodes is unknown[] {
    return Array.isArray(nodes) && Array.isArray(edges) && nodes.length > 0 && nodes.length <= config.limits.maxNodes && edges.length === nodes.length - 1;
}
