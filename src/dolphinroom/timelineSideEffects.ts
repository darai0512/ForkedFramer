import type { Media } from '../lib/layeredCanvas/dataModels/media';
import type { MediaItem, TimelineItem } from './timelineTypes';

interface TimelineAccess {
  getTimelineItems(): TimelineItem[];
  setTimelineItems(items: TimelineItem[]): void;
  getLogElement(): HTMLDivElement | null;
}

interface AppendDeps extends TimelineAccess {
  ensureMediaItemMedia: (item: MediaItem) => Promise<Media>;
  tick: () => Promise<void>;
}

export function createMediaAppender({ ensureMediaItemMedia, getTimelineItems, setTimelineItems, getLogElement, tick }: AppendDeps) {
  return async function appendMediaItems(items: MediaItem[]) {
    for (const item of items) {
      void ensureMediaItemMedia(item);
    }

    setTimelineItems([...getTimelineItems(), ...items]);
    await tick();

    const logElement = getLogElement();
    if (logElement) {
      logElement.scrollTo({ top: logElement.scrollHeight, behavior: 'smooth' });
    }
  };
}
