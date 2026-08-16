import {expect, test} from "bun:test";
import type {Config} from "@opencode-ai/plugin";
import {configureOrchestratorAgents} from "./directives";
import type {OrchestratorConfig} from "./model";

const orchestrator = (overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig => ({
  enabled: true,
  manager: {agent: "manager", model: "provider/manager", fanOut: 2},
  coordinators: [{agent: "coord", model: "provider/coord-one", fanOut: 2}, {agent: "coord", model: "provider/coord-two", fanOut: 1}],
  build: {agent: "build", model: "provider/build", maxParallel: 1},
  fanOutMode: "exact",
  failurePolicy: "fail-fast",
  limits: {maxNodes: 64, maxDurationMs: 1, maxCoordinatorAttempts: 1, maxPromptChars: 100, maxResultChars: 100},
  ...overrides,
});

test("registers manager and one hidden coordinator per unique name with routed models", () => {
  const config = {agent: {manager: {description: "keep"}}, command: {other: {template: "keep"}}} as unknown as Config;

  configureOrchestratorAgents(config, orchestrator());

  expect(config.agent?.manager).toMatchObject({model: "provider/manager", mode: "primary", hidden: false, description: "keep"});
  expect(config.agent?.coord).toMatchObject({model: "provider/coord-one", mode: "subagent", hidden: true});
  expect(Object.keys(config.agent ?? {})).toEqual(["manager", "coord"]);
  expect(config.command?.other).toEqual({template: "keep"});
  expect(config.command?.orchestrate).toMatchObject({agent: "manager"});
  expect(config.command?.orchestrate?.template).toContain("$ARGUMENTS");
});

test("mandatory denies override broad permissions and preserve unrelated fields", () => {
  const config = {agent: {
    manager: {tools: "*", hidden: true, permission: {bash: {"*": "allow"}, task: "allow", webfetch: "allow"}, color: "#fff"},
    coord: {tools: {edit: true, custom: true}, hidden: false, permission: {edit: "allow", task: "allow", external_directory: "ask"}, temperature: 0.2},
  }} as unknown as Config;

  configureOrchestratorAgents(config, orchestrator());

  expect(config.agent?.manager).toMatchObject({color: "#fff", hidden: false, tools: {edit: false, bash: false, task: false}, permission: {edit: "deny", bash: "deny", task: "deny", webfetch: "allow"}});
  expect(config.agent?.coord).toMatchObject({temperature: 0.2, hidden: true, tools: {"*": false}, permission: {"*": "deny"}});
  expect(config.agent?.coord?.tools).not.toHaveProperty("custom");
  expect(config.agent?.coord?.permission).not.toHaveProperty("external_directory");
});

test("does not mutate disabled configuration", () => {
  const config = {agent: {existing: {model: "provider/existing"}}, command: {orchestrate: {template: "user"}}} as unknown as Config;
  const before = structuredClone(config);

  configureOrchestratorAgents(config, orchestrator({enabled: false}));

  expect(config).toEqual(before);
});

test("does not replace an existing orchestrate command", () => {
  const existing = {template: "user command", description: "user"};
  const config = {command: {orchestrate: existing}} as unknown as Config;

  configureOrchestratorAgents(config, orchestrator());

  expect(config.command?.orchestrate).toBe(existing);
});

test("the manager directive preserves the configured first decomposition and cardinality policy", () => {
  const config = {agent: {manager: {}}} as unknown as Config;

  configureOrchestratorAgents(config, orchestrator({fanOutMode: "atMost"}));

  expect(config.agent?.manager?.prompt).toContain("construct the configured first decomposition with 2 children");
  expect(config.agent?.manager?.prompt).toContain("MUST call orchestration_start");
  expect(config.agent?.manager?.prompt).toContain("atMost permits no more than it");
});
