<script lang="ts">
import { createEventDispatcher, onDestroy, tick } from 'svelte';
import { get } from 'svelte/store';
import Drawer from '../utils/Drawer.svelte';
import TimelineItemView from './TimelineItemView.svelte';
import { dolphinRoomOpen } from './dolphinRoomStore';
import { getVideoElementFromMedia, buildMedia } from '../lib/layeredCanvas/dataModels/media';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { attachFileToDataTransfer } from '../lib/layeredCanvas/tools/dragUtil';
import {
  toTimelineRows,
  type MediaItem,
  type MessageItem,
  type TimelineRow,
  type TimelineItem,
  isMediaItem
} from './timelineTypes';
import { createMediaLoaders } from './mediaLoaders';
import ImagingModes from '../generator/ImagingModes.svelte';
import type {
  ImagingMode,
  ImageToVideoModel,
  ImagingBackground,
  ImageToVideoRequest,
  ImageToVideoResolution,
} from '$protocolTypes/imagingTypes';
import { createPreferenceStore } from '../preferences';
import { developmentFlag } from '../utils/developmentFlagStore';
import { executeProcessAndNotify } from '../utils/executeProcessAndNotify';
import { generateImage, isContentsPolicyViolationError, supportsRefImages, getRefMaxForMode } from '../utils/feathralImaging';
import { toastStore, RadioGroup, RadioItem } from '@skeletonlabs/skeleton';
import { _ } from 'svelte-i18n';
import { image2Video, pollMediaStatus } from '../supabase';
import { mainBookFileSystem } from '../filemanager/fileManagerStore';
import { saveRequest } from '../filemanager/warehouse';
import { resizeCanvasIfNeeded } from '../lib/layeredCanvas/tools/imageUtil';

const botReplies = [
  'うんうん、なるほど！', 'ちょっと考えてみますね。', 'それは面白いアイデアですね。',
  '詳しく聞かせてもらえますか？', 'いいですね、その調子です！'
];

const dispatch = createEventDispatcher<{ dragstart: Media }>();

let timelineItems: TimelineItem[] = [], timelineRows: TimelineRow[] = [];
let draft = '', nextId = 0;
let logElement: HTMLDivElement | null = null;
const objectUrls: string[] = [], mediaElements = new Map<number, HTMLButtonElement>();
let capturingMediaIds = new Set<number>();
let imagingMode: ImagingMode = 'schnell';
let generationType: 'image' | 'video' = 'image';
let selectedImageItems: MediaItem[] = [];
let hasSelectedImages = false;
let isGenerating = false;
let isDraftEmpty = true;
$: isDraftEmpty = draft.trim().length === 0;
$: {
  selectedImageItems = timelineItems.filter(
    (item): item is MediaItem => isMediaItem(item) && item.selected && item.kind === 'image'
  );
  hasSelectedImages = selectedImageItems.length > 0;
}
$: messageHeading = generationType === 'video'
  ? (isGenerating ? '動画生成中…' : '動画生成')
  : hasSelectedImages
    ? (isGenerating ? '編集中…' : '編集')
    : (isGenerating ? '生成中…' : '生成');
$: generationDisableReason = (() => {
  if (isGenerating) return '現在処理中です';
  if (isDraftEmpty) return 'プロンプトを入力してください';
  if (generationType === 'video' && !hasSelectedImages) return '動画生成には画像を選択してください';
  return '';
})();

const DEFAULT_PROMPT_POSTFIX = 'masterpiece, best quality, high detail';
const DEFAULT_IMAGE_SIZE: { width: number; height: number } = { width: 1024, height: 1024 };
const DEFAULT_BACKGROUND: ImagingBackground = 'opaque';
const DEFAULT_IMAGE_COUNT = 1;
const DEFAULT_VIDEO_COUNT = 1;
const DEFAULT_VIDEO_DURATION: ImageToVideoRequest['duration'] = '5';
const DEFAULT_VIDEO_RESOLUTION: ImageToVideoResolution = '720p';
const VIDEO_NOTIFICATION_THRESHOLD_MS = 10000;
const DEFAULT_VIDEO_SOURCE_MAX = 1024;

function inferVideoExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogv';
  if (normalized.includes('quicktime')) return 'mov';
  if (normalized.includes('x-msvideo')) return 'avi';
  return 'mp4';
}

