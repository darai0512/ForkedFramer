<script lang="ts">
import { _ } from 'svelte-i18n';
import Drawer from '../utils/Drawer.svelte';
import TimelineItemView from './TimelineItemView.svelte';
import MediaFrame from '../gallery/MediaFrame.svelte';
import ImagingModes from '../generator/ImagingModes.svelte';
import VideoGenerationModes from '../generator/VideoGenerationModes.svelte';
import MaterialBucketContent from '../materialBucket/MaterialBucketContent.svelte';
import PlainDropdown from '../utils/PlainDropdown.svelte';
import SliderEdit from '../utils/SliderEdit.svelte';
import { RadioGroup, RadioItem, SlideToggle } from '@skeletonlabs/skeleton';
import { slide } from 'svelte/transition';
import type { TimelineRow, MediaItem } from './timelineTypes';
import { promptHistory as promptHistoryAction } from '../utils/promptHistoryAction';
import { persistentText } from '../utils/persistentText';
import type {
  ImagingMode,
  ImageToVideoModel,
  ImageToVideoRequest,
  ImageToVideoResolution,
} from '$protocolTypes/imagingTypes';

export let open = false;
let materialBucketOpen = false;
let materialBucketContentRef: MaterialBucketContent | null = null;
export let logElement: HTMLDivElement | null = null;
export let timelineRows: TimelineRow[] = [];
export let capturingMediaIds = new Set<number>();
export let messageHeading = '';
export let generationDisableReason = '';
export let isDraftEmpty = true;
export let isGenerating = false;
export let hasSelectedImages = false;
export let draft = '';
export let imagingMode: ImagingMode = 'schnell';
export let generationType: 'image' | 'video' = 'image';
export let videoModel: ImageToVideoModel = 'FramePack';
export let videoModelOptions: Array<{ value: ImageToVideoModel; label: string; devOnly?: boolean }> = [];
export let imageSize: { width: number; height: number } = { width: 1024, height: 1024 };
export let videoSourceSize: { width: number; height: number } = { width: 1024, height: 1024 };
export let videoDuration: ImageToVideoRequest['duration'] = '5';
export let videoResolution: ImageToVideoResolution = '720p';
export let videoAspectRatio: ImageToVideoRequest['aspectRatio'] = '16:9';
export let onVideoModelChange: (model: ImageToVideoModel) => void = () => {};

export let onClose: () => void = () => {};
export let toggleMediaSelection: (itemId: number) => void = () => {};
export let captureCurrentFrame: (item: MediaItem) => void = () => {};
export let handleMediaDragStartEvent: (event: Event, item: MediaItem) => void = () => {};
export let registerMediaElement: (id: number, element: HTMLButtonElement | null) => void = () => {};
export let deleteMediaItem: (item: MediaItem) => void = () => {};
export let handleDeleteGroup: (event: CustomEvent<{ messageId: number }>) => void = () => {};
export let handleModeButtonClick: () => void = () => {};
export let handleSubmit: (event: Event) => void = () => {};
export let handleDrop: (event: DragEvent) => void = () => {};
export let handlePaste: (event: ClipboardEvent) => void = () => {};
export let loadTemplateImage: (url: string) => Promise<void> = async () => {};
export let style: string = '';
export let applyStyle: boolean = true;
export let promptSubmitTrigger: number = 0;
export let imageWidth: number = 1024;
export let imageHeight: number = 1024;
export let batchCount: number = 1;

function clearAllSelections() {
  const selectedItems: MediaItem[] = [];
  for (const block of timelineRows) {
    if (block.kind === 'media-grid' || block.kind === 'message-media') {
      const items = block.kind === 'media-grid' ? block.items : block.items;
      selectedItems.push(...items.filter(item => item.selected));
    }
  }
  for (const item of selectedItems) {
    toggleMediaSelection(item.id);
  }
}

// More options
let showMoreOptions = false;

