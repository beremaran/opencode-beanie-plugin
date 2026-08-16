import type {OrchestratorNode, OrchestratorStatus} from "./model";

export const terminal = (status: OrchestratorStatus) => ["completed", "failed", "cancelled", "timeout", "interrupted"].includes(status);
export const modelParts = (model: string): {provider: string; model: string} => {
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(model);

  if (!match) { throw new Error("provider/model must be a provider/model id"); }
  return {provider: match[1] ?? "", model: match[2] ?? ""};
};
export const childrenOf = (nodes: readonly OrchestratorNode[], parent: OrchestratorNode) => parent.childIDs.map((id) => nodes.find((node) => node.id === id)).filter((node): node is OrchestratorNode => node !== undefined);
export const reasonStatus = (reason: unknown): Extract<OrchestratorStatus, "cancelled" | "timeout" | "interrupted"> => reason === "timeout" ? "timeout" : reason === "cancel" ? "cancelled" : "interrupted";
