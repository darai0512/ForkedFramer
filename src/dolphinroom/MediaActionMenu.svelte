<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { toastStore } from '@skeletonlabs/skeleton';
  import { canvasToBlob } from '../lib/layeredCanvas/tools/imageUtil';
  import { getVideoElementFromMedia, type Media } from '../lib/layeredCanvas/dataModels/media';
  import type { MediaItem } from './timelineTypes';

  import downloadIcon from '../assets/download.webp';
  import clipboardIcon from '../assets/clipboard.webp';
  import popupIcon from '../assets/filmlist/popup.webp';

  export let mediaItem: MediaItem;

  let menuOpen = false;
  let triggerButton: HTMLButtonElement | null = null;
  let menuElement: HTMLDivElement | null = null;
  let activeAction: 'copy' | 'download' | null = null;

  function toggleMenu(event: MouseEvent) {
    event.stopPropagation();
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }

  function handleDocumentClick(event: MouseEvent) {
    if (!menuOpen) return;
    const target = event.target as Node;
    if (triggerButton?.contains(target) || menuElement?.contains(target)) {
      return;
    }
    menuOpen = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!menuOpen) return;
    if (event.key === 'Escape') {
      menuOpen = false;
    }
  }

  onMount(() => {
    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('keydown', handleKeydown, true);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleDocumentClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
  });

  async function handleDownload(event: MouseEvent) {
    event.stopPropagation();
    await runWithAction('download', async () => {
      const payload = await resolveMediaBlob(mediaItem);
      if (!payload) {
        toastStore.trigger({ message: 'ダウンロードできるデータが見つかりませんでした', timeout: 2000 });
        return;
      }

      const { blob, filename } = payload;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  }

  async function handleCopy(event: MouseEvent) {
    event.stopPropagation();
    await runWithAction('copy', async () => {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        toastStore.trigger({ message: 'クリップボードへコピーできません', timeout: 2000 });
        return;
      }

      const payload = await resolveMediaBlob(mediaItem, true);
      if (!payload) {
        toastStore.trigger({ message: 'コピーできるデータが見つかりませんでした', timeout: 2000 });
        return;
      }

      const { blob } = payload;
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'application/octet-stream']: blob })]);
        toastStore.trigger({ message: 'クリップボードにコピーしました', timeout: 1600 });
      } catch (error) {
        console.error('Failed to write clipboard', error);
        toastStore.trigger({ message: 'クリップボードへのコピーに失敗しました', timeout: 2000 });
      }
    });
  }

  async function runWithAction(action: 'copy' | 'download', work: () => Promise<void>) {
    if (activeAction) return;
    activeAction = action;
    try {
      await work();
    } finally {
      activeAction = null;
      closeMenu();
    }
  }

  async function resolveMediaBlob(item: MediaItem, preferPng = false): Promise<{ blob: Blob; filename: string } | null> {
    const baseName = createBaseFileName(item);

    if (item.file) {
      const originalName = item.file.name?.trim();
      return {
        blob: item.file,
        filename: originalName && originalName.length > 0
          ? originalName
          : ensureExtension(baseName, item.file.type || guessExtensionFromKind(item.kind)),
      };
    }

    const media = item.media;
    if (media) {
      const result = await fromMedia(media, item, baseName, preferPng);
      if (result) return result;
    }

    if (item.url) {
      try {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error(`Failed to fetch media: ${response.status}`);
        const blob = await response.blob();
        return {
          blob,
          filename: ensureExtension(baseName, blob.type || guessExtensionFromKind(item.kind)),
        };
      } catch (error) {
        console.error('Failed to download media from URL', error);
        return null;
      }
    }

    return null;
  }

  async function fromMedia(media: Media, item: MediaItem, baseName: string, preferPng: boolean) {
    if (media.type === 'image') {
      try {
        const blob = await canvasToBlob(media.drawSourceCanvas, preferPng ? 'image/png' : undefined);
        return {
          blob,
          filename: ensureExtension(baseName, blob.type || 'image/png'),
        };
      } catch (error) {
        console.error('Failed to convert image canvas', error);
        return null;
      }
    }

    if (media.type === 'video') {
      const videoElement = getVideoElementFromMedia(media);
      const src = videoElement?.src ?? item.url;
      if (!src) {
        return null;
      }
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);
        const blob = await response.blob();
        return {
          blob,
          filename: ensureExtension(baseName, blob.type || 'video/mp4'),
        };
      } catch (error) {
        console.error('Failed to retrieve video', error);
        return null;
      }
    }

    return null;
  }

  function createBaseFileName(item: MediaItem): string {
    if (item.name?.trim()) return item.name.trim();
    const timestamp = new Date(item.timestamp).toISOString().replace(/[:T]/g, '-').split('.')[0];
    return `${item.kind}-${timestamp}`;
  }

  function ensureExtension(name: string, mimeOrKind: string): string {
    const normalizedName = name.trim();
    const extension = deriveExtension(mimeOrKind);
    if (!extension) return normalizedName;
    if (normalizedName.toLowerCase().endsWith(extension)) return normalizedName;
    return `${normalizedName}${extension}`;
  }

  function deriveExtension(mimeOrKind: string): string {
    const value = mimeOrKind.toLowerCase();
    if (value.includes('png')) return '.png';
    if (value.includes('jpeg') || value.includes('jpg')) return '.jpg';
    if (value.includes('webp')) return '.webp';
    if (value.includes('gif')) return '.gif';
    if (value.includes('mp4')) return '.mp4';
    if (value.includes('webm')) return '.webm';
    if (value.includes('video')) return '.mp4';
    if (value.includes('image')) return '.png';
    if (value === 'image') return '.png';
    if (value === 'video') return '.mp4';
    return '';
  }

  function guessExtensionFromKind(kind: MediaItem['kind']): string {
    return kind === 'video' ? 'video/mp4' : 'image/png';
  }
