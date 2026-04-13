// 現在のファイルIDをSessionStorageに記録する関数
import type { NodeId } from '../lib/filesystem/fileSystem';

export type CurrentFileInfo = {
  id: NodeId;
  fileSystem: 'cloud' | 'local' | 'fsa';
  title: string;
}

export async function recordCurrentFileInfo(info: CurrentFileInfo): Promise<void> {
  sessionStorage.setItem('currentFileId', JSON.stringify(info));
  
  const currentUrl = new URL(window.location.href);
  const currentBookId = currentUrl.searchParams.get('book');
  
  if (currentBookId !== info.id) {
    currentUrl.searchParams.set('book', info.id);
    // If there is already a book in the URL, this is a navigation between books, so we pushState.
    // If it's the first time landing on the page without a book parameter, we replaceState to avoid extra history.
    if (currentBookId != null) {
      window.history.pushState(info, '', currentUrl.toString());
    } else {
      window.history.replaceState(info, '', currentUrl.toString());
    }
  } else {
    // Only update the state if title or something changed, without creating a new history entry
    window.history.replaceState(info, '', currentUrl.toString());
  }
}
export async function fetchCurrentFileInfo(): Promise<CurrentFileInfo | null> {
  if (window.history.state && window.history.state.id) {
    return window.history.state as CurrentFileInfo;
  }

  const currentUrl = new URL(window.location.href);
  const bookId = currentUrl.searchParams.get('book');
  const infoStr = sessionStorage.getItem('currentFileId');

  if (bookId) {
    if (infoStr) {
      try {
        const parsed = JSON.parse(infoStr);
        if (parsed.id === bookId) {
          return parsed;
        }
      } catch {}
    }
    return { id: bookId as NodeId, fileSystem: 'local', title: '' };
  }

  if (infoStr) {
    try {
      const parsed = JSON.parse(infoStr);
      return parsed;  
    }
    catch {
      // 互換性
      return {id: infoStr as NodeId, fileSystem: 'local', title: ''};
    }
  }
  return null;
}

export async function clearCurrentFileInfo(): Promise<void> {
  sessionStorage.removeItem('currentFileId');
}
