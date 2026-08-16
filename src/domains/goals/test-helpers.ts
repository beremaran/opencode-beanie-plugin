import {afterEach} from "bun:test";
import type {Hooks, PluginInput, ToolContext, ToolResult} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createGoalsDomain} from "./index";
import {FileGoalStore} from "./store";

export type Goal = {
    id: string
    sessionID: string
    status: string
    outcome: string
    constraints: string[]
    verificationCriteria: string[]
    verificationEvidence: string[]
    version: number
    createdAt: string
    updatedAt: string
    completedAt?: string
    progress?: string
    nextAction?: string
    blocker?: string
}

const roots: string[] = [];

export const context = (sessionID: string) => ({sessionID} as ToolContext);

export const result = (value: ToolResult): Record<string, unknown> =>
    JSON.parse(typeof value === "string" ? value : value.output) as Record<string, unknown>;

export const event = (sessionID: string): {event: Event} => ({
    event: {
        type: "session.deleted",
        properties: {
            info: {
                id: sessionID, projectID: "project", directory: "/", title: "Test session", version: "1",
                time: {created: 0, updated: 0},
            },
        },
    },
});

export async function createDomain() {
    const stateRoot = await mkdtemp(join(tmpdir(), "beanie-goals-test-"));
    roots.push(stateRoot);
    return createDomainAt(stateRoot);
}

export async function createDomainAt(stateRoot: string) {
    const input = {worktree: "/tmp/worktree", project: {id: "project"}} as PluginInput;

    return createGoalsDomain(input, (options) => new FileGoalStore({...options, stateRoot}));
}

export async function cleanupDomains() {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
}

afterEach(cleanupDomains);

export function tools(hooks: Hooks) {
    const registered = hooks.tool;

    if (!registered) {
        throw new Error("Goals tools were not registered");
    }

    return registered;
}

export function configHook(hooks: Hooks) {
    if (!hooks.config) {
        throw new Error("Goals config hook was not registered");
    }
    return hooks.config;
}

export function goalSet(hooks: Hooks) {
    const definition = tools(hooks).goal_set;

    if (!definition) {
        throw new Error("goal_set was not registered");
    }
    return definition;
}

export function goalStatus(hooks: Hooks) {
    const definition = tools(hooks).goal_status;

    if (!definition) {
        throw new Error("goal_status was not registered");
    }
    return definition;
}

export function goalUpdate(hooks: Hooks) {
    const definition = tools(hooks).goal_update;

    if (!definition) {
        throw new Error("goal_update was not registered");
    }
    return definition;
}
