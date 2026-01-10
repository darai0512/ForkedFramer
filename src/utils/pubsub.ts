import { writable, type Writable } from 'svelte/store';

/**
 * PubSubQueue<T> - Pub-Subキュー実装
 *
 * 特徴:
 * - 同期・非同期をサポート
 * - subscriberはasync関数
 * - Svelteのwritableストアを使用してキューの状態を追跡
 * - publishとpublishUniqueは非同期関数だが、awaitしなくても安全に動作する
 * - maxConcurrencyで同時処理数を制御可能（デフォルト: 1）
 */
export type Subscriber<T> = (message: T) => Promise<void>;

export type PubSubQueueOptions = {
  maxConcurrency?: number;
};

export class PubSubQueue<T> {
  private subscribers: Set<Subscriber<T>> = new Set();
  private queue: T[] = [];
  private processingPromise: Promise<void> | null = null;
  private store: Writable<{ queueSize: number; subscriberCount: number }>;
  private maxConcurrency: number;
  private activeCount: number = 0;
  private resolveWhenIdle: (() => void) | null = null;

  constructor(options: PubSubQueueOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 1;
    this.store = writable({ queueSize: 0, subscriberCount: 0 });
  }

  async publish(message: T): Promise<void> {
    this.queue.push(message);
    this.updateStore();
    await this.ensureProcessing();
  }

  async publishUnique(message: T, isEqual: (a: T, b: T) => boolean): Promise<boolean> {
    const isAlreadyQueued = this.queue.some(queuedMessage => isEqual(queuedMessage, message));
    
    if (isAlreadyQueued) {
      return false;
    }

    await this.publish(message);
    return true;
  }

  subscribe(subscriber: Subscriber<T>): () => void {
    this.subscribers.add(subscriber);
    this.updateStore();
    return () => {
      this.subscribers.delete(subscriber);
      this.updateStore();
    };
  }

  private ensureProcessing(): Promise<void> {
    if (!this.processingPromise) {
      this.processingPromise = this.processQueue();
    }
    return this.processingPromise;
  }

  private async processQueue(): Promise<void> {
    // maxConcurrencyまでタスクを開始
    this.startTasks();

    // アクティブなタスクがある、またはキューに残りがある場合は待機
    if (this.activeCount > 0 || this.queue.length > 0) {
      await new Promise<void>(resolve => {
        this.resolveWhenIdle = resolve;
      });
    }

    this.processingPromise = null;
  }

  private startTasks(): void {
    while (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const message = this.queue.shift()!;
      this.activeCount++;
      this.updateStore();
      this.processTask(message);
    }
  }

  private async processTask(message: T): Promise<void> {
    try {
      await this.notifySubscribers(message);
    } finally {
      this.activeCount--;
      this.updateStore();

      // 次のタスクを開始
      this.startTasks();

      // すべて完了したらresolve
      if (this.activeCount === 0 && this.queue.length === 0 && this.resolveWhenIdle) {
        this.resolveWhenIdle();
        this.resolveWhenIdle = null;
      }
    }
  }

  private async notifySubscribers(message: T): Promise<void> {
    const promises = Array.from(this.subscribers).map(subscriber =>
      subscriber(message).catch(error => console.error('Subscriber error:', error))
    );
    await Promise.all(promises);
  }

  private updateStore(): void {
    this.store.set({
      queueSize: this.queue.length,
      subscriberCount: this.subscribers.size
    });
  }

  getStore(): Writable<{ queueSize: number; subscriberCount: number }> {
    return this.store;
  }
}

export const createPubSubQueue = <T>() => new PubSubQueue<T>();