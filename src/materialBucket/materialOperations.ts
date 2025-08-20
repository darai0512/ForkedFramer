import type { Node, EmbodiedEntry, BindId, Folder } from '../lib/filesystem/fileSystem';
import { waitDialog } from '../utils/waitDialog';
import { get } from 'svelte/store';
import { gadgetFileSystem, saveMaterialToFolder as saveToFolder, deleteMaterialFromFolder as deleteFromFolder } from '../filemanager/fileManagerStore';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { buildMedia, ImageMedia, VideoMedia, type RemoteMediaReference } from '../lib/layeredCanvas/dataModels/media';
import { copyCanvas } from '../lib/layeredCanvas/tools/imageUtil';
import { materialCollectionUpdateToken } from './materialBucketStore';
import { pollMediaStatus, getMaterialsUrl, recordMaterial } from '../supabase';
import { toastStore } from '@skeletonlabs/skeleton';
import { blobToSha1 } from '../lib/layeredCanvas/tools/misc';
import { loading } from '../utils/loadingStore';
import { onlineStatus } from '../utils/accountStore';
import { BrowserMediaConverter } from '../lib/filesystem/mediaConverter';

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
      if (!media.isLoaded) {
        // Unmaterializedメディアの場合、ロード
        const rmr = media.persistentSource as RemoteMediaReference;
        const { mediaResources }  = await pollMediaStatus(rmr);
        if (mediaResources.length > 0) {
          media.setMedia(mediaResources[0]);
        }
        console.log("================================================================ loadMedia done", media);
        await file.writeMediaResource(mediaResources[0]); // Ensure the media is written back if needed
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

export async function postToPublicMaterials(media: Media): Promise<void> {
  // サインインチェック
  if (get(onlineStatus) !== 'signed-in') {
    toastStore.trigger({ message: 'みんなの素材集への投稿にはサインインが必要です', timeout: 3000 });
    return;
  }

  const dialogResponse = await waitDialog<{
    media: Media, 
    confirmed: boolean,
    category?: string,
    displayName?: string,
    description?: string
  }>('postToPublicMaterials', { 
    media
  });
  
  if (!dialogResponse?.confirmed) {
    return;
  }

  loading.set(true);
  try {
    // BrowserMediaConverterを使用してメディアをBlobに変換
    const converter = new BrowserMediaConverter();
    let filename: string;
    
    // メディアのdrawSourceを取得
    const mediaSource = media.type === 'image' ? media.drawSourceCanvas : media.drawSource;
    if (!mediaSource) {
      throw new Error('メディアソースが見つかりません');
    }
    
    // ファイル名を決定（拡張子も適切に設定）
    filename = media.type === 'image' 
      ? `material-${Date.now()}.webp`
      : `material-video-${Date.now()}.mp4`;

    // メディアをBlobに変換
    const result = await converter.toStorable(mediaSource);
    if (!result.blob) {
      throw new Error('メディアの変換に失敗しました');
    }
    const blob = result.blob;

    // SHA1ハッシュを計算
    const sha1 = await blobToSha1(blob);
    
    // アップロードURLを取得
    const { apiUrl, url, token, filename: uploadFilename } = await getMaterialsUrl(filename);
    console.log("素材アップロード", apiUrl, url, token, uploadFilename);

    // ファイルをアップロード
    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      body: blob,
      headers: {
        "Content-Type": "b2/x-auto",
        "Authorization": token,
        "X-Bz-File-Name": uploadFilename,
        "X-Bz-Content-Sha1": sha1,
      },
    });
    
    console.log(response);
    if (!response.ok) {
      throw new Error("素材のアップロードに失敗しました");
    }

    const materialUrl = `${apiUrl}/file/FramePlannerMaterials/${uploadFilename}`;
    console.log("material_url", materialUrl);

    // recordMaterialを呼び出してデータベースに記録
    const recordResponse = await recordMaterial({
      category: dialogResponse.category || 'general',
      display_name: dialogResponse.displayName || 'Untitled',
      description: dialogResponse.description || '',
      file: materialUrl
    });

    if (recordResponse.success) {
      toastStore.trigger({ 
        message: `素材を投稿しました！<br/>管理人に承認された場合、ユーザー全員に公開されます`, 
        timeout: 5000 
      });
    } else {
      toastStore.trigger({ 
        message: `素材のアップロードは完了しましたが、記録に失敗しました: ${recordResponse.message}`, 
        timeout: 5000 
      });
    }
  } catch (error) {
    console.error('素材の投稿に失敗:', error);
    toastStore.trigger({ 
      message: `素材の投稿に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`, 
      timeout: 3000 
    });
  } finally {
    loading.set(false);
  }
}