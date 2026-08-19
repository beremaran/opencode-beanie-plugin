import type {TuiApi} from "./types";

export const at = <T>(items: readonly T[], index: number): T => {
    const item = items[index];

    if (item === undefined) {
        throw new Error(`Item at index ${String(index)} not found`);
    }
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

type LocationResult = {data?: {project?: {id?: string}}};

export const createMockTuiApi = (options?: {
    worktree?: string
    location?: () => LocationResult | Promise<LocationResult>
}): MockTuiApi => {
    const s = {
        worktree: options?.worktree ?? "/tmp/beanie-tui-mock",
        current: {name: "session"} as {name: string; params?: Record<string, unknown>},
        vcs: undefined as {branch?: string} | undefined,
        defaultModel: undefined as string | undefined,
        goalCommandError: (() => undefined) as () => unknown,
        sessions: new Map<string, MockSession>(),
        mcpRows: [] as {name: string; status: string; error?: string}[],
        lspRows: [] as {id: string; root?: string; status: string}[],
        providers: [] as unknown[],
        events: new Map<string, ((event: unknown) => void)[]>(),
        notifications: [] as {title: string; message: string; sound?: {name: string}}[],
        toasts: [] as {title: string; message: string; variant: string}[],
        goalCommands: [] as {sessionID: string; command: string; arguments?: string}[],
        navigations: [] as {name: string; params?: Record<string, unknown>}[],
        keymapLayers: [] as MockTuiApi["keymapLayers"],
        legacyCommands: [] as MockTuiApi["legacyCommands"],
        registeredRoutes: [] as string[],
        slotRegistrations: [] as MockTuiApi["slotRegistrations"],
        dialogEntries: [] as MockTuiApi["dialogEntries"],
        disposers: [] as (() => void)[],
    };

    const api = {
        attention: {
            notify: (input: {title: string; message: string; sound?: {name: string}}) => {
                s.notifications.push(input);
                return Promise.resolve();
            },
        },
        keymap: {
            registerLayer: (layer: {commands: {name: string; run: () => void}[]; bindings?: {key: string; cmd: string; desc: string}[]}) => {
                s.keymapLayers.push(layer);
                return () => {s.keymapLayers.splice(s.keymapLayers.indexOf(layer), 1);};
            },
        },
        route: {
            register: (routes: {name: string}[]) => {
                routes.forEach((route) => s.registeredRoutes.push(route.name));
                return () => {
                    for (const route of routes) {s.registeredRoutes.splice(s.registeredRoutes.indexOf(route.name), 1);}
                };
            },
            navigate: (name: string, params?: Record<string, unknown>) => {s.navigations.push({name, params});},
            get current() {return s.current;},
        },
        ui: {
            DialogConfirm: (props: {onConfirm?: () => void; onCancel?: () => void}) => props,
            toast: (input: {title: string; message: string; variant: string}) => {s.toasts.push(input);},
            dialog: {
                replace: (render: () => unknown, close?: () => void) => {
                    s.dialogEntries.push({render, close});
                    return () => {s.dialogEntries.splice(s.dialogEntries.length - 1, 1);};
                },
                clear: () => {s.dialogEntries.splice(0, s.dialogEntries.length);},
            },
        },
        client: {
            v2: {
                location: {
                    get: () => (options?.location ? options.location() : Promise.resolve({data: {project: {id: "project-mock"}}})),
                },
            },
            session: {
                command: (params: {sessionID: string; command: string; arguments?: string}) => {
                    s.goalCommands.push(params);
                    return Promise.resolve({error: s.goalCommandError()});
                },
            },
        },
        event: {
            on: (name: string, handler: (event: unknown) => void) => {
                const handlers = s.events.get(name) ?? [];
                handlers.push(handler);
                s.events.set(name, handlers);
                return () => {handlers.splice(handlers.indexOf(handler), 1);};
            },
        },
        lifecycle: {
            signal: new AbortController().signal,
            onDispose: (fn: () => void) => {s.disposers.push(fn); return () => {};},
        },
        theme: {
            current: {
                accent: "accent", background: "background", backgroundPanel: "backgroundPanel",
                borderSubtle: "borderSubtle", error: "error", success: "success", text: "text",
                textMuted: "textMuted", warning: "warning",
            },
        },
        slots: {
            register: (plugin: {order?: number; dispose?: () => void; slots: Record<string, unknown>}) => {
                s.slotRegistrations.push(plugin);
                return "slot";
            },
        },
        command: {
            register: (fn: () => {title: string; value: string; onSelect: () => void}[]) => {
                s.legacyCommands.push(...fn());
                return () => {s.legacyCommands.splice(0, s.legacyCommands.length);};
            },
        },
        state: {
            ready: true,
            config: {get model() {return s.defaultModel;}},
            provider: s.providers,
            path: {state: s.worktree, config: s.worktree, worktree: s.worktree, directory: s.worktree},
            get vcs() {return s.vcs;},
            session: {
                count: () => s.sessions.size,
                get: (id: string) => s.sessions.get(id),
                diff: (id: string) => s.sessions.get(id)?.diff ?? [],
                todo: (id: string) => s.sessions.get(id)?.todos ?? [],
                messages: () => [],
                status: (id: string) => {
                    const status = s.sessions.get(id)?.status;

                    return status ? {type: status} : undefined;
                },
                permission: (id: string) => s.sessions.get(id)?.permissions ?? [],
                question: (id: string) => s.sessions.get(id)?.questions ?? [],
            },
            part: () => [],
            lsp: () => s.lspRows,
            mcp: () => s.mcpRows,
        },
    } as unknown as TuiApi;

    return {
        api,
        fire: (name: string, event?: unknown) => {
            for (const handler of s.events.get(name) ?? []) {handler(event);}
        },
        notifications: s.notifications, toasts: s.toasts, goalCommands: s.goalCommands,
        setGoalCommandError: (fn: () => unknown) => {s.goalCommandError = fn;},
        navigations: s.navigations, keymapLayers: s.keymapLayers, legacyCommands: s.legacyCommands,
        registeredRoutes: s.registeredRoutes, slotRegistrations: s.slotRegistrations,
        dialogEntries: s.dialogEntries, disposers: s.disposers, sessions: s.sessions,
        mcpRows: s.mcpRows, lspRows: s.lspRows, providers: s.providers,
        setRoute: (route: {name: string; params?: Record<string, unknown>}) => {s.current = route;},
        setBranch: (branch?: string) => {s.vcs = branch === undefined ? undefined : {branch};},
        setDefaultModel: (model?: string) => {s.defaultModel = model;},
    };
};
