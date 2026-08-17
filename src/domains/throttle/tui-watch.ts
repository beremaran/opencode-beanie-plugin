import {type FSWatcher, watch} from "node:fs";
import {basename, dirname} from "node:path";

type SnapshotChange = () => void;

const retryArm = (path: string, onChange: SnapshotChange, arm: () => void) =>
    setTimeout(() => { arm(); }, 1000);

const handleWatchError = (
    watcher: FSWatcher | undefined,
    setWatcher: (w: FSWatcher | undefined) => void,
    scheduleRetry: () => void,
) => {
    watcher?.close(); setWatcher(undefined); scheduleRetry();
};

const armWatcher = (
    disposed: boolean,
    path: string,
    onChange: SnapshotChange,
    setWatcher: (w: FSWatcher | undefined) => void,
    scheduleRetry: () => void,
) => {
    if (disposed) {return;}
    try {
        const newWatcher = watch(dirname(path), {persistent: false}, (event, name) => {
            if (event === "rename" || !name || name === basename(path)) {onChange();}
        });
        setWatcher(newWatcher);
        newWatcher.on("error", () => { handleWatchError(newWatcher, setWatcher, scheduleRetry); });
    } catch { scheduleRetry(); }
};

const setupCleanup = (disposedRef: {value: boolean}, getWatcher: () => FSWatcher | undefined, getRetry: () => ReturnType<typeof setTimeout> | undefined) =>
    () => {
        disposedRef.value = true;
        getWatcher()?.close();
        const retry = getRetry();

        if (retry) {clearTimeout(retry);}
    };

export const watchThrottleSnapshot = (path: string, onChange: SnapshotChange) => {
    let watcher: FSWatcher | undefined;

    let retry: ReturnType<typeof setTimeout> | undefined;

    const disposedRef = {value: false};

    const scheduleRetry = () => {
        if (disposedRef.value || retry) {return;}
        retry = retryArm(path, onChange, () => { armWatcher(disposedRef.value, path, onChange, (w) => watcher = w, scheduleRetry); });
    };

    const arm = () => { armWatcher(disposedRef.value, path, onChange, (w) => watcher = w, scheduleRetry); };

    arm();
    return setupCleanup(disposedRef, () => watcher, () => retry);
};
