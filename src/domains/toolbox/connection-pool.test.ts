import { describe, expect, test } from "bun:test";
import { ProcessPool } from "./connection-pool";

describe("ProcessPool", () => {
  test("acquires slots immediately up to pool size", async () => {
    const pool = new ProcessPool(2);
    await pool.acquire(1000);
    await pool.acquire(1000);
    expect(pool.isClosed()).toBe(false);
  });

  test("queues waiters when pool is exhausted and resolves on release", async () => {
    const pool = new ProcessPool(1);
    await pool.acquire(1000);

    let acquiredSecond = false;
    const secondAcquire = pool.acquire(1000).then(() => {
      acquiredSecond = true;
    });

    expect(acquiredSecond).toBe(false);
    pool.release();
    await secondAcquire;
    expect(acquiredSecond).toBe(true);
  });

  test("times out waiters when no slot is released in time", async () => {
    const pool = new ProcessPool(1);
    await pool.acquire(1000);

    let error: Error | null = null;
    try {
      await pool.acquire(50);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toContain("no slot available within");
  });

  test("close rejects new and waiting requests", async () => {
    const pool = new ProcessPool(1);
    await pool.acquire(1000);

    const pendingErrors: Error[] = [];
    const pending = pool.acquire(1000).catch((err: unknown) => {
      pendingErrors.push(err as Error);
    });

    pool.close();
    await pending;
    expect(pendingErrors[0]?.message).toBe("shutdown");

    let postCloseError: Error | null = null;
    try {
      await pool.acquire(1000);
    } catch (err) {
      postCloseError = err as Error;
    }
    expect(postCloseError?.message).toBe("shutdown");
  });
});
