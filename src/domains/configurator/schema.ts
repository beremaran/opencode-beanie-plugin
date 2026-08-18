import {
    buildConfig,
    limitsConfig,
    modelOverride,
    modelRef,
    nonEmptyString,
    providerSource,
    serversMap,
    splitConfig,
    stringArray,
    TOOL_NAME_PATTERN,
} from "./schema-parts";

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
