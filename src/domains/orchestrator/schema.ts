import {ORCHESTRATOR_LIMIT_MAXIMA} from "./config";
import type {OrchestratorConfig, OrchestratorJob, OrchestratorNode} from "./model";
import {validArtifactGraph} from "./artifact-graph";

export const ORCHESTRATOR_SCHEMA = "opencode-beanie.orchestrator.v1";
export const DEFAULT_MAX_ARTIFACT_BYTES = 1024 * 1024;
type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : undefined;

const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const text = (value: unknown, limit: number): value is string => typeof value === "string" && value.length <= limit;

const identifier = (value: unknown, limit: number): value is string => typeof value === "string" && value.length <= limit && value.trim().length > 0;

const optionalText = (value: unknown, limit: number) => value === undefined || identifier(value, limit);

const optionalResult = (value: unknown, limit: number) => value === undefined || text(value, limit);

const list = (value: unknown, entries: number, chars: number): value is readonly string[] => Array.isArray(value) && value.length <= entries && value.every((item) => identifier(item, chars));

const status = (value: unknown) => ["registered", "running", "completed", "failed", "cancelled", "timeout", "interrupted"].includes(String(value));

const validLimits = (value: RecordValue) => positive(value.maxNodes) && value.maxNodes <= ORCHESTRATOR_LIMIT_MAXIMA.maxNodes && positive(value.maxDurationMs) && value.maxDurationMs <= ORCHESTRATOR_LIMIT_MAXIMA.maxDurationMs &&
    positive(value.maxCoordinatorAttempts) && value.maxCoordinatorAttempts <= ORCHESTRATOR_LIMIT_MAXIMA.maxCoordinatorAttempts && positive(value.maxPromptChars) && value.maxPromptChars <= ORCHESTRATOR_LIMIT_MAXIMA.maxPromptChars &&
    positive(value.maxResultChars) && value.maxResultChars <= ORCHESTRATOR_LIMIT_MAXIMA.maxResultChars;

const validSplit = (value: unknown, nodes: number) => {
    const split = record(value);

    return !!split && identifier(split.agent, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && identifier(split.model, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && positive(split.fanOut) && split.fanOut <= nodes && split.fanOut <= ORCHESTRATOR_LIMIT_MAXIMA.maxFanOut;
};

const validBuild = (value: unknown, nodes: number) => {
    const build = record(value);

    return !!build && identifier(build.agent, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && identifier(build.model, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && positive(build.maxParallel) && build.maxParallel <= nodes && build.maxParallel <= ORCHESTRATOR_LIMIT_MAXIMA.maxParallel;
};

const validConfig = (value: unknown): value is OrchestratorConfig => {
    const config = record(value);

    const limits = record(config?.limits);

    if (!config || !limits || !validLimits(limits)) {return false;}

    const nodes = limits.maxNodes as number;

    return typeof config.enabled === "boolean" && validSplit(config.manager, nodes) && validBuild(config.build, nodes) && Array.isArray(config.coordinators) &&
        config.coordinators.length <= ORCHESTRATOR_LIMIT_MAXIMA.maxCoordinators && config.coordinators.length <= nodes && config.coordinators.every((item) => validSplit(item, nodes)) &&
        ["exact", "atMost"].includes(String(config.fanOutMode)) && ["fail-fast", "collect"].includes(String(config.failurePolicy));
};

const promptFields = (title: unknown, objective: unknown, constraints: unknown, verification: unknown, config: OrchestratorConfig) => {
    const {maxNodes, maxPromptChars} = config.limits;

    if (!identifier(title, maxPromptChars) || !identifier(objective, maxPromptChars) || !list(constraints, maxNodes, maxPromptChars) || !list(verification, maxNodes, maxPromptChars)) {return false;}
    return title.length + objective.length + constraints.reduce((sum, value) => sum + value.length, 0) + verification.reduce((sum, value) => sum + value.length, 0) <= maxPromptChars;
};

const validNode = (value: unknown, job: RecordValue, config: OrchestratorConfig): value is OrchestratorNode => {
    const node = record(value);

    const {maxNodes, maxResultChars} = config.limits;

    return !!node && identifier(node.id, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && node.jobID === job.id && node.rootSessionID === job.rootSessionID &&
        list(node.childIDs, maxNodes, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && promptFields(node.title, node.objective, node.constraints, node.verification, config) &&
        ["manager", "coordinator", "build"].includes(String(node.role)) && nonnegative(node.layer) && optionalText(node.parentID, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) &&
        optionalText(node.childSessionID, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && positive(node.attempt) && optionalText(node.createdAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) &&
        optionalText(node.updatedAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && optionalText(node.startedAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) && optionalText(node.completedAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) &&
        optionalResult(node.result, maxResultChars) && optionalResult(node.error, maxResultChars) && status(node.status);
};

export const isOrchestratorJob = (value: unknown): value is OrchestratorJob => {
    const job = record(value);

    const configValue = job?.config;

    if (!job || !identifier(job.id, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) || !identifier(job.rootSessionID, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) || !validConfig(configValue)) {return false;}

    const config = configValue;

    if (!promptFields(job.title, job.objective, job.constraints, job.verification, config) || !positive(job.attempt) || !optionalText(job.createdAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) ||
        !optionalText(job.updatedAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) || !optionalText(job.startedAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) || !optionalText(job.completedAt, ORCHESTRATOR_LIMIT_MAXIMA.maxIdentifierChars) ||
        !optionalResult(job.result, config.limits.maxResultChars) || !optionalResult(job.error, config.limits.maxResultChars) || !status(job.status)) {return false;}

    const graph = record(job.graph);

    return !!graph && validArtifactGraph(job, graph, config, validNode);
};

export const parseArtifact = (value: unknown): OrchestratorJob | undefined => {
    const artifact = record(value);

    return artifact?.schema === ORCHESTRATOR_SCHEMA && isOrchestratorJob(artifact.job) ? artifact.job : undefined;
};

export const artifactJSON = (job: OrchestratorJob, maxBytes: number) => {
    const textValue = `${JSON.stringify({schema: ORCHESTRATOR_SCHEMA, job})}\n`;

    if (new TextEncoder().encode(textValue).byteLength > maxBytes) {throw new Error(`Orchestrator job artifact exceeds ${String(maxBytes)} bytes.`);}
    return textValue;
};
