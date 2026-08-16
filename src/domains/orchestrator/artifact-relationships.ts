type RecordValue = Record<string, unknown>;
type Node = {readonly id: string; readonly parentID?: string; readonly childIDs: readonly string[]};

const record = (value: unknown): RecordValue | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : undefined;

const edgeKey = (from: string, to: string) => `${from}\0${to}`;

export function validEdges(values: unknown[], nodes: Map<string, Node>) {
  const seen = new Set<string>();

  for (const value of values) {
    const edge = record(value);

    if (!edge || typeof edge.from !== "string" || !edge.from.trim() || typeof edge.to !== "string" || !edge.to.trim()) {return false;}
    if (edge.from === edge.to || !nodes.has(edge.from) || !nodes.has(edge.to) || seen.has(edgeKey(edge.from, edge.to))) {return false;}
    seen.add(edgeKey(edge.from, edge.to));
  }
  return true;
}

function edgeSet(values: unknown[]) {
  return new Set(values.map((value) => {const edge = record(value);

 return edge ? edgeKey(String(edge.from), String(edge.to)) : "";}));
}

function validNodeLinks(node: Node, nodes: Map<string, Node>, edges: Set<string>) {
  const children = new Set(node.childIDs);

  if (children.size !== node.childIDs.length) {return false;}
  for (const childID of children) {
    const child = nodes.get(childID);

    if (!child || child.parentID !== node.id || !edges.has(edgeKey(node.id, childID))) {return false;}
  }
  return node.parentID === undefined || (!!nodes.get(node.parentID) && edges.has(edgeKey(node.parentID, node.id)) && nodes.get(node.parentID)?.childIDs.includes(node.id));
}

export function validRelationships(nodes: Map<string, Node>, values: unknown[]) {
  const edges = edgeSet(values);

  return [...nodes.values()].every((node) => validNodeLinks(node, nodes, edges)) && values.every((value) => {
    const edge = record(value);

    return !!edge && nodes.get(String(edge.from))?.childIDs.includes(String(edge.to)) && nodes.get(String(edge.to))?.parentID === edge.from;
  });
}

export function edgeMap(values: unknown[]) {
  const map = new Map<string, string[]>();

  for (const value of values) {
    const edge = record(value);

    if (edge) {map.set(String(edge.from), [...(map.get(String(edge.from)) ?? []), String(edge.to)]);}
  }
  return map;
}

export function hasCycle(edges: Map<string, readonly string[]>, node: string, visiting = new Set<string>(), visited = new Set<string>()): boolean {
  if (visiting.has(node)) {return true;}
  if (visited.has(node)) {return false;}
  visiting.add(node);
  if ((edges.get(node) ?? []).some((child) => hasCycle(edges, child, visiting, visited))) {return true;}
  visiting.delete(node); visited.add(node); return false;
}
