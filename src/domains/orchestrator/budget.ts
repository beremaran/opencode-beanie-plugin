import type {OrchestratorConfig} from "./model";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

const JSON_OVERHEAD = 131072;

const NODE_OVERHEAD = 4096;

const BYTES_PER_ESCAPED_CHAR = 6;

const STRUCTURAL_TEXT_CHARS = 256;

const add = (left: number, right: number) => Math.min(MAX_SAFE, left + right);

const multiply = (left: number, right: number) => left > MAX_SAFE / right ? MAX_SAFE : left * right;

export const derivedOrchestratorArtifactBytes = (config: OrchestratorConfig): number => {
    const nodes = config.limits.maxNodes;

    const promptChars = multiply(add(nodes, 1), config.limits.maxPromptChars);

    const resultChars = multiply(add(multiply(2, nodes), 2), config.limits.maxResultChars);

    const configChars = [config.manager.agent, config.manager.model, config.build.agent, config.build.model, ...config.coordinators.flatMap((item) => [item.agent, item.model])].reduce((total, value) => add(total, value.length), 0);

    const structuralChars = multiply(add(16, multiply(12, nodes)), STRUCTURAL_TEXT_CHARS);

    const content = add(promptChars, add(resultChars, add(configChars, structuralChars)));

    return add(JSON_OVERHEAD, add(multiply(NODE_OVERHEAD, nodes), multiply(BYTES_PER_ESCAPED_CHAR, content)));
};