</script>

<button
  type="button"
  class="media-action-trigger"
  class:loading={!!activeAction}
  bind:this={triggerButton}
  on:click={toggleMenu}
  aria-expanded={menuOpen}
  aria-label="メディア操作メニュー"
>
  <img src={popupIcon} alt="" />
</button>

{#if menuOpen}
  <div
    class="media-action-menu"
    bind:this={menuElement}
    role="menu"
    aria-label="メディア操作"
    on:click|stopPropagation
  >
    <button
      type="button"
      class="media-action-item"
      on:click={handleDownload}
      disabled={activeAction === 'copy'}
      role="menuitem"
    >
      <img src={downloadIcon} alt="ダウンロード" />
      <span>{activeAction === 'download' ? 'ダウンロード中…' : 'ダウンロード'}</span>
    </button>
    <button
      type="button"
      class="media-action-item"
      on:click={handleCopy}
      disabled={activeAction === 'download'}
      role="menuitem"
    >
      <img src={clipboardIcon} alt="クリップボードにコピー" />
      <span>{activeAction === 'copy' ? 'コピー中…' : 'クリップボードにコピー'}</span>
    </button>
  </div>
{/if}

<style>
  .media-action-trigger {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 32px;
    height: 32px;
    border-radius: 9999px;
    border: none;
    background: rgba(15, 23, 42, 0.75);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.15s ease, transform 0.15s ease;
  }

  .media-action-trigger img {
    width: 18px;
    height: 18px;
    filter: invert(1);
  }

  .media-action-trigger:hover,
  .media-action-trigger:focus-visible {
    background: rgba(30, 64, 175, 0.85);
    transform: translateY(-1px);
    outline: none;
  }

  .media-action-trigger[aria-expanded="true"] {
    background: rgba(30, 64, 175, 0.9);
  }

  .media-action-trigger.loading {
    pointer-events: none;
    opacity: 0.6;
  }

  .media-action-menu {
    position: absolute;
    right: 0;
    bottom: 42px;
    display: flex;
    flex-direction: column;
    padding: 0.45rem 0.35rem;
    gap: 0.1rem;
    min-width: 180px;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 10px;
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.28);
    border: 1px solid rgba(15, 23, 42, 0.08);
    z-index: 20;
  }

  .media-action-menu::before {
    content: '';
    position: absolute;
    bottom: -8px;
    right: 12px;
    width: 16px;
    height: 16px;
    background: inherit;
    border-left: 1px solid rgba(15, 23, 42, 0.08);
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    transform: rotate(45deg);
    z-index: -1;
  }

  .media-action-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    font-size: 0.9rem;
    color: rgb(var(--color-surface-900));
  }

  .media-action-item img {
    width: 20px;
    height: 20px;
  }

  .media-action-item:hover,
  .media-action-item:focus-visible {
    background: rgba(59, 130, 246, 0.12);
    outline: none;
  }

  .media-action-item:disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
