<script lang="ts">
import { createEventDispatcher, onDestroy, tick } from 'svelte';
import Drawer from '../utils/Drawer.svelte';
import TimelineItemView from './TimelineItemView.svelte';
import { dolphinRoomOpen } from './dolphinRoomStore';
import { getVideoElementFromMedia, buildMedia } from '../lib/layeredCanvas/dataModels/media';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { attachFileToDataTransfer } from '../lib/layeredCanvas/tools/dragUtil';
import {
  toTimelineBlocks,
  type MediaItem,
  type TimelineBlock,
  type TimelineItem,
  isMediaItem
} from './timelineTypes';
import { createMediaLoaders } from './mediaLoaders';
import ImagingModes from '../generator/ImagingModes.svelte';
import type { ImagingMode, ImageToVideoModel, ImagingBackground } from '$protocolTypes/imagingTypes';
import { createPreferenceStore } from '../preferences';
import { developmentFlag } from '../utils/developmentFlagStore';
import { executeProcessAndNotify } from '../utils/executeProcessAndNotify';
import { generateImage, isContentsPolicyViolationError, supportsRefImages, getRefMaxForMode } from '../utils/feathralImaging';
import { toastStore } from '@skeletonlabs/skeleton';
import { _ } from 'svelte-i18n';

const botReplies = [
  'うんうん、なるほど！', 'ちょっと考えてみますね。', 'それは面白いアイデアですね。',
  '詳しく聞かせてもらえますか？', 'いいですね、その調子です！'
];

const dispatch = createEventDispatcher<{ dragstart: Media }>();

let timelineItems: TimelineItem[] = [], timelineBlocks: TimelineBlock[] = [];
let draft = '', nextId = 0;
let logElement: HTMLDivElement | null = null;
const objectUrls: string[] = [], mediaElements = new Map<number, HTMLButtonElement>();
let capturingMediaIds = new Set<number>();
let imagingMode: ImagingMode = 'schnell';
let hasSelectedMedia = false;
let isGenerating = false;
$: messageHeading = hasSelectedMedia ? '編集' : (isGenerating ? '生成中…' : '生成');
let isDraftEmpty = true;
$: isDraftEmpty = draft.trim().length === 0;

const DEFAULT_PROMPT_POSTFIX = 'masterpiece, best quality, high detail';
const DEFAULT_IMAGE_SIZE: { width: number; height: number } = { width: 1024, height: 1024 };
const DEFAULT_BACKGROUND: ImagingBackground = 'opaque';
const DEFAULT_IMAGE_COUNT = 1;

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
$: timelineBlocks = toTimelineBlocks(timelineItems);
function closeDrawer() {
  $dolphinRoomOpen = false;
}

$: if ($dolphinRoomOpen && timelineItems.length === 0) {
  void enqueueBotMessage('イルカ室へようこそ！お気軽に話しかけてくださいね。');
}

$: hasSelectedMedia = timelineItems.some((item) => isMediaItem(item) && item.selected);

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

