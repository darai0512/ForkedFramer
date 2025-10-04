<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { MediaItem } from './timelineTypes';

  import downloadIcon from '../assets/download.webp';
  import clipboardIcon from '../assets/clipboard.webp';
  import popupIcon from '../assets/filmlist/popup.webp';
  import punchIcon from '../assets/filmlist/punch.webp';

  export let mediaItem: MediaItem;
  export let isProcessing = false;

  const dispatch = createEventDispatcher<{
    download: void;
    copy: void;
    punch: void;
  }>();

  let menuOpen = false;
  let triggerButton: HTMLButtonElement | null = null;
  let menuElement: HTMLDivElement | null = null;

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

  function handleDownload(event: MouseEvent) {
    event.stopPropagation();
    dispatch('download');
    closeMenu();
  }

  function handleCopy(event: MouseEvent) {
    event.stopPropagation();
    dispatch('copy');
    closeMenu();
  }

  function handlePunch(event: MouseEvent) {
    event.stopPropagation();
    dispatch('punch');
    closeMenu();
  }
</script>

<button
  type="button"
  class="media-action-trigger"
  class:loading={isProcessing}
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
      disabled={isProcessing}
      role="menuitem"
    >
      <img src={downloadIcon} alt="ダウンロード" />
      <span>ダウンロード</span>
    </button>
    <button
      type="button"
      class="media-action-item"
      on:click={handleCopy}
      disabled={isProcessing}
      role="menuitem"
    >
      <img src={clipboardIcon} alt="クリップボードにコピー" />
      <span>クリップボードにコピー</span>
    </button>
    {#if mediaItem.kind === 'image'}
      <button
        type="button"
        class="media-action-item"
        on:click={handlePunch}
        disabled={isProcessing}
        role="menuitem"
      >
        <img src={punchIcon} alt="背景除去" />
        <span>背景除去</span>
      </button>
    {/if}
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
