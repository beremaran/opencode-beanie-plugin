import {type Config, type PluginInput, tool} from "@opencode-ai/plugin";
import type {Domain} from "../../shared/domain";
import {
    parseBeanie,
    parseOptionsPayload,
    renderApply,
    renderHelp,
    renderInitDirective,
    renderStatus,
    renderValidation,
} from "./commands";
import {applyOptionsToFile, type ConfigScope, isPluginEntryName, PLUGIN_NAME, resolveTargetPath} from "./opencode-file";
import {PLUGIN_OPTIONS_SCHEMA} from "./schema";
import {validateFullOptions} from "./validate";

const SERVICE = "opencode-beanie-plugin";

type OutputParts = Array<{type: string; text?: string}>;

function replaceTextPart(parts: OutputParts, text: string): void {
    const part = parts.find((candidate) => candidate.type === "text");

    if (part) {part.text = text;} else {parts.push({type: "text", text});}
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface BeanieState {
    options: Record<string, unknown>;
    hasEntry: boolean;
    subagentDepth?: number;
}

function pluginEntryOf(config: Config): {options: Record<string, unknown>; hasEntry: boolean} {
    for (const entry of config.plugin ?? []) {
        if (isPluginEntryName(entry)) {return {options: {}, hasEntry: true};}
        if (Array.isArray(entry) && isPluginEntryName(entry[0])) {
            const [, pluginOptions] = entry;

            let options: Record<string, unknown> = {};

            if (isRecord(pluginOptions)) {options = pluginOptions;}
            return {options, hasEntry: true};
        }
    }
    return {options: {}, hasEntry: false};
}

function parseConfigArgument(
    config: string | undefined,
): {ok: true; options: Record<string, unknown>} | {ok: false; error: string} {
    return parseOptionsPayload(config ?? "");
}

function errorText(error: unknown): string {
    if (error instanceof Error) {return error.message;}
    return String(error);
}

async function runConfigHook(client: PluginInput["client"], cfg: Config, state: BeanieState): Promise<void> {
    cfg.command = {
        ...cfg.command,
        beanie: {
            description: "Inspect, validate, or write the opencode-beanie-plugin configuration",
            template: "<beanie-command>$ARGUMENTS</beanie-command>",
        },
    };
    const found = pluginEntryOf(cfg);
    state.options = found.options;
    state.hasEntry = found.hasEntry;
    const subagentDepth = (cfg as Config & {subagent_depth?: unknown}).subagent_depth;

    let depth: number | undefined;

    if (typeof subagentDepth === "number") {depth = subagentDepth;}
    state.subagentDepth = depth;
    const validation = validateFullOptions(state.options);

    if (!state.hasEntry) {
        await warn(
            client,
            "The configurator could not find the plugin entry in the loaded config; /beanie and configure_plugin will operate on empty options.",
        );
    }
    await Promise.all(
        validation.errors.map((error) => warn(client, `Existing configuration problem in "${error.feature}": ${error.message ?? ""}`)),
    );
}

async function warn(client: PluginInput["client"], message: string): Promise<void> {
    await client.app.log({body: {service: SERVICE, level: "warn", message}}).catch(() => undefined);
}

function handleBeanieApply(payload: string, parts: OutputParts, state: BeanieState, worktree: string): void {
    const decoded = parseOptionsPayload(payload);

    if (!decoded.ok) {
        replaceTextPart(parts, decoded.error);
        return;
    }

    const candidate = decoded.options;

    const validation = validateFullOptions(candidate);

    if (validation.errors.length > 0) {
        replaceTextPart(parts, `Refusing to write invalid configuration.\n\n${renderValidation(validation)}`);
        return;
    }
    try {
        const result = applyOptionsToFile(worktree, "auto", candidate);
        state.options = candidate;
        state.hasEntry = true;
        replaceTextPart(parts, renderApply(candidate, result, validation));
    } catch (error) {
        replaceTextPart(parts, `Failed to write configuration: ${errorText(error)}`);
    }
}

function handleBeanieCommand(
    rawArguments: string,
    output: {parts: OutputParts},
    state: BeanieState,
    worktree: string,
): void {
    const parsed = parseBeanie(rawArguments);

    if (parsed.action === "help") {
        replaceTextPart(output.parts, renderHelp());
        return;
    }
    if (parsed.action === "init") {
        replaceTextPart(output.parts, renderInitDirective());
        return;
    }
    if (parsed.action === "status") {
        replaceTextPart(output.parts, renderStatus(state.options, validateFullOptions(state.options), worktree, state.subagentDepth));
        return;
    }
    if (parsed.action === "validate") {
        const decoded = parseOptionsPayload(parsed.payload);

        if (!decoded.ok) {
            replaceTextPart(output.parts, decoded.error);
            return;
        }

        let candidate = state.options;

        if (parsed.payload.trim() !== "") {candidate = decoded.options;}
        replaceTextPart(output.parts, renderValidation(validateFullOptions(candidate)));
        return;
    }
    if (parsed.action === "apply") {
        handleBeanieApply(parsed.payload, output.parts, state, worktree);
        return;
    }
    replaceTextPart(output.parts, `Unknown /beanie subcommand.\n\n${renderHelp()}`);
}

type ConfigureAction = "status" | "schema" | "validate" | "apply";

function executeConfigurePlugin(
    args: {action: ConfigureAction; config?: string; scope: ConfigScope},
    state: BeanieState,
    worktree: string,
): string {
    if (args.action === "schema") {
        return JSON.stringify(PLUGIN_OPTIONS_SCHEMA, null, 2);
    }
    if (args.action === "status") {
        return JSON.stringify(
            {
                plugin: PLUGIN_NAME,
                registered: state.hasEntry,
                targetFile: resolveTargetPath(worktree, args.scope),
                options: state.options,
                subagentDepth: state.subagentDepth,
                validation: validateFullOptions(state.options),
            },
            null,
            2,
        );
    }

    let decoded: {ok: true; options: Record<string, unknown>} | {ok: false; error: string};

    if (args.config === undefined) {
        decoded = {ok: true as const, options: state.options};
    } else {
        decoded = parseConfigArgument(args.config);
    }
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
    try {
        const result = applyOptionsToFile(worktree, args.scope, candidate);
        state.options = candidate;
        state.hasEntry = true;
        return JSON.stringify({applied: true, ...result, options: candidate, validation}, null, 2);
    } catch (error) {
        return JSON.stringify({applied: false, error: errorText(error)}, null, 2);
    }
}

const configurePluginTool = (state: BeanieState, worktree: string) =>
    tool({
        description:
            "Inspect, validate, or write the opencode-beanie-plugin configuration. Options are nested per camelCase feature name (orchestrator, throttle, goal, providers, skillbox, toolbox, directives); orchestrator.subagentModel is required. Changes take effect after opencode restarts.",
        args: {
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
        },
        execute(args) {
            return Promise.resolve(executeConfigurePlugin(args, state, worktree));
        },
    });

export const ConfiguratorDomain: Domain = (input) => {
    const state: BeanieState = {options: {}, hasEntry: false};

    const worktree = input.worktree;

    return Promise.resolve({
        config: (cfg) => runConfigHook(input.client, cfg, state),
        "command.execute.before": (command, output) => {
            if (command.command !== "beanie") {return Promise.resolve();}
            handleBeanieCommand(command.arguments, output, state, worktree);
            return Promise.resolve();
        },
        tool: {
            configure_plugin: configurePluginTool(state, worktree),
        },
    });
};
