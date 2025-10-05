<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MediaFrame from '../gallery/MediaFrame.svelte';
  import MediaActionMenu from './MediaActionMenu.svelte';
  import {
    formatTimestamp,
    type MediaItem,
    type MessageItem
  } from './timelineTypes';
  import * as mediaActions from './mediaActions';

  import dropIcon from '../assets/drop.webp';
  import telescopeIcon from '../assets/telescope.webp';

  export let messageItem: MessageItem | null = null;
  export let mediaItems: MediaItem[] | null = null;
  export let toggleMediaSelection: (id: number) => void = () => {};
  export let captureCurrentFrame: (item: MediaItem) => void = () => {};
  export let handleMediaDragStartEvent: (event: Event, item: MediaItem) => void = () => {};
  export let registerMediaElement: (id: number, element: HTMLButtonElement | null) => void = () => {};
  export let capturingMediaIds: Set<number> = new Set();
  export let deleteMediaItem: (item: MediaItem) => void = () => {};
  export let combined = false;

  const dispatch = createEventDispatcher<{
    deleteGroup: { messageId: number };
  }>();

  function mediaElementAction(node: HTMLButtonElement, elementId: number) {
    registerMediaElement(elementId, node);
    return {
      destroy() {
        registerMediaElement(elementId, null);
      }
    };
  }

  let processingMediaIds = new Set<number>();

  async function handleDownload(mediaItem: MediaItem) {
    processingMediaIds.add(mediaItem.id);
    processingMediaIds = processingMediaIds;
    try {
      await mediaActions.downloadMedia(mediaItem);
    } finally {
      processingMediaIds.delete(mediaItem.id);
      processingMediaIds = processingMediaIds;
    }
  }

  async function handleCopy(mediaItem: MediaItem) {
    processingMediaIds.add(mediaItem.id);
    processingMediaIds = processingMediaIds;
    try {
      await mediaActions.copyMediaToClipboard(mediaItem);
    } finally {
      processingMediaIds.delete(mediaItem.id);
      processingMediaIds = processingMediaIds;
    }
  }

  async function handlePunch(mediaItem: MediaItem) {
    processingMediaIds.add(mediaItem.id);
    processingMediaIds = processingMediaIds;
    try {
      await mediaActions.removeBackground(mediaItem);
      // 強制的に再描画をトリガー
      if (mediaItems) {
        mediaItems = [...mediaItems];
      }
    } finally {
      processingMediaIds.delete(mediaItem.id);
      processingMediaIds = processingMediaIds;
    }
  }

  $: groupItems = mediaItems ?? [];
  $: hasMessage = messageItem != null;
  $: hasMediaGroup = groupItems.length > 0;
  $: showCombined = combined && hasMessage && hasMediaGroup;
  $: messageTimestamp = messageItem ? formatTimestamp(messageItem.timestamp) : '';

  let expandedMediaIds = new Set<number>();
  $: {
    if (!mediaItems) {
      expandedMediaIds = new Set();
    } else {
      const validIds = new Set(mediaItems.map((item) => item.id));
      expandedMediaIds = new Set([...expandedMediaIds].filter((id) => validIds.has(id)));
      // 生成完了した画像（プレースホルダーではなくmediaを持つ）を自動的に展開する
      const completedImages = mediaItems.filter((item) => item.media && !item.placeholder);
      for (const item of completedImages) {
        if (!expandedMediaIds.has(item.id)) {
          expandedMediaIds.add(item.id);
        }
      }
      expandedMediaIds = expandedMediaIds;
    }
  }

  function toggleExpanded(mediaItem: MediaItem) {
    const next = new Set(expandedMediaIds);
    if (next.has(mediaItem.id)) {
      next.delete(mediaItem.id);
    } else {
      next.add(mediaItem.id);
    }
    expandedMediaIds = next;
  }

  function onDeleteGroup() {
    if (messageItem) {
      dispatch('deleteGroup', { messageId: messageItem.id });
    }
  }
