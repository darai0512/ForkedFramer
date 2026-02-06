// 呼び出し例
// 
// async function* myTask() {
//   for (let i = 0; i < 5; i++) {
//     console.log('heartbeat', i);
//     yield;
//   }
//   return "完了！"; // ← これは string 型になる
// }
// 
// async function main() {
//   const result = await runResilientTask(myTask, { interval: 1000 });
//   // result は string 型になる！！
//   console.log('タスク終了:', result);
// }
// 
// main().catch(console.error);

export async function runResilientTask<R>(
  taskFn: () => AsyncGenerator<unknown, R, unknown>,
  errorFilter: (error: unknown) => boolean,
  options: { interval?: number } = {}
): Promise<R> {
  console.log('runResilientTask');
  const interval = options.interval ?? 1000;

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  // タブが非表示になったことを追跡し、復帰時に即座にポーリングするため
  let wasHidden = false;
  const trackVisibility = () => {
    if (document.hidden) {
      wasHidden = true;
    }
  };
  document.addEventListener('visibilitychange', trackVisibility);

  const waitVisibleOrTimeout = (ms: number): Promise<void> =>
    new Promise<void>(resolve => {
      // API呼出中にタブが非表示→表示に戻った場合、即座にresolve
      if (wasHidden && !document.hidden) {
        wasHidden = false;
        console.log(`[DIAG resilientTask] wait(${ms}ms) → wasHiddenスキップ`);
        resolve();
        return;
      }
      console.log(`[DIAG resilientTask] wait(${ms}ms) 開始, hidden=${document.hidden}`);

      let timerId: number | null = null;
      let finished = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (timerId !== null) clearTimeout(timerId);
        document.removeEventListener('visibilitychange', onVisibility);
        resolve();
      };

      const onVisibility = () => {
        if (!document.hidden) {
          wasHidden = false;
          console.log(`[DIAG resilientTask] wait(${ms}ms) → タブ復帰で即resolve`);
          // 休止中 → 可視化されたら即再開
          cleanup();
        } else if (timerId !== null) {
          // 可視 → 非可視に変わったらタイマーを止める
          clearTimeout(timerId);
          timerId = null;
          console.log(`[DIAG resilientTask] wait(${ms}ms) → タブ非表示でタイマー停止`);
        }
      };

      document.addEventListener('visibilitychange', onVisibility);

      // 最初が可視ならタイマーを掛ける。非可視なら onVisibility が処理する
      if (!document.hidden) {
        timerId = window.setTimeout(() => {
          console.log(`[DIAG resilientTask] wait(${ms}ms) → タイマー満了`);
          cleanup();
        }, ms);
      }
    });

  try {
  while (true) {
    const gen = taskFn(); // AsyncGenerator を開始
    try {
      while (true) {
        const { value, done } = await gen.next();

        if (done) {
          // 正常終了。返り値を返す
          return value;
        }

        // 生存確認できたので、ポーリング間隔待機
        console.log('runResilientTask: polling');
        await waitVisibleOrTimeout(interval);
      }
    } catch (err) {
      if (errorFilter(err)) {
        console.warn('Task error, restarting...', JSON.stringify(err));
        await sleep(interval); // 少し待ってリトライ
        continue;
      }
    } finally {
      if (gen?.return) {
        await gen.return(undefined as any);
      }
    }
  }
  } finally {
    document.removeEventListener('visibilitychange', trackVisibility);
  }
}
