<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import { createPreferenceStore } from '../preferences';
  import AutoSizeTextarea from '../notebook/AutoSizeTextarea.svelte';
  import TextEditModels from '../generator/TextEditModels.svelte';
  import type { TextEditModel } from '$protocolTypes/imagingTypes';
  import { dropzone } from '../utils/dropzone';
  import { createCanvasFromBlob, createVideoFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
  import type { Media } from '../lib/layeredCanvas/dataModels/media';
  import { ImageMedia, VideoMedia } from '../lib/layeredCanvas/dataModels/media';
  import Gallery from '../gallery/Gallery.svelte';
  import type { GalleryItem } from '../gallery/gallery';
  import { _ } from 'svelte-i18n';

  let title: string;
  let imageSource: HTMLCanvasElement;
  let imageSize: { width: number; height: number } = { width: 0, height: 0 };

  const minHeight = 100;
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  let canvasElement: HTMLCanvasElement;
  let prompt = '';
  let placeholder = $_('dialogs.textEdit.placeholder');

  let selectedModel: TextEditModel = 'kontext/inscene';
  
  // プロンプト履歴
  const MAX_HISTORY_SIZE = 50;
  const promptHistoryStore = createPreferenceStore<string[]>("tweakUi", "textEditPromptHistory", []);
  let promptHistory: string[] = [];
  let historyIndex = -1;
  let temporaryPrompt = '';
  
  // 参考画像用のデータ
  let referenceImages: GalleryItem[] = [];
  let referenceMedias: Media[] = [];

  onMount(async () => {
    const args = $modalStore[0]?.meta;
    console.log('TextEdit Dialog mounted, modal store:', args);
    
    // 履歴を購読
    promptHistoryStore.subscribe(value => {
      promptHistory = value;
    });

    if (args) {
      title = args.title;
      if (args.imageSource) {
        imageSource = args.imageSource;
        imageSize = { width: imageSource.width, height: imageSource.height };
        console.log('Image source:', imageSource, 'size:', imageSize);
        drawImageOnCanvas();
      } else {
        console.error('No image source in modal meta');
      }
    }
  });

  function drawImageOnCanvas() {
    if (!imageSource || !canvasElement) return;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    // キャンバスをクリア
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 画像のアスペクト比を保持してキャンバスに描画
    const imageAspect = imageSource.width / imageSource.height;
    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
    
    let drawWidth, drawHeight, drawX, drawY;
    
    if (imageAspect > canvasAspect) {
      // 画像が横長の場合
      drawWidth = CANVAS_WIDTH;
      drawHeight = CANVAS_WIDTH / imageAspect;
      drawX = 0;
      drawY = (CANVAS_HEIGHT - drawHeight) / 2;
    } else {
      // 画像が縦長の場合
      drawWidth = CANVAS_HEIGHT * imageAspect;
      drawHeight = CANVAS_HEIGHT;
      drawX = (CANVAS_WIDTH - drawWidth) / 2;
      drawY = 0;
    }
    
    ctx.drawImage(imageSource, drawX, drawY, drawWidth, drawHeight);
  }

  function onCancel() {
    modalStore.close();
  }
  
  async function onFileDrop(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/svg')) continue;
      
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        // 非同期関数を作成してreferenceImagesに追加
        const loadMedia = async (): Promise<Media[]> => {
          let media: Media;
          if (file.type.startsWith('image/')) {
            const canvas = await createCanvasFromBlob(file);
            media = new ImageMedia(canvas);
          } else {
            const video = await createVideoFromBlob(file);
            media = new VideoMedia(video);
          }
          // メディアをリストに追加
          referenceMedias.push(media);
          referenceMedias = referenceMedias; // リアクティブ更新
          return [media];
        };
        
        referenceImages.push(loadMedia);
      }
    }
    referenceImages = referenceImages; // リアクティブ更新をトリガー
  }
  
  function onReferenceImageDelete(e: CustomEvent<GalleryItem>) {
    // Galleryアイテムと対応するメディアを削除
    const index = referenceImages.indexOf(e.detail as GalleryItem);
    if (index !== -1) {
      referenceMedias.splice(index, 1);
      referenceMedias = referenceMedias; // リアクティブ更新
    }
    referenceImages = referenceImages.filter(item => item !== e.detail);
  }

  function onSubmit() {
    if (!imageSource || !prompt.trim()) return;

    // 履歴に追加
    addToHistory(prompt);

    $modalStore[0].response?.({
      image: imageSource,
      prompt: prompt,
      model: selectedModel,
      referenceImages: referenceMedias,
    });

    modalStore.close();
  }
  
  function addToHistory(newPrompt: string) {
    if (!newPrompt.trim()) return;
    
    // 重複を削除
    const filteredHistory = promptHistory.filter(item => item !== newPrompt);
    
    // 新しいプロンプトを先頭に追加
    const newHistory = [newPrompt, ...filteredHistory];
    
    // 最大履歴数を超えた場合は古いものを削除
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.splice(MAX_HISTORY_SIZE);
    }
    
    promptHistoryStore.set(newHistory);
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (!event.ctrlKey) return;
    
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigateHistory('up');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigateHistory('down');
    }
  }
  
  function navigateHistory(direction: 'up' | 'down') {
    if (promptHistory.length === 0) return;
    
    // 初めて履歴をナビゲートする場合、現在のプロンプトを保存
    if (historyIndex === -1 && prompt.trim()) {
      temporaryPrompt = prompt;
    }
    
    if (direction === 'up') {
      if (historyIndex < promptHistory.length - 1) {
        historyIndex++;
        prompt = promptHistory[historyIndex];
      }
    } else {
      if (historyIndex > -1) {
        historyIndex--;
        if (historyIndex === -1) {
          prompt = temporaryPrompt;
        } else {
          prompt = promptHistory[historyIndex];
        }
      }
    }
  }
