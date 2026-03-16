<script lang="ts">
  import { dropzone } from '../utils/dropzone';
  import { createCanvasFromBlob, createVideoFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
  import type { Media } from '../lib/layeredCanvas/dataModels/media';
  import { ImageMedia, VideoMedia } from '../lib/layeredCanvas/dataModels/media';
  import Gallery from '../gallery/Gallery.svelte';
  import type { GalleryItem } from '../gallery/gallery';
  import { _ } from 'svelte-i18n';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { toolTip } from '../utils/passiveToolTipStore';
  import trash from '../assets/trash.webp';

  export let referenceImages: GalleryItem[] = [];
  export let referenceMedias: Media[] = [];
  export let maxHeight: number = 300;
  export let showDeleteButton: boolean = true; // フッターの「すべて削除」ボタン
  export let itemDeletable: boolean = true;    // 各アイテムの削除ボタン

  const dispatch = createEventDispatcher();
  // GalleryItem(ローダ関数 or Media) と 実体Mediaの対応を保持
  const mediaMap: WeakMap<GalleryItem, Media[]> = new WeakMap();

  // マウスオーバートラッキング（Ctrl+Vペースト用）
  let isMouseOver = false;

  function addMediaFromBlobs(blobs: { blob: Blob, type: string }[]) {
    const newGalleryItems: GalleryItem[] = [];

    for (const { blob, type } of blobs) {
      if (type.startsWith('image/svg')) continue;

      if (type.startsWith('image/') || type.startsWith('video/')) {
        const loadMedia = async (): Promise<Media[]> => {
          let media: Media;
          if (type.startsWith('image/')) {
            const canvas = await createCanvasFromBlob(blob);
            media = new ImageMedia(canvas);
          } else {
            const video = await createVideoFromBlob(blob);
            media = new VideoMedia(video);
          }
          referenceMedias = [...referenceMedias, media];
          try {
            const existing = mediaMap.get(loadMedia) ?? [];
            mediaMap.set(loadMedia, [...existing, media]);
          } catch {}
          dispatch('update', { referenceImages, referenceMedias });
          return [media];
        };

        newGalleryItems.push(loadMedia);
      }
    }

    if (newGalleryItems.length > 0) {
      referenceImages = [...referenceImages, ...newGalleryItems];
      dispatch('update', { referenceImages, referenceMedias });
    }
  }

  async function onFileDrop(files: FileList) {
    const blobs = Array.from(files).map(f => ({ blob: f as Blob, type: f.type }));
    addMediaFromBlobs(blobs);
  }

  // ペーストイベントハンドラ（マウスオーバー時にクリップボードから画像を受け取る）
  async function onWindowPaste(event: ClipboardEvent) {
    if (!isMouseOver) return;
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const blobs: { blob: Blob, type: string }[] = [];
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (!file) continue;
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          blobs.push({ blob: file, type: file.type });
        }
      }
    }

    if (blobs.length > 0) {
      event.preventDefault();
      addMediaFromBlobs(blobs);
    }
  }

  onMount(() => {
    window.addEventListener('paste', onWindowPaste);
  });

  onDestroy(() => {
    window.removeEventListener('paste', onWindowPaste);
  });

  function onReferenceImageDelete(e: CustomEvent<GalleryItem>) {
    // Galleryアイテムと対応するメディアを削除（マップベースで確実に対応づけ）
    const item = e.detail as GalleryItem;
    const mediasToRemove = mediaMap.get(item) ?? [];
    if (mediasToRemove.length > 0) {
      referenceMedias = referenceMedias.filter(m => !mediasToRemove.includes(m));
    }
    // アイテム自体を削除
    referenceImages = referenceImages.filter(i => i !== item);
    // マップのクリーンアップ
    mediaMap.delete(item);

    // 親コンポーネントに変更を通知
    dispatch('update', {
      referenceImages,
      referenceMedias
    });
  }

  function onClearAll() {
    referenceImages = [];
    referenceMedias = [];
    // マップのクリアは不要（WeakMapなので参照がなくなればGCされる）

    // 親コンポーネントに変更を通知
    dispatch('update', {
      referenceImages,
      referenceMedias
    });
  }
</script>

<div class="reference-container">
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="reference-images-container" use:dropzone={onFileDrop} style="max-height: {maxHeight}px;"
    on:mouseenter={() => isMouseOver = true}
    on:mouseleave={() => isMouseOver = false}
  >
    {#if referenceImages.length > 0}
      <Gallery
        columnWidth={100}
        referable={false}
        accessable={itemDeletable}
        viewable={false}
        items={referenceImages}
        on:delete={onReferenceImageDelete}
      />
    {:else}
      <div class="empty-state">
        <p class="empty-message">{$_('dialogs.textEdit.dropReferenceImages')}</p>
      </div>
    {/if}
  </div>

  {#if referenceMedias.length > 0}
    <div class="footer">
      <div class="image-count">
        {$_('dialogs.textEdit.referenceImageCount')}: {referenceMedias.length}
      </div>
      {#if showDeleteButton}
        <button
          class="clear-all-button"
          on:click={onClearAll}
          use:toolTip={'すべての参照画像を削除'}
        >
          <img src={trash} alt="Clear all" />
          <span>すべて削除</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .reference-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .reference-images-container {
    min-height: 150px;
    overflow-y: auto;
    border: 2px dashed rgb(var(--color-surface-300));
    border-radius: 8px;
    padding: 12px;
    background: rgb(var(--color-surface-50));
    transition: all 0.2s ease;
  }

  :global(.reference-images-container.drag-over) {
    background-color: rgba(0, 123, 255, 0.1) !important;
    border-color: rgb(var(--color-primary-400)) !important;
    border-style: solid !important;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
  }

  .empty-message {
    color: rgb(var(--color-surface-500));
    font-size: 14px;
    text-align: center;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px;
  }

  .image-count {
    font-size: 12px;
    color: rgb(var(--color-surface-600));
    font-weight: 500;
  }

  .clear-all-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background-color: rgb(var(--color-error-500));
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;
  }

  .clear-all-button:hover {
    background-color: rgb(var(--color-error-600));
    transform: scale(1.05);
  }

  .clear-all-button:active {
    transform: scale(0.95);
  }

  .clear-all-button img {
    width: 16px;
    height: 16px;
    filter: brightness(0) invert(1);
  }

  .clear-all-button span {
    font-weight: 500;
  }
  /* ここでのビューアは無効（Galleryのviewable={false}で制御） */
</style>
