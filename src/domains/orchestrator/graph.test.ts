import {expect, test} from "bun:test";
import {appendDecomposition, createOrchestratorJob, deriveChildResultSummaries, updateOrchestratorNode} from "./graph";
import type {Decomposition, OrchestratorConfig, OrchestratorJob} from "./index";

const config = (overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig => ({
  enabled: true, manager: {agent: "manager", model: "p/m", fanOut: 3}, coordinators: [{agent: "one", model: "p/m", fanOut: 2}], build: {agent: "build", model: "p/m", maxParallel: 2}, fanOutMode: "exact", failurePolicy: "collect", limits: {maxNodes: 20, maxDurationMs: 1, maxCoordinatorAttempts: 1, maxPromptChars: 1000, maxResultChars: 5}, ...overrides,
});

const child = (title: string): {title: string; objective: string; constraints: string[]; verification: string[]} => ({title, objective: `objective ${title}`, constraints: ["constraint"], verification: ["verify"]});
const decomposition = (...titles: string[]): Decomposition => ({children: titles.map(child)});
const deps = () => {let number = 0; return {now: () => "2026-01-01T00:00:00.000Z", id: (kind: "job" | "node") => `${kind}-${String(number++)}`};};
const make = (input = decomposition("a", "b", "c"), options = config()) => createOrchestratorJob("root", "objective", "title", ["constraint"], ["verify"], options, input, deps());
const job = (input = decomposition("a", "b", "c"), options = config()): OrchestratorJob => {const result = make(input, options); if (!result.ok) {throw new Error(result.errors.join(","));} return result.job;};

test("builds a deterministic [3, 2] layered graph", () => {
  const dependencies = deps();
  const initial = createOrchestratorJob("root", "objective", "title", ["constraint"], ["verify"], config(), decomposition("a", "b", "c"), dependencies);
  if (!initial.ok) {throw new Error(initial.errors.join(","));}
  let result = initial.job;
  for (const coordinator of result.graph.nodes.filter((node) => node.role === "coordinator")) {
    const expanded = appendDecomposition(result, coordinator.id, decomposition("x", "y"), dependencies);
    if (!expanded.ok) {throw new Error(expanded.errors.join(","));}
    result = expanded.job;
  }
  expect(result.graph.nodes.map((node) => node.role)).toEqual(["manager", "coordinator", "coordinator", "coordinator", "build", "build", "build", "build", "build", "build"]);
  expect(result.graph.nodes.map((node) => node.layer)).toEqual([0, 1, 1, 1, 2, 2, 2, 2, 2, 2]);
  expect(result.graph.edges).toHaveLength(9);
  expect(result.graph.nodes[0]?.childIDs).toEqual(["node-2", "node-3", "node-4"]);
});

test("uses build leaves when no coordinator is configured", () => {
  const result = job(decomposition("a", "b", "c"), config({coordinators: []}));
  expect(result.graph.nodes.map((node) => node.role)).toEqual(["manager", "build", "build", "build"]);
  expect(result.graph.nodes.every((node) => node.layer === 1 || node.layer === 0)).toBe(true);
});

test("enforces exact and atMost fan-out", () => {
  expect(make(decomposition("a", "b"), config({manager: {agent: "manager", model: "p/m", fanOut: 3}})).ok).toBe(false);
  expect(make(decomposition("a", "b"), config({fanOutMode: "atMost"})).ok).toBe(true);
  expect(make(decomposition(), config({fanOutMode: "atMost"})).ok).toBe(false);
});

test("enforces maxNodes and generated ID uniqueness", () => {
  expect(make(decomposition("a", "b", "c"), config({limits: {...config().limits, maxNodes: 3}})).ok).toBe(false);
  const duplicate = createOrchestratorJob("root", "objective", "title", [], [], config(), decomposition("a", "b", "c"), {now: () => "now", id: () => "same"});
  expect(duplicate.ok).toBe(false);
  expect(duplicate.ok ? "" : duplicate.errors[0]).toContain("duplicate id");
});

test("rejects aggregate root and node prompt overflow before persistence", () => {
  const oversized = "x".repeat(1001);
  expect(createOrchestratorJob("root", oversized, "title", [], [], config(), decomposition("a"), deps()).ok).toBe(false);
  expect(createOrchestratorJob("root", "objective", "title", [], [], config(), {children: [{title: oversized, objective: "objective", constraints: [], verification: []}]}, deps()).ok).toBe(false);
});

test("rejects invalid and repeated appends", () => {
  const dependencies = deps();
  const initial = createOrchestratorJob("root", "objective", "title", ["constraint"], ["verify"], config(), decomposition("a", "b", "c"), dependencies);
  if (!initial.ok) {throw new Error(initial.errors.join(","));}
  const original = initial.job;
  const manager = original.graph.nodes[0];
  if (!manager) {throw new Error("missing manager");}
  expect(appendDecomposition(original, manager.id, decomposition("x"), deps()).ok).toBe(false);
  const coordinator = original.graph.nodes.find((node) => node.role === "coordinator");
  if (!coordinator) {throw new Error("missing coordinator");}
  const appended = appendDecomposition(original, coordinator.id, decomposition("x", "y"), dependencies);
  expect(appended.ok).toBe(true);
  if (appended.ok) {expect(appendDecomposition(appended.job, coordinator.id, decomposition("z", "q"), dependencies).ok).toBe(false);}
});

test("updates and appends without mutating prior graphs", () => {
  const dependencies = deps();
  const initial = createOrchestratorJob("root", "objective", "title", ["constraint"], ["verify"], config(), decomposition("a", "b", "c"), dependencies);
  if (!initial.ok) {throw new Error(initial.errors.join(","));}
  const original = initial.job;
  const coordinator = original.graph.nodes.find((node) => node.role === "coordinator");
  if (!coordinator) {throw new Error("missing coordinator");}
  const updated = updateOrchestratorNode(original, coordinator.id, {result: "abcdef"}, deps());
  expect(updated.ok).toBe(true);
  expect(original.graph.nodes.find((node) => node.id === coordinator.id)?.result).toBeUndefined();
  const appended = appendDecomposition(original, coordinator.id, decomposition("x", "y"), dependencies);
  expect(appended.ok).toBe(true);
  expect(original.graph.nodes).toHaveLength(4);
  if (updated.ok) {
    const manager = updated.job.graph.nodes[0];
    if (!manager) {throw new Error("missing manager");}
    expect(deriveChildResultSummaries(updated.job, manager.id)).toEqual([{title: "a", result: "abcde"}, {title: "b", result: ""}, {title: "c", result: ""}]);
  }
});
