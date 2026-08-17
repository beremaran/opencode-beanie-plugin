type Waiter = {
    label: string
    resolve: (release: () => void) => void
    reject: (error: Error) => void
}

type PoolState = {
    available: number
    disposed: boolean
    waiters: Waiter[]
    listeners: Set<(change: PermitChange) => void>
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

const makeRelease = (onRelease: () => void) => {
    let released = false;

    return () => {
        if (released) {return;}
        released = true;
        onRelease();
    };
};

const notify = (state: PoolState, change: PermitChange) => {
    state.listeners.forEach((listener) => { listener(change); });
};

const admitOrCountUp = (state: PoolState) => {
    if (state.waiters.length > 0) {
        const waiter = state.waiters.shift();
        waiter?.resolve(makeRelease(() => { admitOrCountUp(state); }));
        notify(state, {type: "admitted", label: waiter?.label});
    } else {
        state.available = Math.min(CAPACITY, state.available + 1);
        notify(state, {type: "released"});
    }
};

const acquirePermit = (state: PoolState, label: string): Promise<() => void> => {
    if (state.disposed) {return Promise.reject(new Error("Throttle domain is disposed."));}
    if (state.available > 0) {
        state.available -= 1;
        notify(state, {type: "admitted", label});
        return Promise.resolve(makeRelease(() => { admitOrCountUp(state); }));
    }

    return new Promise<() => void>((resolve, reject) => {
        state.waiters.push({label, resolve, reject});
        notify(state, {type: "queued", label});
    });
};

const disposePool = (state: PoolState) => {
    state.disposed = true;
    state.waiters.splice(0).forEach(({reject}) => { reject(new Error("Throttle domain is disposed.")); });
    notify(state, {type: "disposed"});
    state.listeners.clear();
};

export const createPermitPool = (): PermitPool => {
    const state: PoolState = {
        available: CAPACITY,
        disposed: false,
        waiters: [],
        listeners: new Set<(change: PermitChange) => void>(),
    };

    return {
        acquire: (label: string) => acquirePermit(state, label),
        onChange: (listener) => { state.listeners.add(listener); },
        state: () => ({
            active: CAPACITY - state.available,
            queued: state.waiters.map(({label}) => label),
        }),
        dispose: () => { disposePool(state); },
    };
};
