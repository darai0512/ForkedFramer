<script lang="ts">
import { createEventDispatcher, onDestroy, tick } from 'svelte';
import { get } from 'svelte/store';
import { dolphinRoomOpen } from './dolphinRoomStore';
import { createMediaLoaders } from './mediaLoaders';
import {
  toTimelineRows,
  type MediaItem,
  type TimelineRow,
  type TimelineItem,
  isMediaItem,
} from './timelineTypes';
import type {
  ImagingMode,
  ImageToVideoModel,
  ImageToVideoRequest,
  ImageToVideoResolution,
} from '$protocolTypes/imagingTypes';
import { createPreferenceStore } from '../preferences';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import {
  videoModelOptions,
  pickVideoDuration,
  pickVideoResolution,
  pickVideoAspectRatio,
} from '../generator/videoModelConfig';
import { createObjectUrlManager } from './objectUrlManager';
import {
  createPlaceholderMediaItems,
  removeMediaItems as removeTimelineMediaItems,
  hydratePlaceholdersWithCanvases,
  hydratePlaceholdersWithVideos,
  toggleMediaSelection as toggleSelectionMutation,
  deleteMediaItem as deleteTimelineMediaItem,
  deleteMessageGroup as deleteTimelineMessageGroup,
} from './timelineActions';
import { createMessageActions } from './messageActions';
import { createMediaAppender } from './timelineSideEffects';
import { createDragActions } from './dragActions';
import { createFrameCapture } from './frameCapture';
import type { AllocateId } from './types';
import { createGenerationActions } from './generationActions';
import DolphinRoomView from './DolphinRoomView.svelte';
import { DEFAULT_IMAGE_SIZE } from './constants';

const dispatch = createEventDispatcher<{ dragstart: Media }>();

let timelineItems: TimelineItem[] = [];
let timelineRows: TimelineRow[] = [];
let draft = '';
let nextId = 0;
let logElement: HTMLDivElement | null = null;

const objectUrls = createObjectUrlManager();
const mediaElements = new Map<number, HTMLButtonElement>();
let capturingMediaIds = new Set<number>();
let imagingMode: ImagingMode = 'schnell';
let generationType: 'image' | 'video' = 'image';
let isGenerating = false;
let messageHeading = '';
let generationDisableReason = '';

let selectedImageItems: MediaItem[] = [];
let hasSelectedImages = false;
let isDraftEmpty = true;

let imageSizeForCost = DEFAULT_IMAGE_SIZE;
let videoSourceSize = DEFAULT_IMAGE_SIZE;
let videoDurationForCost: ImageToVideoRequest['duration'];
let videoResolutionForCost: ImageToVideoResolution;
let videoAspectRatioForCost: ImageToVideoRequest['aspectRatio'];

const allocateId: AllocateId = () => nextId++;

const getTimelineItems = () => timelineItems;
const setTimelineItems = (items: TimelineItem[]) => {
  timelineItems = items;
};
const getLogElement = () => logElement;

const { ensureMediaItemMedia } = createMediaLoaders({
  refreshTimeline,
  addObjectUrl: (url: string) => objectUrls.register(url),
});

const appendMediaItems = createMediaAppender({
  ensureMediaItemMedia,
  getTimelineItems,
  setTimelineItems,
  getLogElement,
  tick,
});

const { appendMessage, enqueueUserMessage, enqueueBotMessage } = createMessageActions({
  allocateId,
  getTimelineItems,
  setTimelineItems,
  getLogElement,
  tick,
});

const videoModelStore = createPreferenceStore<ImageToVideoModel>(
  'tweakUi',
  'dolphinRoomVideoModel',
  'FramePack',
);

let videoModel: ImageToVideoModel = get(videoModelStore);
videoDurationForCost = pickVideoDuration(videoModel);
videoResolutionForCost = pickVideoResolution(videoModel);
videoAspectRatioForCost = pickVideoAspectRatio(videoModel, videoSourceSize.width, videoSourceSize.height);
const unsubscribeVideoModel = videoModelStore.subscribe((value) => {
  videoModel = value;
  videoDurationForCost = pickVideoDuration(videoModel);
  videoResolutionForCost = pickVideoResolution(videoModel);
  videoAspectRatioForCost = pickVideoAspectRatio(videoModel, videoSourceSize.width, videoSourceSize.height);
});

const { handleMediaDragStartEvent } = createDragActions({
  ensureMediaItemMedia,
  dispatch,
});

