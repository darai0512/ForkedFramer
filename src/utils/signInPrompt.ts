import { get } from 'svelte/store';
import { onlineStatus } from './accountStore';
import { waitDialog } from './waitDialog';

/**
 * サインイン済みかチェックし、未サインインならサインイン促進ダイアログを表示する。
 * @returns true: サインイン済み、false: 未サインイン（ダイアログ表示済み）
 */
export async function requireSignIn(message?: string): Promise<boolean> {
  if (get(onlineStatus) === 'signed-in') {
    return true;
  }
  await waitDialog<boolean>('signInPrompt', { message });
  return false;
}
