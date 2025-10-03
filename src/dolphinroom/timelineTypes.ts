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

export interface MessageBlock {
  kind: 'message-block';
  item: MessageItem;
}

export interface MediaGroupBlock {
  kind: 'media-group';
  items: MediaItem[];
}

export type TimelineBlock = MessageBlock | MediaGroupBlock;

export function toTimelineBlocks(items: TimelineItem[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  let pendingMedia: MediaItem[] | null = null;

  for (const item of items) {
    if (isMessageItem(item)) {
      if (pendingMedia && pendingMedia.length > 0) {
        blocks.push({ kind: 'media-group', items: pendingMedia });
        pendingMedia = null;
      }
      blocks.push({ kind: 'message-block', item });
      continue;
    }

    if (!pendingMedia) {
      pendingMedia = [];
    }
    pendingMedia.push(item);
  }

  if (pendingMedia && pendingMedia.length > 0) {
    blocks.push({ kind: 'media-group', items: pendingMedia });
  }

  return blocks;
}