function refreshTimeline() {
  timelineItems = [...timelineItems];
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

const captureCurrentFrame = createFrameCapture({
  isCapturing: (id) => capturingMediaIds.has(id),
  setCapturing: setMediaCapturing,
  mediaElements,
  ensureMediaItemMedia,
  appendMediaItems,
  objectUrls,
  allocateId,
});

const { handleModeButtonClick } = createGenerationActions({
  getTimelineItems,
  setTimelineItems,
  getSelectedImageItems: () => selectedImageItems,
  getHasSelectedImages: () => hasSelectedImages,
  getGenerationType: () => generationType,
  isDraftEmpty: () => isDraftEmpty,
  getDraft: () => draft,
  getImagingMode: () => imagingMode,
  getIsGenerating: () => isGenerating,
  setIsGenerating: (value) => {
    isGenerating = value;
  },
  objectUrls,
  allocateId,
  ensureMediaItemMedia,
  appendMessage,
  videoModelStore,
});

function handleVideoModelChange(nextModel: ImageToVideoModel) {
  if (nextModel === videoModel) return;
  videoModel = nextModel;
  videoModelStore.set(nextModel);
}

$: isDraftEmpty = draft.trim().length === 0;
$: {
  selectedImageItems = timelineItems.filter(
    (item): item is MediaItem => isMediaItem(item) && item.selected && item.kind === 'image',
  );
  hasSelectedImages = selectedImageItems.length > 0;
}
$: {
  const candidate = selectedImageItems.find((item) => item.media && item.media.type === 'image' && item.media.isLoaded);
  if (candidate?.media) {
    imageSizeForCost = {
      width: candidate.media.naturalWidth || candidate.media.drawSourceCanvas.width || DEFAULT_IMAGE_SIZE.width,
      height: candidate.media.naturalHeight || candidate.media.drawSourceCanvas.height || DEFAULT_IMAGE_SIZE.height,
    };
  } else {
    imageSizeForCost = DEFAULT_IMAGE_SIZE;
  }
  videoSourceSize = imageSizeForCost;
  videoAspectRatioForCost = pickVideoAspectRatio(videoModel, videoSourceSize.width, videoSourceSize.height);
}
$: timelineRows = toTimelineRows(timelineItems);
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

function closeDrawer() {
  $dolphinRoomOpen = false;
}

$: if ($dolphinRoomOpen && timelineItems.length === 0) {
  void enqueueBotMessage('イルカ室へようこそ！お気軽に話しかけてくださいね。');
}

function toggleMediaSelection(itemId: number) {
  timelineItems = toggleSelectionMutation({ timelineItems, itemId });
}

function registerMediaElement(id: number, element: HTMLButtonElement | null) {
  if (element) {
    mediaElements.set(id, element);
  } else {
    mediaElements.delete(id);
  }
}

function deleteMediaItem(target: MediaItem) {
  const { timelineItems: nextTimeline, capturingMediaIds: nextCapturing } = deleteTimelineMediaItem({
    timelineItems,
    target,
    mediaElements,
    capturingMediaIds,
    objectUrls,
  });
  timelineItems = nextTimeline;
  capturingMediaIds = nextCapturing;
}

function deleteMessageGroup(messageId: number) {
  const { timelineItems: nextTimeline, capturingMediaIds: nextCapturing } = deleteTimelineMessageGroup({
    timelineItems,
    messageId,
    mediaElements,
    capturingMediaIds,
    objectUrls,
  });
  timelineItems = nextTimeline;
  capturingMediaIds = nextCapturing;
}

function handleDeleteGroup(event: CustomEvent<{ messageId: number }>) {
  deleteMessageGroup(event.detail.messageId);
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
    objectUrls.register(url);

    mediaItems.push({
      id: allocateId(),
      kind: type.startsWith('image/') ? 'image' : 'video',
      url,
      name: file.name,
      selected: false,
      file,
      timestamp: Date.now(),
    });
  }
  if (mediaItems.length === 0) return;
  void appendMediaItems(mediaItems);
  event.dataTransfer?.clearData();
}

async function handlePaste(event: ClipboardEvent) {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return;

  const mediaItems: MediaItem[] = [];

  // クリップボードからファイルを取得
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (!file) continue;
      const type = file.type;
      if (!type.startsWith('image/') && !type.startsWith('video/')) continue;

      const url = URL.createObjectURL(file);
      objectUrls.register(url);

      mediaItems.push({
        id: allocateId(),
        kind: type.startsWith('image/') ? 'image' : 'video',
        url,
        name: file.name || 'pasted-file',
        selected: false,
        file,
        timestamp: Date.now(),
      });
    }
  }

  // 画像/動画が見つかった場合のみpreventDefaultして追加
  if (mediaItems.length > 0) {
    event.preventDefault();
    void appendMediaItems(mediaItems);
  }

  // テキストのみの場合はデフォルト動作を許可（何もしない）
}

function handleSubmit(event: Event) {
  event.preventDefault();
  const text = draft.trim();
  if (!text) return;
  draft = '';
  void enqueueUserMessage(text, true);
}

onDestroy(() => {
  objectUrls.revokeAll();
  mediaElements.clear();
  unsubscribeVideoModel();
});
</script>

<DolphinRoomView
  open={$dolphinRoomOpen}
  bind:logElement={logElement}
  {timelineRows}
  {capturingMediaIds}
  {messageHeading}
  {generationDisableReason}
  {isDraftEmpty}
  {isGenerating}
  {hasSelectedImages}
  bind:draft={draft}
  bind:imagingMode={imagingMode}
  bind:generationType={generationType}
  videoModel={videoModel}
  videoModelOptions={videoModelOptions}
  imageSize={imageSizeForCost}
  videoSourceSize={videoSourceSize}
  videoDuration={videoDurationForCost}
  videoResolution={videoResolutionForCost}
  videoAspectRatio={videoAspectRatioForCost}
  onVideoModelChange={handleVideoModelChange}
  onClose={closeDrawer}
  toggleMediaSelection={toggleMediaSelection}
  captureCurrentFrame={captureCurrentFrame}
  handleMediaDragStartEvent={handleMediaDragStartEvent}
  registerMediaElement={registerMediaElement}
  deleteMediaItem={deleteMediaItem}
  handleDeleteGroup={handleDeleteGroup}
  handleModeButtonClick={handleModeButtonClick}
  handleSubmit={handleSubmit}
  handleDrop={handleDrop}
  handlePaste={handlePaste}
/>
