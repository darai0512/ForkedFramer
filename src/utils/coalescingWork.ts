export function createCoalescingWork(
  job: () => Promise<unknown>,
  onError: (err: unknown) => void = console.error,
): () => void {
  let running = false;
  let pending = false;

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

  return request;
}
