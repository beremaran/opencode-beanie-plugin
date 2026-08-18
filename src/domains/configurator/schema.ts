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

export const PLUGIN_OPTIONS_SCHEMA = {
    $id: "https://opencode.ai/plugins/opencode-beanie-plugin.schema.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "@beremaran/opencode-beanie-plugin options",
    description:
        "Options for @beremaran/opencode-beanie-plugin. Set them on the plugin tuple in opencode.json: [\"@beremaran/opencode-beanie-plugin\", { ... }]. Feature names are camelCase.",
    type: "object",
    additionalProperties: false,
    properties: {
        orchestrator: {
            type: "object",
            additionalProperties: false,
            properties: {
                enabled: {type: "boolean"},
                manager: splitConfig,
                coordinators: {type: "array", items: splitConfig},
                build: buildConfig,
                fanOutMode: {type: "string", enum: ["exact", "atMost"]},
                failurePolicy: {type: "string", enum: ["fail-fast", "collect"]},
                limits: limitsConfig,
            },
        },
        throttle: {
            type: "object",
            additionalProperties: false,
            properties: {
                maxParallel: {type: "integer", minimum: 1, default: 2},
                mode: {type: "string", enum: ["session", "global"], default: "session"},
                maxWaitMs: {type: "number", exclusiveMinimum: 0, default: 3_600_000},
                notifyQueue: {type: "boolean", default: false},
            },
        },
        goal: {
            type: "object",
            additionalProperties: false,
            properties: {
                evaluatorModel: modelRef,
                evaluatorAgent: nonEmptyString,
                stateDirectory: nonEmptyString,
                maxTranscriptChars: {type: "integer", minimum: 1024, default: 48_000},
                defaultTokenBudget: {type: "integer", minimum: 1},
                defaultMaxTurns: {type: "integer", minimum: 1},
                continuationDelayMs: {type: "integer", minimum: 0, default: 0},
                deleteEvaluatorSessions: {type: "boolean", default: true},
            },
        },
        providers: {
            type: "object",
            additionalProperties: false,
            properties: {
                providers: {type: "array", items: {$ref: "#/$defs/providerSource"}},
                model: modelRef,
                smallModel: modelRef,
                timeout: {type: "integer", exclusiveMinimum: 0, default: 10_000},
                npm: nonEmptyString,
                env: {type: "boolean", default: true},
            },
        },
        skillbox: {
            type: "object",
            additionalProperties: false,
            properties: {
                registry: {type: "string", enum: ["auto", "skills-sh", "github"]},
                skillsShToken: nonEmptyString,
                githubSources: stringArray,
                githubToken: nonEmptyString,
                maxBytes: {type: "integer", minimum: 1},
                debug: {type: "boolean"},
            },
        },
        toolbox: {
            type: "object",
            additionalProperties: false,
            properties: {
                config: {
                    type: "object",
                    additionalProperties: false,
                    required: ["mcpServers"],
                    properties: {
                        mcpServers: serversMap,
                        searchTopK: {type: "integer", minimum: 1, maximum: 500, default: 20},
                        cacheToolMetadata: {
                            type: "boolean",
                            default: true,
                            description:
                                "Cache upstream tool metadata between list_tools calls. When true, list_tools auto-connects servers whose metadata is not loaded yet and marks stale rows; pass refresh=true to force a reload or refresh=false to use only the cache.",
                        },
                        processPoolSize: {type: "integer", minimum: 1, maximum: 64, default: 8},
                        timeoutSeconds: {type: "number", minimum: 1, maximum: 600, default: 30},
                        idleTimeoutMs: {type: "integer", minimum: 0, maximum: 3_600_000, default: 300_000},
                    },
                },
                servers: serversMap,
            },
        },
        directives: {
            type: "object",
            additionalProperties: false,
            properties: {
                defaults: {type: "boolean", default: true},
                system: stringArray,
                tools: {
                    type: "object",
                    additionalProperties: {type: "string", minLength: 1},
                    propertyNames: {pattern: TOOL_NAME_PATTERN},
                },
                mechanisms: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: ["goal", "orchestrator", "throttle", "skillbox", "toolbox", "providers", "configurator"],
                    },
                },
            },
        },
    },
    $defs: {
        providerSource,
        modelOverride,
    },
};
