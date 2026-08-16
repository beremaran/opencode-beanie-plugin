import {expect, test} from "bun:test";
import {calculateWorstCaseNodeCount} from "./count";
import type {OrchestratorConfig} from "./model";

const config: OrchestratorConfig = {
  enabled: true,
  manager: {agent: "Manager", model: "p/m", fanOut: 2},
  coordinators: [
    {agent: "one", model: "p/m", fanOut: 3},
    {agent: "two", model: "p/m", fanOut: 2},
  ],
  build: {agent: "build", model: "p/m", maxParallel: 4},
  fanOutMode: "atMost",
  failurePolicy: "collect",
  limits: {maxNodes: 1000, maxDurationMs: 1, maxCoordinatorAttempts: 1, maxPromptChars: 1, maxResultChars: 1},
};

test("counts manager, every split layer, and build leaves deterministically", () => {
  expect(calculateWorstCaseNodeCount(config)).toEqual({
    manager: 1,
    coordinators: [2, 6],
    build: 12,
    total: 21,
  });
});

test("records coordinator input branches before applying fan-out", () => {
  const oneCoordinator = {...config, manager: {...config.manager, fanOut: 3}, coordinators: [{agent: "one", model: "p/m", fanOut: 2}]};

  expect(calculateWorstCaseNodeCount(oneCoordinator)).toEqual({
    manager: 1,
    coordinators: [3],
    build: 6,
    total: 10,
  });
});

test("counts manager fan-out directly into build when there are no coordinators", () => {
  expect(calculateWorstCaseNodeCount({...config, coordinators: [], manager: {...config.manager, fanOut: 4}})).toEqual({
    manager: 1,
    coordinators: [],
    build: 4,
    total: 5,
  });
});