</script>

{#if showCombined}
  <div class="message-row from-user">
    <div class="bubble media-bubble combined-bubble" role="group" class:expanded-block={expandedMediaIds.size > 0}>
      <button
        type="button"
        class="bubble-delete"
        on:click={onDeleteGroup}
        aria-label="メッセージと画像を削除"
      >
        <img src={dropIcon} alt="delete" />
      </button>
      {#if messageItem?.content}
        <p class="combined-message">{messageItem.content}</p>
      {/if}
      <div class="media-grid">
        {#each groupItems as mediaItem (mediaItem.id)}
          <div class="media-cell" class:expanded={expandedMediaIds.has(mediaItem.id)}>
            <div class="media-preview">
              <button
                type="button"
                class="attachment"
                class:image={mediaItem.kind === 'image'}
                class:video={mediaItem.kind === 'video'}
                class:selected={mediaItem.selected}
                class:expanded={expandedMediaIds.has(mediaItem.id)}
                on:click={() => toggleMediaSelection(mediaItem.id)}
                on:dragstart={(event) => handleMediaDragStartEvent(event, mediaItem)}
                aria-pressed={mediaItem.selected}
                use:mediaElementAction={mediaItem.id}
              >
                {#if mediaItem.media}
                  <div class="attachment-media">
                    <MediaFrame
                      media={mediaItem.media}
                      showControls={mediaItem.kind === 'video'}
                      dragAsImage={mediaItem.kind === 'image'}
                    />
                    {#if processingMediaIds.has(mediaItem.id)}
                      <div class="processing-overlay" aria-live="polite">
                        <div class="spinner" />
                        <span>処理中…</span>
                      </div>
                    {/if}
                  </div>
                {:else}
                  <div class="attachment-placeholder" aria-live="polite">
                    <div class="spinner" />
                    <span>{mediaItem.placeholder ? '生成中…' : '読み込み中…'}</span>
                  </div>
                {/if}
              </button>
              <MediaActionMenu
                {mediaItem}
                isProcessing={processingMediaIds.has(mediaItem.id)}
                on:download={() => handleDownload(mediaItem)}
                on:copy={() => handleCopy(mediaItem)}
                on:punch={() => handlePunch(mediaItem)}
              />
            </div>
            <button
              type="button"
              class="expand-button"
              class:expanded={expandedMediaIds.has(mediaItem.id)}
              on:click|stopPropagation={() => toggleExpanded(mediaItem)}
              aria-label={expandedMediaIds.has(mediaItem.id) ? '通常サイズに戻す' : '大きく表示'}
            >
              <img src={telescopeIcon} alt="expand" />
            </button>
            <button
              type="button"
              class="delete-button"
              on:click|stopPropagation={() => deleteMediaItem(mediaItem)}
              aria-label="メディアを削除"
            >
              <img src={dropIcon} alt="delete" />
            </button>
            {#if mediaItem.kind === 'video'}
              <div class="media-actions">
                <button
                  type="button"
                  class="capture-button"
                  on:click|stopPropagation={() => captureCurrentFrame(mediaItem)}
                  disabled={capturingMediaIds.has(mediaItem.id)}
                >
                  {capturingMediaIds.has(mediaItem.id) ? 'キャプチャ中…' : 'キャプチャ'}
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <div class="message-footer">
        <span class="timestamp">{messageTimestamp}</span>
      </div>
    </div>
  </div>
{:else if messageItem}
  <div class="message-row" class:from-user={messageItem.sender === 'user'} class:from-bot={messageItem.sender === 'bot'}>
    <div class="bubble" role="group">
      {#if messageItem.content}
        <p>{messageItem.content}</p>
      {/if}
      <div class="message-footer">
        <span class="timestamp">{formatTimestamp(messageItem.timestamp)}</span>
      </div>
    </div>
  </div>
{:else if hasMediaGroup}
  <div class="media-grid-row" class:expanded-row={expandedMediaIds.size > 0}>
    <div class="media-grid standalone-grid">
      {#each groupItems as mediaItem (mediaItem.id)}
        <div class="media-cell" class:expanded={expandedMediaIds.has(mediaItem.id)}>
          <div class="media-preview">
            <button
              type="button"
              class="attachment"
              class:image={mediaItem.kind === 'image'}
              class:video={mediaItem.kind === 'video'}
              class:selected={mediaItem.selected}
              class:expanded={expandedMediaIds.has(mediaItem.id)}
              on:click={() => toggleMediaSelection(mediaItem.id)}
              on:dragstart={(event) => handleMediaDragStartEvent(event, mediaItem)}
              aria-pressed={mediaItem.selected}
              use:mediaElementAction={mediaItem.id}
            >
              {#if mediaItem.media}
                <div class="attachment-media">
                  <MediaFrame
                    media={mediaItem.media}
                    showControls={mediaItem.kind === 'video'}
                    dragAsImage={mediaItem.kind === 'image'}
                  />
                  {#if processingMediaIds.has(mediaItem.id)}
                    <div class="processing-overlay" aria-live="polite">
                      <div class="spinner" />
                      <span>処理中…</span>
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="attachment-placeholder" aria-live="polite">
                  <div class="spinner" />
                  <span>{mediaItem.placeholder ? '生成中…' : '読み込み中…'}</span>
                </div>
              {/if}
            </button>
            <MediaActionMenu
              {mediaItem}
              isProcessing={processingMediaIds.has(mediaItem.id)}
              on:download={() => handleDownload(mediaItem)}
              on:copy={() => handleCopy(mediaItem)}
              on:punch={() => handlePunch(mediaItem)}
            />
          </div>
          <button
            type="button"
            class="expand-button"
            class:expanded={expandedMediaIds.has(mediaItem.id)}
            on:click|stopPropagation={() => toggleExpanded(mediaItem)}
            aria-label={expandedMediaIds.has(mediaItem.id) ? '通常サイズに戻す' : '大きく表示'}
          >
            <img src={telescopeIcon} alt="expand" />
          </button>
          <button
            type="button"
            class="delete-button"
            on:click|stopPropagation={() => deleteMediaItem(mediaItem)}
            aria-label="メディアを削除"
          >
            <img src={dropIcon} alt="delete" />
          </button>
          {#if mediaItem.kind === 'video'}
            <div class="media-actions">
              <button
                type="button"
                class="capture-button"
                on:click|stopPropagation={() => captureCurrentFrame(mediaItem)}
                disabled={capturingMediaIds.has(mediaItem.id)}
              >
                {capturingMediaIds.has(mediaItem.id) ? 'キャプチャ中…' : 'キャプチャ'}
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .message-row {
    display: flex;
  }

  .message-row.from-user {
    justify-content: flex-end;
  }

  .message-row.from-bot {
    justify-content: flex-start;
  }

  .bubble {
    max-width: min(72%, 560px);
    padding: 0.7rem 1rem;
    border-radius: 14px;
    background-color: rgb(var(--color-primary-200));
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: rgb(var(--color-surface-900));
    border: 2px solid transparent;
    position: relative;
  }

  .message-row.from-user .bubble {
    background-color: rgb(var(--color-primary-500));
    color: white;
  }

  .media-bubble {
    gap: 0.7rem;
    align-items: flex-start;
    max-width: min(100%, 680px);
    width: min(100%, 680px);
    margin-left: auto;
  }

  .media-bubble.expanded-block {
    max-width: 100%;
    width: 100%;
    margin-left: 0;
  }

  .combined-bubble {
    gap: 1rem;
  }

  .combined-message {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .bubble-delete {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    border-radius: 9999px;
    border: none;
    background: rgba(15, 23, 42, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .bubble-delete:hover,
  .bubble-delete:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
    background: rgba(220, 38, 38, 0.85);
    outline: none;
  }

  .bubble-delete img {
    width: 18px;
    height: 18px;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.4));
  }

  .media-grid-row {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .media-grid-row.expanded-row {
    align-items: stretch;
  }

  .media-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.6rem;
    width: 100%;
  }

  .media-grid.standalone-grid {
    max-width: min(100%, 680px);
    width: min(100%, 680px);
  }

  .media-grid-row.expanded-row .media-grid.standalone-grid {
    max-width: 100%;
    width: 100%;
    justify-content: flex-start;
  }

  .media-cell {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 0 0 calc((100% - 1.2rem) / 3);
    max-width: calc((100% - 1.2rem) / 3);
    min-width: 140px;
    position: relative;
  }

  .media-cell.expanded {
    flex: 1 1 100%;
    max-width: 100%;
  }

  .media-preview {
    position: relative;
  }

  .attachment {
    border-radius: 14px;
    overflow: hidden;
    background-image:
      linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
      linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    background-color: #f3f4f6;
    border: 1px solid rgba(15, 23, 42, 0.08);
    cursor: pointer;
    position: relative;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    display: flex;
    justify-content: center;
    align-items: stretch;
    padding: 0;
    outline: none;
    background-clip: padding-box;
    aspect-ratio: 1 / 1;
    width: 100%;
  }

  .attachment.expanded {
    aspect-ratio: auto;
    min-height: 320px;
  }

  .attachment:hover,
  .attachment:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  }

  .attachment.selected {
    border: 3px dashed rgba(37, 99, 235, 0.95);
    box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.55);
    background: rgba(191, 219, 254, 0.5);
  }

  .attachment:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.9);
    outline-offset: 2px;
  }

  .attachment-media {
    width: 100%;
    display: block;
  }

  .attachment-media :global(.media-frame) {
    width: 100%;
  }

  .attachment-media :global(.media-element) {
    width: 100%;
    height: auto;
  }

  .attachment-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    padding: 1.9rem 1rem;
    color: rgba(15, 23, 42, 0.65);
    font-size: 0.85rem;
    background: rgba(15, 23, 42, 0.05);
  }

  .processing-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: rgba(255, 255, 255, 0.9);
    color: rgba(15, 23, 42, 0.75);
    font-size: 0.85rem;
    z-index: 10;
  }

  .delete-button {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    border-radius: 9999px;
    border: none;
    background: rgba(15, 23, 42, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .delete-button:hover,
  .delete-button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
    background: rgba(220, 38, 38, 0.85);
    outline: none;
  }

  .delete-button img {
    width: 18px;
    height: 18px;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.4));
  }

  .media-actions {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    pointer-events: none;
    z-index: 2;
  }

  .capture-button {
    border: none;
    border-radius: 9999px;
    padding: 0.3rem 0.9rem;
    background: rgba(15, 23, 42, 0.8);
    color: white;
    cursor: pointer;
    font-size: 0.75rem;
    letter-spacing: 0.02em;
    pointer-events: auto;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);
  }

  .capture-button:hover,
  .capture-button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
    background: rgba(37, 99, 235, 0.85);
    outline: none;
  }

  .capture-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .attachment-placeholder .spinner,
  .processing-overlay .spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid rgba(148, 163, 184, 0.3);
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

  .expand-button {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: none;
    background: rgba(15, 23, 42, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .expand-button:hover,
  .expand-button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
    background: rgba(59, 130, 246, 0.85);
    outline: none;
  }

  .expand-button.expanded {
    background: rgba(59, 130, 246, 0.9);
  }

  .expand-button img {
    width: 16px;
    height: 16px;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.4));
  }
  
  p {
    font-family: '源暎アンチック';
    margin-left: 32px;
  }
</style>
