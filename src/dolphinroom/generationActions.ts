import { get } from 'svelte/store';
import { executeProcessAndNotify } from '../utils/executeProcessAndNotify';
import { generateImage, isContentsPolicyViolationError, supportsRefImages, getRefMaxForMode } from '../utils/feathralImaging';
import { toastStore } from '@skeletonlabs/skeleton';
import { _ } from 'svelte-i18n';
import { image2Video, pollMediaStatus } from '../supabase';
import { mainBookFileSystem } from '../filemanager/fileManagerStore';
import { saveRequest } from '../filemanager/warehouse';
import { resizeCanvasIfNeeded } from '../lib/layeredCanvas/tools/imageUtil';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import type { MediaItem, TimelineItem, MessageItem } from './timelineTypes';
import type { ImagingMode, ImageToVideoModel, ImageToVideoRequest } from '$protocolTypes/imagingTypes';
import type { Writable } from 'svelte/store';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_VIDEO_COUNT,
  DEFAULT_VIDEO_SOURCE_MAX,
  VIDEO_NOTIFICATION_THRESHOLD_MS,
  composeGenerationPrompt,
} from './constants';
import {
  createPlaceholderMediaItems,
  hydratePlaceholdersWithCanvases,
  hydratePlaceholdersWithVideos,
  removeMediaItems as removeTimelineMediaItems,
} from './timelineActions';
import { pickVideoAspectRatio, pickVideoDuration, pickVideoResolution } from '../generator/videoModelConfig';
import type { ObjectUrlHandle } from './objectUrlManager';
import type { AllocateId } from './types';

interface GenerationDeps {
  getTimelineItems(): TimelineItem[];
  setTimelineItems(items: TimelineItem[]): void;
  getSelectedImageItems(): MediaItem[];
  getHasSelectedImages(): boolean;
  getGenerationType(): 'image' | 'video';
  isDraftEmpty(): boolean;
  getDraft(): string;
  getStyle(): string;
  getApplyStyle(): boolean;
  getImagingMode(): ImagingMode;
  getIsGenerating(): boolean;
  setIsGenerating(value: boolean): void;
  objectUrls: ObjectUrlHandle;
  allocateId: AllocateId;
  ensureMediaItemMedia: (item: MediaItem) => Promise<Media>;
  appendMessage: (sender: 'user' | 'bot', content: string) => Promise<MessageItem>;
  videoModelStore: Writable<ImageToVideoModel>;
}

