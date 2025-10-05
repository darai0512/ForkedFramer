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
  placeholder?: boolean;
  promptId?: number;
  userAdded?: boolean; // ドロップ/ペーストでユーザーが追加した画像
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

export interface MediaGridRow {
  kind: 'media-grid';
  items: MediaItem[];
  groupId: number;
}

export interface MessageMediaBlock {
  kind: 'message-media';
  message: MessageItem;
  items: MediaItem[];
  groupId: number;
}

export type TimelineRow = MessageBlock | MediaGridRow | MessageMediaBlock;

export function toTimelineRows(items: TimelineItem[]): TimelineRow[] {
  const rows: TimelineRow[] = [];

  let index = 0;
  while (index < items.length) {
    const current = items[index];
    if (isMessageItem(current)) {
      const message = current;
      const combined: MediaItem[] = [];
      let nextIndex = index + 1;
      while (nextIndex < items.length) {
        const candidate = items[nextIndex];
        if (!isMediaItem(candidate)) {
          break;
        }
        if (candidate.promptId !== message.id) {
          break;
        }
        combined.push(candidate);
        nextIndex += 1;
      }

      if (combined.length > 0) {
        rows.push({ kind: 'message-media', message, items: combined, groupId: combined[0].id });
        index = nextIndex;
        continue;
      }

      rows.push({ kind: 'message-block', item: message });
      index += 1;
      continue;
    }

    const mediaGroup: MediaItem[] = [];
    let nextIndex = index;
    while (nextIndex < items.length) {
      const candidate = items[nextIndex];
      if (!isMediaItem(candidate) || candidate.promptId != null) {
        break;
      }
      mediaGroup.push(candidate);
      nextIndex += 1;
    }

    if (mediaGroup.length > 0) {
      rows.push({ kind: 'media-grid', items: mediaGroup, groupId: mediaGroup[0].id });
      index = nextIndex;
    } else {
      // Safety: skip items that didn't fit above conditions to avoid infinite loop
      index += 1;
    }
  }

  return rows;
}
