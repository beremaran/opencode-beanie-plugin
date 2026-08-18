import {type Config, type PluginInput} from "@opencode-ai/plugin";
import type {Domain} from "../../shared/domain";
import {handleBeanieCommand} from "./command";
import {configurePluginTool} from "./tool";
import type {BeanieState} from "./shared";
import {isPluginEntryName} from "./opencode-file";
import {validateFullOptions} from "./validate";

const SERVICE = "opencode-beanie-plugin";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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

async function warn(client: PluginInput["client"], message: string): Promise<void> {
    await client.app.log({body: {service: SERVICE, level: "warn", message}}).catch(() => undefined);
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
    const validation = validateFullOptions(state.options);

    if (!state.hasEntry) {
        await warn(client, "The configurator could not find the plugin entry in the loaded config; /beanie and configure_plugin will operate on empty options.");
    }
    await Promise.all(
        validation.errors.map((error) => warn(client, `Existing configuration problem in "${error.feature}": ${error.message ?? ""}`)),
    );
}

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
