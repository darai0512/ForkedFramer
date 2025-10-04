<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import { createPreferenceStore } from '../preferences';
  import AutoSizeTextarea from '../notebook/AutoSizeTextarea.svelte';
  import ImagingModes from '../generator/ImagingModes.svelte';
  import type { ImagingMode } from '$protocolTypes/imagingTypes';
  import type { Media } from '../lib/layeredCanvas/dataModels/media';
  import type { GalleryItem } from '../gallery/gallery';
  import { _ } from 'svelte-i18n';
  import ReferenceImageDropzone from './ReferenceImageDropzone.svelte';
  import { modeOptions } from '../utils/feathralImaging';

  let title: string;
  let imageSource: HTMLCanvasElement;
  let imageSize: { width: number; height: number } = { width: 0, height: 0 };

  const minHeight = 100;
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  let canvasElement: HTMLCanvasElement;
  let prompt = '';
  let placeholder = $_('dialogs.textEdit.placeholder');

  let selectedModel: ImagingMode = 'kontext/inscene';
  
  // 参考画像用のデータ
  let referenceImages: GalleryItem[] = [];
  let referenceMedias: Media[] = [];
  
  // 参考画像が使用可能なモデルかチェック（定義元に合わせる）
  $: referenceImagesSupported = (() => {
    const opt = modeOptions.find(o => o.value === selectedModel);
    return !!opt?.refImaging && !!opt?.refRange && (opt.refRange.min > 0 || opt.refRange.max > 0);
  })();
  $: refMax = modeOptions.find(o => o.value === selectedModel)?.refRange?.max ?? 0;
  
  // モデルが変更されて参考画像が使用できない場合はリセット
  $: if (!referenceImagesSupported && (referenceImages.length > 0 || referenceMedias.length > 0)) {
    referenceImages = [];
    referenceMedias = [];
  }

  onMount(async () => {
    const args = $modalStore[0]?.meta;
    console.log('TextEdit Dialog mounted, modal store:', args);

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
  
  // 参照画像のドロップゾーンはコンポーネントに委譲

  function onSubmit() {
    if (!imageSource || !prompt.trim()) return;

    $modalStore[0].response?.({
      image: imageSource,
      prompt: prompt,
      model: selectedModel,
      referenceImages: referenceMedias,
    });

    modalStore.close();
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
            <ImagingModes bind:mode={selectedModel} {imageSize} group="textedit" />
          </div>
          
          {#if referenceImagesSupported}
            <div class="setting-section">
              <h3>
                {$_('dialogs.textEdit.referenceImages')}
                <span class="ref-counter">({referenceMedias.length} / {refMax})</span>
              </h3>
              <ReferenceImageDropzone
                bind:referenceImages
                bind:referenceMedias
                maxHeight={300}
                showDeleteButton={false}
                itemDeletable={true}
              />
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>
  <footer class="card-footer">
    <div class="footer-content">
      <div class="history-hint">{$_('dialogs.textEdit.historyHint')}</div>
      <div class="flex gap-2 items-end">
        <AutoSizeTextarea
          minHeight={minHeight}
          bind:value={prompt}
          placeholder={placeholder}
          historyStoreKey="textEditPromptHistory"
        />
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
  
  /* 参照画像ドロップゾーンのスタイルはコンポーネント側に移譲 */
  
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
  .ref-counter {
    font-size: 12px;
    margin-left: 8px;
    color: rgb(var(--color-surface-600));
    font-family: '源暎アンチック';
  }
</style>