const VIDEO_MODEL_CAPABILITIES: Record<
  ImageToVideoModel,
  {
    durations: ImageToVideoRequest['duration'][];
    aspectRatios: ImageToVideoRequest['aspectRatio'][];
    resolutions: ImageToVideoResolution[];
  }
> = {
  FramePack: {
    durations: ['1', '2', '3', '4', '5'],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['480p', '720p'],
  },
  kling: {
    durations: ['5'],
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
  },
  'seedance/lite': {
    durations: ['3', '4', '5'],
    aspectRatios: ['16:9'],
    resolutions: ['480p', '720p', '1080p'],
  },
  'seedance/pro': {
    durations: ['3', '4', '5'],
    aspectRatios: ['16:9'],
    resolutions: ['480p', '1080p'],
  },
  'wan/v2.2-a14b/turbo': {
    durations: ['5'],
    aspectRatios: ['1:1', '16:9', '9:16'],
    resolutions: ['480p', '720p'],
  },
  'wan-25-preview/image-to-video': {
    durations: ['5'],
    aspectRatios: ['1:1'],
    resolutions: ['480p', '720p', '1080p'],
  },
  'decart/lucy-14b': {
    durations: ['5'],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p'],
  },
  failure: {
    durations: ['1'],
    aspectRatios: ['1:1'],
    resolutions: ['480p'],
  },
};

function pickVideoDuration(model: ImageToVideoModel): ImageToVideoRequest['duration'] {
  const options = VIDEO_MODEL_CAPABILITIES[model]?.durations ?? [DEFAULT_VIDEO_DURATION];
  return options.includes(DEFAULT_VIDEO_DURATION) ? DEFAULT_VIDEO_DURATION : options[0];
}

function pickVideoResolution(model: ImageToVideoModel): ImageToVideoResolution {
  const options = VIDEO_MODEL_CAPABILITIES[model]?.resolutions ?? [DEFAULT_VIDEO_RESOLUTION];
  return options.includes(DEFAULT_VIDEO_RESOLUTION) ? DEFAULT_VIDEO_RESOLUTION : options[0];
}

function pickVideoAspectRatio(model: ImageToVideoModel, width: number, height: number): ImageToVideoRequest['aspectRatio'] {
  const options = VIDEO_MODEL_CAPABILITIES[model]?.aspectRatios ?? ['16:9'];
  const preferred = height > width ? '9:16' : '16:9';
  if (options.includes(preferred)) return preferred;
  return options[0];
}

const videoModelStore = createPreferenceStore<ImageToVideoModel>('tweakUi', 'dolphinRoomVideoModel', 'FramePack');
const videoModelOptions: Array<{ value: ImageToVideoModel; label: string; devOnly?: boolean }> = [
  { value: 'FramePack', label: 'FramePack' },
  { value: 'kling', label: 'kling-2.5' },
  { value: 'seedance/lite', label: 'Seedance Lite' },
  { value: 'seedance/pro', label: 'Seedance Pro' },
  { value: 'wan/v2.2-a14b/turbo', label: 'Wan v2.2 Turbo' },
  { value: 'failure', label: 'failure', devOnly: true }
];

const { ensureMediaItemMedia } = createMediaLoaders({
  refreshTimeline,
  addObjectUrl: (url: string) => objectUrls.push(url)
});
function refreshTimeline() {
  timelineItems = [...timelineItems];
}
$: timelineRows = toTimelineRows(timelineItems);
function closeDrawer() {
  $dolphinRoomOpen = false;
}

$: if ($dolphinRoomOpen && timelineItems.length === 0) {
  void enqueueBotMessage('イルカ室へようこそ！お気軽に話しかけてくださいね。');
}

function composeGenerationPrompt(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return DEFAULT_PROMPT_POSTFIX ? `${DEFAULT_PROMPT_POSTFIX}\n${trimmed}` : trimmed;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to Blob'));
      }
    }, 'image/png');
  });
}

