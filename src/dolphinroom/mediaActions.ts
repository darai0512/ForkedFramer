import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { saveAs } from 'file-saver';
import { canvasToBlob } from '../lib/layeredCanvas/tools/imageUtil';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import type { MediaItem } from './timelineTypes';
import { removeBg, pollMediaStatus } from '../supabase';
import { saveRequest } from '../filemanager/warehouse';
import { mainBookFileSystem } from '../filemanager/fileManagerStore';
import { analyticsEvent } from '../utils/analyticsEvent';

export async function downloadMedia(mediaItem: MediaItem): Promise<void> {
  const media = mediaItem.media;
  if (!media) {
    toastStore.trigger({ message: 'ダウンロードできるデータが見つかりませんでした', timeout: 2000 });
    return;
  }

  const mediaResource = media.persistentSource;
  const filename = createBaseFileName(mediaItem);

  if (mediaResource instanceof HTMLCanvasElement) {
    const blob = await canvasToBlob(mediaResource, 'image/png');
    saveAs(blob, ensureExtension(filename, 'image/png'));
  } else if (mediaResource instanceof HTMLVideoElement) {
    const blob = await fetch(mediaResource.src).then(res => res.blob());
    saveAs(blob, ensureExtension(filename, 'video/mp4'));
  }
}

export async function copyMediaToClipboard(mediaItem: MediaItem): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    toastStore.trigger({ message: 'クリップボードへコピーできません', timeout: 2000 });
    return;
  }

  const media = mediaItem.media;
  if (!media || media.type !== 'image') {
    toastStore.trigger({ message: 'コピーできるデータが見つかりませんでした', timeout: 2000 });
    return;
  }

  const mediaResource = media.persistentSource;
  if (!(mediaResource instanceof HTMLCanvasElement)) {
    toastStore.trigger({ message: 'コピーできるデータが見つかりませんでした', timeout: 2000 });
    return;
  }

  try {
    const blob = await canvasToBlob(mediaResource, 'image/png');
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    toastStore.trigger({ message: 'クリップボードにコピーしました', timeout: 1600 });
  } catch (error) {
    console.error('Failed to write clipboard', error);
    toastStore.trigger({ message: 'クリップボードへのコピーに失敗しました', timeout: 2000 });
  }
}

export async function removeBackground(mediaItem: MediaItem): Promise<void> {
  const media = mediaItem.media;
  if (!media || !(media instanceof ImageMedia)) {
    toastStore.trigger({ message: '画像のみ背景除去できます', timeout: 2000 });
    return;
  }

  const dataUrl = media.drawSourceCanvas.toDataURL('image/png');
  const { requestId, model } = await removeBg({ dataUrl });
  await saveRequest(get(mainBookFileSystem)!, 'image', 'removebg', requestId, model);

  const { mediaResources } = await pollMediaStatus({ mediaType: 'image', action: 'removebg', requestId, model });

  mediaItem.media = new ImageMedia(mediaResources[0] as HTMLCanvasElement);
  analyticsEvent('punch');
  toastStore.trigger({ message: '背景を除去しました', timeout: 1600 });
}

function createBaseFileName(item: MediaItem): string {
  if (item.name?.trim()) return item.name.trim();
  const timestamp = new Date(item.timestamp).toISOString().replace(/[:T]/g, '-').split('.')[0];
  return `${item.kind}-${timestamp}`;
}

function ensureExtension(name: string, mimeOrKind: string): string {
  const normalizedName = name.trim();
  const extension = deriveExtension(mimeOrKind);
  if (!extension) return normalizedName;
  if (normalizedName.toLowerCase().endsWith(extension)) return normalizedName;
  return `${normalizedName}${extension}`;
}

function deriveExtension(mimeOrKind: string): string {
  const value = mimeOrKind.toLowerCase();
  if (value.includes('png')) return '.png';
  if (value.includes('jpeg') || value.includes('jpg')) return '.jpg';
  if (value.includes('webp')) return '.webp';
  if (value.includes('gif')) return '.gif';
  if (value.includes('mp4')) return '.mp4';
  if (value.includes('webm')) return '.webm';
  if (value.includes('video')) return '.mp4';
  if (value.includes('image')) return '.png';
  return '';
}
