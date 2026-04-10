import type { Node, EmbodiedEntry, BindId, Folder } from '../lib/filesystem/fileSystem';
import { waitDialog } from '../utils/waitDialog';
import { get } from 'svelte/store';
import { gadgetFileSystem, saveMaterialToFolder as saveToFolder, deleteMaterialFromFolder as deleteFromFolder } from '../filemanager/fileManagerStore';
import type { Media, MediaType } from '../lib/layeredCanvas/dataModels/media';
import { buildMedia, ImageMedia, VideoMedia, type RemoteMediaReference, createMissingMediaReference } from '../lib/layeredCanvas/dataModels/media';
import { copyCanvas } from '../lib/layeredCanvas/tools/imageUtil';
import { materialCollectionUpdateToken } from './materialBucketStore';
import { pollMediaStatus, getMaterialsUrl, recordMaterial, getActorsUrl, recordActor } from '../supabase';
import { toastStore } from '@skeletonlabs/skeleton';
import { blobToSha1 } from '../lib/layeredCanvas/tools/misc';
import { loading } from '../utils/loadingStore';
import { requireSignIn } from '../utils/signInPrompt';
import { BrowserMediaConverter } from '../lib/filesystem/mediaConverter';
import type { ImagingAction } from '$protocolTypes/imagingTypes';
import type { CharacterLocal } from '../lib/book/book';

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
  
  for (const [bindId, name, node] of materials) {
    const file = node.asFile();
    if (!file) continue;
    const guessedMediaType: MediaType = name?.toLowerCase().endsWith('.mp4') ? 'video' : 'image';
    
    const loadMedia = async (): Promise<Media[]> => {
      let mediaResource;
      try {
        mediaResource = await file.readMediaResource();
      } catch (e) {
        console.error("loadMaterialsFromFolder: media read failed, treated as missing", e);
        mediaResource = createMissingMediaReference(guessedMediaType, {
          reason: 'read-failed',
          missingId: file.id,
        });
      }
      const media = buildMedia(mediaResource);
      if (!media.isLoaded) {
        // Unmaterializedメディアの場合、ロード
        const rmr = media.persistentSource as RemoteMediaReference;
        // beforeRequestの場合はポーリングできない（requestIdがない）
        if (rmr.mode === 'beforeRequest') {
          console.log("================================================================ loadMedia: beforeRequest, skipping poll");
          return [media];
        }
        // afterRequestの場合のみポーリング
        if (rmr.mode === 'afterRequest') {
          // TODO: rmrの方が空間が狭い、この機会に同等にしておいたほうがよい
          const mr = {
            mediaType: rmr.mediaType,
            action: (rmr.mediaType === 'image' ? 'texttoimage' : 'imagetovideo') as ImagingAction,
            requestId: rmr.requestId as string,
            model: rmr.model as string
          }
          const { mediaResources } = await pollMediaStatus(mr);
          if (mediaResources.length > 0) {
            media.setMedia(mediaResources[0]);
          }
          console.log("================================================================ loadMedia done", media);
          await file.writeMediaResource(mediaResources[0]); // Ensure the media is written back if needed
        }
      }

      return [media];
    };
    
    items.push({ loadMedia, bindId });
  }
  
  return items;
}

export async function sendMediaToMaterialCollection(
  media: Media,
  fileName?: string
): Promise<{ success: boolean; message: string }> {
  const fs = get(gadgetFileSystem);
  if (!fs) {
    return { success: false, message: 'ファイルシステムが利用できません' };
  }

  try {
    // 素材集フォルダを取得
    const state: MaterialCollectionState = {
      materialCollectionFolders: [],
      openStates: {},
      collectionFolderNode: null
    };
    
    await loadMaterialCollections(state);
    
    if (state.materialCollectionFolders.length === 0) {
      return { success: false, message: '素材集フォルダが見つかりません' };
    }

    // 最初のコレクションフォルダに保存
    const firstCollection = state.materialCollectionFolders[0];
    const folder = firstCollection[2].asFolder()!;
    
    // ファイル名を生成
    if (!fileName) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fileName = `material-${timestamp}.png`;
    }
    
    // Mediaをコピーして保存（参照の問題を避けるため）
    let copiedMedia: Media;
    if (media instanceof ImageMedia) {
      const copiedCanvas = copyCanvas(media.drawSourceCanvas);
      copiedMedia = new ImageMedia(copiedCanvas);
    } else if (media instanceof VideoMedia) {
      // 動画の場合はそのまま使用（動画は通常コピーしない）
      copiedMedia = media;
    } else {
      copiedMedia = media;
    }
    
    await saveMaterialToFolder(folder, copiedMedia, fileName);
    
    // 素材集の更新をトリガー
    materialCollectionUpdateToken.set(true);
    
    return { 
      success: true, 
      message: `「${firstCollection[1]}」に保存しました` 
    };
  } catch (error) {
    console.error('素材集への保存に失敗:', error);
    return { 
      success: false, 
      message: '素材集への保存に失敗しました' 
    };
  }
}

