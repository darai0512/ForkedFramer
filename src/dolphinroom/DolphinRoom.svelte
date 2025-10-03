<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import Drawer from '../utils/Drawer.svelte';
  import TimelineItemView from './TimelineItemView.svelte';
  import { dolphinRoomOpen } from './dolphinRoomStore';
  import { getVideoElementFromMedia, type Media } from '../lib/layeredCanvas/dataModels/media';
  import { attachFileToDataTransfer } from '../lib/layeredCanvas/tools/dragUtil';
  import {
    toTimelineBlocks,
    type MediaItem,
    type TimelineBlock,
    type TimelineItem
  } from './timelineTypes';
  import { createMediaLoaders } from './mediaLoaders';

  const botReplies = [
    'うんうん、なるほど！', 'ちょっと考えてみますね。', 'それは面白いアイデアですね。',
    '詳しく聞かせてもらえますか？', 'いいですね、その調子です！'
  ];

  const dispatch = createEventDispatcher<{ dragstart: Media }>();

  let timelineItems: TimelineItem[] = [], timelineBlocks: TimelineBlock[] = [];
  let draft = '', nextId = 0;
  let logElement: HTMLDivElement | null = null;
  const objectUrls: string[] = [], mediaElements = new Map<number, HTMLButtonElement>();
  let capturingMediaIds = new Set<number>();

  const { ensureMediaItemMedia } = createMediaLoaders({
    refreshTimeline,
    addObjectUrl: (url: string) => objectUrls.push(url)
  });
  function refreshTimeline() {
    timelineItems = [...timelineItems];
  }
  $: timelineBlocks = toTimelineBlocks(timelineItems);
  function closeDrawer() {
    $dolphinRoomOpen = false;
  }

  $: if ($dolphinRoomOpen && timelineItems.length === 0) {
    void enqueueBotMessage('イルカ室へようこそ！お気軽に話しかけてくださいね。');
  }

  async function enqueueUserMessage(text: string, shouldRespond = true) {
    const content = text.trim();
    if (!content) return;
    await appendMessage('user', content);
    if (shouldRespond) {
      scheduleBotReply();
    }
  }
  async function enqueueBotMessage(text: string) {
    await appendMessage('bot', text);
  }
  async function appendMessage(sender: 'user' | 'bot', content: string) {
    const entry = {
      id: nextId++,
      kind: 'message' as const,
      sender,
      content,
      timestamp: Date.now()
    };

    timelineItems = [...timelineItems, entry];
    await tick();
    if (logElement) {
      logElement.scrollTo({ top: logElement.scrollHeight, behavior: 'smooth' });
    }
  }
  function scheduleBotReply() {
    const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
    setTimeout(() => {
      void enqueueBotMessage(reply);
    }, 500 + Math.random() * 700);
  }
  function handleSubmit(event: Event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    draft = '';
    void enqueueUserMessage(text, true);
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
      objectUrls.push(url);

      mediaItems.push({
        id: nextId++,
        kind: type.startsWith('image/') ? 'image' : 'video',
        url,
        name: file.name,
        selected: false,
        file,
        timestamp: Date.now()
      });
    }
    if (mediaItems.length === 0) return;
    void appendMediaItems(mediaItems);
    event.dataTransfer?.clearData();
  }

  async function appendMediaItems(items: MediaItem[]) {
    for (const item of items) {
      void ensureMediaItemMedia(item);
    }

    timelineItems = [...timelineItems, ...items];
    await tick();
    if (logElement) {
      logElement.scrollTo({ top: logElement.scrollHeight, behavior: 'smooth' });
    }
  }
  function toggleMediaSelection(itemId: number) {
    timelineItems = timelineItems.map((item) => {
      if (item.id !== itemId || item.kind === 'message') return item;
      return { ...item, selected: !item.selected };
    });
  }
  function registerMediaElement(id: number, element: HTMLButtonElement | null) {
    if (element) {
      mediaElements.set(id, element);
    } else {
      mediaElements.delete(id);
    }
  }

  function releaseObjectUrl(url: string | null | undefined) {
    if (!url) return;
    let index = objectUrls.indexOf(url);
    let removed = false;
    while (index !== -1) {
      objectUrls.splice(index, 1);
      removed = true;
      index = objectUrls.indexOf(url);
    }
    if (removed) {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('Failed to revoke object URL', error);
      }
    }
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

  function deleteMediaItem(target: MediaItem) {
    releaseObjectUrl(target.url);
    if (target.kind === 'video') {
      const media = target.media;
      const video = media ? getVideoElementFromMedia(media) : null;
      releaseObjectUrl(video?.src ?? null);
    }

    mediaElements.delete(target.id);
    const nextCapturing = new Set(capturingMediaIds);
    nextCapturing.delete(target.id);
    capturingMediaIds = nextCapturing;

    timelineItems = timelineItems.filter((item) => item.id !== target.id);
  }

  function handleMediaDragStart(event: DragEvent, item: MediaItem) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;
    dataTransfer.effectAllowed = 'copy';
    const file = item.file;
    if (file) {
      attachFileToDataTransfer(dataTransfer, file, {
        downloadUrl: item.url
      });
    } else if (item.url) {
      try {
        dataTransfer.setData('text/uri-list', item.url);
      } catch (error) {
        console.warn('Failed to set text/uri-list drag data', error);
      }
    }

    if (item.kind === 'video') {
      const fallbackElement = item.media ? getVideoElementFromMedia(item.media) : null;
      const videoUrl = item.url ?? fallbackElement?.src ?? null;
      if (videoUrl) {
        try {
          dataTransfer.setData('video/mp4', videoUrl);
        } catch (error) {
          console.warn('Failed to set video/mp4 drag data', error);
        }
      }
    }

    const notifyDragStart = (media: Media) => {
      dispatch('dragstart', media);
    };
    if (item.media) {
      notifyDragStart(item.media);
    } else {
      ensureMediaItemMedia(item)
        .then(notifyDragStart)
        .catch((error) => {
          console.error('Failed to prepare media for drag', error);
        });
    }
  }

  function handleMediaDragStartEvent(event: Event, item: MediaItem) {
    if (typeof DragEvent !== 'undefined' && event instanceof DragEvent) {
      handleMediaDragStart(event, item);
    }
  }

  async function captureCurrentFrame(item: MediaItem) {
    if (capturingMediaIds.has(item.id)) return;
    setMediaCapturing(item.id, true);
    try {
      const container = mediaElements.get(item.id);
      let video = container?.querySelector('video') ?? null;

      if (!video) {
        const media = item.media ?? (await ensureMediaItemMedia(item).catch(() => null));
        video = media ? getVideoElementFromMedia(media) : null;
      }

      if (!video) return;

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error('failed to load video data'));
          };
          const cleanup = () => {
            video.removeEventListener('loadeddata', onLoaded);
            video.removeEventListener('error', onError);
          };
          video.addEventListener('loadeddata', onLoaded, { once: true });
          video.addEventListener('error', onError, { once: true });
        }).catch(() => undefined);
      }

      const width = video.videoWidth || video.clientWidth;
      const height = video.videoHeight || video.clientHeight;
      if (width === 0 || height === 0) return;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);

      const fileName = `frame-${item.id}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const frameItem: MediaItem = {
        id: nextId++,
        kind: 'image',
        url,
        name: fileName,
        selected: false,
        file,
        timestamp: Date.now()
      };

      await appendMediaItems([frameItem]);
    } finally {
      setMediaCapturing(item.id, false);
    }
  }

  onDestroy(() => {
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
    mediaElements.clear();
  });
</script>

<Drawer
  placement="right"
  open={$dolphinRoomOpen}
  size="800px"
  on:clickAway={closeDrawer}
  hideOverlayOnDrag
>
  {#if $dolphinRoomOpen}
    <div
      class="dolphin-room-container"
      role="region"
      aria-label="ドルフィンルームのタイムライン"
      on:dragover|preventDefault
      on:drop={handleDrop}
    >
      <header class="room-header">
        <h2>ドルフィンルーム</h2>
        <p>チャットで気軽にアイデアを整理しましょう。</p>
      </header>

      <div class="message-log" bind:this={logElement}>
        {#each timelineBlocks as block ((block.kind === 'message-block'
          ? `message-${block.item.id}`
          : `media-${block.groupId}`))}
          <TimelineItemView
            messageItem={block.kind === 'message-block' ? block.item : null}
            mediaItems={block.kind === 'media-group' ? block.items : null}
            {capturingMediaIds}
            {toggleMediaSelection}
            captureCurrentFrame={captureCurrentFrame}
            handleMediaDragStartEvent={handleMediaDragStartEvent}
            registerMediaElement={registerMediaElement}
            deleteMediaItem={deleteMediaItem}
          />
        {/each}
        {#if timelineBlocks.length === 0}
          <div class="empty-state">
            <p>まだメッセージがありません。下のフォームから送信してみましょう！</p>
          </div>
        {/if}
      </div>

      <form class="input-row" on:submit={handleSubmit}>
        <input
          type="text"
          placeholder="メッセージを入力してください"
          bind:value={draft}
          aria-label="メッセージ入力"
        />
        <button type="submit" class="btn btn-primary">送信</button>
      </form>
    </div>
  {/if}
</Drawer>

<style>
  .dolphin-room-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1.5rem;
    gap: 1.5rem;
    background-color: rgb(var(--color-surface-50));
    box-sizing: border-box;
  }

  .room-header h2 {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
  }

  .room-header p {
    margin: 0.5rem 0 0;
    color: rgb(var(--color-tertiary-500));
    font-size: 0.95rem;
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
    align-items: center;
  }

  .input-row input {
    flex: 1;
    padding: 0.75rem 1rem;
    border-radius: 9999px;
    border: 1px solid rgb(var(--color-surface-400));
    background-color: white;
    font-size: 1rem;
  }

  .input-row input:focus {
    outline: none;
    border-color: rgb(var(--color-primary-500));
    box-shadow: 0 0 0 2px rgba(var(--color-primary-500), 0.1);
  }

  .input-row button {
    padding: 0.75rem 1.5rem;
  }
</style>
