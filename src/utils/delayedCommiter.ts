const MAX_TIMEOUT = 0x7fffffff; // 2,147,483,647 (~24.8 days)
const nowMono = () =>
  (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();

export class DelayedCommiter {
  private when: number;
  private timerId: number | null;
  private readonly commit: () => void;

  constructor(commit: () => void) {
    this.when = 0;
    this.timerId = null;
    this.commit = commit;
  }

  schedule(ms: number) {
    const msClamped = Math.max(0, Math.min(ms, MAX_TIMEOUT));
    const now = nowMono();
    const newWhen = now + msClamped;

    // 「未来の方を選ぶ」のポリシーを維持
    if (this.when < newWhen) {
      if (this.timerId !== null) {
        clearTimeout(this.timerId);
      }
      this.when = newWhen;
      const delay = Math.min(newWhen - now, MAX_TIMEOUT);

      this.timerId = setTimeout(() => {
        // 先にクリアして再入可能にする（commit内でschedule可）
        this.timerId = null;
        this.when = 0;
        try {
          this.commit();
        } catch (e) {
          // 任意：非同期に再throw（コンソールで気づける）
          setTimeout(() => { throw e; }, 0);
        }
      }, delay) as unknown as number;
    }
  }

  cancel() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
      this.when = 0;
    }
  }

  force() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
      this.when = 0;
      this.commit(); // ここは先クリアなので再入OK
    }
  }

  // 任意の補助
  isScheduled(): boolean { return this.timerId !== null; }
  getRemaining(): number {
    if (this.timerId === null || this.when === 0) return 0;
    return Math.max(0, this.when - nowMono());
  }
}

export class DelayedCommiterGroup {
  private readonly commiters: Record<string, DelayedCommiter>;
  private currentTag: string | null = null;

  constructor(commiters: Record<string, () => void>) {
    this.commiters = {};
    for (const key of Object.keys(commiters)) {
      this.commiters[key] = new DelayedCommiter(commiters[key]);
    }
  }

  schedule(key: string, ms: number) {
    const c = this.commiters[key];
    if (!c) throw new Error(`Unknown key: ${key}`);
    if (this.currentTag !== key) {
      this.force(); // 旧タグの保留は即時コミット
    }
    c.schedule(ms);
    this.currentTag = key;
  }

  cancel() {
    for (const c of Object.values(this.commiters)) c.cancel();
    this.currentTag = null;
  }

  force() {
    for (const c of Object.values(this.commiters)) c.force();
    this.currentTag = null;
  }
}
