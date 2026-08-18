import {afterEach} from "bun:test";
import type {Hooks, PluginInput, ToolContext, ToolResult} from "@opencode-ai/plugin";
import type {Event} from "@opencode-ai/sdk";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createGoalsDomain} from "./index";
import {FileGoalStore} from "./store";
import type {GoalPluginOptions} from "./types";

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
    turns?: number
    tokensUsed?: number
    tokenBudget?: number
    maxTurns?: number
    lastEvaluatedMessageId?: string
    lastReason?: string
    completionClaim?: {reason: string; createdAt: string}
};

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

export const mockClient = () => {
    const logs: Array<{level: string; message: string; extra?: unknown}> = [];

    const toasts: Array<{title: string; message: string; variant: string}> = [];

    const prompted: Array<{sessionId: string; body: unknown}> = [];

    const createdSessions: Array<{parentID?: string; title?: string}> = [];

    const deletedSessions: string[] = [];

    const client = {
        app: {
            log: (params: {body: {level: string; message: string; extra?: unknown}}) => {
                logs.push(params.body);
                return Promise.resolve();
            },
        },
        tui: {
            showToast: (params: {body: {title: string; message: string; variant: string}}) => {
                toasts.push(params.body);
                return Promise.resolve();
            },
        },
        session: {
            create: (params: {body: {parentID?: string; title?: string}}) => {
                createdSessions.push(params.body);
                return Promise.resolve({data: {id: "eval-session-1"}});
            },
            delete: (params: {path: {id: string}}) => {
                deletedSessions.push(params.path.id);
                return Promise.resolve({});
            },
            prompt: (params: {path: {id: string}; body: unknown}) => {
                prompted.push({sessionId: params.path.id, body: params.body});
                return Promise.resolve({data: {parts: [{type: "text", text: '{"complete":false,"reason":"Still working"}'}]}});
            },
            promptAsync: (params: {path: {id: string}; body: unknown}) => {
                prompted.push({sessionId: params.path.id, body: params.body});
                return Promise.resolve({});
            },
            status: () => Promise.resolve({data: {}}),
            messages: () => Promise.resolve({data: []}),
        },
        config: {
            get: () => Promise.resolve({data: {small_model: "anthropic/claude-haiku-3-5"}}),
        },
    } as unknown as PluginInput["client"];

    return {client, logs, toasts, prompted, createdSessions, deletedSessions};
};

export async function createDomain(rawOptions?: {goal?: GoalPluginOptions}) {
    const stateRoot = await mkdtemp(join(tmpdir(), "beanie-goals-test-"));
    roots.push(stateRoot);
    return createDomainAt(stateRoot, rawOptions);
}

export async function createDomainAt(stateRoot: string, rawOptions?: {goal?: GoalPluginOptions}, client = mockClient().client) {
    const input = {worktree: "/tmp/worktree", project: {id: "project"}, client} as PluginInput;

    return createGoalsDomain(input, rawOptions, (options) => new FileGoalStore({...options, stateRoot}));
}

export async function cleanupDomains() {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
}

afterEach(cleanupDomains);

export function tools(hooks: Hooks) {
    const registered = hooks.tool;

    if (!registered) {throw new Error("Goals tools were not registered");}
    return registered;
}

export function configHook(hooks: Hooks) {
    if (!hooks.config) {throw new Error("Goals config hook was not registered");}
    return hooks.config;
}

export function commandHook(hooks: Hooks) {
    const hook = hooks["command.execute.before"];

    if (!hook) {throw new Error("Goals command hook was not registered");}
    return hook;
}

export function transformHook(hooks: Hooks) {
    const hook = hooks["experimental.chat.system.transform"];

    if (!hook) {throw new Error("Goals transform hook was not registered");}
    return hook;
}

export function eventHook(hooks: Hooks) {
    const hook = hooks.event;

    if (!hook) {throw new Error("Goals event hook was not registered");}
    return hook;
}

export function goalSet(hooks: Hooks) {
    const definition = tools(hooks).goal_set;

    if (!definition) {throw new Error("goal_set was not registered");}
    return definition;
}

export function goalStatus(hooks: Hooks) {
    const definition = tools(hooks).goal_status;

    if (!definition) {throw new Error("goal_status was not registered");}
    return definition;
}

export function goalUpdate(hooks: Hooks) {
    const definition = tools(hooks).goal_update;

    if (!definition) {throw new Error("goal_update was not registered");}
    return definition;
}
