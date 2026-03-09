import { describe, expect, it, vi } from 'vitest';
import { createCoalescingWork } from './coalescingWork';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = () => innerResolve();
  });
  return { promise, resolve };
}

describe('createCoalescingWork', () => {
  it('whenIdle waits for the running job to finish', async () => {
    const deferred = createDeferred();
    const job = vi.fn(async () => {
      await deferred.promise;
    });

    const work = createCoalescingWork(job);
    work.request();

    expect(job).toHaveBeenCalledTimes(1);

    const idlePromise = work.whenIdle();
    let settled = false;
    void idlePromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    deferred.resolve();
    await idlePromise;

    expect(settled).toBe(true);
  });

  it('whenIdle waits for coalesced reruns as well', async () => {
    const first = createDeferred();
    const second = createDeferred();
    let callCount = 0;

    const job = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        await first.promise;
        return;
      }
      await second.promise;
    });

    const work = createCoalescingWork(job);
    work.request();
    work.request();

    const idlePromise = work.whenIdle();

    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(job).toHaveBeenCalledTimes(2);

    let settled = false;
    void idlePromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    second.resolve();
    await idlePromise;

    expect(settled).toBe(true);
    expect(job).toHaveBeenCalledTimes(2);
  });
});
