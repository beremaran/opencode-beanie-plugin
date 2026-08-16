import type {OrchestratorConfig} from "./model";

export type NodeCount = {
  manager: number;
  coordinators: number[];
  build: number;
  total: number;
};

export function calculateWorstCaseNodeCount(config: OrchestratorConfig): NodeCount {
  // Layer 0 is one manager; each coordinator records its incoming branches before splitting.
  let branchCount = config.manager.fanOut;

  const coordinators: number[] = [];

  for (const coordinator of config.coordinators) {
    coordinators.push(branchCount);
    branchCount *= coordinator.fanOut;
  }

  const build = branchCount;

  const total = 1 + coordinators.reduce((sum, count) => sum + count, 0) + build;

  return {manager: 1, coordinators, build, total};
}