</script>

<div class="card p-4 shadow-xl">
  <header class="card-header">
    <h2>{title}</h2>
  </header>
  <section class="p-4">
    <div class="main-content-container">
      <div class="left-pane">
        <div class="canvas-container">
          <canvas
            bind:this={canvasElement}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            class="border border-surface-300 rounded"
          />
        </div>
      </div>
      <div class="right-pane">
        <div class="right-pane-content">
          <div class="setting-section">
            <h3>{$_('dialogs.textEdit.model')}</h3>
            <TextEditModels bind:model={selectedModel} {imageSize} />
          </div>
          
          <div class="setting-section">
            <h3>{$_('dialogs.textEdit.referenceImages')}</h3>
            <div class="reference-images-container" use:dropzone={onFileDrop}>
              {#if referenceImages.length > 0}
                <Gallery 
                  columnWidth={100} 
                  referable={false}
                  accessable={false}
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
              <div class="image-count">
                {$_('dialogs.textEdit.referenceImageCount')}: {referenceMedias.length}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </section>
  <footer class="card-footer">
    <div class="footer-content">
      <div class="history-hint">{$_('dialogs.textEdit.historyHint')}</div>
      <div class="flex gap-2 items-end">
        <AutoSizeTextarea minHeight={minHeight} bind:value={prompt} placeholder={placeholder} on:keydown={handleKeyDown}/>
        <div class="flex gap-2">
          <button class="btn variant-ghost-surface" on:click={onCancel}>{$_('dialogs.cancel')}</button>
          <button class="btn variant-filled-primary" on:click={onSubmit} disabled={!prompt.trim()}>{$_('dialogs.execute')}</button>
        </div>
      </div>
    </div>
  </footer>
</div>

<style>
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }
  
  .main-content-container {
    display: flex;
    gap: 16px;
    height: 600px;
  }
  
  .left-pane {
    flex: 2;
    display: flex;
    flex-direction: column;
  }
  
  .right-pane {
    flex: 1;
    min-width: 0;
    border-left: 1px solid rgb(var(--color-surface-300));
    padding-left: 16px;
    overflow-y: auto;
    max-height: 600px;
  }
  
  .right-pane-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .setting-section {
    margin-bottom: 24px;
  }
  
  .right-pane h3 {
    font-family: '源暎エムゴ';
    font-size: 18px;
    margin: 0 0 8px 0;
    color: rgb(var(--color-primary-500));
  }
  
  .reference-images-container {
    min-height: 150px;
    max-height: 300px;
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
  
  .image-count {
    margin-top: 8px;
    font-size: 12px;
    color: rgb(var(--color-surface-600));
    font-weight: 500;
  }
  
  .canvas-container {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
  }
  
  canvas {
    max-width: 100%;
    max-height: 100%;
  }
  
  .footer-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  
  .history-hint {
    font-size: 12px;
    color: rgb(var(--color-surface-500));
    padding-left: 4px;
  }
</style>