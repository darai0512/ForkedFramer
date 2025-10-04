<script lang="ts">
  import MediaFrame from '../gallery/MediaFrame.svelte';
  import {
    formatTimestamp,
    type MediaItem,
    type MessageItem
  } from './timelineTypes';

  export let messageItem: MessageItem | null = null;
  export let mediaItems: MediaItem[] | null = null;
export let toggleMediaSelection: (id: number) => void = () => {};
export let captureCurrentFrame: (item: MediaItem) => void = () => {};
export let handleMediaDragStartEvent: (event: Event, item: MediaItem) => void = () => {};
export let registerMediaElement: (id: number, element: HTMLButtonElement | null) => void = () => {};
export let capturingMediaIds: Set<number> = new Set();
export let deleteMediaItem: (item: MediaItem) => void = () => {};
export let combined = false;

function mediaElementAction(node: HTMLButtonElement, elementId: number) {
  registerMediaElement(elementId, node);
  return {
    destroy() {
      registerMediaElement(elementId, null);
    }
  };
}

$: groupItems = mediaItems ?? [];
$: hasMessage = messageItem != null;
$: hasMediaGroup = groupItems.length > 0;
$: showCombined = combined && hasMessage && hasMediaGroup;
$: groupTimestamp = hasMediaGroup
  ? formatTimestamp(groupItems[groupItems.length - 1].timestamp)
  : '';
$: messageTimestamp = messageItem ? formatTimestamp(messageItem.timestamp) : '';
</script>

{#if showCombined}
  <div class="message-row from-user">
    <div class="bubble media-bubble combined-bubble" role="group">
      {#if messageItem?.content}
        <p class="combined-message">{messageItem.content}</p>
      {/if}
      <div class="media-grid">
        {#each groupItems as mediaItem (mediaItem.id)}
          <div class="media-cell">
            <button
              type="button"
              class="attachment"
              class:image={mediaItem.kind === 'image'}
              class:video={mediaItem.kind === 'video'}
              class:selected={mediaItem.selected}
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
                </div>
              {:else}
                <div class="attachment-placeholder" aria-live="polite">
                  <div class="spinner" />
                  <span>{mediaItem.placeholder ? '生成中…' : '読み込み中…'}</span>
                </div>
              {/if}
            </button>
            <button
              type="button"
              class="delete-button"
              on:click|stopPropagation={() => deleteMediaItem(mediaItem)}
              aria-label="メディアを削除"
            >
              ×
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
  <div class="message-row from-user">
    <div class="bubble media-bubble" role="group">
      <div class="media-grid">
        {#each groupItems as mediaItem (mediaItem.id)}
          <div class="media-cell">
            <button
              type="button"
              class="attachment"
              class:image={mediaItem.kind === 'image'}
              class:video={mediaItem.kind === 'video'}
              class:selected={mediaItem.selected}
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
                </div>
              {:else}
                <div class="attachment-placeholder" aria-live="polite">
                  <div class="spinner" />
                  <span>{mediaItem.placeholder ? '生成中…' : '読み込み中…'}</span>
                </div>
              {/if}
            </button>
            <button
              type="button"
              class="delete-button"
              on:click|stopPropagation={() => deleteMediaItem(mediaItem)}
              aria-label="メディアを削除"
            >
              ×
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
        <span class="timestamp">{groupTimestamp}</span>
      </div>
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

  .bubble p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .media-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.6rem;
    width: 100%;
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

  .attachment {
    border-radius: 14px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.7);
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
    min-height: 140px;
    padding: 1.9rem 1rem;
    color: rgba(15, 23, 42, 0.65);
    font-size: 0.85rem;
    background: rgba(15, 23, 42, 0.05);
  }

  .attachment-placeholder .spinner {
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

  .delete-button {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    border-radius: 9999px;
    border: none;
    background: rgba(15, 23, 42, 0.7);
    color: white;
    font-size: 1rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .delete-button:hover,
  .delete-button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
    background: rgba(220, 38, 38, 0.85);
    outline: none;
  }

  .media-actions {
    display: flex;
    justify-content: flex-end;
  }

  .capture-button {
    background: rgba(37, 99, 235, 0.9);
    color: white;
    border: none;
    border-radius: 9999px;
    padding: 0.4rem 1.05rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    box-shadow: 0 3px 8px rgba(15, 23, 42, 0.25);
  }

  .capture-button:hover:not(:disabled),
  .capture-button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
    background: rgba(29, 78, 216, 0.95);
    outline: none;
  }

  .capture-button:disabled {
    opacity: 0.65;
    cursor: progress;
  }

  .message-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-top: 0.4rem;
  }

  .timestamp {
    font-size: 0.72rem;
    opacity: 0.75;
  }
</style>
