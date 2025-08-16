import type { Node, EmbodiedEntry, BindId, Folder } from '../lib/filesystem/fileSystem';
import { waitDialog } from '../utils/waitDialog';
import { get } from 'svelte/store';
import { gadgetFileSystem, saveMaterialToFolder as saveToFolder, deleteMaterialFromFolder as deleteFromFolder } from '../filemanager/fileManagerStore';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { buildMedia } from '../lib/layeredCanvas/dataModels/media';

export interface MaterialCollectionState {
  materialCollectionFolders: EmbodiedEntry[];
  openStates: { [key: string]: boolean };
  collectionFolderNode: Node | null;
}

export async function loadMaterialCollections(state: MaterialCollectionState): Promise<void> {
  const fs = get(gadgetFileSystem);
  if (fs == null) return;
  
  const root = await fs.getRoot();
  const collectionFolders = await root.getNodesByName('素材集');
  
  if (collectionFolders.length > 0) {
    state.collectionFolderNode = collectionFolders[0];
    const collectionFolder = state.collectionFolderNode.asFolder()!;
    const subfolders = await collectionFolder.listEmbodied();
    state.materialCollectionFolders = subfolders.filter(entry => entry[2].getType() === 'folder');
    
    // 初回読み込み時に開いた状態を設定
    state.materialCollectionFolders.forEach((folder, index) => {
      if (state.openStates[folder[1]] === undefined) {
        state.openStates[folder[1]] = index === 0; // 最初のフォルダだけ開く
      }
    });
  }
}

export async function addMaterialCollection(state: MaterialCollectionState): Promise<void> {
  const fs = get(gadgetFileSystem);
  if (state.collectionFolderNode == null || fs == null) return;
  
  const collectionFolder = state.collectionFolderNode.asFolder()!;
  const newFolder = await fs.createFolder();
  const name = `新しいコレクション${state.materialCollectionFolders.length + 1}`;
  await collectionFolder.link(name, newFolder.id);
  await loadMaterialCollections(state);
}

export async function deleteMaterialCollection(
  state: MaterialCollectionState, 
  bindId: string
): Promise<void> {
  const fs = get(gadgetFileSystem);
  if (state.collectionFolderNode == null || fs == null) return;
  
  const collectionFolder = state.collectionFolderNode.asFolder()!;
  const entry = await collectionFolder.getEntry(bindId as any);
  
  if (entry) {
    // 削除確認ダイアログを表示
    const confirmed = await waitDialog<boolean>('confirm', {
      title: 'コレクションの削除',
      message: `「${entry[1]}」を削除しますか？\n\nこのコレクション内のすべてのファイルが削除されます。\nこの操作は元に戻すことができません。`,
      positiveButtonText: '削除',
      negativeButtonText: 'キャンセル'
    });
    
    if (confirmed) {
      await collectionFolder.unlink(bindId as any);
      await fs.destroyNode(entry[2]);
      delete state.openStates[entry[1]];
      await loadMaterialCollections(state);
    }
  }
}

export async function renameMaterialCollection(
  state: MaterialCollectionState,
  bindId: string,
  newName: string
): Promise<void> {
  if (state.collectionFolderNode == null || !newName.trim()) return;
  
  const collectionFolder = state.collectionFolderNode.asFolder()!;
  await collectionFolder.rename(bindId as any, newName.trim());
  await loadMaterialCollections(state);
}

// MaterialGallery operations
export interface MaterialGalleryItem {
  loadMedia: () => Promise<Media[]>;
  bindId: BindId;
}

export async function saveMaterialToFolder(
  folder: Folder,
  media: Media,
  fileName: string
): Promise<BindId> {
  return await saveToFolder(folder, media, fileName);
}

export async function deleteMaterialFromFolder(
  folder: Folder,
  bindId: BindId
): Promise<void> {
  await deleteFromFolder(folder, bindId);
}

export async function loadMaterialsFromFolder(
  folder: Folder
): Promise<MaterialGalleryItem[]> {
  const materials = await folder.listEmbodied();
  const items: MaterialGalleryItem[] = [];
  
  for (const [bindId, _, node] of materials) {
    const file = node.asFile();
    if (!file) continue;
    
    const loadMedia = async (): Promise<Media[]> => {
      const mediaResource = await file.readMediaResource();
      const media = buildMedia(mediaResource);
      return [media];
    };
    
    items.push({ loadMedia, bindId });
  }
  
  return items;
}