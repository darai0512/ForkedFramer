import { buildMedia, getVideoElementFromMedia } from '../lib/layeredCanvas/dataModels/media';
import { canvasToBlob } from '../lib/layeredCanvas/tools/imageUtil';
import type { MediaItem, TimelineItem } from './timelineTypes';
import { isMediaItem } from './timelineTypes';
import type { ObjectUrlHandle } from './objectUrlManager';
import { inferVideoExtension } from '../generator/videoModelConfig';
import type { pollMediaStatus } from '../supabase';
import type { AllocateId } from './types';

type PollResult = Awaited<ReturnType<typeof pollMediaStatus>>;

type HydrationBase = {
  timelineItems: TimelineItem[];
  placeholders: MediaItem[];
  promptId?: number;
  allocateId: AllocateId;
  objectUrls: ObjectUrlHandle;
};

async function buildMediaPayloadFromCanvas(
  canvas: HTMLCanvasElement,
  index: number,
  objectUrls: ObjectUrlHandle,
) {
  const blob = await canvasToBlob(canvas, 'image/png');
  const timestamp = Date.now();
  const fileName = `dolphin-image-${timestamp}-${index}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  objectUrls.register(url);

  return {
    file,
    url,
    name: fileName,
    media: buildMedia(canvas),
    timestamp,
  };
}

export function createPlaceholderMediaItems(params: {
  timelineItems: TimelineItem[];
  count: number;
  allocateId: AllocateId;
  promptId?: number;
  kind?: MediaItem['kind'];
}): { placeholders: MediaItem[]; timelineItems: TimelineItem[] } {
  const { timelineItems, count, allocateId, promptId, kind = 'image' } = params;
  if (count <= 0) {
    return { placeholders: [], timelineItems };
  }

  const baseTimestamp = Date.now();
  const placeholders: MediaItem[] = [];
  for (let i = 0; i < count; i += 1) {
    placeholders.push({
      id: allocateId(),
      kind,
      name: '生成中',
      url: '',
      selected: false,
      file: null,
      timestamp: baseTimestamp + i,
      placeholder: true,
      promptId,
    });
  }

  return {
    placeholders,
    timelineItems: [...timelineItems, ...placeholders],
  };
}

export function removeMediaItems(params: {
  timelineItems: TimelineItem[];
  targets: MediaItem[];
  objectUrls: ObjectUrlHandle;
}): TimelineItem[] {
  const { timelineItems, targets, objectUrls } = params;
  if (targets.length === 0) return timelineItems;
  const idSet = new Set(targets.map((item) => item.id));
  for (const item of targets) {
    objectUrls.release(item.url);
  }
  return timelineItems.filter((entry) => !(isMediaItem(entry) && idSet.has(entry.id)));
}

export async function hydratePlaceholdersWithCanvases(params: HydrationBase & {
  canvases: HTMLCanvasElement[];
}): Promise<TimelineItem[]> {
  const { timelineItems, placeholders, canvases, promptId, objectUrls } = params;
  const extras: MediaItem[] = [];

  for (let i = 0; i < canvases.length; i += 1) {
    const canvas = canvases[i];
    const payload = await buildMediaPayloadFromCanvas(canvas, i, objectUrls);
    const target = placeholders[i];

    if (target) {
      objectUrls.release(target.url);
      target.name = payload.name;
      target.url = payload.url;
      target.file = payload.file;
      target.media = payload.media;
      target.timestamp = payload.timestamp;
      target.placeholder = false;
      target.selected = false;
      if (promptId != null) {
        target.promptId = promptId;
      }
    } else {
      extras.push({
        id: params.allocateId(),
        kind: 'image',
        name: payload.name,
        url: payload.url,
        selected: false,
        file: payload.file,
        media: payload.media,
        timestamp: payload.timestamp,
        promptId,
      });
    }
  }

  if (extras.length > 0) {
    return [...timelineItems, ...extras];
  }
  return [...timelineItems];
}

export async function hydratePlaceholdersWithVideos(params: HydrationBase & {
  pollResult: PollResult;
}): Promise<TimelineItem[]> {
  const { timelineItems, placeholders, pollResult, promptId, objectUrls, allocateId } = params;
  const extras: MediaItem[] = [];
  const { mediaResources, urls } = pollResult;

  for (let i = 0; i < mediaResources.length; i += 1) {
    const resource = mediaResources[i];
    if (!(resource instanceof HTMLVideoElement)) {
      console.warn('Unexpected media type for video result', resource);
      continue;
    }

    let blob: Blob | null = null;
    const remoteUrl = urls?.[i];
    try {
      if (remoteUrl) {
        const response = await fetch(remoteUrl);
        blob = await response.blob();
      }
    } catch (error) {
      console.warn('Failed to fetch remote video blob, falling back to local source', error);
    }

    if (!blob) {
      try {
        const response = await fetch(resource.src);
        blob = await response.blob();
      } catch (error) {
        console.error('Failed to obtain video blob', error);
        continue;
      }
    }

    const mimeType = blob.type || 'video/mp4';
    const extension = inferVideoExtension(mimeType);
    const timestamp = Date.now() + i;
    const fileName = `dolphin-video-${timestamp}.${extension}`;
    const file = new File([blob], fileName, { type: mimeType });

    if (resource.src) {
      objectUrls.register(resource.src);
    }

    const media = buildMedia(resource);
    const target = placeholders[i];
    if (target) {
      objectUrls.release(target.url);
      target.name = fileName;
      target.url = resource.src;
      target.file = file;
      target.media = media;
      target.timestamp = timestamp;
      target.placeholder = false;
      target.selected = false;
      if (promptId != null) {
        target.promptId = promptId;
      }
    } else {
      extras.push({
        id: allocateId(),
        kind: 'video',
        name: fileName,
        url: resource.src,
        selected: false,
        file,
        media,
        timestamp,
        promptId,
      });
    }
  }

  if (extras.length > 0) {
    return [...timelineItems, ...extras];
  }
  return [...timelineItems];
}

export function toggleMediaSelection(params: {
  timelineItems: TimelineItem[];
  itemId: number;
}): TimelineItem[] {
  const { timelineItems, itemId } = params;
  return timelineItems.map((item) => {
    if (item.id !== itemId || item.kind === 'message') return item;
    return { ...item, selected: !item.selected };
  });
}

export function deleteMediaItem(params: {
  timelineItems: TimelineItem[];
  target: MediaItem;
  mediaElements: Map<number, HTMLButtonElement>;
  capturingMediaIds: Set<number>;
  objectUrls: ObjectUrlHandle;
}): { timelineItems: TimelineItem[]; capturingMediaIds: Set<number> } {
  const { timelineItems, target, mediaElements, capturingMediaIds, objectUrls } = params;
  objectUrls.release(target.url);
  if (target.kind === 'video') {
    const video = target.media ? getVideoElementFromMedia(target.media) : null;
    objectUrls.release(video?.src ?? null);
  }

  mediaElements.delete(target.id);
  const nextCapturing = new Set(capturingMediaIds);
  nextCapturing.delete(target.id);

  return {
    timelineItems: timelineItems.filter((item) => item.id !== target.id),
    capturingMediaIds: nextCapturing,
  };
}

export function deleteMessageGroup(params: {
  timelineItems: TimelineItem[];
  messageId: number;
  mediaElements: Map<number, HTMLButtonElement>;
  capturingMediaIds: Set<number>;
  objectUrls: ObjectUrlHandle;
}): { timelineItems: TimelineItem[]; capturingMediaIds: Set<number> } {
  const { timelineItems, messageId, mediaElements, capturingMediaIds, objectUrls } = params;
  const remaining: TimelineItem[] = [];
  const nextCapturing = new Set(capturingMediaIds);

  for (const item of timelineItems) {
    if (item.kind === 'message' && item.id === messageId) {
      continue;
    }
    if (isMediaItem(item) && item.promptId === messageId) {
      objectUrls.release(item.url);
      if (item.kind === 'video') {
        const video = item.media ? getVideoElementFromMedia(item.media) : null;
        objectUrls.release(video?.src ?? null);
      }
      mediaElements.delete(item.id);
      nextCapturing.delete(item.id);
      continue;
    }
    remaining.push(item);
  }

  return { timelineItems: remaining, capturingMediaIds: nextCapturing };
}
