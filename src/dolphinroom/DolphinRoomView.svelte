<script lang="ts">
import Drawer from '../utils/Drawer.svelte';
import TimelineItemView from './TimelineItemView.svelte';
import ImagingModes from '../generator/ImagingModes.svelte';
import VideoGenerationModes from '../generator/VideoGenerationModes.svelte';
import MaterialBucketContent from '../materialBucket/MaterialBucketContent.svelte';
import { RadioGroup, RadioItem, SlideToggle } from '@skeletonlabs/skeleton';
import type { TimelineRow, MediaItem } from './timelineTypes';
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
        aria-label="ドルフィンルームのタイムライン"
        on:dragover|preventDefault
        on:drop={handleDrop}
        on:paste={handlePaste}
        tabindex="-1"
      >
        <header class="room-header">
          <div class="header-text">
            <h2>ドルフィンルーム</h2>
            <p>チャットで気軽にアイデアを整理しましょう。</p>
          </div>
          <div class="header-actions">
            <SlideToggle
              name="material-bucket-toggle"
              bind:checked={materialBucketOpen}
              size="sm"
            >
              素材集
            </SlideToggle>
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
            {captureCurrentFrame}
            {handleMediaDragStartEvent}
            {registerMediaElement}
            {deleteMediaItem}
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
          <div
            class="model-item"
            class:inactive={generationType !== 'image'}
            aria-disabled={generationType !== 'image'}
          >
            <span class="model-label">画像</span>
            <ImagingModes
              bind:mode={imagingMode}
              group="imaging"
              width={240}
              disabled={generationType !== 'image'}
              {imageSize}
            />
          </div>
          <div
            class="model-item"
            class:inactive={generationType !== 'video'}
            aria-disabled={generationType !== 'video'}
          >
            <span class="model-label">動画</span>
            <VideoGenerationModes
              model={videoModel}
              options={videoModelOptions}
              width={240}
              disabled={generationType !== 'video'}
              duration={videoDuration}
              resolution={videoResolution}
              aspectRatio={videoAspectRatio}
              sourceSize={videoSourceSize}
              on:change={(event) => onVideoModelChange(event.detail)}
            />
          </div>
        </div>
        <div class="input-row">
          <div class="input-wrapper">
            <textarea
              id="dolphin-room-message"
              placeholder="メッセージを入力してください"
              bind:value={draft}
              on:paste={handleTextareaPaste}
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
              disabled={!!generationDisableReason}
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

  .model-item.inactive {
    opacity: 0.55;
  }

  .model-label {
    white-space: nowrap;
    font-weight: 600;
  }

  .model-item :global(.imaging-modes) {
    flex: 1;
    min-width: 180px;
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
