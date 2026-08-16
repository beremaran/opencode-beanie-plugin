import {expect, test} from "bun:test";
import {createAbortSemaphore} from "./index";

test("queued acquisition rejects on abort and later waiters still admit", async () => {
  const semaphore = createAbortSemaphore(1);
  const release = await semaphore.acquire();
  const controller = new AbortController();
  const queued = semaphore.acquire(controller.signal);
  controller.abort();
  const rejected = queued.then(() => false, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  expect(await rejected).toBe(true);
  release();
  const next = await semaphore.acquire();
  next();
  semaphore.dispose();
});
