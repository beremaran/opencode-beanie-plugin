import {expect, test} from "bun:test";
import {mkdtemp, rm, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {applyOptionsToFile, globalConfigPath, projectConfigPaths, resolveTargetPath} from "./opencode-file";

const writeJson = async (path: string, value: unknown) => {
    await writeFile(path, JSON.stringify(value, null, 2), "utf8");
};

const readJson = async (path: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

test("globalConfigPath uses XDG_CONFIG_HOME when set", () => {
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/tmp/beanie-test-config";
    expect(globalConfigPath()).toBe(join("/tmp/beanie-test-config", "opencode", "opencode.json"));
    process.env.XDG_CONFIG_HOME = original;
});

test("projectConfigPaths lists worktree candidates", () => {
    const paths = projectConfigPaths("/tmp/worktree");
    expect(paths).toEqual([
        join("/tmp/worktree", "opencode.json"),
        join("/tmp/worktree", "opencode.jsonc"),
        join("/tmp/worktree", ".opencode", "opencode.json"),
    ]);
});

test("resolveTargetPath returns global path for global scope", () => {
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/tmp/beanie-test-global";
    const path = resolveTargetPath("/tmp/worktree", "global");
    expect(path).toBe(join("/tmp/beanie-test-global", "opencode", "opencode.json"));
    process.env.XDG_CONFIG_HOME = original;
});

test("applyOptionsToFile creates a new config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "beanie-configurator-test-"));
    try {
        const result = applyOptionsToFile(dir, "project", {throttle: {maxParallel: 3}});
        const config = await readJson(result.path);
        expect(config.plugin).toEqual([["@beremaran/opencode-beanie-plugin", {throttle: {maxParallel: 3}}]]);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
});

test("applyOptionsToFile updates an existing config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "beanie-configurator-test-"));
    try {
        const configPath = join(dir, "opencode.json");
        await writeJson(configPath, {plugin: []});
        const result = applyOptionsToFile(dir, "project", {goal: {}});
        expect(result.path).toBe(configPath);
        const config = await readJson(configPath);
        expect(config.plugin).toEqual([["@beremaran/opencode-beanie-plugin", {goal: {}}]]);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
});
