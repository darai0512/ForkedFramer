<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import Drawer from '../utils/Drawer.svelte';
  import MediaFrame from '../gallery/MediaFrame.svelte';
  import { dolphinRoomOpen } from './dolphinRoomStore';
  import { buildMedia, type Media } from '../lib/layeredCanvas/dataModels/media';
  import { createCanvasFromBlob, createVideoFromBlob } from '../lib/layeredCanvas/tools/imageUtil';

  interface ChatMessage {
    id: number;
    sender: 'user' | 'bot';
    content: string;
    attachments: MediaAttachment[];
    timestamp: number;
  }

  interface MediaAttachment {
    id: number;
    type: 'image' | 'video';
    url: string;
    name: string;
    selected: boolean;
    file: File | null;
    media?: Media;
    mediaPromise?: Promise<Media>;
  }

  const botReplies = [
    'うんうん、なるほど！',
    'ちょっと考えてみますね。',
    'それは面白いアイデアですね。',
    '詳しく聞かせてもらえますか？',
    'いいですね、その調子です！'
  ];

  const dispatch = createEventDispatcher<{ dragstart: Media }>();

  let messages: ChatMessage[] = [];
  let draft = '';
  let nextId = 0;
  let nextAttachmentId = 0;
  let logElement: HTMLDivElement | null = null;
  const objectUrls: string[] = [];
  const attachmentElements = new Map<number, HTMLButtonElement>();
  let capturingAttachmentIds = new Set<number>();

  function refreshMessages() {
    messages = [...messages];
  }

  function closeDrawer() {
    $dolphinRoomOpen = false;
  }

  $: if ($dolphinRoomOpen && messages.length === 0) {
    void enqueueBotMessage('イルカ室へようこそ！お気軽に話しかけてくださいね。');
  }

  async function enqueueUserMessage(
    text: string,
    attachments: MediaAttachment[] = [],
    shouldRespond = true
  ) {
    await appendMessage({ sender: 'user', content: text, attachments });
    if (shouldRespond) {
      scheduleBotReply();
    }
  }

  async function enqueueBotMessage(text: string) {
    await appendMessage({ sender: 'bot', content: text, attachments: [] });
  }

  async function appendMessage({ sender, content, attachments = [] }: Omit<ChatMessage, 'id' | 'timestamp'>) {
    const entry: ChatMessage = {
      id: nextId++,
      sender,
      content,
      attachments,
      timestamp: Date.now()
    };

    for (const attachment of attachments) {
      void ensureAttachmentMedia(attachment);
    }

    messages = [...messages, entry];
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
    void enqueueUserMessage(text, []);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const items = event.dataTransfer?.files;
    if (!items || items.length === 0) return;

    const attachments: MediaAttachment[] = [];
    for (const file of Array.from(items)) {
      const type = file.type;
      if (!type.startsWith('image/') && !type.startsWith('video/')) continue;
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const attachment: MediaAttachment = {
        id: nextAttachmentId++,
        type: type.startsWith('image/') ? 'image' : 'video',
        url,
        name: file.name,
        selected: false,
        file,
      };
      attachments.push(attachment);
      void ensureAttachmentMedia(attachment);
    }

    if (attachments.length === 0) return;

    void enqueueUserMessage('', attachments, false);
    event.dataTransfer?.clearData();
  }

  function toggleAttachmentSelection(messageId: number, attachmentId: number) {
    messages = messages.map((message) => {
      if (message.id !== messageId) return message;
      const attachments = message.attachments.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, selected: !attachment.selected }
          : attachment
      );
      return { ...message, attachments };
    });
  }

  function messageHasSelection(message: ChatMessage): boolean {
    return message.attachments.some((attachment) => attachment.selected);
  }

  function handleMessageClick(messageId: number, event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('[data-attachment-id]')) {
      return;
    }
    const message = messages.find((item) => item.id === messageId);
    if (!message || message.attachments.length === 0) return;
    const shouldSelect = !messageHasSelection(message);
    messages = messages.map((item) => {
      if (item.id !== messageId) return item;
      return {
        ...item,
        attachments: item.attachments.map((attachment) => ({
          ...attachment,
          selected: shouldSelect
        }))
      };
    });
  }

  function registerAttachmentElement(id: number, element: HTMLButtonElement | null) {
    if (element) {
      attachmentElements.set(id, element);
    } else {
      attachmentElements.delete(id);
    }
  }

  function attachmentElementAction(node: HTMLButtonElement, attachmentId: number) {
    registerAttachmentElement(attachmentId, node);
    return {
      destroy() {
        registerAttachmentElement(attachmentId, null);
      }
    };
  }

  function setAttachmentCapturing(id: number, enabled: boolean) {
    const next = new Set(capturingAttachmentIds);
    if (enabled) {
      next.add(id);
    } else {
      next.delete(id);
    }
    capturingAttachmentIds = next;
  }

  async function ensureAttachmentFile(attachment: MediaAttachment): Promise<File | null> {
    if (attachment.file) {
      return attachment.file;
    }
    try {
      const response = await fetch(attachment.url);
      const blob = await response.blob();
      const extension = attachment.type === 'image' ? 'png' : 'mp4';
      const type = blob.type || (attachment.type === 'image' ? 'image/png' : 'video/mp4');
      const fileName = attachment.name || `attachment-${attachment.id}.${extension}`;
      const file = new File([blob], fileName, { type });
      attachment.file = file;
      return file;
    } catch (error) {
      console.error('Failed to fetch attachment blob', error);
      return null;
    }
  }

  async function ensureAttachmentMedia(attachment: MediaAttachment): Promise<Media> {
    if (attachment.media) {
      return attachment.media;
    }
    if (attachment.mediaPromise) {
      return attachment.mediaPromise;
    }

    attachment.mediaPromise = (async () => {
      const file = await ensureAttachmentFile(attachment);
      if (!file) {
        throw new Error('Missing attachment file');
      }

      if (attachment.type === 'image') {
        const canvas = await createCanvasFromBlob(file);
        const media = buildMedia(canvas);
        attachment.media = media;
        refreshMessages();
        return media;
      } else {
        const video = await createVideoFromBlob(file);
        if (video.src) {
          objectUrls.push(video.src);
        }
        const media = buildMedia(video);
        attachment.media = media;
        refreshMessages();
        return media;
      }
    })();

    try {
      const media = await attachment.mediaPromise;
      return media;
    } finally {
      attachment.mediaPromise = undefined;
    }
  }

  function handleAttachmentDragStart(
    event: DragEvent,
    attachment: MediaAttachment
  ) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    dataTransfer.effectAllowed = 'copy';

    const file = attachment.file;
    if (file) {
      try {
        dataTransfer.items.add(file);
      } catch (error) {
        console.warn('Failed to add file to DataTransfer', error);
      }

      if (attachment.url) {
        const downloadType = file.type || (attachment.type === 'image' ? 'image/png' : 'video/mp4');
        const downloadName = file.name || attachment.name || `attachment-${attachment.id}`;
        const downloadUrl = `${downloadType}:${downloadName}:${attachment.url}`;
        try {
          dataTransfer.setData('DownloadURL', downloadUrl);
        } catch (error) {
          console.warn('Failed to set DownloadURL drag data', error);
        }
      }
    } else if (attachment.url) {
      try {
        dataTransfer.setData('text/uri-list', attachment.url);
      } catch (error) {
        console.warn('Failed to set text/uri-list drag data', error);
      }
    }

    if (attachment.type === 'video') {
      const videoUrl = attachment.url ?? (() => {
        const mediaSource = attachment.media?.persistentSource;
        return mediaSource instanceof HTMLVideoElement ? mediaSource.src : null;
      })();
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

    if (attachment.media) {
      notifyDragStart(attachment.media);
    } else {
      ensureAttachmentMedia(attachment)
        .then(notifyDragStart)
        .catch((error) => {
          console.error('Failed to prepare attachment media for drag', error);
        });
    }
  }

  function handleAttachmentDragStartEvent(event: Event, attachment: MediaAttachment) {
    if (typeof DragEvent !== 'undefined' && event instanceof DragEvent) {
      handleAttachmentDragStart(event, attachment);
    }
  }

  async function captureCurrentFrame(messageId: number, attachmentId: number) {
    const container = attachmentElements.get(attachmentId);
    const video = container?.querySelector('video');
    if (!video) return;

    if (capturingAttachmentIds.has(attachmentId)) return;
    setAttachmentCapturing(attachmentId, true);

    try {
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

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      objectUrls.push(url);

      const fileName = `frame-${attachmentId}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const frameAttachment: MediaAttachment = {
        id: nextAttachmentId++,
        type: 'image',
        url,
        name: fileName,
        selected: false,
        file,
      };

      void ensureAttachmentMedia(frameAttachment);
      await enqueueUserMessage('', [frameAttachment], false);
    } finally {
      setAttachmentCapturing(attachmentId, false);
    }
  }

  onDestroy(() => {
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
    attachmentElements.clear();
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
        {#each messages as message (message.id)}
          <div class:from-user={message.sender === 'user'} class:from-bot={message.sender === 'bot'} class="message-row">
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
            <div
              class="bubble"
              class:selected-message={messageHasSelection(message)}
              on:click={(event) => handleMessageClick(message.id, event)}
              role="group"
            >
              {#if message.content}
                <p>{message.content}</p>
              {/if}
              {#if message.attachments.length > 0}
                <div class="attachment-grid">
                  {#each message.attachments as attachment (attachment.id)}
                    <button
                      type="button"
                      class="attachment"
                      class:image={attachment.type === 'image'}
                      class:video={attachment.type === 'video'}
                      class:selected={attachment.selected}
                      on:click={() => toggleAttachmentSelection(message.id, attachment.id)}
                      on:dragstart={(event) => handleAttachmentDragStartEvent(event, attachment)}
                      aria-pressed={attachment.selected}
                      data-attachment-id={attachment.id}
                      use:attachmentElementAction={attachment.id}
                    >
                      {#if attachment.media}
                        <div class="attachment-media">
                          <MediaFrame
                            media={attachment.media}
                            showControls={attachment.type === 'video'}
                            dragAsImage={attachment.type === 'image'}
                          />
                        </div>
                      {:else}
                        <div class="attachment-placeholder">読み込み中…</div>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
              <div class="message-footer">
                {#if message.attachments.some((attachment) => attachment.type === 'video')}
                  <div class="message-actions">
                    {#each message.attachments as attachment (attachment.id)}
                      {#if attachment.type === 'video'}
                        <button
                          type="button"
                          class="message-action-button"
                          on:click|stopPropagation={() => captureCurrentFrame(message.id, attachment.id)}
                          disabled={capturingAttachmentIds.has(attachment.id)}
                        >
                          {capturingAttachmentIds.has(attachment.id) ? 'キャプチャ中…' : 'キャプチャ'}
                        </button>
                      {/if}
                    {/each}
                  </div>
                {/if}
                <span class="timestamp">{new Date(message.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        {/each}
        {#if messages.length === 0}
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

  .from-user .bubble {
    background-color: rgb(var(--color-primary-500));
    color: white;
  }

  .bubble.selected-message {
    border-color: rgba(59, 130, 246, 0.9);
    background-color: rgba(59, 130, 246, 0.2);
    box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.45);
    animation: pulse-border 1.2s ease-in-out infinite;
  }

  .from-user .bubble.selected-message {
    background-color: rgba(37, 99, 235, 0.75);
    color: white;
  }

  .from-bot .bubble.selected-message {
    background-color: rgba(59, 130, 246, 0.35);
  }

  .bubble p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .attachment-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
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

  @keyframes pulse-border {
    0% {
      box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.45);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.25);
    }
    100% {
      box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.45);
    }
  }

  .timestamp {
    font-size: 0.75rem;
    opacity: 0.7;
    align-self: flex-end;
    margin-left: auto;
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
