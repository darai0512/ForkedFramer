<script lang="ts">
  import MediaFrame from '../gallery/MediaFrame.svelte';
  import {
    formatTimestamp,
    isMessageItem,
    type MediaItem,
    type MessageItem,
    type TimelineItem
  } from './timelineTypes';

  export let item: TimelineItem;
  export let toggleMediaSelection: (id: number) => void = () => {};
  export let captureCurrentFrame: (id: number) => void = () => {};
  export let handleMediaDragStartEvent: (event: Event, item: MediaItem) => void = () => {};
  export let registerMediaElement: (id: number, element: HTMLButtonElement | null) => void = () => {};
  export let capturingMediaIds: Set<number> = new Set();

  $: isMessage = isMessageItem(item);
  $: messageItem = isMessage ? (item as MessageItem) : null;
  $: mediaItem = isMessage ? null : (item as MediaItem);
  $: isCapturing = mediaItem?.kind === 'video' && capturingMediaIds.has(item.id);

  function mediaElementAction(node: HTMLButtonElement, elementId: number) {
    registerMediaElement(elementId, node);
    return {
      destroy() {
        registerMediaElement(elementId, null);
      }
    };
  }
</script>

{#if messageItem}
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
{:else if mediaItem}
  <div class="message-row" class:from-user={true}>
    <div class="bubble media-bubble" role="group">
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
          <div class="attachment-placeholder">読み込み中…</div>
        {/if}
      </button>
      <div class="message-footer">
        {#if mediaItem.kind === 'video'}
          <div class="message-actions">
            <button
              type="button"
              class="message-action-button"
              on:click|stopPropagation={() => captureCurrentFrame(mediaItem.id)}
              disabled={isCapturing}
            >
              {isCapturing ? 'キャプチャ中…' : 'キャプチャ'}
            </button>
          </div>
        {/if}
        <span class="timestamp">{formatTimestamp(mediaItem.timestamp)}</span>
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
    max-width: min(70%, 520px);
    padding: 0.75rem 1rem;
    border-radius: 14px;
    background-color: rgb(var(--color-primary-200));
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: rgb(var(--color-surface-900));
    border: 2px solid transparent;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .media-bubble {
    gap: 0.75rem;
    align-items: flex-start;
  }

  .message-row.from-user .bubble {
    background-color: rgb(var(--color-primary-500));
    color: white;
  }

  .bubble p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .attachment {
    border-radius: 12px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(0, 0, 0, 0.08);
    max-width: 220px;
    cursor: pointer;
    position: relative;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    display: inline-flex;
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
    box-shadow: 0 0 0 4px rgba(147, 197, 253, 0.6);
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
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 2rem 1rem;
    color: rgba(15, 23, 42, 0.6);
    font-size: 0.9rem;
    background: rgba(15, 23, 42, 0.05);
  }

  .message-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }

  .message-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .message-action-button {
    background: rgba(59, 130, 246, 0.95);
    color: white;
    border: none;
    border-radius: 9999px;
    padding: 0.4rem 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .message-action-button:hover:not(:disabled),
  .message-action-button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(15, 23, 42, 0.35);
    background: rgba(37, 99, 235, 0.95);
    outline: none;
  }

  .message-action-button:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .timestamp {
    font-size: 0.75rem;
    opacity: 0.7;
    align-self: flex-end;
    margin-left: auto;
  }
</style>
