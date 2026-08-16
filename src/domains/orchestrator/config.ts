import {calculateWorstCaseNodeCount} from "./count";
import type {
  BuildConfig,
  CoordinatorConfig,
  OrchestratorConfig,
  OrchestratorLimits,
  SplitConfig,
} from "./model";

type RecordValue = Record<string, unknown>;
export type ConfigResult = {ok: true; value: OrchestratorConfig} | {ok: false; errors: string[]};

// Hard ceilings keep scheduler, prompt, and artifact resource use predictable.
export const ORCHESTRATOR_LIMIT_MAXIMA = {
  maxNodes: 256,
  maxDurationMs: 86_400_000,
  maxCoordinatorAttempts: 10,
  maxParallel: 64,
  maxFanOut: 64,
  maxPromptChars: 1_048_576,
  maxResultChars: 1_048_576,
  maxCoordinators: 64,
  maxIdentifierChars: 256,
} as const;

const defaults: OrchestratorConfig = {
  enabled: true,
  manager: {agent: "Manager", model: "openai/gpt-5", fanOut: 1},
  coordinators: [],
  build: {agent: "build", model: "openai/gpt-5", maxParallel: 1},
  fanOutMode: "exact",
  failurePolicy: "fail-fast",
  limits: {maxNodes: 64, maxDurationMs: 3600000, maxCoordinatorAttempts: 2, maxPromptChars: 48000, maxResultChars: 12000},
};

const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);

function rejectUnknown(input: RecordValue, allowed: readonly string[], path: string, errors: string[]) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {errors.push(`${path}.${key} is not allowed`);}
  }
}

const positive = (value: unknown, path: string, errors: string[]) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {errors.push(`${path} must be a positive integer`);}
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

const boundedPositive = (value: unknown, path: string, maximum: number, errors: string[]) => {
  const result = positive(value, path, errors);

  if (result !== undefined && result > maximum) {errors.push(`${path} must be at most ${String(maximum)}`);}
  return result !== undefined && result <= maximum ? result : undefined;
};

const model = (value: unknown, path: string, errors: string[]) => {
  if (typeof value !== "string" || value.length > ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars || !/^[^/\s]+\/[^/\s]+$/.test(value)) {errors.push(`${path} must be a provider/model id`);}
  return typeof value === "string" && value.length <= ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars && /^[^/\s]+\/[^/\s]+$/.test(value) ? value : undefined;
};

const agent = (value: unknown, path: string, errors: string[]) => {
  if (typeof value !== "string" || value.length > ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars || value.trim() === "") {errors.push(`${path} must be a non-empty string`);}
  return typeof value === "string" && value.length <= ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars && value.trim() !== "" ? value : undefined;
};

function parseSplit(raw: unknown, fallback: SplitConfig, path: string, errors: string[]): SplitConfig {
  const input = isRecord(raw) ? raw : {};

  if (raw !== undefined && !isRecord(raw)) {errors.push(`${path} must be an object`);}
  rejectUnknown(input, ["agent", "model", "fanOut"], path, errors);
  return {
    agent: agent(input.agent ?? fallback.agent, `${path}.agent`, errors) ?? fallback.agent,
    model: model(input.model ?? fallback.model, `${path}.model`, errors) ?? fallback.model,
    fanOut: boundedPositive(input.fanOut ?? fallback.fanOut, `${path}.fanOut`, ORCHESTRATOR_LIMIT_MAXIMA.maxFanOut, errors) ?? fallback.fanOut,
  };
}

function parseBuild(raw: unknown, fallback: BuildConfig, errors: string[]): BuildConfig {
  const input = isRecord(raw) ? raw : {};

  if (raw !== undefined && !isRecord(raw)) {errors.push("build must be an object");}
  rejectUnknown(input, ["agent", "model", "maxParallel"], "build", errors);
  return {
    agent: agent(input.agent ?? fallback.agent, "build.agent", errors) ?? fallback.agent,
    model: model(input.model ?? fallback.model, "build.model", errors) ?? fallback.model,
    maxParallel: boundedPositive(input.maxParallel ?? fallback.maxParallel, "build.maxParallel", ORCHESTRATOR_LIMIT_MAXIMA.maxParallel, errors) ?? fallback.maxParallel,
  };
}

