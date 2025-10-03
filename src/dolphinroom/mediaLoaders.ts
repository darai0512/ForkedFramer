import {
  buildMedia,
  type Media
} from '../lib/layeredCanvas/dataModels/media';
import { createCanvasFromBlob, createVideoFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
import type { MediaItem } from './timelineTypes';

interface MediaLoaderDeps {
  refreshTimeline: () => void;
  addObjectUrl: (url: string) => void;
}

export function createMediaLoaders({ refreshTimeline, addObjectUrl }: MediaLoaderDeps) {
  async function ensureMediaItemFile(item: MediaItem): Promise<File | null> {
    if (item.file) {
      return item.file;
    }

    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const extension = item.kind === 'image' ? 'png' : 'mp4';
      const type = blob.type || (item.kind === 'image' ? 'image/png' : 'video/mp4');
      const fileName = item.name || `media-${item.id}.${extension}`;
      const file = new File([blob], fileName, { type });
      item.file = file;
      return file;
    } catch (error) {
      console.error('Failed to fetch media blob', error);
      return null;
    }
  }

  async function ensureMediaItemMedia(item: MediaItem): Promise<Media> {
    if (item.media) {
      return item.media;
    }
    if (item.mediaPromise) {
      return item.mediaPromise;
    }

    item.mediaPromise = (async () => {
      const file = await ensureMediaItemFile(item);
      if (!file) {
        throw new Error('Missing media file');
      }

      if (item.kind === 'image') {
        const canvas = await createCanvasFromBlob(file);
        const media = buildMedia(canvas);
        item.media = media;
        refreshTimeline();
        return media;
      } else {
        const video = await createVideoFromBlob(file);
        if (video.src) {
          addObjectUrl(video.src);
        }
        const media = buildMedia(video);
        item.media = media;
        refreshTimeline();
        return media;
      }
    })();

    try {
      const media = await item.mediaPromise;
      return media;
    } finally {
      item.mediaPromise = undefined;
    }
  }

  return { ensureMediaItemFile, ensureMediaItemMedia };
}