async function createMediaItemFromCanvas(canvas: HTMLCanvasElement, index: number): Promise<MediaItem> {
  const blob = await canvasToBlob(canvas);
  const timestamp = Date.now();
  const fileName = `dolphin-image-${timestamp}-${index}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);

  return {
    id: nextId++,
    kind: 'image',
    name: fileName,
    url,
    selected: false,
    file,
    media: buildMedia(canvas),
    timestamp
  };
}

async function handleModeButtonClick() {
  if (isGenerating || isDraftEmpty) return;

  const prompt = composeGenerationPrompt(draft);
  if (!prompt) return;

  if (hasSelectedMedia) {
    await handleEditSelected(prompt);
  } else {
    await handleGenerateNew(prompt);
  }
}

async function handleGenerateNew(prompt: string) {
  isGenerating = true;
  try {
    const canvases = await executeProcessAndNotify(
      5000,
      $_('generator.imageGenerated'),
      async () => await generateImage(prompt, DEFAULT_IMAGE_SIZE, imagingMode, DEFAULT_IMAGE_COUNT, DEFAULT_BACKGROUND, [])
    );

    const items: MediaItem[] = [];
    for (let i = 0; i < canvases.length; i += 1) {
      items.push(await createMediaItemFromCanvas(canvases[i], i));
    }

    if (items.length > 0) {
      await appendMediaItems(items);
    }
  } catch (error) {
    if (isContentsPolicyViolationError(error)) {
      // エラー通知は generateImage 側で行われる
    } else {
      console.error('画像生成に失敗しました', error);
      toastStore.trigger({ message: '画像生成に失敗しました。', timeout: 3000 });
    }
  } finally {
    isGenerating = false;
  }
}

async function handleEditSelected(prompt: string) {
  const selectedItems = timelineItems.filter((item): item is MediaItem => isMediaItem(item) && item.selected && item.kind === 'image');
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

    const items: MediaItem[] = [];
    for (let i = 0; i < canvases.length; i += 1) {
      items.push(await createMediaItemFromCanvas(canvases[i], i));
    }

    if (items.length > 0) {
      await appendMediaItems(items);
    }
  } catch (error) {
    if (isContentsPolicyViolationError(error)) {
      // エラー通知は generateImage 側で行われる
    } else {
      console.error('画像編集に失敗しました', error);
      toastStore.trigger({ message: '画像編集に失敗しました。', timeout: 3000 });
    }
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
async function appendMessage(sender: 'user' | 'bot', content: string) {
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
        <div class="model-controls" role="group" aria-label="生成モデル設定">
          <div class="model-control">
            <span class="control-title">画像生成モデル</span>
            <ImagingModes bind:mode={imagingMode} group="imaging" width={220} />
          </div>
          <div class="model-control">
            <span class="control-title">動画生成モデル</span>
            <select
              class="selector"
              bind:value={$videoModelStore}
              aria-label="動画生成モデル"
            >
              {#each videoModelOptions as option (option.value)}
                {#if !option.devOnly || $developmentFlag}
                  <option value={option.value}>{option.label}</option>
                {/if}
              {/each}
            </select>
          </div>
        </div>
      </header>

      <div class="message-log" bind:this={logElement}>
        {#each timelineBlocks as block ((block.kind === 'message-block'
          ? `message-${block.item.id}`
          : `media-${block.groupId}`))}
          <TimelineItemView
            messageItem={block.kind === 'message-block' ? block.item : null}
            mediaItems={block.kind === 'media-group' ? block.items : null}
            {capturingMediaIds}
            {toggleMediaSelection}
            captureCurrentFrame={captureCurrentFrame}
            handleMediaDragStartEvent={handleMediaDragStartEvent}
            registerMediaElement={registerMediaElement}
            deleteMediaItem={deleteMediaItem}
          />
        {/each}
        {#if timelineBlocks.length === 0}
          <div class="empty-state">
            <p>まだメッセージがありません。下のフォームから送信してみましょう！</p>
          </div>
        {/if}
      </div>

      <form class="input-row" on:submit={handleSubmit}>
        <div class="input-wrapper">
          <textarea
            id="dolphin-room-message"
            placeholder="メッセージを入力してください"
            bind:value={draft}
            aria-label="メッセージ入力"
            rows={5}
          />
        </div>
        <button
          type="button"
          class="btn send-button mode-button"
          class:editing={hasSelectedMedia}
          title={hasSelectedMedia ? '選択中メディアを編集' : isGenerating ? '生成中です…' : '新規生成モード'}
          disabled={isDraftEmpty || isGenerating}
          on:click={handleModeButtonClick}
          aria-busy={isGenerating}
        >
          {messageHeading}
        </button>
        <button type="submit" class="btn send-button speak-button" disabled={isDraftEmpty}>発言</button>
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

  .model-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
  }

  .model-control {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .control-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgb(var(--color-surface-500));
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
