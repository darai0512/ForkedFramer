import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { getVideoElementFromMedia } from '../lib/layeredCanvas/dataModels/media';
import { attachFileToDataTransfer } from '../lib/layeredCanvas/tools/dragUtil';
import type { MediaItem } from './timelineTypes';

interface DragDeps {
  ensureMediaItemMedia: (item: MediaItem) => Promise<Media>;
  dispatch: (event: 'dragstart', detail: Media) => void;
}

export function createDragActions({ ensureMediaItemMedia, dispatch }: DragDeps) {
  function handleMediaDragStart(event: DragEvent, item: MediaItem) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;
    dataTransfer.effectAllowed = 'copy';
    const file = item.file;
    if (file) {
      attachFileToDataTransfer(dataTransfer, file, {
        downloadUrl: item.url,
      });
    } else if (item.url) {
      try {
        dataTransfer.setData('text/uri-list', item.url);
      } catch (error) {
        console.warn('Failed to set text/uri-list drag data', error);
      }
    }

    if (item.kind === 'video') {
      const fallbackElement = item.media ? getVideoElementFromMedia(item.media) : null;
      const videoUrl = item.url ?? fallbackElement?.src ?? null;
      if (videoUrl) {
        try {
          dataTransfer.setData('video/mp4', videoUrl);
        } catch (error) {
          console.warn('Failed to set video/mp4 drag data', error);
        }
      }
    }

    const notifyDragStart = (media: Media) => {
      dispatch('dragstart', media);
    };

    if (item.media) {
      notifyDragStart(item.media);
    } else {
      ensureMediaItemMedia(item)
        .then(notifyDragStart)
        .catch((error) => {
          console.error('Failed to prepare media for drag', error);
        });
    }
  }

  function handleMediaDragStartEvent(event: Event, item: MediaItem) {
    if (typeof DragEvent !== 'undefined' && event instanceof DragEvent) {
      handleMediaDragStart(event, item);
    }
  }

  return {
    handleMediaDragStart,
    handleMediaDragStartEvent,
  };
}
