import type {AbortSemaphore} from "./semaphore";

type Waiter = {readonly signal?: AbortSignal; readonly resolve: (release: () => void) => void; readonly reject: (error: unknown) => void; readonly abort: () => void};
type State = {active: number; closed: boolean; readonly queue: Waiter[]};

const abortError = () => new DOMException("The operation was aborted", "AbortError");

const pump = (state: State, limit: number) => {
  while (state.active < limit && state.queue.length > 0) {
    const waiter = state.queue.shift();

    if (!waiter || waiter.signal?.aborted) { waiter?.signal?.removeEventListener("abort", waiter.abort); waiter?.reject(abortError()); continue; }
    waiter.signal?.removeEventListener("abort", waiter.abort);
    state.active++;
    let released = false;
    waiter.resolve(() => { if (!released) { released = true; state.active--; pump(state, limit); } });
  }
};

const acquire = (state: State, limit: number, signal?: AbortSignal) => new Promise<() => void>((resolve, reject) => {
  if (state.closed || signal?.aborted) { reject(abortError()); return; }

  const abort = () => { const index = state.queue.findIndex((item) => item.abort === abort);

 if (index >= 0) { state.queue.splice(index, 1); reject(abortError()); } };
  signal?.addEventListener("abort", abort, {once: true});
  state.queue.push({signal, resolve, reject, abort});
  pump(state, limit);
});

const dispose = (state: State) => { state.closed = true; while (state.queue.length) { const waiter = state.queue.shift(); waiter?.signal?.removeEventListener("abort", waiter.abort); waiter?.reject(abortError()); } };

export const createSemaphore = (limit: number): AbortSemaphore => {
  const state: State = {active: 0, closed: false, queue: []};

  return {acquire: (signal) => acquire(state, limit, signal), dispose: () => { dispose(state); }};
};
