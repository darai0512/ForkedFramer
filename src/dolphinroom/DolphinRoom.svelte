<script lang="ts">
import { createEventDispatcher, onDestroy, tick } from 'svelte';
import { get } from 'svelte/store';
import { _, locale, isLoading } from 'svelte-i18n';
import { toastStore } from '@skeletonlabs/skeleton';
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
import { supportsRefImages, getRefRangeForMode } from '../utils/feathralImaging';
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
import { persistentText } from '../utils/persistentText';

const dispatch = createEventDispatcher<{ dragstart: Media }>();
const ANGLE_EDIT_MODE: ImagingMode = 'qwen-image-edit/multiple-angles';

let timelineItems: TimelineItem[] = [];
let timelineRows: TimelineRow[] = [];
let draft = '';
let style = '';
let applyStyle = true;
let nextId = 0;
let logElement: HTMLDivElement | null = null;
let promptSubmitTrigger = 0;


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

// 画像生成オプション
let imageWidth = DEFAULT_IMAGE_SIZE.width;
let imageHeight = DEFAULT_IMAGE_SIZE.height;
let batchCount = 1;
let angleRotateRightLeft = 0;
let angleMoveForward = 0;
let angleVerticalAngle = 0;
let angleWideAngleLens = false;
let requiresReferenceSelection = false;
let isAngleEditMode = false;
let promptRequired = true;
let lastSelectableImagingMode: ImagingMode = 'schnell';

const allocateId: AllocateId = () => nextId++;

const getTimelineItems = () => timelineItems;
const setTimelineItems = (items: TimelineItem[]) => {
  queueMicrotask(() => {
    timelineItems = items;
  });
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

const { handleModeButtonClick: originalHandleModeButtonClick } = createGenerationActions({
  getTimelineItems,
  setTimelineItems,
  getSelectedImageItems: () => selectedImageItems,
  getHasSelectedImages: () => hasSelectedImages,
  getGenerationType: () => generationType,
  isDraftEmpty: () => (promptRequired ? isDraftEmpty : false),
  isPromptRequired: () => promptRequired,
  getDraft: () => draft,
  getStyle: () => style,
  getApplyStyle: () => applyStyle,
  getImagingMode: () => imagingMode,
  getIsGenerating: () => isGenerating,
  setIsGenerating: (value) => {
    isGenerating = value;
  },
  getImageWidth: () => imageWidth,
  getImageHeight: () => imageHeight,
  getBatchCount: () => batchCount,
  getAngleEditValues: () => ({
    rotateRightLeft: Number(angleRotateRightLeft),
    moveForward: Number(angleMoveForward),
    verticalAngle: Number(angleVerticalAngle),
    wideAngleLens: angleWideAngleLens,
  }),
  objectUrls,
  allocateId,
  ensureMediaItemMedia,
  appendMessage,
  videoModelStore,
});

async function handleModeButtonClick() {
  promptSubmitTrigger++;
  await originalHandleModeButtonClick();
  // 生成処理が完了した後にdraftをクリア
  draft = '';
}

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
$: {
  const nextRequires = getRefRangeForMode(imagingMode).min > 0;
  if (requiresReferenceSelection !== nextRequires) {
    requiresReferenceSelection = nextRequires;
  }
  if (!nextRequires || hasSelectedImages) {
    lastSelectableImagingMode = imagingMode;
  } else if (imagingMode !== lastSelectableImagingMode) {
    toastStore.trigger({ message: $_('dolphinRoom.disable.needImageForMode'), timeout: 2500 });
    imagingMode = lastSelectableImagingMode;
  }
}
$: isAngleEditMode = imagingMode === ANGLE_EDIT_MODE;
$: promptRequired = !(isAngleEditMode && generationType === 'image');
$: if (isAngleEditMode && batchCount !== 1) {
  batchCount = 1;
}
$: timelineRows = toTimelineRows(timelineItems);
$: messageHeading = generationType === 'video'
  ? (isGenerating ? $_('dolphinRoom.heading.videoGenerating') : $_('dolphinRoom.heading.videoGenerate'))
  : hasSelectedImages
    ? (isGenerating ? $_('dolphinRoom.heading.editing') : $_('dolphinRoom.heading.edit'))
    : (isGenerating ? $_('dolphinRoom.heading.generating') : $_('dolphinRoom.heading.generate'));
$: generationDisableReason = (() => {
  if (isGenerating) return $_('dolphinRoom.disable.inProgress');
  if (generationType === 'video' && !hasSelectedImages) return $_('dolphinRoom.disable.needImageForVideo');
  if (generationType === 'image' && requiresReferenceSelection && !hasSelectedImages) {
    return $_('dolphinRoom.disable.needImageForMode');
  }
  if (generationType === 'image' && hasSelectedImages && !supportsRefImages(imagingMode)) {
    return $_('dolphinRoom.disable.noRefImageSupport');
  }
  if (generationType === 'image' && hasSelectedImages) {
    const refRange = getRefRangeForMode(imagingMode);
    if (selectedImageItems.length > refRange.max) {
      return $_('dolphinRoom.disable.tooManyImages', { values: { max: refRange.max } });
    }
  }
  if (promptRequired && isDraftEmpty) return $_('dolphinRoom.disable.emptyPrompt');
  return '';
})();

function closeDrawer() {
  $dolphinRoomOpen = false;
}

let hasShownWelcome = false;

// Show welcome message when dialog opens for the first time
$: if ($dolphinRoomOpen && !hasShownWelcome && !$isLoading && timelineItems.length === 0) {
  const welcomeMessage = $_('dolphinRoom.welcome');
  if (welcomeMessage && welcomeMessage !== 'dolphinRoom.welcome') {
    hasShownWelcome = true;
    void enqueueBotMessage(welcomeMessage);
  }
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
      userAdded: true,
    });
  }
  if (mediaItems.length === 0) return;
  void appendMediaItems(mediaItems);
  event.dataTransfer?.clearData();
}

async function loadTemplateImage(url: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], 'template.webp', { type: blob.type });

    const objectUrl = URL.createObjectURL(blob);
    objectUrls.register(objectUrl);

    const mediaItem: MediaItem = {
      id: allocateId(),
      kind: 'image',
      url: objectUrl,
      name: 'template.webp',
      selected: true, // テンプレート画像は選択状態にする
      file,
      timestamp: Date.now(),
      userAdded: true,
    };

    await appendMediaItems([mediaItem]);
  } catch (error) {
    console.error('Failed to load template image:', error);
  }
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
        userAdded: true,
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
  promptSubmitTrigger++;
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
  {isGenerating}
  {hasSelectedImages}
  bind:draft={draft}
  bind:style={style}
  bind:applyStyle={applyStyle}
  bind:imagingMode={imagingMode}
  bind:generationType={generationType}
  videoModel={videoModel}
  videoModelOptions={videoModelOptions}
  imageSize={imageSizeForCost}
  videoSourceSize={videoSourceSize}
  videoDuration={videoDurationForCost}
  videoResolution={videoResolutionForCost}
  videoAspectRatio={videoAspectRatioForCost}
  promptSubmitTrigger={promptSubmitTrigger}
  bind:imageWidth={imageWidth}
  bind:imageHeight={imageHeight}
  bind:batchCount={batchCount}
  bind:angleRotateRightLeft={angleRotateRightLeft}
  bind:angleMoveForward={angleMoveForward}
  bind:angleVerticalAngle={angleVerticalAngle}
  bind:angleWideAngleLens={angleWideAngleLens}
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
  loadTemplateImage={loadTemplateImage}
/>
