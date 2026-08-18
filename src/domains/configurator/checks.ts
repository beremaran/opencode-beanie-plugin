import {parseOrchestratorConfig} from "../orchestrator/config";

export interface FeatureReport {
    feature: string;
    ok: boolean;
    message?: string;
}

export interface ValidationResult {
    errors: FeatureReport[];
    warnings: string[];
}

const TOOL_KEY_RE = /^[a-z0-9_-]+$/;

const MECHANISMS: readonly string[] = ["goal", "orchestrator", "throttle", "skillbox", "toolbox", "providers", "configurator"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";

const isPositiveInteger = (value: unknown): boolean =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isNonNegativeInteger = (value: unknown): boolean =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isBoolean = (value: unknown): boolean => typeof value === "boolean";

const failure = (feature: string, message: string): FeatureReport => ({feature, ok: false, message});

const asRecord = (raw: unknown): Record<string, unknown> | null => {
    let value = raw;

    if (value === undefined) {value = {};}
    if (!isRecord(value)) {return null;}
    return value;
};

type OptionSpec = [string, (value: unknown) => boolean, string];

const checkSpecs = (feature: string, o: Record<string, unknown>, specs: OptionSpec[]): FeatureReport | null => {
    for (const [key, valid, expected] of specs) {
        if (o[key] !== undefined && !valid(o[key])) {return failure(feature, `The \`${key}\` option must be ${expected}.`);}
    }
    return null;
};

const isRegistryMode = (value: unknown): boolean => value === "auto" || value === "skills-sh" || value === "github";

const isStringArray = (value: unknown): boolean => Array.isArray(value) && value.every(isNonEmptyString);

const isMechanismArray = (value: unknown): boolean =>
    Array.isArray(value) && value.every((entry) => typeof entry === "string" && MECHANISMS.includes(entry));

const checkTools = (tools: unknown): FeatureReport | null => {
    if (!isRecord(tools)) {return failure("directives", "The `tools` option must be an object with non-empty string values.");}
    for (const [key, value] of Object.entries(tools)) {
        if (!TOOL_KEY_RE.test(key)) {return failure("directives", `The \`tools\` keys must match /^[a-z0-9_-]+$/ (got "${key}").`);}
        if (!isNonEmptyString(value)) {return failure("directives", "The `tools` option must be an object with non-empty string values.");}
    }
    return null;
};

function checkOrchestrator(raw: unknown): FeatureReport {
    const parsed = parseOrchestratorConfig(raw);

    if (parsed.ok) {return {feature: "orchestrator", ok: true};}
    return failure("orchestrator", parsed.errors.join("; "));
}

function checkThrottle(raw: unknown): FeatureReport {
    const o = asRecord(raw);

    if (o === null) {return failure("throttle", "The throttle options must be an object.");}

    const issue = checkSpecs("throttle", o, [
        ["maxParallel", isPositiveInteger, "a positive integer"],
        ["mode", (value) => value === "session" || value === "global", 'one of "session" or "global"'],
        ["maxWaitMs", (value) => typeof value === "number" && value > 0, "a number greater than 0"],
        ["notifyQueue", isBoolean, "a boolean"],
    ]);

    return issue ?? {feature: "throttle", ok: true};
}

function checkGoal(raw: unknown): FeatureReport {
    const o = asRecord(raw);

    if (o === null) {return failure("goal", "The goal options must be an object.");}

    const issue = checkSpecs("goal", o, [
        ["evaluatorModel", isNonEmptyString, "a non-empty string"],
        ["evaluatorAgent", isNonEmptyString, "a non-empty string"],
        ["stateDirectory", isNonEmptyString, "a non-empty string"],
        ["maxTranscriptChars", isPositiveInteger, "a positive integer"],
        ["defaultTokenBudget", isPositiveInteger, "a positive integer"],
        ["defaultMaxTurns", isPositiveInteger, "a positive integer"],
        ["continuationDelayMs", isNonNegativeInteger, "a non-negative integer"],
        ["deleteEvaluatorSessions", isBoolean, "a boolean"],
    ]);

    return issue ?? {feature: "goal", ok: true};
}

function checkProviders(raw: unknown): FeatureReport {
    const o = asRecord(raw);

    if (o === null) {return failure("providers", "The providers options must be an object.");}
    if (o.providers !== undefined && !Array.isArray(o.providers)) {
        return failure("providers", "The `providers` option must be an array.");
    }

    const issue = checkSpecs("providers", o, [
        ["model", isNonEmptyString, "a non-empty string"],
        ["smallModel", isNonEmptyString, "a non-empty string"],
        ["timeout", isPositiveInteger, "a positive integer"],
        ["npm", isNonEmptyString, "a non-empty string"],
        ["env", isBoolean, "a boolean"],
    ]);

    return issue ?? {feature: "providers", ok: true};
}

function checkSkillbox(raw: unknown): FeatureReport {
    const o = asRecord(raw);

    if (o === null) {return failure("skillbox", "The skillbox options must be an object.");}

    const issue = checkSpecs("skillbox", o, [
        ["registry", isRegistryMode, 'one of "auto", "skills-sh", or "github"'],
        ["skillsShToken", isNonEmptyString, "a non-empty string"],
        ["githubToken", isNonEmptyString, "a non-empty string"],
        ["maxBytes", isPositiveInteger, "a positive integer"],
        ["debug", isBoolean, "a boolean"],
        ["githubSources", isStringArray, "an array of non-empty strings"],
    ]);

    return issue ?? {feature: "skillbox", ok: true};
}

function checkToolbox(raw: unknown): FeatureReport {
    const o = asRecord(raw);

    if (o === null) {return failure("toolbox", "The toolbox options must be an object.");}
    if (o.config === undefined && o.servers === undefined) {return {feature: "toolbox", ok: true};}
    if (typeof o.config === "string") {
        return failure("toolbox", "The `config` option must be an inline object with mcpServers; external JSON config files are not supported.");
    }
    return {feature: "toolbox", ok: true};
}

function checkDirectives(raw: unknown): FeatureReport {
    const o = asRecord(raw);

    if (o === null) {return failure("directives", "The directives options must be an object.");}

    const issue = checkSpecs("directives", o, [
        ["defaults", isBoolean, "a boolean"],
        ["system", isStringArray, "an array of non-empty strings"],
        ["mechanisms", isMechanismArray, `an array of values from ${MECHANISMS.join(", ")}`],
    ]);

    if (issue !== null) {return issue;}
    if (o.tools !== undefined) {
        const toolsIssue = checkTools(o.tools);

        if (toolsIssue !== null) {return toolsIssue;}
    }
    return {feature: "directives", ok: true};
}

const CHECKS: [string, (raw: unknown) => FeatureReport][] = [
    ["orchestrator", checkOrchestrator],
    ["throttle", checkThrottle],
    ["goal", checkGoal],
    ["providers", checkProviders],
    ["skillbox", checkSkillbox],
    ["toolbox", checkToolbox],
    ["directives", checkDirectives],
];

export {CHECKS, isRecord, failure, checkOrchestrator};
