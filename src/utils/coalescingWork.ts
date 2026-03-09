export type CoalescingWork = {
  request: () => void;
  whenIdle: () => Promise<void>;
};

export function createCoalescingWork(
  job: () => Promise<unknown>,
  onError: (err: unknown) => void = console.error,
): CoalescingWork {
  let running = false;
  let pending = false;
  let idleResolvers: Array<() => void> = [];

  function resolveIdle(): void {
    if (running || pending) {
      return;
    }
    for (const resolve of idleResolvers) {
      resolve();
    }
    idleResolvers = [];
  }

  async function runLoop(): Promise<void> {
    try {
      for (;;) {
        pending = false;
        try {
          console.log("coalescingWork: job start");
          await job();
          console.log("coalescingWork: job end");
        } catch (err) {
          try { onError(err); } catch {}
        }
        if (!pending) break; // 要求が積まれていなければ終了
      }
    } finally {
      running = false;
      // ループ終了後に新たな request() が入っていた場合の取りこぼし防止
      if (pending) {
        // 再スケジュール（request() が running を立て直す）
        request();
      } else {
        resolveIdle();
      }
    }
  }

  function request(): void {
    pending = true;
    if (!running) {
      running = true;
      void runLoop();
    } else {
      console.log("coalescingWork: job already running, coalesced");
    }
  }

  async function whenIdle(): Promise<void> {
    if (!running && !pending) {
      return;
    }
    await new Promise<void>((resolve) => {
      idleResolvers.push(resolve);
    });
  }

  return {
    request,
    whenIdle,
  };
}
