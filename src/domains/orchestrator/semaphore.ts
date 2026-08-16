export type AbortSemaphore = {acquire(signal?: AbortSignal): Promise<() => void>; dispose(): void};
import {createSemaphore} from "./semaphore-factory";

export function createAbortSemaphore(limit: number): AbortSemaphore {
  return createSemaphore(limit);
}
