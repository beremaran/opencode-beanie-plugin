import type {TuiApi} from "./types";
import {
    type LocationResult,
    type MockState,
    buildAttentionAndKeymap,
    buildLifecycleAndEvents,
    buildRouteApi,
    buildSlotsAndCommands,
    buildStateSessionApi,
    buildUiApi,
    createInitialMockState,
} from "./test-helpers-builders";

export const at = <T>(items: readonly T[], index: number): T => {
    const item = items[index];

    if (item === undefined) {throw new Error(`Item at index ${String(index)} not found`);}
    return item;
};

export type MockSession = {
    slug?: string; parentID?: string; status?: string
    todos: {content: string; status: string}[]
    diff: {file: string; additions: number; deletions: number}[]
    permissions: {id: string; permission: string; patterns: string[]}[]
    questions: {id: string; questions: unknown[]}[]
};

export type MockTuiApi = {
    api: TuiApi
    fire: (name: string, event?: unknown) => void
    notifications: {title: string; message: string; sound?: {name: string}}[]
    toasts: {title: string; message: string; variant: string}[]
    goalCommands: {sessionID: string; command: string; arguments?: string}[]
    setGoalCommandError: (fn: () => unknown) => void
    navigations: {name: string; params?: Record<string, unknown>}[]
    keymapLayers: {commands: {name: string; run: () => void}[]; bindings?: {key: string; cmd: string; desc: string}[]}[]
    legacyCommands: {title: string; value: string; onSelect: () => void}[]
    registeredRoutes: string[]
    slotRegistrations: {order?: number; dispose?: () => void; slots: Record<string, unknown>}[]
    dialogEntries: {render: () => unknown; close?: () => void}[]
    disposers: (() => void)[]
    sessions: Map<string, MockSession>
    mcpRows: {name: string; status: string; error?: string}[]
    lspRows: {id: string; root?: string; status: string}[]
    providers: unknown[]
    setRoute: (route: {name: string; params?: Record<string, unknown>}) => void
    setBranch: (branch?: string) => void
    setDefaultModel: (model?: string) => void
};

const buildClientApi = (s: MockState, location?: () => LocationResult | Promise<LocationResult>) => ({
    v2: {
        location: {
            get: () => (location ? location() : Promise.resolve({data: {project: {id: "project-mock"}}})),
        },
    },
    session: {
        command: (params: {sessionID: string; command: string; arguments?: string}) => {
            s.goalCommands.push(params);
            return Promise.resolve({error: s.goalCommandError()});
        },
    },
});

const buildStateApi = (s: MockState) => ({
    ready: true,
    config: {get model() {return s.defaultModel;}},
    provider: s.providers,
    path: {state: s.worktree, config: s.worktree, worktree: s.worktree, directory: s.worktree},
    get vcs() {return s.vcs;},
    session: buildStateSessionApi(s),
    part: () => [],
    lsp: () => s.lspRows,
    mcp: () => s.mcpRows,
});

const buildTuiApi = (s: MockState, location?: () => LocationResult | Promise<LocationResult>): TuiApi => ({
    ...buildAttentionAndKeymap(s),
    route: buildRouteApi(s),
    ui: buildUiApi(s),
    client: buildClientApi(s, location),
    ...buildLifecycleAndEvents(s),
    ...buildSlotsAndCommands(s),
    state: buildStateApi(s),
} as unknown as TuiApi);

const buildMockTuiResult = (s: MockState, api: TuiApi): MockTuiApi => ({
    api,
    fire: (name: string, event?: unknown) => {for (const handler of s.events.get(name) ?? []) {handler(event);}},
    notifications: s.notifications, toasts: s.toasts, goalCommands: s.goalCommands,
    setGoalCommandError: (fn: () => unknown) => {s.goalCommandError = fn;},
    navigations: s.navigations, keymapLayers: s.keymapLayers, legacyCommands: s.legacyCommands,
    registeredRoutes: s.registeredRoutes, slotRegistrations: s.slotRegistrations,
    dialogEntries: s.dialogEntries, disposers: s.disposers, sessions: s.sessions,
    mcpRows: s.mcpRows, lspRows: s.lspRows, providers: s.providers,
    setRoute: (route: {name: string; params?: Record<string, unknown>}) => {s.current = route;},
    setBranch: (branch?: string) => {s.vcs = branch === undefined ? undefined : {branch};},
    setDefaultModel: (model?: string) => {s.defaultModel = model;},
});

export const createMockTuiApi = (options?: {
    worktree?: string
    location?: () => LocationResult | Promise<LocationResult>
}): MockTuiApi => {
    const s = createInitialMockState(options?.worktree);

    return buildMockTuiResult(s, buildTuiApi(s, options?.location));
};
