import {expect, test} from "bun:test";
import {canTransitionJob, canTransitionNode, isTerminalStatus, transitionJob, transitionNode} from "./lifecycle";
import type {OrchestratorConfig, OrchestratorJob, OrchestratorNode, OrchestratorStatus} from "./model";

const config: OrchestratorConfig = {
  enabled: true, manager: {agent: "Manager", model: "p/m", fanOut: 1}, coordinators: [],
  build: {agent: "build", model: "p/m", maxParallel: 1}, fanOutMode: "exact", failurePolicy: "fail-fast",
  limits: {maxNodes: 64, maxDurationMs: 1, maxCoordinatorAttempts: 2, maxPromptChars: 1, maxResultChars: 1},
};
const node: OrchestratorNode = {
  id: "n1", jobID: "j1", childIDs: [], role: "coordinator", layer: 1,
  objective: "objective", title: "title", constraints: [], verification: [], rootSessionID: "root",
  attempt: 1, createdAt: "created", updatedAt: "updated", status: "registered",
};
const job: OrchestratorJob = {
  id: "j1", rootSessionID: "root", objective: "objective", title: "title", constraints: [], verification: [],
  config, graph: {nodes: [node], edges: []}, attempt: 1, createdAt: "created", updatedAt: "updated", status: "registered",
};

test("allows idempotent status registration and valid execution transitions", () => {
  expect(canTransitionNode("registered", "registered")).toBe(true);
  expect(canTransitionNode("registered", "running")).toBe(true);
  expect(canTransitionNode("running", "completed")).toBe(true);
  expect(canTransitionNode("running", "timeout")).toBe(true);
});

test("rejects transitions out of terminal statuses", () => {
  const statuses: OrchestratorStatus[] = ["completed", "failed", "cancelled", "timeout", "interrupted"];

  for (const status of statuses) {
    expect(isTerminalStatus(status)).toBe(true);
    expect(canTransitionNode(status, "running")).toBe(false);
    expect(canTransitionNode(status, status)).toBe(true);
  }
});

test("returns a new node for a guarded transition", () => {
  const result = transitionNode(node, "running");

  expect(result).toEqual({ok: true, node: {...node, status: "running"}});
  expect(node.status).toBe("registered");
});

test("returns an error and preserves the node for an invalid transition", () => {
  expect(transitionNode(node, "completed")).toEqual({ok: false, error: "Cannot transition registered to completed."});
});

test("guards job transitions with the same idempotent lifecycle", () => {
  expect(canTransitionJob("registered", "registered")).toBe(true);
  expect(canTransitionJob("registered", "running")).toBe(true);
  expect(transitionJob(job, "running")).toEqual({ok: true, job: {...job, status: "running"}});
  expect(transitionJob(job, "completed")).toEqual({ok: false, error: "Cannot transition registered to completed."});
});