function parseLimits(raw: unknown, fallback: OrchestratorLimits, errors: string[]): OrchestratorLimits {
  const input = isRecord(raw) ? raw : {};

  if (raw !== undefined && !isRecord(raw)) {errors.push("limits must be an object");}
  rejectUnknown(input, ["maxNodes", "maxDurationMs", "maxCoordinatorAttempts", "maxPromptChars", "maxResultChars"], "limits", errors);
  return {
    maxNodes: boundedPositive(input.maxNodes ?? fallback.maxNodes, "limits.maxNodes", ORCHESTRATOR_LIMIT_MAXIMA.maxNodes, errors) ?? fallback.maxNodes,
    maxDurationMs: boundedPositive(input.maxDurationMs ?? fallback.maxDurationMs, "limits.maxDurationMs", ORCHESTRATOR_LIMIT_MAXIMA.maxDurationMs, errors) ?? fallback.maxDurationMs,
    maxCoordinatorAttempts: boundedPositive(input.maxCoordinatorAttempts ?? fallback.maxCoordinatorAttempts, "limits.maxCoordinatorAttempts", ORCHESTRATOR_LIMIT_MAXIMA.maxCoordinatorAttempts, errors) ?? fallback.maxCoordinatorAttempts,
    maxPromptChars: boundedPositive(input.maxPromptChars ?? fallback.maxPromptChars, "limits.maxPromptChars", ORCHESTRATOR_LIMIT_MAXIMA.maxPromptChars, errors) ?? fallback.maxPromptChars,
    maxResultChars: boundedPositive(input.maxResultChars ?? fallback.maxResultChars, "limits.maxResultChars", ORCHESTRATOR_LIMIT_MAXIMA.maxResultChars, errors) ?? fallback.maxResultChars,
  };
}

function parseMode(value: unknown, fallback: OrchestratorConfig["fanOutMode"], errors: string[]) {
  if (value !== undefined && value !== "exact" && value !== "atMost") {errors.push("fanOutMode must be exact or atMost");}
  return value === "atMost" ? "atMost" : value === "exact" ? "exact" : fallback;
}

function parseFailure(value: unknown, fallback: OrchestratorConfig["failurePolicy"], errors: string[]) {
  if (value !== undefined && value !== "fail-fast" && value !== "collect") {errors.push("failurePolicy must be fail-fast or collect");}
  return value === "collect" ? "collect" : value === "fail-fast" ? "fail-fast" : fallback;
}

function buildConfig(input: RecordValue, errors: string[]): OrchestratorConfig {
  const manager = parseSplit(input.manager, defaults.manager, "manager", errors);

  const build = parseBuild(input.build, defaults.build, errors);

  const coordinators = parseCoordinators(input.coordinators, errors);

  return {
    enabled: input.enabled === undefined ? defaults.enabled : input.enabled === true,
    manager, coordinators, build,
    fanOutMode: parseMode(input.fanOutMode, defaults.fanOutMode, errors),
    failurePolicy: parseFailure(input.failurePolicy, defaults.failurePolicy, errors),
    limits: parseLimits(input.limits, defaults.limits, errors),
  };
}

function validateExpansion(config: OrchestratorConfig, errors: string[]) {
  const count = calculateWorstCaseNodeCount(config);

  if (count.total > config.limits.maxNodes) {
    errors.push(`worst-case node count ${String(count.total)} exceeds limits.maxNodes ${String(config.limits.maxNodes)}`);
  }
}

function validateRoleNames(config: OrchestratorConfig, errors: string[]) {
  if (config.manager.agent === config.build.agent) {
    errors.push("manager.agent must differ from build.agent");
  }

  config.coordinators.forEach((coordinator, index) => {
    if (coordinator.agent === config.manager.agent) {
      errors.push(`coordinators[${String(index)}].agent must differ from manager.agent`);
    }

    if (coordinator.agent === config.build.agent) {
      errors.push(`coordinators[${String(index)}].agent must differ from build.agent`);
    }
  });
}

function parseConfig(raw: unknown): ConfigResult {
  const errors: string[] = [];

  const input = isRecord(raw) ? raw : {};

  if (raw !== undefined && !isRecord(raw)) {return {ok: false, errors: ["orchestrator must be an object"]};}
  rejectUnknown(input, ["enabled", "manager", "coordinators", "build", "fanOutMode", "failurePolicy", "limits"], "orchestrator", errors);
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {errors.push("enabled must be a boolean");}

  const config = buildConfig(input, errors);

  validateRoleNames(config, errors);
  validateExpansion(config, errors);
  return errors.length === 0 ? {ok: true, value: config} : {ok: false, errors};
}

function parseCoordinators(raw: unknown, errors: string[]): CoordinatorConfig[] {
  if (raw === undefined) {return [];}
  if (!Array.isArray(raw)) { errors.push("coordinators must be an array"); return []; }
  if (raw.length > ORCHESTRATOR_LIMIT_MAXIMA.maxCoordinators) {errors.push(`coordinators must contain at most ${String(ORCHESTRATOR_LIMIT_MAXIMA.maxCoordinators)} entries`);}
  return raw.slice(0, ORCHESTRATOR_LIMIT_MAXIMA.maxCoordinators).map((item, index) => parseSplit(item, defaults.manager, `coordinators[${String(index)}]`, errors));
}

export function parseOrchestratorConfig(raw?: unknown): ConfigResult {
  return parseConfig(raw);
}

export function parseOrchestratorOptions(options: unknown): ConfigResult {
  if (options === undefined) {return parseConfig(undefined);}
  if (!isRecord(options)) {return {ok: false, errors: ["plugin options must be an object"]};}
  return parseConfig(options.orchestrator);
}
