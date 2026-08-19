import type {MockSession, MockTuiApi} from "./test-helpers";

export type LocationResult = {data?: {project?: {id?: string}}};

export type MockState = {
    worktree: string;
    current: {name: string; params?: Record<string, unknown>};
    vcs: {branch?: string} | undefined;
    defaultModel: string | undefined;
    goalCommandError: () => unknown;
    sessions: Map<string, MockSession>;
    mcpRows: {name: string; status: string; error?: string}[];
    lspRows: {id: string; root?: string; status: string}[];
    providers: unknown[];
    events: Map<string, ((event: unknown) => void)[]>;
    notifications: {title: string; message: string; sound?: {name: string}}[];
    toasts: {title: string; message: string; variant: string}[];
    goalCommands: {sessionID: string; command: string; arguments?: string}[];
    navigations: {name: string; params?: Record<string, unknown>}[];
    keymapLayers: MockTuiApi["keymapLayers"];
    legacyCommands: MockTuiApi["legacyCommands"];
    registeredRoutes: string[];
    slotRegistrations: MockTuiApi["slotRegistrations"];
    dialogEntries: MockTuiApi["dialogEntries"];
    disposers: (() => void)[];
};

const createCollections = () => ({
    sessions: new Map(), mcpRows: [], lspRows: [], providers: [], events: new Map(),
    notifications: [], toasts: [], goalCommands: [], navigations: [], keymapLayers: [],
    legacyCommands: [], registeredRoutes: [], slotRegistrations: [], dialogEntries: [], disposers: [],
});

export const createInitialMockState = (worktree = "/tmp/beanie-tui-mock"): MockState => ({
    worktree, current: {name: "session"}, vcs: undefined, defaultModel: undefined, goalCommandError: () => undefined,
    ...createCollections(),
});

export const buildRouteApi = (s: MockState) => ({
    register: (routes: {name: string}[]) => {
        routes.forEach((route) => s.registeredRoutes.push(route.name));
        return () => {
            for (const route of routes) {s.registeredRoutes.splice(s.registeredRoutes.indexOf(route.name), 1);}
        };
    },
    navigate: (name: string, params?: Record<string, unknown>) => {s.navigations.push({name, params});},
    get current() {return s.current;},
});

export const buildUiApi = (s: MockState) => ({
    DialogConfirm: (props: {onConfirm?: () => void; onCancel?: () => void}) => props,
    toast: (input: {title: string; message: string; variant: string}) => {s.toasts.push(input);},
    dialog: {
        replace: (render: () => unknown, close?: () => void) => {
            s.dialogEntries.push({render, close});
            return () => {s.dialogEntries.splice(s.dialogEntries.length - 1, 1);};
        },
        clear: () => {s.dialogEntries.splice(0, s.dialogEntries.length);},
    },
});

export const buildStateSessionApi = (s: MockState) => ({
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
});

export const buildAttentionAndKeymap = (s: MockState) => ({
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
});

export const buildLifecycleAndEvents = (s: MockState) => ({
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
});

const mockThemeCurrent = {
    accent: "accent", background: "background", backgroundPanel: "backgroundPanel",
    borderSubtle: "borderSubtle", error: "error", success: "success", text: "text",
    textMuted: "textMuted", warning: "warning",
};

export const buildSlotsAndCommands = (s: MockState) => ({
    theme: {current: mockThemeCurrent},
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
});
