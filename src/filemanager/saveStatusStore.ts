import { writable } from 'svelte/store';

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export interface SaveStatusState {
  status: SaveStatus;
  message?: string;
}

function createSaveStatusStore() {
  const { subscribe, set: originalSet, update } = writable<SaveStatusState>({ status: 'idle' });

  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const set = (statusOrState: SaveStatus | SaveStatusState, message?: string) => {
    // 前のタイマーをクリア
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }

    // 文字列の場合はSaveStatusとして扱う
    const state: SaveStatusState = typeof statusOrState === 'string' 
      ? { status: statusOrState, message }
      : statusOrState;

    originalSet(state);

    // 成功の場合のみ、500ms後にidleに戻す
    if (state.status === 'success') {
      resetTimer = setTimeout(() => {
        originalSet({ status: 'idle' });
      }, 500);
    }
  };

  return {
    subscribe,
    set,
    update
  };
}

export const saveStatusStore = createSaveStatusStore();