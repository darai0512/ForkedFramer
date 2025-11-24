import { type FileSystem } from '../lib/filesystem/fileSystem';
import { IndexedDBFileSystem } from '../lib/filesystem/indexeddbFileSystem';
import { makeSpecialFolders } from './specialFolders';
import { BrowserMediaConverter } from '../lib/filesystem/mediaConverter';
import { fatalStorageError } from '../utils/accountStore';

export async function buildFileSystem(): Promise<FileSystem> {
  if (navigator.storage?.persisted && navigator.storage?.persist) {
    const already = await navigator.storage.persisted();
    if (already) {
      console.log("すでにストレージは保護されています");
    } else {
      const granted = await navigator.storage.persist();
      console.log(granted
        ? "navigator.storage.persist() によりストレージ保護に成功しました"
        : "persist() 試行 → 保護は許可されませんでした"
      );
    }
  } else {
    console.log("この環境では navigator.storage が使用できません");
  }
  
  try {
    const fs = new IndexedDBFileSystem(new BrowserMediaConverter());
    await fs.open();
    // throw new Error("Not implemented");

    await makeSpecialFolders(fs);
    // const tree = await folderTree(fs);
    // console.log(tree);
    console.log(fs);

    return fs;
  } catch (e) {
    console.error("IndexedDBFileSystem の初期化に失敗しました。", e);
    fatalStorageError.set("indexeddb-unavailable");
  }
  throw new Error("ファイルシステムの初期化に失敗しました");
}
