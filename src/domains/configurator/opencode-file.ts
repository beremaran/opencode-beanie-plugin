import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {dirname, join} from "node:path";
import {findPluginEntrySpan, isPluginEntryName} from "./opencode-upsert";

export const PLUGIN_NAME = "@beremaran/opencode-beanie-plugin";

export {isPluginEntryName};

export function globalConfigPath(): string {
    const xdg = process.env.XDG_CONFIG_HOME?.trim();

    return join(xdg || join(homedir(), ".config"), "opencode", "opencode.json");
}

export function projectConfigPaths(worktree: string): string[] {
    return [
        join(worktree, "opencode.json"),
        join(worktree, "opencode.jsonc"),
        join(worktree, ".opencode", "opencode.json"),
    ];
}

export function candidateConfigPaths(worktree: string): string[] {
    return [...projectConfigPaths(worktree), globalConfigPath()];
}

export function readConfigFile(path: string): string | null {
    try {
        if (existsSync(path)) {return readFileSync(path, "utf8");}
        return null;
    } catch {
        return null;
    }
}

export function writeConfigFile(path: string, text: string): void {
    mkdirSync(dirname(path), {recursive: true});
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
}

export type ConfigScope = "auto" | "project" | "global";

export function resolveTargetPath(worktree: string, scope: ConfigScope = "auto"): string {
    const candidates: string[] = [];

    if (scope === "global") {candidates.push(globalConfigPath());}
    else if (scope === "project") {candidates.push(...projectConfigPaths(worktree));}
    else {candidates.push(...candidateConfigPaths(worktree));}
    for (const path of candidates) {
        const text = readConfigFile(path);

        if (text !== null && findPluginEntrySpan(text) !== null) {return path;}
    }
    for (const path of candidates) {
        if (existsSync(path)) {return path;}
    }
    return candidates[0] ?? join(worktree, "opencode.json");
}

export interface ApplyResult {
    path: string;
    created: boolean;
    changed: boolean;
}

export function applyOptionsToFile(worktree: string, scope: ConfigScope, options: Record<string, unknown>): ApplyResult {
    const path = resolveTargetPath(worktree, scope);

    const before = readConfigFile(path);

    const created = before === null;

    const text = upsertPluginEntry(before ?? "{}", options);
    writeConfigFile(path, text);
    return {path, created, changed: text !== before};
}

import {upsertPluginEntry} from "./opencode-upsert";