async function buildMediaPayloadFromCanvas(canvas: HTMLCanvasElement, index: number) {
  const blob = await canvasToBlob(canvas);
  const timestamp = Date.now();
  const fileName = `dolphin-image-${timestamp}-${index}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);

  return {
    file,
    url,
    name: fileName,
    media: buildMedia(canvas),
    timestamp,
  };
}

function createPlaceholderMediaItems(count: number, promptId?: number, kind: MediaItem['kind'] = 'image'): MediaItem[] {
  if (count <= 0) return [];
  const baseTimestamp = Date.now();
  const placeholders: MediaItem[] = [];
  for (let i = 0; i < count; i += 1) {
    placeholders.push({
      id: nextId++,
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
  timelineItems = [...timelineItems, ...placeholders];
  return placeholders;
}

function removeMediaItems(targets: MediaItem[]) {
  if (targets.length === 0) return;
  const idSet = new Set(targets.map((item) => item.id));
  for (const item of targets) {
    releaseObjectUrl(item.url);
  }
  timelineItems = timelineItems.filter(
    (entry) => !(isMediaItem(entry) && idSet.has(entry.id))
  );
}

async function hydratePlaceholdersWithCanvases(placeholders: MediaItem[], canvases: HTMLCanvasElement[], promptId?: number) {
  const extras: MediaItem[] = [];

  for (let i = 0; i < canvases.length; i += 1) {
    const canvas = canvases[i];
    const payload = await buildMediaPayloadFromCanvas(canvas, i);
    const target = placeholders[i];

    if (target) {
      releaseObjectUrl(target.url);
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
        id: nextId++,
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
    timelineItems = [...timelineItems, ...extras];
  } else {
    timelineItems = [...timelineItems];
  }
}

async function hydratePlaceholdersWithVideos(
  placeholders: MediaItem[],
  pollResult: Awaited<ReturnType<typeof pollMediaStatus>>,
  promptId?: number
) {
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
      objectUrls.push(resource.src);
    }

    const media = buildMedia(resource);
    const target = placeholders[i];
    if (target) {
      releaseObjectUrl(target.url);
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
        id: nextId++,
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
    timelineItems = [...timelineItems, ...extras];
  } else {
    timelineItems = [...timelineItems];
  }
}

async function handleModeButtonClick() {
  if (isGenerating || isDraftEmpty) return;

  const prompt = composeGenerationPrompt(draft);
  if (!prompt) return;

  if (generationType === 'video' && !hasSelectedImages) {
    toastStore.trigger({ message: '動画生成には画像を選択してください。', timeout: 2500 });
    return;
  }

  const selection = [...selectedImageItems];
  const promptMessage = await appendMessage('user', prompt);

  if (!promptMessage) return;

  if (generationType === 'video') {
    await handleGenerateVideo(prompt, promptMessage.id, selection);
  } else if (selection.length > 0) {
    await handleEditSelected(prompt, promptMessage.id, selection);
  } else {
    await handleGenerateNew(prompt, promptMessage.id);
  }
}

async function handleGenerateNew(prompt: string, promptId: number) {
  isGenerating = true;
  const placeholders = createPlaceholderMediaItems(DEFAULT_IMAGE_COUNT, promptId);
  try {
    const canvases = await executeProcessAndNotify(
      5000,
      $_('generator.imageGenerated'),
      async () => await generateImage(prompt, DEFAULT_IMAGE_SIZE, imagingMode, DEFAULT_IMAGE_COUNT, DEFAULT_BACKGROUND, [])
    );

    await hydratePlaceholdersWithCanvases(placeholders, canvases, promptId);
  } catch (error) {
    if (isContentsPolicyViolationError(error)) {
      // エラー通知は generateImage 側で行われる
    } else {
      console.error('画像生成に失敗しました', error);
      toastStore.trigger({ message: '画像生成に失敗しました。', timeout: 3000 });
    }
    removeMediaItems(placeholders);
  } finally {
    isGenerating = false;
  }
}

async function handleEditSelected(prompt: string, promptId: number, selectedItems: MediaItem[]) {
  if (selectedItems.length === 0) {
    toastStore.trigger({ message: '編集には画像を選択してください。', timeout: 2500 });
    return;
  }

  if (!supportsRefImages(imagingMode)) {
    toastStore.trigger({ message: 'このモードは参照画像に対応していません。', timeout: 2500 });
    return;
  }

  const refMax = Math.max(0, getRefMaxForMode(imagingMode));
  if (refMax === 0) {
    toastStore.trigger({ message: '参照画像の上限により編集を実行できません。', timeout: 2500 });
    return;
  }

  const limitedItems = selectedItems.slice(0, refMax);
  isGenerating = true;
  const placeholders = createPlaceholderMediaItems(DEFAULT_IMAGE_COUNT, promptId);
  try {
    const medias = await Promise.all(limitedItems.map((item) => ensureMediaItemMedia(item)));
    const canvasesForRefs = medias
      .filter((media) => media.type === 'image')
      .map((media) => media.drawSourceCanvas);

    if (canvasesForRefs.length === 0) {
      toastStore.trigger({ message: '参照画像を取得できませんでした。', timeout: 2500 });
      return;
    }

    const referenceUrls = canvasesForRefs.map((canvas) => canvas.toDataURL('image/png'));
    const baseCanvas = canvasesForRefs[0];
    const imageSize = baseCanvas
      ? { width: baseCanvas.width || DEFAULT_IMAGE_SIZE.width, height: baseCanvas.height || DEFAULT_IMAGE_SIZE.height }
      : DEFAULT_IMAGE_SIZE;

    const canvases = await executeProcessAndNotify(
      5000,
      $_('generator.imageGenerated'),
      async () =>
        await generateImage(prompt, imageSize, imagingMode, DEFAULT_IMAGE_COUNT, 'auto', referenceUrls)
    );

    await hydratePlaceholdersWithCanvases(placeholders, canvases, promptId);
  } catch (error) {
    if (isContentsPolicyViolationError(error)) {
      // エラー通知は generateImage 側で行われる
    } else {
      console.error('画像編集に失敗しました', error);
      toastStore.trigger({ message: '画像編集に失敗しました。', timeout: 3000 });
    }
    removeMediaItems(placeholders);
  } finally {
    isGenerating = false;
  }
}

async function handleGenerateVideo(prompt: string, promptId: number, selectedItems: MediaItem[]) {
  if (selectedItems.length === 0) {
    toastStore.trigger({ message: '動画生成には画像を選択してください。', timeout: 2500 });
    return;
  }

  const baseItem = selectedItems[0];
  isGenerating = true;
  const placeholders = createPlaceholderMediaItems(DEFAULT_VIDEO_COUNT, promptId, 'video');
  try {
    const baseMedia = await ensureMediaItemMedia(baseItem).catch((error) => {
      console.error('Failed to load base media for video generation', error);
      return null;
    });
    if (!baseMedia || baseMedia.type !== 'image') {
      toastStore.trigger({ message: '動画生成には画像メディアが必要です。', timeout: 2500 });
      removeMediaItems(placeholders);
      return;
    }

    const resizedCanvas = resizeCanvasIfNeeded(baseMedia.drawSourceCanvas, DEFAULT_VIDEO_SOURCE_MAX);
    const model = $videoModelStore;
    const request: ImageToVideoRequest = {
      prompt,
      imageUrl: resizedCanvas.toDataURL('image/png'),
      duration: pickVideoDuration(model),
      aspectRatio: pickVideoAspectRatio(model, resizedCanvas.width, resizedCanvas.height),
      resolution: pickVideoResolution(model),
      model,
    };

    const { requestId, model: resolvedModel } = await image2Video(request);
    const fileSystem = get(mainBookFileSystem);
    if (fileSystem) {
      await saveRequest(fileSystem, 'video', request.model, requestId, resolvedModel);
    }

    toastStore.trigger({ message: '動画生成を開始しました。完了までしばらくお待ちください。', timeout: 3500 });

    const pollResult = await executeProcessAndNotify(
      VIDEO_NOTIFICATION_THRESHOLD_MS,
      $_('generator.videoGenerated'),
      async () => await pollMediaStatus({ mediaType: 'video', mode: request.model, requestId, model: resolvedModel })
    );

    await hydratePlaceholdersWithVideos(placeholders, pollResult, promptId);
  } catch (error) {
    if (isContentsPolicyViolationError(error)) {
      // エラー通知は generateImage 側で行われる
    } else {
      console.error('動画生成に失敗しました', error);
      toastStore.trigger({ message: '動画生成に失敗しました。', timeout: 3000 });
    }
    removeMediaItems(placeholders);
  } finally {
    isGenerating = false;
  }
}

async function enqueueUserMessage(text: string, shouldRespond = true) {
  const content = text.trim();
  if (!content) return;
  await appendMessage('user', content);
  if (shouldRespond) {
    scheduleBotReply();
  }
}
async function enqueueBotMessage(text: string) {
  await appendMessage('bot', text);
}
async function appendMessage(sender: 'user' | 'bot', content: string): Promise<MessageItem> {
  const entry = {
    id: nextId++,
    kind: 'message' as const,
    sender,
    content,
    timestamp: Date.now()
  };

  timelineItems = [...timelineItems, entry];
  await tick();
  if (logElement) {
    logElement.scrollTo({ top: logElement.scrollHeight, behavior: 'smooth' });
  }
  return entry;
}
function scheduleBotReply() {
  const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
  setTimeout(() => {
    void enqueueBotMessage(reply);
  }, 500 + Math.random() * 700);
}
function handleSubmit(event: Event) {
  event.preventDefault();
  const text = draft.trim();
  if (!text) return;
  draft = '';
  void enqueueUserMessage(text, true);
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  const items = event.dataTransfer?.files;
  if (!items || items.length === 0) return;
  const mediaItems: MediaItem[] = [];
  for (const file of Array.from(items)) {
    const type = file.type;
    if (!type.startsWith('image/') && !type.startsWith('video/')) continue;

    const url = URL.createObjectURL(file);
    objectUrls.push(url);

    mediaItems.push({
      id: nextId++,
      kind: type.startsWith('image/') ? 'image' : 'video',
      url,
      name: file.name,
      selected: false,
      file,
      timestamp: Date.now()
    });
  }
  if (mediaItems.length === 0) return;
  void appendMediaItems(mediaItems);
  event.dataTransfer?.clearData();
}

async function appendMediaItems(items: MediaItem[]) {
  for (const item of items) {
    void ensureMediaItemMedia(item);
  }

  timelineItems = [...timelineItems, ...items];
  await tick();
  if (logElement) {
    logElement.scrollTo({ top: logElement.scrollHeight, behavior: 'smooth' });
  }
}
function toggleMediaSelection(itemId: number) {
  timelineItems = timelineItems.map((item) => {
    if (item.id !== itemId || item.kind === 'message') return item;
    return { ...item, selected: !item.selected };
  });
}
function registerMediaElement(id: number, element: HTMLButtonElement | null) {
  if (element) {
    mediaElements.set(id, element);
  } else {
    mediaElements.delete(id);
  }
}

function releaseObjectUrl(url: string | null | undefined) {
  if (!url) return;
  let index = objectUrls.indexOf(url);
  let removed = false;
  while (index !== -1) {
    objectUrls.splice(index, 1);
    removed = true;
    index = objectUrls.indexOf(url);
  }
  if (removed) {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('Failed to revoke object URL', error);
    }
  }
}

function setMediaCapturing(id: number, enabled: boolean) {
  const next = new Set(capturingMediaIds);
  if (enabled) {
    next.add(id);
  } else {
    next.delete(id);
  }
  capturingMediaIds = next;
}

function deleteMediaItem(target: MediaItem) {
  releaseObjectUrl(target.url);
  if (target.kind === 'video') {
    const media = target.media;
    const video = media ? getVideoElementFromMedia(media) : null;
    releaseObjectUrl(video?.src ?? null);
  }

  mediaElements.delete(target.id);
  const nextCapturing = new Set(capturingMediaIds);
  nextCapturing.delete(target.id);
  capturingMediaIds = nextCapturing;

  timelineItems = timelineItems.filter((item) => item.id !== target.id);
}

function deleteMessageGroup(messageId: number) {
  const remaining: TimelineItem[] = [];
  const nextCapturing = new Set(capturingMediaIds);
  for (const item of timelineItems) {
    if (item.kind === 'message' && item.id === messageId) {
      continue;
    }
    if (isMediaItem(item) && item.promptId === messageId) {
      releaseObjectUrl(item.url);
      if (item.kind === 'video') {
        const video = item.media ? getVideoElementFromMedia(item.media) : null;
        releaseObjectUrl(video?.src ?? null);
      }
      mediaElements.delete(item.id);
      nextCapturing.delete(item.id);
      continue;
    }
    remaining.push(item);
  }
  capturingMediaIds = nextCapturing;
  timelineItems = remaining;
}

function handleDeleteGroup(event: CustomEvent<{ messageId: number }>) {
  deleteMessageGroup(event.detail.messageId);
}

function handleMediaDragStart(event: DragEvent, item: MediaItem) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;
  dataTransfer.effectAllowed = 'copy';
  const file = item.file;
  if (file) {
    attachFileToDataTransfer(dataTransfer, file, {
      downloadUrl: item.url
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

async function captureCurrentFrame(item: MediaItem) {
  if (capturingMediaIds.has(item.id)) return;
  setMediaCapturing(item.id, true);
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
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('loadeddata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);

    const fileName = `frame-${item.id}-${Date.now()}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });
    const frameItem: MediaItem = {
      id: nextId++,
      kind: 'image',
      url,
      name: fileName,
      selected: false,
      file,
      timestamp: Date.now()
    };

    await appendMediaItems([frameItem]);
  } finally {
    setMediaCapturing(item.id, false);
  }
}

