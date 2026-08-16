import {type FSWatcher, watch} from "node:fs";
import {basename, dirname} from "node:path";

type SnapshotChange = () => void;

type WatchState = {
    watcher?: FSWatcher
    retry?: ReturnType<typeof setTimeout>
    disposed: boolean
};

const closeWatcher = (state: WatchState) => {
    state.watcher?.close();
    state.watcher = undefined;
};

const scheduleRetry = (state: WatchState, arm: () => void) => {
    if (!state.disposed && !state.retry) {
        state.retry = setTimeout(() => {
            state.retry = undefined;
            arm();
        }, 1000);
    }
};

const createWatcher = (path: string, onChange: SnapshotChange, state: WatchState) => watch(
    dirname(path), {persistent: false}, (event, name) => {
        if (!state.disposed && (event === "rename" || !name || name === basename(path))) {onChange();}
    }
);

const armWatcher = (path: string, onChange: SnapshotChange, state: WatchState, arm: () => void) => {
    if (state.disposed || state.watcher) {return;}

    try {
        state.watcher = createWatcher(path, onChange, state);
        state.watcher.on("error", () => {
            closeWatcher(state);
            scheduleRetry(state, arm);
        });
    } catch {
        scheduleRetry(state, arm);
    }
};

export const watchGoalsSnapshot = (path: string, onChange: SnapshotChange) => {
    const state: WatchState = {disposed: false};

    const arm = () => {armWatcher(path, onChange, state, arm);};

    arm();
    return () => {
        state.disposed = true;
        closeWatcher(state);
        if (state.retry) {clearTimeout(state.retry); state.retry = undefined;}
    };
};
