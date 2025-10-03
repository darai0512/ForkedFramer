import type { Media } from '../lib/layeredCanvas/dataModels/media';

type BaseTimelineItem = {
  id: number;
  timestamp: number;
};

export interface MessageItem extends BaseTimelineItem {
  kind: 'message';
  sender: 'user' | 'bot';
  content: string;
}

export interface MediaItem extends BaseTimelineItem {
  kind: 'image' | 'video';
  name: string;
  url: string;
  selected: boolean;
  file: File | null;
  media?: Media;
  mediaPromise?: Promise<Media>;
}

export type TimelineItem = MessageItem | MediaItem;

export function isMessageItem(item: TimelineItem): item is MessageItem {
  return item.kind === 'message';
}

export function isMediaItem(item: TimelineItem): item is MediaItem {
  return item.kind === 'image' || item.kind === 'video';
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
