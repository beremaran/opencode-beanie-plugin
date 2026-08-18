import {expect, test} from "bun:test";
import type {Config, PluginInput} from "@opencode-ai/plugin";
import type {Part} from "@opencode-ai/sdk";
import {ConfiguratorDomain} from "./index";

const mockClient = () => ({
    app: {
        log: () => Promise.resolve(undefined),
    },
});

const input = (worktree = "/tmp/worktree"): PluginInput => ({
    worktree,
    client: mockClient(),
    project: {id: "project"},
} as unknown as PluginInput);

test("ConfiguratorDomain registers the configure_plugin tool", async () => {
    const hooks = await ConfiguratorDomain(input());
    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.configure_plugin).toBeDefined();
});

test("config hook registers the beanie command", async () => {
    const hooks = await ConfiguratorDomain(input());
    const config = {} as Config;
    await hooks.config?.(config);
    expect(config.command?.beanie).toBeDefined();
    expect(config.command?.beanie?.template).toContain("beanie-command");
});

test("config hook preserves existing commands", async () => {
    const hooks = await ConfiguratorDomain(input());
    const existing = {description: "Existing", template: "Keep this"};
    const config = {command: {help: existing}} as unknown as Config;
    await hooks.config?.(config);
    expect(config.command?.help).toEqual(existing);
    expect(config.command?.beanie).toBeDefined();
});

test("command hook ignores non-beanie commands", async () => {
    const hooks = await ConfiguratorDomain(input());
    const output = {parts: [] as Part[]};
    await hooks["command.execute.before"]?.({command: "other", sessionID: "test", arguments: ""}, output);
    expect(output.parts).toEqual([]);
});

test("command hook handles beanie status", async () => {
    const hooks = await ConfiguratorDomain(input());
    const output = {parts: [] as Part[]};
    await hooks["command.execute.before"]?.({command: "beanie", sessionID: "test", arguments: "status"}, output);
    expect(output.parts.length).toBe(1);
    const part = output.parts[0];
    if (part && part.type === "text") {
        expect(part.text).toContain("opencode-beanie-plugin configuration");
    }
});

test("command hook handles beanie help", async () => {
    const hooks = await ConfiguratorDomain(input());
    const output = {parts: [] as Part[]};
    await hooks["command.execute.before"]?.({command: "beanie", sessionID: "test", arguments: "help"}, output);
    const part = output.parts[0];
    if (part && part.type === "text") {
        expect(part.text).toContain("/beanie");
    }
});

test("configure_plugin tool returns schema", async () => {
    const hooks = await ConfiguratorDomain(input());
    const tool = hooks.tool?.configure_plugin;
    if (!tool?.execute) {throw new Error("configure_plugin not registered");}
    const result = await tool.execute({action: "schema", scope: "auto"}, {} as never);
    expect(result).toContain("opencode-beanie-plugin options");
});

test("configure_plugin tool returns status", async () => {
    const hooks = await ConfiguratorDomain(input());
    const tool = hooks.tool?.configure_plugin;
    if (!tool?.execute) {throw new Error("configure_plugin not registered");}
    const result = await tool.execute({action: "status", scope: "auto"}, {} as never);
    expect(result).toContain("opencode-beanie-plugin");
    expect(result).toContain("registered");
});

test("configure_plugin tool validates options", async () => {
    const hooks = await ConfiguratorDomain(input());
    const tool = hooks.tool?.configure_plugin;
    if (!tool?.execute) {throw new Error("configure_plugin not registered");}
    const result = await tool.execute({action: "validate", scope: "auto", config: `{"throttle": {"maxParallel": "bad"}}`}, {} as never);
    expect(result).toContain("errors");
});
