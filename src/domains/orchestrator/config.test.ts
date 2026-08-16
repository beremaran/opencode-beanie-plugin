import {describe, expect, test} from "bun:test";
import {ORCHESTRATOR_LIMIT_MAXIMA, parseOrchestratorConfig, parseOrchestratorOptions} from "./config";

describe("orchestrator configuration", () => {
  test("supplies documented defaults", () => {
    const result = parseOrchestratorConfig();

    expect(result).toEqual({ok: true, value: {
      enabled: true,
      manager: {agent: "Manager", model: "openai/gpt-5", fanOut: 1},
      coordinators: [],
      build: {agent: "build", model: "openai/gpt-5", maxParallel: 1},
      fanOutMode: "exact",
      failurePolicy: "fail-fast",
      limits: {maxNodes: 64, maxDurationMs: 3600000, maxCoordinatorAttempts: 2, maxPromptChars: 48000, maxResultChars: 12000},
    }});
  });

  test("reads unknown plugin keys only at the runtime boundary", () => {
    const result = parseOrchestratorOptions({orchestrator: {enabled: false}});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(false);
    }
  });

  test("rejects malformed models and empty agents", () => {
    const result = parseOrchestratorConfig({manager: {agent: " ", model: "not-a-model", fanOut: 1}});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("manager.agent must be a non-empty string");
      expect(result.errors).toContain("manager.model must be a provider/model id");
    }
  });

  test("rejects invalid positive values and enum values", () => {
    const result = parseOrchestratorConfig({
      manager: {agent: "m", model: "p/m", fanOut: 0},
      build: {agent: "b", model: "p/m", maxParallel: -1},
      fanOutMode: "invalid",
      failurePolicy: "invalid",
      limits: {maxNodes: 0},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBe(5);
    }
  });

  test("rejects nonpositive coordinator and limit values", () => {
    const result = parseOrchestratorConfig({
      coordinators: [{agent: "c", model: "p/m", fanOut: 0}],
      limits: {maxNodes: 0, maxDurationMs: 0, maxCoordinatorAttempts: 0, maxPromptChars: 0, maxResultChars: 0},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("coordinators[0].fanOut must be a positive integer");
      expect(result.errors).toContain("limits.maxNodes must be a positive integer");
      expect(result.errors).toContain("limits.maxDurationMs must be a positive integer");
      expect(result.errors).toContain("limits.maxCoordinatorAttempts must be a positive integer");
      expect(result.errors).toContain("limits.maxPromptChars must be a positive integer");
      expect(result.errors).toContain("limits.maxResultChars must be a positive integer");
    }
  });

  test("rejects expansion beyond the node limit before execution", () => {
    const result = parseOrchestratorConfig({
      manager: {agent: "m", model: "p/m", fanOut: 3},
      coordinators: [{agent: "c", model: "p/m", fanOut: 3}],
      limits: {maxNodes: 10},
    });

    expect(result).toEqual({ok: false, errors: ["worst-case node count 13 exceeds limits.maxNodes 10"]});
  });

  test("rejects a non-object runtime options value", () => {
    expect(parseOrchestratorOptions([])).toEqual({ok: false, errors: ["plugin options must be an object"]});
  });

  test("rejects unknown keys at every orchestrator object level", () => {
    const result = parseOrchestratorConfig({
      typo: true,
      manager: {agent: "m", model: "p/m", fanOut: 1, typo: true},
      coordinators: [{agent: "c", model: "p/m", fanOut: 1, typo: true}],
      build: {agent: "b", model: "p/m", maxParallel: 1, typo: true},
      limits: {maxNodes: 10, maxDurationMs: 1, maxCoordinatorAttempts: 1, maxPromptChars: 1, maxResultChars: 1, typo: true},
    });

    expect(result).toEqual({ok: false, errors: [
      "orchestrator.typo is not allowed",
      "manager.typo is not allowed",
      "build.typo is not allowed",
      "coordinators[0].typo is not allowed",
      "limits.typo is not allowed",
    ]});
  });

  test("rejects unsafe cross-role agent collisions but allows repeated coordinators", () => {
    const result = parseOrchestratorConfig({
      manager: {agent: "same", model: "p/m", fanOut: 1},
      coordinators: [{agent: "coord", model: "p/c", fanOut: 1}, {agent: "coord", model: "p/c2", fanOut: 1}],
      build: {agent: "same", model: "p/b", maxParallel: 1},
      limits: {maxNodes: 10},
    });

    expect(result).toEqual({ok: false, errors: ["manager.agent must differ from build.agent"]});
    expect(parseOrchestratorConfig({manager: {agent: "manager", model: "p/m", fanOut: 1}, coordinators: [{agent: "coord", model: "p/c", fanOut: 1}, {agent: "coord", model: "p/c2", fanOut: 1}], build: {agent: "build", model: "p/b", maxParallel: 1}}).ok).toBe(true);
  });

  test("rejects coordinators colliding with manager or build", () => {
    const result = parseOrchestratorConfig({
      manager: {agent: "manager", model: "p/m", fanOut: 1},
      coordinators: [{agent: "manager", model: "p/c", fanOut: 1}, {agent: "build", model: "p/c", fanOut: 1}],
      build: {agent: "build", model: "p/b", maxParallel: 1},
    });

    expect(result).toEqual({ok: false, errors: [
      "coordinators[0].agent must differ from manager.agent",
      "coordinators[1].agent must differ from build.agent",
    ]});
  });

  test("rejects resource-sensitive values above practical maxima", () => {
    const result = parseOrchestratorConfig({
      manager: {agent: "m", model: "p/m", fanOut: ORCHESTRATOR_LIMIT_MAXIMA.maxFanOut + 1},
      build: {agent: "b", model: "p/m", maxParallel: ORCHESTRATOR_LIMIT_MAXIMA.maxParallel + 1},
      limits: {
        maxNodes: ORCHESTRATOR_LIMIT_MAXIMA.maxNodes + 1,
        maxDurationMs: ORCHESTRATOR_LIMIT_MAXIMA.maxDurationMs + 1,
        maxCoordinatorAttempts: ORCHESTRATOR_LIMIT_MAXIMA.maxCoordinatorAttempts + 1,
        maxPromptChars: ORCHESTRATOR_LIMIT_MAXIMA.maxPromptChars + 1,
        maxResultChars: ORCHESTRATOR_LIMIT_MAXIMA.maxResultChars + 1,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {expect(result.errors).toContain("limits.maxNodes must be at most 256");}
  });
});
