type Waiter = {
    label: string
    resolve: (release: () => void) => void
    reject: (error: Error) => void
}

export type PermitChange = Readonly<{
    type: "queued" | "admitted" | "released" | "disposed"
    label?: string
}>;

export type PermitPool = {
    acquire: (label: string) => Promise<() => void>
    onChange: (listener: (change: PermitChange) => void) => void
    state: () => Readonly<{ active: number; queued: readonly string[] }>
    dispose: () => void
}

const CAPACITY = 2;

export const createPermitPool = (): PermitPool => {
    let available = CAPACITY;

    let disposed = false;

    const waiters: Waiter[] = [];

    const listeners = new Set<(change: PermitChange) => void>();

    const notify = (change: PermitChange) => {
        listeners.forEach((listener) => {
            listener(change);
        });
    };

    const release = () => {
        if (waiters.length > 0) {
            const waiter = waiters.shift();

            waiter?.resolve(createRelease());
            notify({type: "admitted", label: waiter?.label});
            return;
        }
        available = Math.min(CAPACITY, available + 1);
        notify({type: "released"});
    };

    const createRelease = () => {
        let released = false;

        return () => {
            if (released) {
                return;
            }
            released = true;
            release();
        };
    };

    return {
        acquire: (label: string) => {
            if (disposed) {
                return Promise.reject(new Error("Throttle domain is disposed."));
            }
            if (available > 0) {
                available -= 1;
                notify({type: "admitted", label});
                return Promise.resolve(createRelease());
            }

            const promise = new Promise<() => void>((resolve, reject) => {
                waiters.push({label, resolve, reject});
            });

            notify({type: "queued", label});
            return promise;
        },
        onChange: (listener) => listeners.add(listener),
        state: () => ({
            active: CAPACITY - available,
            queued: waiters.map(({label}) => label),
        }),
        dispose: () => {
            disposed = true;
            waiters.splice(0).forEach(({reject}) => {
                reject(new Error("Throttle domain is disposed."));
            });
            notify({type: "disposed"});
            listeners.clear();
        },
    };
};
