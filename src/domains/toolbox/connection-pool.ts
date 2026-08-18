const MS_PER_SECOND = 1000;

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function maybeUnref(timer: ReturnType<typeof setTimeout>): void {
  (timer as unknown as { unref?: () => void }).unref?.();
}

export class ProcessPool {
  private available: number;
  private closed = false;
  private waiters: Waiter[] = [];

  constructor(size: number) {
    this.available = size;
  }

  isClosed(): boolean {
    return this.closed;
  }

  acquire(timeout: number): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("shutdown"));
    }
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          reject(new Error(`process pool: no slot available within ${String(Math.round(timeout / MS_PER_SECOND))}s`));
        }, timeout),
      };
      maybeUnref(waiter.timer);
      this.waiters.push(waiter);
    });
  }

  release(): void {
    const waiter = this.waiters.shift();

    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    } else {
      this.available += 1;
    }
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("shutdown"));
    }
  }
}
