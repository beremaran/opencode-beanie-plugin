import type {TuiApi} from "./types";

const MAX_CACHE_ENTRIES = 256;

const HEALTHY = "connected";
type HealthKind = "MCP" | "LSP";
type HealthRow = Readonly<{id: string; status: string}>;

type BoundedSet = Readonly<{
    add: (value: string) => boolean
    delete: (value: string) => void
    clear: () => void
}>;

const createBoundedSet = (limit: number): BoundedSet => {
    const entries: string[] = [];

    return {
        add: (value) => {
            if (entries.includes(value)) {return false;}
            entries.push(value);
            if (entries.length > limit) {entries.shift();}
            return true;
        },
        delete: (value) => {
            const index = entries.indexOf(value);

            if (index >= 0) {entries.splice(index, 1);}
        },
        clear: () => { entries.splice(0, entries.length); },
    };
};

const notify = (api: TuiApi, title: string, message: string, sound?: "error" | "subagent_done") => {
    void api.attention.notify({title, message, sound: sound ? {name: sound} : undefined}).catch(() => undefined);
};

const currentSessionId = (api: TuiApi): string | undefined => {
    const route = api.route.current;

    if (!("params" in route) || !route.params) {return undefined;}

    const sessionID = route.params.sessionID;

    return typeof sessionID === "string" && sessionID.length > 0 ? sessionID : undefined;
};

const checkHealthRow = (api: TuiApi, kind: HealthKind, row: HealthRow, states: Map<string, string>, transitions: BoundedSet) => {
    const previous = states.get(row.id);
    states.set(row.id, row.status);
    if (row.status === HEALTHY) {
        if (previous !== undefined) {transitions.delete(`${kind}:${row.id}:${previous}`);}
        return;
    }
    if (previous === undefined || previous === row.status || previous !== HEALTHY) {return;}
    if (transitions.add(`${kind}:${row.id}:${row.status}`)) {
        notify(api, `${kind} unhealthy`, `${kind} server ${row.id} is ${row.status}.`);
    }
};

const createHealthTracker = (api: TuiApi, kind: HealthKind, rows: () => readonly HealthRow[]) => {
    const states = new Map<string, string>();

    const transitions = createBoundedSet(MAX_CACHE_ENTRIES);

    for (const row of rows()) {states.set(row.id, row.status);}
    return () => {
        const seen = new Set<string>();

        for (const row of rows()) {
            seen.add(row.id);
            checkHealthRow(api, kind, row, states, transitions);
        }
        for (const id of states.keys()) {
            if (!seen.has(id)) {states.delete(id);}
        }
    };
};

const errorMessage = (error: Readonly<{name: string; data?: Readonly<{message?: unknown}>}>): string =>
    typeof error.data?.message === "string" ? error.data.message : error.name;

const createSessionListeners = (api: TuiApi, errors: BoundedSet, childIdle: BoundedSet) => ({
    onError: (event: {properties: {sessionID?: string; error?: {name: string; data?: {message?: unknown}}}}) => {
        const sessionID = event.properties.sessionID;

        if (!sessionID) {return;}

        const message = event.properties.error ? errorMessage(event.properties.error) : "unknown";

        if (errors.add(`${sessionID}:${message}`)) {notify(api, "Session error", message, "error");}
    },
    onIdle: (event: {properties: {sessionID: string}}) => {
        const sessionID = event.properties.sessionID;

        const current = currentSessionId(api);

        if (!current || current === sessionID) {return;}

        const session = api.state.session.get(sessionID);

        if (!session?.parentID || session.parentID !== current) {return;}
        if (childIdle.add(sessionID)) {notify(api, "Subagent done", `${session.slug || sessionID} is idle.`, "subagent_done");}
    },
    onStatus: (event: {properties: {sessionID: string; status: {type: string}}}) => {
        if (event.properties.status.type !== "idle") {childIdle.delete(event.properties.sessionID);}
    },
});

export const registerAttentionPolicy = (api: TuiApi) => {
    const mcp = createHealthTracker(api, "MCP", () => api.state.mcp().map((row) => ({id: row.name, status: row.status})));

    const lsp = createHealthTracker(api, "LSP", () => api.state.lsp().map((row) => ({id: row.id, status: row.status})));

    const errors = createBoundedSet(MAX_CACHE_ENTRIES);

    const childIdle = createBoundedSet(MAX_CACHE_ENTRIES);

    const session = createSessionListeners(api, errors, childIdle);

    const events = [
        api.event.on("mcp.tools.changed", mcp),
        api.event.on("lsp.updated", lsp),
        api.event.on("session.error", session.onError),
        api.event.on("session.idle", session.onIdle),
        api.event.on("session.status", session.onStatus),
    ];
    api.lifecycle.onDispose(() => {
        for (const unsubscribe of events) {unsubscribe();}
        errors.clear();
        childIdle.clear();
    });
};