$: imageTemplates = [
  {
    id: 'lineArt',
    label: $_('dolphinRoom.templates.lineArt'),
    imagingMode: 'nano-banana' as ImagingMode,
    prompt: $_('dolphinRoom.templates.lineArtPrompt'),
    applyStyle: false,
  },
  {
    id: 'characterSheet',
    label: $_('dolphinRoom.templates.characterSheet'),
    imagingMode: 'nano-banana' as ImagingMode,
    prompt: $_('dolphinRoom.templates.characterSheetPrompt'),
    templateImageUrl: '/assets/charactersheet.webp',
  },
];

$: videoTemplates = [
  {
    id: 'turntable',
    label: $_('dolphinRoom.templates.turntable'),
    videoModel: 'seedance/lite' as ImageToVideoModel,
    prompt: $_('dolphinRoom.templates.turntablePrompt'),
  },
];

// テンプレート選択用のオプション
let selectedTemplate = '';
$: imageTemplateOptions = [
  { value: '', label: $_('dolphinRoom.generation.selectTemplate') },
  ...imageTemplates.map(t => ({ value: t.id, label: t.label })),
];
$: videoTemplateOptions = [
  { value: '', label: $_('dolphinRoom.generation.selectTemplate') },
  ...videoTemplates.map(t => ({ value: t.id, label: t.label })),
];

$: templateOptions = generationType === 'image' ? imageTemplateOptions : videoTemplateOptions;

// プロンプト履歴用のバインディング
let draftBinding = {
  get value() {
    return draft;
  },
  set value(newValue: string) {
    draft = newValue;
  }
};

function handleTextareaPaste(event: ClipboardEvent) {
  handlePaste(event);
  // 画像がペーストされた場合は既にpreventDefaultされているので
  // 伝播を止めて親のペーストハンドラが実行されないようにする
  if (event.defaultPrevented) {
    event.stopPropagation();
  }
}

function handleMaterialBucketDragStart() {
  // MaterialBucketからのドラッグ開始時の処理（必要に応じて追加）
}

async function handleAddCollection() {
  if (materialBucketContentRef) {
    await materialBucketContentRef.addCollection();
  }
}

// テンプレート選択時の処理
async function applyTemplate(templateId: string) {
  if (!templateId) return;

  if (generationType === 'image') {
    const template = imageTemplates.find(t => t.id === templateId);
    if (template) {
      if (template.imagingMode !== undefined) {
        imagingMode = template.imagingMode;
      }
      draft = template.prompt;
      if (template.applyStyle !== undefined) {
        applyStyle = template.applyStyle;
      }

      // テンプレート画像がある場合、画像を読み込む
      if (template.templateImageUrl) {
        await loadTemplateImage(template.templateImageUrl);
      }
    }
  } else if (generationType === 'video') {
    const template = videoTemplates.find(t => t.id === templateId);
    if (template) {
      if (template.videoModel !== undefined) {
        onVideoModelChange(template.videoModel);
      }
      draft = template.prompt;
    }
  }
}

$: if (selectedTemplate) {
  applyTemplate(selectedTemplate);
  selectedTemplate = '';
}
</script>

<Drawer
  placement="right"
  {open}
  size={materialBucketOpen ? "1200px" : "800px"}
  on:clickAway={onClose}
  hideOverlayOnDrag
