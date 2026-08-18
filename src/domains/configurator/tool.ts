import {tool} from "@opencode-ai/plugin";
import {PLUGIN_OPTIONS_SCHEMA} from "./schema";
import {applyOptionsToFile, resolveTargetPath, PLUGIN_NAME, type ConfigScope} from "./opencode-file";
import {validateFullOptions, type ValidationResult} from "./validate";
import {errorText, resolveApplyPayload, type BeanieState} from "./shared";

type ConfigureAction = "status" | "schema" | "validate" | "apply";

type ConfigureArgs = {action: ConfigureAction; config?: string; scope: ConfigScope};

function renderStatusJson(state: BeanieState, worktree: string, scope: ConfigScope): string {
    return JSON.stringify(
        {
            plugin: PLUGIN_NAME,
            registered: state.hasEntry,
            targetFile: resolveTargetPath(worktree, scope),
            options: state.options,
            validation: validateFullOptions(state.options),
        },
        null,
        2,
    );
}

function writeConfig(
    scope: ConfigScope,
    state: BeanieState,
    worktree: string,
    candidate: Record<string, unknown>,
    validation: ValidationResult,
): string {
    try {
        const result = applyOptionsToFile(worktree, scope, candidate);

        state.options = candidate;
        state.hasEntry = true;
        return JSON.stringify({applied: true, ...result, options: candidate, validation}, null, 2);
    } catch (error) {
        return JSON.stringify({applied: false, error: errorText(error)}, null, 2);
    }
}

function applyOrValidate(args: ConfigureArgs, state: BeanieState, worktree: string): string {
    const decoded = resolveApplyPayload(args.config, state);

    if (!decoded.ok) {
        return JSON.stringify({error: decoded.error}, null, 2);
    }

    const candidate = decoded.options;

    const validation = validateFullOptions(candidate);

    if (args.action === "validate") {
        return JSON.stringify(validation, null, 2);
    }
    if (validation.errors.length > 0) {
        return JSON.stringify({applied: false, error: "Refusing to write invalid configuration.", validation}, null, 2);
    }
    return writeConfig(args.scope, state, worktree, candidate, validation);
}

function executeConfigurePlugin(args: ConfigureArgs, state: BeanieState, worktree: string): string {
    if (args.action === "schema") {
        return JSON.stringify(PLUGIN_OPTIONS_SCHEMA, null, 2);
    }
    if (args.action === "status") {
        return renderStatusJson(state, worktree, args.scope);
    }
    return applyOrValidate(args, state, worktree);
}

const toolArgs = {
    action: tool.schema
        .enum(["status", "schema", "validate", "apply"])
        .describe("status: current effective options; schema: full JSON schema; validate: check options for errors; apply: validate then write to opencode.json."),
    config: tool.schema
        .string()
        .optional()
        .describe("Full plugin options as a JSON object string. Required for validate/apply; omit to use the currently loaded options."),
    scope: tool.schema
        .enum(["auto", "project", "global"])
        .optional()
        .default("auto")
        .describe(
            "auto: update the config file that already registers the plugin, else the project config; project: <worktree>/opencode.json; global: ~/.config/opencode/opencode.json.",
        ),
};

function configurePluginTool(state: BeanieState, worktree: string) {
    return tool({
        description:
            "Inspect, validate, or write the opencode-beanie-plugin configuration. Options are nested per camelCase feature name (orchestrator, throttle, goal, providers, skillbox, toolbox, directives). Changes take effect after opencode restarts.",
        args: toolArgs,
        execute(args) {
            return Promise.resolve(executeConfigurePlugin(args, state, worktree));
        },
    });
}

export {configurePluginTool};