export function createGenerationActions(deps: GenerationDeps) {
  async function handleModeButtonClick() {
    if (deps.getIsGenerating() || deps.isDraftEmpty()) return;

    const prompt = composeGenerationPrompt(deps.getDraft());
    if (!prompt) return;

    if (deps.getGenerationType() === 'video' && !deps.getHasSelectedImages()) {
      toastStore.trigger({ message: '動画生成には画像を選択してください。', timeout: 2500 });
      return;
    }

    const selection = [...deps.getSelectedImageItems()];
    const promptMessage = await deps.appendMessage('user', prompt);

    if (!promptMessage) return;

    if (deps.getGenerationType() === 'video') {
      await handleGenerateVideo(prompt, promptMessage.id, selection);
    } else if (selection.length > 0) {
      await handleEditSelected(prompt, promptMessage.id, selection);
    } else {
      await handleGenerateNew(prompt, promptMessage.id);
    }
  }

  async function handleGenerateNew(prompt: string, promptId: number) {
    deps.setIsGenerating(true);
    const { placeholders, timelineItems } = createPlaceholderMediaItems({
      timelineItems: deps.getTimelineItems(),
      count: DEFAULT_IMAGE_COUNT,
      allocateId: deps.allocateId,
      promptId,
    });
    deps.setTimelineItems(timelineItems);
    try {
      const style = deps.getApplyStyle() ? deps.getStyle() : '';
      const fullPrompt = style ? `${style}\n${prompt}` : prompt;
      const canvases = await executeProcessAndNotify(
        5000,
        get(_)("generator.imageGenerated"),
        async () => await generateImage(fullPrompt, DEFAULT_IMAGE_SIZE, deps.getImagingMode(), DEFAULT_IMAGE_COUNT, DEFAULT_BACKGROUND, []),
      );

      deps.setTimelineItems(await hydratePlaceholdersWithCanvases({
        timelineItems: deps.getTimelineItems(),
        placeholders,
        canvases,
        promptId,
        allocateId: deps.allocateId,
        objectUrls: deps.objectUrls,
      }));
    } catch (error) {
      if (isContentsPolicyViolationError(error)) {
        // エラー通知は generateImage 側で行われる
      } else {
        console.error('画像生成に失敗しました', error);
        toastStore.trigger({ message: '画像生成に失敗しました。', timeout: 3000 });
      }
      deps.setTimelineItems(removeTimelineMediaItems({
        timelineItems: deps.getTimelineItems(),
        targets: placeholders,
        objectUrls: deps.objectUrls,
      }));
    } finally {
      deps.setIsGenerating(false);
    }
  }

  async function handleEditSelected(prompt: string, promptId: number, selectedItems: MediaItem[]) {
    if (selectedItems.length === 0) {
      toastStore.trigger({ message: '編集には画像を選択してください。', timeout: 2500 });
      return;
    }

    if (!supportsRefImages(deps.getImagingMode())) {
      toastStore.trigger({ message: 'このモードは参照画像に対応していません。', timeout: 2500 });
      return;
    }

    const refMax = Math.max(0, getRefMaxForMode(deps.getImagingMode()));
    if (refMax === 0) {
      toastStore.trigger({ message: '参照画像の上限により編集を実行できません。', timeout: 2500 });
      return;
    }

    const limitedItems = selectedItems.slice(0, refMax);
    deps.setIsGenerating(true);
    const { placeholders, timelineItems } = createPlaceholderMediaItems({
      timelineItems: deps.getTimelineItems(),
      count: DEFAULT_IMAGE_COUNT,
      allocateId: deps.allocateId,
      promptId,
    });
    deps.setTimelineItems(timelineItems);
    try {
      const medias = await Promise.all(limitedItems.map((item) => deps.ensureMediaItemMedia(item)));
      const canvasesForRefs = medias
        .filter((media) => media.type === 'image')
        .map((media) => media.drawSourceCanvas);

      if (canvasesForRefs.length === 0) {
        toastStore.trigger({ message: '参照画像を取得できませんでした。', timeout: 2500 });
        deps.setTimelineItems(removeTimelineMediaItems({
          timelineItems: deps.getTimelineItems(),
          targets: placeholders,
          objectUrls: deps.objectUrls,
        }));
        return;
      }

      const referenceUrls = canvasesForRefs.map((canvas) => canvas.toDataURL('image/png'));
      const baseCanvas = canvasesForRefs[0];
      const imageSize = baseCanvas
        ? { width: baseCanvas.width || DEFAULT_IMAGE_SIZE.width, height: baseCanvas.height || DEFAULT_IMAGE_SIZE.height }
        : DEFAULT_IMAGE_SIZE;

      const style = deps.getApplyStyle() ? deps.getStyle() : '';
      const fullPrompt = style ? `${style}\n${prompt}` : prompt;
      const canvases = await executeProcessAndNotify(
        5000,
        get(_)("generator.imageGenerated"),
        async () =>
          await generateImage(fullPrompt, imageSize, deps.getImagingMode(), DEFAULT_IMAGE_COUNT, 'auto', referenceUrls),
      );

      deps.setTimelineItems(await hydratePlaceholdersWithCanvases({
        timelineItems: deps.getTimelineItems(),
        placeholders,
        canvases,
        promptId,
        allocateId: deps.allocateId,
        objectUrls: deps.objectUrls,
      }));
    } catch (error) {
      if (isContentsPolicyViolationError(error)) {
        // エラー通知は generateImage 側で行われる
      } else {
        console.error('画像編集に失敗しました', error);
        toastStore.trigger({ message: '画像編集に失敗しました。', timeout: 3000 });
      }
      deps.setTimelineItems(removeTimelineMediaItems({
        timelineItems: deps.getTimelineItems(),
        targets: placeholders,
        objectUrls: deps.objectUrls,
      }));
    } finally {
      deps.setIsGenerating(false);
    }
  }

  async function handleGenerateVideo(prompt: string, promptId: number, selectedItems: MediaItem[]) {
    if (selectedItems.length === 0) {
      toastStore.trigger({ message: '動画生成には画像を選択してください。', timeout: 2500 });
      return;
    }

    const baseItem = selectedItems[0];
    deps.setIsGenerating(true);
    const { placeholders, timelineItems } = createPlaceholderMediaItems({
      timelineItems: deps.getTimelineItems(),
      count: DEFAULT_VIDEO_COUNT,
      allocateId: deps.allocateId,
      promptId,
      kind: 'video',
    });
    deps.setTimelineItems(timelineItems);
    try {
      const baseMedia = await deps.ensureMediaItemMedia(baseItem).catch((error) => {
        console.error('Failed to load base media for video generation', error);
        return null;
      });
      if (!baseMedia || baseMedia.type !== 'image') {
        toastStore.trigger({ message: '動画生成には画像メディアが必要です。', timeout: 2500 });
        deps.setTimelineItems(removeTimelineMediaItems({
          timelineItems: deps.getTimelineItems(),
          targets: placeholders,
          objectUrls: deps.objectUrls,
        }));
        return;
      }

      const resizedCanvas = resizeCanvasIfNeeded(baseMedia.drawSourceCanvas, DEFAULT_VIDEO_SOURCE_MAX);
      const model = get(deps.videoModelStore);
      const style = deps.getApplyStyle() ? deps.getStyle() : '';
      const fullPrompt = style ? `${style}\n${prompt}` : prompt;
      const request: ImageToVideoRequest = {
        prompt: fullPrompt,
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
        get(_)("generator.videoGenerated"),
        async () => await pollMediaStatus({ mediaType: 'video', mode: request.model, requestId, model: resolvedModel }),
      );

      deps.setTimelineItems(await hydratePlaceholdersWithVideos({
        timelineItems: deps.getTimelineItems(),
        placeholders,
        pollResult,
        promptId,
        allocateId: deps.allocateId,
        objectUrls: deps.objectUrls,
      }));
    } catch (error) {
      if (isContentsPolicyViolationError(error)) {
        // エラー通知は generateImage 側で行われる
      } else {
        console.error('動画生成に失敗しました', error);
        toastStore.trigger({ message: '動画生成に失敗しました。', timeout: 3000 });
      }
      deps.setTimelineItems(removeTimelineMediaItems({
        timelineItems: deps.getTimelineItems(),
        targets: placeholders,
        objectUrls: deps.objectUrls,
      }));
    } finally {
      deps.setIsGenerating(false);
    }
  }

  return {
    handleModeButtonClick,
  };
}