>
  {#if open}
    <div class="dolphin-room-wrapper">
      {#if materialBucketOpen}
        <div class="material-bucket-panel">
          <MaterialBucketContent
            bind:this={materialBucketContentRef}
            galleryColumnWidth={100}
            on:dragstart={handleMaterialBucketDragStart}
            on:addcollection={handleAddCollection}
          />
        </div>
      {/if}
      <div
        class="dolphin-room-container"
        role="region"
        aria-label={$_('dolphinRoom.title')}
        on:dragover|preventDefault
        on:drop={handleDrop}
        on:paste={handlePaste}
        tabindex="-1"
      >
        <header class="room-header">
          <div class="header-text">
            <h2>{$_('dolphinRoom.title')}</h2>
          </div>
          <div class="header-actions">
            <SlideToggle
              name="material-bucket-toggle"
              bind:checked={materialBucketOpen}
              size="sm"
            >
              {$_('dolphinRoom.header.materialBucket')}
            </SlideToggle>
          </div>
        </header>

      <div class="timeline-wrapper">
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
              {captureCurrentFrame}
              {handleMediaDragStartEvent}
              {registerMediaElement}
              {deleteMediaItem}
              on:deleteGroup={handleDeleteGroup}
            />
          {/each}
          {#if timelineRows.length === 0}
            <div class="empty-state">
              <p>{$_('dolphinRoom.timeline.emptyState')}</p>
            </div>
          {/if}
        </div>
        {#if hasSelectedImages}
          <div class="selected-images-panel">
            <div class="selected-images-header">{$_('dolphinRoom.timeline.selected')}</div>
            <div class="selected-images-list">
              {#each timelineRows as block}
                {#if block.kind === 'media-grid' || block.kind === 'message-media'}
                  {@const items = block.kind === 'media-grid' ? block.items : block.items}
                  {#each items.filter(item => item.selected && item.kind === 'image') as selectedItem (selectedItem.id)}
                    <button
                      type="button"
                      class="selected-thumbnail"
                      on:click={() => toggleMediaSelection(selectedItem.id)}
                      title={$_('dolphinRoom.timeline.clickToDeselect')}
                    >
                      {#if selectedItem.media}
                        <MediaFrame
                          media={selectedItem.media}
                          showControls={false}
                          dragAsImage={false}
                        />
                      {:else}
                        <div class="thumbnail-placeholder">
                          <div class="spinner-small" />
                        </div>
                      {/if}
                    </button>
                  {/each}
                {/if}
              {/each}
            </div>
            <button
              type="button"
              class="clear-all-button"
              on:click={clearAllSelections}
              title={$_('dolphinRoom.timeline.clearAll')}
            >
              {$_('dolphinRoom.timeline.clearAll')}
            </button>
          </div>
        {/if}
      </div>

      <form class="generation-form" on:submit={handleSubmit}>
        <div class="model-row" role="group" aria-label={$_('dolphinRoom.generation.template')}>
          {#if generationType === 'image'}
            <div class="model-item">
              <span class="model-label">{$_('dolphinRoom.generation.image')}</span>
              <ImagingModes
                bind:mode={imagingMode}
                group="imaging"
                width={240}
                disabled={false}
                {imageSize}
              />
            </div>
          {/if}
          {#if generationType === 'video'}
            <div class="model-item">
              <span class="model-label">{$_('dolphinRoom.generation.video')}</span>
              <VideoGenerationModes
                model={videoModel}
                options={videoModelOptions}
                width={240}
                disabled={false}
                duration={videoDuration}
                resolution={videoResolution}
                aspectRatio={videoAspectRatio}
                sourceSize={videoSourceSize}
                on:change={(event) => onVideoModelChange(event.detail)}
              />
            </div>
          {/if}
          <div class="model-item">
            <span class="model-label">{$_('dolphinRoom.generation.template')}</span>
            <PlainDropdown
              options={templateOptions}
              bind:selectedValue={selectedTemplate}
              placeholder={$_('dolphinRoom.generation.selectTemplate')}
              width={180}
            />
          </div>
          <button
            type="button"
            class="more-button"
            on:click={() => showMoreOptions = !showMoreOptions}
            aria-label={$_('dolphinRoom.generation.more')}
            aria-expanded={showMoreOptions}
          >
            <span class="more-icon">{showMoreOptions ? '▲' : '▼'}</span>
            <span>{$_('dolphinRoom.generation.more')}</span>
          </button>
        </div>
        {#if showMoreOptions}
          <div class="more-options-panel" transition:slide={{ duration: 200 }}>
            {#if generationType === 'image'}
              <div class="style-row">
                <div class="style-label-wrapper">
                  <span class="style-label">{$_('dolphinRoom.generation.style')}</span>
                  <input
                    type="checkbox"
                    class="style-checkbox"
                    bind:checked={applyStyle}
                    aria-label={$_('dolphinRoom.generation.applyStyle')}
                  />
                </div>
                <input
                  type="text"
                  class="style-input"
                  bind:value={style}
                  use:persistentText={{store:'imaging', key:'style', onLoad: (v) => style = v}}
                  placeholder={$_('dolphinRoom.generation.stylePlaceholder')}
                  aria-label={$_('dolphinRoom.generation.style')}
                  disabled={!applyStyle}
                />
              </div>
              <div class="sliders-wrapper">
                <div class="size-sliders">
                  <SliderEdit label={$_('dolphinRoom.options.width')} bind:value={imageWidth} min={512} max={1536} step={128}/>
                  <SliderEdit label={$_('dolphinRoom.options.height')} bind:value={imageHeight} min={512} max={1536} step={128}/>
                </div>
                <div class="count-slider">
                  <SliderEdit label={$_('dolphinRoom.options.imageCount')} bind:value={batchCount} min={1} max={4} step={1}/>
                </div>
              </div>
            {/if}
          </div>
        {/if}
        <div class="input-row">
          <div class="input-wrapper">
            <div class="history-hint">{$_('dolphinRoom.generation.historyHint')}</div>
            <textarea
              id="dolphin-room-message"
              placeholder={$_('dolphinRoom.generation.promptPlaceholder')}
              bind:value={draft}
              on:paste={handleTextareaPaste}
              use:promptHistoryAction={{ storeKey: 'dolphinRoomPromptHistory', valueBinding: draftBinding, submitTrigger: promptSubmitTrigger }}
              aria-label={$_('dolphinRoom.generation.promptPlaceholder')}
              rows={5}
            />
          </div>
          <div class="action-panel">
            <div class="action-panel-main">
              <RadioGroup class="generation-toggle" regionLabel={$_('dolphinRoom.generation.imageType')}>
                <RadioItem
                  name="dolphin-generation-type"
                  value="image"
                  bind:group={generationType}
                  label={$_('dolphinRoom.generation.typeLabel.image')}
                >
                  {$_('dolphinRoom.generation.imageType')}
                </RadioItem>
                <RadioItem
                  name="dolphin-generation-type"
                  value="video"
                  bind:group={generationType}
                  label={$_('dolphinRoom.generation.typeLabel.video')}
                >
                  {$_('dolphinRoom.generation.videoType')}
                </RadioItem>
              </RadioGroup>
              <button
                type="button"
                class="btn send-button mode-button"
                class:editing={generationType === 'image' && hasSelectedImages}
                title={generationType === 'video'
                  ? (hasSelectedImages ? (isGenerating ? $_('dolphinRoom.tooltip.generating') : $_('dolphinRoom.tooltip.videoWithImage')) : $_('dolphinRoom.tooltip.videoNoImage'))
                  : hasSelectedImages
                    ? (isGenerating ? $_('dolphinRoom.tooltip.generating') : $_('dolphinRoom.tooltip.imageWithSelection'))
                    : (isGenerating ? $_('dolphinRoom.tooltip.generating') : $_('dolphinRoom.tooltip.imageNoSelection'))}
                disabled={!!generationDisableReason}
                on:click={handleModeButtonClick}
                aria-busy={isGenerating}
              >
                {messageHeading}
              </button>
              {#if generationDisableReason}
                <p class="action-note" role="status">{generationDisableReason}</p>
              {/if}
            </div>
            <!-- 発言ボタン: 一旦非表示 -->
            <!-- <button type="submit" class="btn send-button speak-button" disabled={isDraftEmpty}>発言</button> -->
          </div>
        </div>
      </form>
      </div>
    </div>
  {/if}
</Drawer>

<style>
  .dolphin-room-wrapper {
    display: flex;
    height: 100%;
    width: 100%;
  }

  .material-bucket-panel {
    width: 400px;
    flex-shrink: 0;
    border-right: 1px solid rgb(var(--color-surface-300));
    background-color: rgb(var(--color-surface-100));
    overflow-y: auto;
  }

  .dolphin-room-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    flex: 1;
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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .room-header h2 {
    font-size: 1.4rem;
    font-weight: 600;
    margin: 0;
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

  .timeline-wrapper {
    flex: 1;
    display: flex;
    gap: 0.75rem;
    overflow: hidden;
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

  .selected-images-panel {
    width: 120px;
    flex-shrink: 0;
    background-color: rgb(var(--color-surface-100));
    border-radius: 12px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
  }

  .selected-images-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgb(var(--color-surface-600));
    text-align: center;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid rgb(var(--color-surface-300));
  }

  .selected-images-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .selected-thumbnail {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid rgba(37, 99, 235, 0.5);
    background-image:
      linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
      linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
    background-size: 10px 10px;
    background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
    background-color: #f3f4f6;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .selected-thumbnail:hover {
    transform: scale(0.95);
    border-color: rgba(220, 38, 38, 0.7);
  }

  .selected-thumbnail :global(.media-frame) {
    width: 100%;
    height: 100%;
  }

  .selected-thumbnail :global(.media-element) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.05);
  }

  .spinner-small {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid rgba(148, 163, 184, 0.3);
    border-top-color: rgba(59, 130, 246, 0.8);
    animation: attachment-spin 1s linear infinite;
  }

  @keyframes attachment-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .clear-all-button {
    width: 100%;
    padding: 0.5rem;
    border: none;
    border-radius: 6px;
    background-color: rgb(var(--color-surface-200));
    color: rgb(var(--color-surface-700));
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, transform 0.15s ease;
    margin-top: 0.25rem;
  }

  .clear-all-button:hover {
    background-color: rgb(var(--color-error-200));
    color: rgb(var(--color-error-700));
    transform: translateY(-1px);
  }

  .clear-all-button:active {
    transform: translateY(0);
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
    flex-direction: column;
    gap: 0.3rem;
  }

  .history-hint {
    font-size: 0.72rem;
    color: rgb(var(--color-surface-500));
    padding-left: 0.3rem;
  }

  .action-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 180px;
  }

  .action-panel-main {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .action-panel-main button {
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

  /* 発言ボタンのスタイル（現在非表示） */
  /*
  .speak-button {
    background-color: rgb(var(--color-tertiary-500, 16 185 129));
    box-shadow: 0 6px 14px rgb(var(--color-tertiary-500, 16 185 129) / 0.22);
  }

  .speak-button:hover,
  .speak-button:focus-visible {
    box-shadow: 0 8px 18px rgb(var(--color-tertiary-500, 16 185 129) / 0.28);
  }
  */

  .style-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .style-label-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .style-label {
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.85rem;
    color: rgb(var(--color-surface-600));
  }

  .style-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .style-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid rgb(var(--color-surface-400));
    background-color: white;
    font-size: 0.9rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .style-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: rgb(var(--color-surface-200));
  }

  .style-input:focus {
    outline: none;
    border-color: rgb(var(--color-primary-500));
    box-shadow: 0 0 0 2px rgba(var(--color-primary-500), 0.12);
  }

  .style-input::placeholder {
    color: rgb(var(--color-surface-400));
  }
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }

  .more-button {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    border: none;
    background-color: transparent;
    color: rgb(var(--color-surface-500));
    font-size: 0.75rem;
    font-weight: 400;
    cursor: pointer;
    transition: color 0.15s ease;
    white-space: nowrap;
  }

  .more-button:hover {
    color: rgb(var(--color-surface-700));
  }

  .more-button:focus {
    outline: none;
  }

  .more-icon {
    font-size: 0.6rem;
    transition: transform 0.2s ease;
  }

  .more-options-panel {
    padding: 0.75rem;
    background-color: rgb(var(--color-surface-100));
    border-radius: 0.5rem;
    border: 1px solid rgb(var(--color-surface-300));
  }

  .sliders-wrapper {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .size-sliders {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 400px;
  }

  .count-slider {
    display: flex;
    flex-direction: column;
  }
</style>
