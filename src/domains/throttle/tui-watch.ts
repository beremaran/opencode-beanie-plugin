import {type FSWatcher, watch} from "node:fs";
import {basename, dirname} from "node:path";

type SnapshotChange = () => void;

export const watchThrottleSnapshot = (path: string, onChange: SnapshotChange) => {
    let watcher: FSWatcher | undefined;

    let retry: ReturnType<typeof setTimeout> | undefined;

    let disposed = false;

    const scheduleRetry = () => {
        if (!disposed && !retry) {
            retry = setTimeout(() => {
                retry = undefined;
                arm();
            }, 1000);
        }
    };

    const arm = () => {
        if (disposed || watcher) {
            return;
        }

        try {
            watcher = watch(dirname(path), {persistent: false}, (event, name) => {
                if (event === "rename" || !name || name === basename(path)) {
                    onChange();
                }
            });
            watcher.on("error", () => {
                watcher?.close();
                watcher = undefined;
                scheduleRetry();
            });
        } catch {
            scheduleRetry();
        }
    };

    arm();

    return () => {
        disposed = true;
        watcher?.close();
        watcher = undefined;
        if (retry) {
            clearTimeout(retry);
        }
    };
};