onDestroy(() => {
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  mediaElements.clear();
});
</script>

<Drawer
  placement="right"
  open={$dolphinRoomOpen}
  size="800px"
  on:clickAway={closeDrawer}
  hideOverlayOnDrag
>
  {#if $dolphinRoomOpen}
    <div
      class="dolphin-room-container"
      role="region"
      aria-label="ドルフィンルームのタイムライン"
      on:dragover|preventDefault
      on:drop={handleDrop}
    >
      <header class="room-header">
        <div class="header-text">
          <h2>ドルフィンルーム</h2>
          <p>チャットで気軽にアイデアを整理しましょう。</p>
        </div>
      </header>

      <div class="message-log" bind:this={logElement}>
        {#each timelineRows as block ((block.kind === 'message-block'
          ? `message-${block.item.id}`
          : block.kind === 'media-grid'
            ? `media-${block.groupId}`
            : `message-media-${block.groupId}`))}
          <TimelineItemView
            messageItem={block.kind === 'message-block' ? block.item : block.kind === 'message-media' ? block.message : null}
            mediaItems={block.kind === 'media-grid' ? block.items : block.kind === 'message-media' ? block.items : null}
            combined={block.kind === 'message-media'}
            {capturingMediaIds}
            {toggleMediaSelection}
            captureCurrentFrame={captureCurrentFrame}
            handleMediaDragStartEvent={handleMediaDragStartEvent}
            registerMediaElement={registerMediaElement}
            deleteMediaItem={deleteMediaItem}
            on:deleteGroup={handleDeleteGroup}
          />
        {/each}
        {#if timelineRows.length === 0}
          <div class="empty-state">
            <p>まだメッセージがありません。下のフォームから送信してみましょう！</p>
          </div>
        {/if}
      </div>

      <form class="generation-form" on:submit={handleSubmit}>
        <div class="model-row" role="group" aria-label="生成モデル設定">
          <div class="model-item">
            <span class="model-label">画像</span>
            <ImagingModes bind:mode={imagingMode} group="imaging" width={200} />
          </div>
          <label class="model-item" for="dolphin-video-model">
            <span class="model-label">動画</span>
            <select
              id="dolphin-video-model"
              class="selector"
              bind:value={$videoModelStore}
            >
              {#each videoModelOptions as option (option.value)}
                {#if !option.devOnly || $developmentFlag}
                  <option value={option.value}>{option.label}</option>
                {/if}
              {/each}
            </select>
          </label>
        </div>
        <div class="input-row">
          <div class="input-wrapper">
            <textarea
              id="dolphin-room-message"
              placeholder="メッセージを入力してください"
              bind:value={draft}
              aria-label="メッセージ入力"
              rows={5}
            />
          </div>
          <div class="action-panel">
          <RadioGroup class="generation-toggle" regionLabel="生成タイプ">
            <RadioItem
              name="dolphin-generation-type"
              value="image"
              bind:group={generationType}
              label="画像生成"
            >
              画像
            </RadioItem>
            <RadioItem
              name="dolphin-generation-type"
              value="video"
              bind:group={generationType}
              label="動画生成"
            >
              動画
            </RadioItem>
          </RadioGroup>
          <button
            type="button"
            class="btn send-button mode-button"
            class:editing={generationType === 'image' && hasSelectedImages}
            title={generationType === 'video'
              ? (hasSelectedImages ? (isGenerating ? '動画生成中です…' : '選択画像から動画を生成') : '動画生成には画像を選択してください')
              : hasSelectedImages
                ? (isGenerating ? '編集中です…' : '選択中メディアを編集')
                : (isGenerating ? '生成中です…' : '新規生成モード')}
            disabled={isDraftEmpty || isGenerating || (generationType === 'video' && !hasSelectedImages)}
            on:click={handleModeButtonClick}
            aria-busy={isGenerating}
          >
            {messageHeading}
          </button>
          <button type="submit" class="btn send-button speak-button" disabled={isDraftEmpty}>発言</button>
          {#if generationDisableReason}
            <p class="action-note" role="status">{generationDisableReason}</p>
          {/if}
        </div>
        </div>
      </form>
    </div>
  {/if}
</Drawer>

<style>
  .dolphin-room-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1.5rem;
    gap: 1rem;
    background-color: rgb(var(--color-surface-50));
    box-sizing: border-box;
  }

  .room-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem 1.25rem;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .room-header h2 {
    font-size: 1.4rem;
    font-weight: 600;
    margin: 0;
  }

  .room-header p {
    margin: 0;
    color: rgb(var(--color-tertiary-500));
    font-size: 0.9rem;
  }

  .generation-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .model-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: nowrap;
  }

  .model-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: rgb(var(--color-surface-600));
  }

  .model-label {
    white-space: nowrap;
    font-weight: 600;
  }

  .model-item :global(.imaging-modes) {
    flex: 1;
    min-width: 180px;
  }

  .model-item select {
    flex: 1;
    min-width: 180px;
  }

  .selector {
    min-width: 200px;
    padding: 0.45rem 0.6rem;
    border-radius: 0.6rem;
    border: 1px solid rgb(var(--color-surface-400));
    background-color: white;
    font-size: 0.9rem;
    color: rgb(var(--color-surface-900));
    outline: none;
  }

  .selector:focus-visible {
    border-color: rgb(var(--color-primary-500));
    box-shadow: 0 0 0 2px rgba(var(--color-primary-500), 0.12);
  }

  .message-log {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    background-color: rgb(var(--color-surface-100));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .empty-state {
    text-align: center;
    color: rgb(var(--color-surface-500));
    font-size: 0.95rem;
    padding: 1.5rem 0;
  }

  .input-row {
    display: flex;
    gap: 0.75rem;
    align-items: stretch;
  }

  .input-wrapper {
    flex: 1;
    display: flex;
  }

  .action-panel {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    min-width: 180px;
  }

  .action-panel button {
    width: 100%;
  }

  .action-panel :global(.generation-toggle) {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }

  .action-panel :global(.generation-toggle .radio-label) {
    flex: 1;
  }

  .action-panel :global(.generation-toggle .radio-item) {
    width: 100%;
  }

  .action-note {
    font-size: 0.8rem;
    color: rgb(var(--color-secondary-500, 236 72 153));
    margin: 0;
    line-height: 1.35;
  }

  .input-row textarea {
    flex: 1;
    padding: 0.85rem 1.1rem;
    border-radius: 1rem;
    border: 1px solid rgb(var(--color-surface-400));
    background-color: white;
    font-size: 1rem;
    line-height: 1.45;
    min-height: 140px;
    resize: vertical;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .input-row textarea:focus {
    outline: none;
    border-color: rgb(var(--color-primary-500));
    box-shadow: 0 0 0 2px rgba(var(--color-primary-500), 0.12);
  }

  .input-row button {
    padding: 0.75rem 1.5rem;
    align-self: center;
  }

  .send-button {
    border: none;
    border-radius: 9999px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: rgb(var(--color-surface-50, 248 250 252));
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .send-button:hover,
  .send-button:focus-visible {
    transform: translateY(-1px);
  }

  .send-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .send-button:disabled:hover,
  .send-button:disabled:focus-visible {
    transform: none;
    box-shadow: none;
  }

  .mode-button {
    background-color: rgb(var(--color-primary-500, 59 130 246));
    box-shadow: 0 6px 14px rgb(var(--color-primary-500, 59 130 246) / 0.22);
  }

  .mode-button:hover,
  .mode-button:focus-visible {
    box-shadow: 0 8px 18px rgb(var(--color-primary-500, 59 130 246) / 0.28);
  }

  .mode-button.editing {
    background-color: rgb(var(--color-secondary-500, 236 72 153));
    box-shadow: 0 6px 14px rgb(var(--color-secondary-500, 236 72 153) / 0.22);
  }

  .mode-button.editing:hover,
  .mode-button.editing:focus-visible {
    box-shadow: 0 8px 18px rgb(var(--color-secondary-500, 236 72 153) / 0.28);
  }

  .speak-button {
    background-color: rgb(var(--color-tertiary-500, 16 185 129));
    box-shadow: 0 6px 14px rgb(var(--color-tertiary-500, 16 185 129) / 0.22);
  }

  .speak-button:hover,
  .speak-button:focus-visible {
    box-shadow: 0 8px 18px rgb(var(--color-tertiary-500, 16 185 129) / 0.28);
  }
</style>
