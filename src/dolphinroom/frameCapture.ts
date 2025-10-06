import { getVideoElementFromMedia } from '../lib/layeredCanvas/dataModels/media';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { canvasToBlob } from '../lib/layeredCanvas/tools/imageUtil';
import type { MediaItem } from './timelineTypes';
import type { ObjectUrlHandle } from './objectUrlManager';
import type { AllocateId } from './types';

interface FrameCaptureDeps {
  isCapturing(id: number): boolean;
  setCapturing(id: number, enabled: boolean): void;
  mediaElements: Map<number, HTMLButtonElement>;
  ensureMediaItemMedia: (item: MediaItem) => Promise<Media>;
  appendMediaItems(items: MediaItem[]): Promise<void>;
  objectUrls: ObjectUrlHandle;
  allocateId: AllocateId;
}

export function createFrameCapture(deps: FrameCaptureDeps) {
  const { isCapturing, setCapturing, mediaElements, ensureMediaItemMedia, appendMediaItems, objectUrls, allocateId } = deps;

  return async function captureCurrentFrame(item: MediaItem) {
    if (isCapturing(item.id)) return;
    setCapturing(item.id, true);
    try {
      const container = mediaElements.get(item.id);
      let video = container?.querySelector('video') ?? null;

      if (!video) {
        const media = item.media ?? (await ensureMediaItemMedia(item).catch(() => null));
        video = media ? getVideoElementFromMedia(media) : null;
      }

      if (!video) return;

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error('failed to load video data'));
          };
          const cleanup = () => {
            video?.removeEventListener('loadeddata', onLoaded);
            video?.removeEventListener('error', onError);
          };
          video?.addEventListener('loadeddata', onLoaded, { once: true });
          video?.addEventListener('error', onError, { once: true });
        }).catch(() => undefined);
      }

      const width = video.videoWidth || video.clientWidth;
      const height = video.videoHeight || video.clientHeight;
      if (width === 0 || height === 0) return;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, 'image/png');
      const url = URL.createObjectURL(blob);
      objectUrls.register(url);

      const fileName = `frame-${item.id}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const frameItem: MediaItem = {
        id: allocateId(),
        kind: 'image',
        url,
        name: fileName,
        selected: false,
        file,
        timestamp: Date.now(),
        userAdded: true,
      };

      await appendMediaItems([frameItem]);
    } finally {
      setCapturing(item.id, false);
    }
  };
}
