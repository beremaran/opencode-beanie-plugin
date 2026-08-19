import {createSignal} from "solid-js";
import {goalsSnapshotPath} from "../domains/goals/path";
import {readGoalsState, type GoalsReadOutcome, type GoalsTuiState} from "../domains/goals/tui-state";
import {watchGoalsSnapshot} from "../domains/goals/tui-watch";
import {throttleSnapshotPath} from "../domains/throttle/path";
import {readThrottleStatus, type ThrottleStatus} from "../domains/throttle/tui-state";
import {watchThrottleSnapshot} from "../domains/throttle/tui-watch";
import {deriveHostSnapshot} from "./derive";
import {TUI_REFRESH_EVENT_NAMES} from "./events";
import type {TuiApi, TuiDashboardSnapshot, TuiIdentity} from "./types";

export type SnapshotStore = Readonly<{
    snapshot: (sessionID: string) => () => TuiDashboardSnapshot | undefined
    dispose: () => void
}>;

type Entry = {
    get: () => TuiDashboardSnapshot | undefined
    set: (snapshot: TuiDashboardSnapshot | undefined) => void
    goals: GoalsTuiState | undefined
    goalsWatch?: () => void
};

type StoreState = {
    disposed: boolean
    entries: Map<string, Entry>
    throttle: ThrottleStatus | undefined
    throttleWatch?: () => void
};

const createEntry = (): Entry => {
    const [get, set] = createSignal<TuiDashboardSnapshot | undefined>();

    return {get, set, goals: undefined};
};

const merge = (api: TuiApi, state: StoreState, entry: Entry, sessionID: string): TuiDashboardSnapshot => ({
    ...deriveHostSnapshot(api.state, sessionID),
    goals: entry.goals,
    throttle: state.throttle,
});

const refreshEntry = (api: TuiApi, state: StoreState, sessionID: string, entry: Entry) => {
    if (state.disposed) {return;}
    entry.set(merge(api, state, entry, sessionID));
};

const refreshAll = (api: TuiApi, state: StoreState) => {
    for (const [sessionID, entry] of state.entries) {
        refreshEntry(api, state, sessionID, entry);
    }
};

const applyGoalsOutcome = (api: TuiApi, state: StoreState, entry: Entry, sessionID: string,
    outcome: GoalsReadOutcome) => {
    if (state.disposed) {return;}
    entry.goals = outcome.kind === "valid" ? outcome.state : undefined;
    refreshEntry(api, state, sessionID, entry);
};

const attachGoals = (api: TuiApi, state: StoreState, identity: TuiIdentity, sessionID: string, entry: Entry) => {
    const path = goalsSnapshotPath(identity.worktree, identity.projectID, sessionID);

    const read = () =>
        void readGoalsState(path, {projectID: identity.projectID, sessionID}).then((outcome) =>
            { applyGoalsOutcome(api, state, entry, sessionID, outcome); },
        );
    entry.goalsWatch = watchGoalsSnapshot(path, read);
    read();
};

const attachThrottle = (api: TuiApi, state: StoreState, identity: TuiIdentity) => {
    const path = throttleSnapshotPath(identity.worktree, identity.projectID);

    const apply = (status: ThrottleStatus | undefined) => {
        if (state.disposed) {return;}
        state.throttle = status;
        refreshAll(api, state);
    };
    state.throttleWatch = watchThrottleSnapshot(path, () => void readThrottleStatus(path).then(apply));
    void readThrottleStatus(path).then(apply);
};

const stores = new WeakMap<TuiApi, SnapshotStore>();

const createDispose = (api: TuiApi, state: StoreState, unsubscribe: (() => void)[], storeRef: {store?: SnapshotStore}) => () => {
    if (!storeRef.store || stores.get(api) !== storeRef.store) {return;}
    state.disposed = true;
    unsubscribe.forEach((off) => { off(); });
    state.throttleWatch?.();
    state.entries.forEach((entry) => entry.goalsWatch?.());
    state.entries.clear();
    stores.delete(api);
};

const createSessionSnapshot = (api: TuiApi, state: StoreState, identity?: TuiIdentity) => (sessionID: string) => {
    const entry = state.entries.get(sessionID) ?? createEntry();

    state.entries.set(sessionID, entry);
    entry.set(merge(api, state, entry, sessionID));
    if (identity !== undefined) {attachGoals(api, state, identity, sessionID, entry);}
    return entry.get;
};

export const createSnapshotStore = (api: TuiApi, identity?: TuiIdentity): SnapshotStore => {
    const existing = stores.get(api);

    if (existing) {return existing;}

    const state: StoreState = {disposed: false, entries: new Map(), throttle: undefined};

    const unsubscribe = TUI_REFRESH_EVENT_NAMES.map((name) => api.event.on(name, () => { refreshAll(api, state); }));

    if (identity !== undefined) {attachThrottle(api, state, identity);}

    const storeRef: {store?: SnapshotStore} = {};

    const store: SnapshotStore = {
        snapshot: createSessionSnapshot(api, state, identity),
        dispose: createDispose(api, state, unsubscribe, storeRef),
    };
    storeRef.store = store;
    stores.set(api, store);
    return store;
};
