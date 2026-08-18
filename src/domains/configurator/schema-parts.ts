const MODEL_PATTERN = "^[^\\s/]+/[^\\s/]+$";

const TOOL_NAME_PATTERN = "^[a-z0-9_-]+$";

const GLOB_PATTERN = "^[A-Za-z0-9._*-]+$";

const ID_PATTERN = "^[A-Za-z0-9._-]+$";

const modelRef = {type: "string", pattern: MODEL_PATTERN, examples: ["anthropic/claude-sonnet-4-6"]};

const nonEmptyString = {type: "string", minLength: 1};

const stringArray = {type: "array", items: nonEmptyString};

const splitConfig = {
    type: "object",
    additionalProperties: false,
    properties: {
        agent: nonEmptyString,
        model: modelRef,
        fanOut: {type: "integer", minimum: 1},
    },
};

const buildConfig = {
    type: "object",
    additionalProperties: false,
    properties: {
        agent: nonEmptyString,
        model: modelRef,
        maxParallel: {type: "integer", minimum: 1},
    },
};

const limitsConfig = {
    type: "object",
    additionalProperties: false,
    properties: {
        maxNodes: {type: "integer", minimum: 1},
        maxDurationMs: {type: "integer", minimum: 1},
        maxCoordinatorAttempts: {type: "integer", minimum: 1},
        maxPromptChars: {type: "integer", minimum: 1},
        maxResultChars: {type: "integer", minimum: 1},
    },
};

const modelOverride = {
    type: "object",
    additionalProperties: true,
    properties: {
        id: nonEmptyString,
        name: nonEmptyString,
        limit: {
            type: "object",
            additionalProperties: false,
            properties: {
                context: {type: "integer", minimum: 1},
                input: {type: "integer", minimum: 1},
                output: {type: "integer", minimum: 1},
            },
        },
        temperature: {type: "boolean"},
        reasoning: {type: "boolean"},
        attachment: {type: "boolean"},
        toolCall: {type: "boolean"},
        modalities: {
            type: "object",
            additionalProperties: false,
            properties: {
                input: {type: "array", items: {type: "string", enum: ["text", "audio", "image", "video", "pdf"]}},
                output: {type: "array", items: {type: "string", enum: ["text", "audio", "image", "video", "pdf"]}},
            },
        },
        options: {type: "object"},
        headers: {type: "object", additionalProperties: {type: "string"}},
    },
};

const providerSource = {
    type: "object",
    additionalProperties: false,
    required: ["id", "baseURL"],
    properties: {
        id: {type: "string", pattern: ID_PATTERN},
        name: nonEmptyString,
        baseUrl: {type: "string", pattern: "^https?://"},
        apiKey: nonEmptyString,
        headers: {type: "object", additionalProperties: {type: "string"}},
        npm: nonEmptyString,
        kind: {type: "string", enum: ["auto", "openai", "ollama", "unsloth", "lmstudio"], default: "auto"},
        modelsUrl: nonEmptyString,
        fetchModels: {type: "boolean"},
        staticModels: {type: "object", additionalProperties: {$ref: "#/$defs/modelOverride"}},
        overrides: {type: "object", additionalProperties: {$ref: "#/$defs/modelOverride"}},
        include: stringArray,
        exclude: stringArray,
        defaultLimit: {
            type: "object",
            additionalProperties: false,
            properties: {context: {type: "integer", minimum: 1}, output: {type: "integer", minimum: 1}},
        },
        env: {type: "boolean"},
        timeout: {type: "integer", exclusiveMinimum: 0},
    },
};

const serverCommon = {
    disabled: {type: "boolean"},
    timeout: {type: "number", exclusiveMinimum: 0},
    toolFilter: {type: "array", items: {type: "string", pattern: GLOB_PATTERN}},
    tags: stringArray,
};

const stdioServer = {
    type: "object",
    additionalProperties: false,
    required: ["command"],
    properties: {
        ...serverCommon,
        command: {type: "string", minLength: 1},
        args: stringArray,
        env: {type: "object", additionalProperties: {type: "string"}},
        cwd: nonEmptyString,
    },
};

const httpServer = {
    type: "object",
    additionalProperties: false,
    required: ["url"],
    properties: {
        ...serverCommon,
        url: {type: "string", pattern: "^https?://"},
        headers: {type: "object", additionalProperties: {type: "string"}},
        transportType: {type: "string", enum: ["streamable-http", "sse"]},
    },
};

const serverConfig = {oneOf: [stdioServer, httpServer]};

const serversMap = {type: "object", additionalProperties: serverConfig};

export {modelRef, nonEmptyString, stringArray, splitConfig, buildConfig, limitsConfig, modelOverride, providerSource, serversMap, TOOL_NAME_PATTERN};
