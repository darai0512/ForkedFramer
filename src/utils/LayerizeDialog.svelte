<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { RangeSlider } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  let title: string;
  let imageSource: HTMLCanvasElement;

  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 400;

  let canvasElement: HTMLCanvasElement;
  let numLayers = 2;

  onMount(async () => {
    const args = $modalStore[0]?.meta;
    console.log('Layerize Dialog mounted, modal store:', args);

    if (args) {
      title = args.title;
      if (args.imageSource) {
        imageSource = args.imageSource;
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

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const imageAspect = imageSource.width / imageSource.height;
    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;

    let drawWidth, drawHeight, drawX, drawY;

    if (imageAspect > canvasAspect) {
      drawWidth = CANVAS_WIDTH;
      drawHeight = CANVAS_WIDTH / imageAspect;
      drawX = 0;
      drawY = (CANVAS_HEIGHT - drawHeight) / 2;
    } else {
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

  function onSubmit() {
    if (!imageSource) return;

    $modalStore[0].response?.({
      image: imageSource,
      numLayers: numLayers,
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
      <div class="canvas-container">
        <canvas
          bind:this={canvasElement}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          class="border border-surface-300 rounded"
        />
      </div>
      <div class="settings-container">
        <div class="setting-section">
          <h3>{$_('dialogs.layerize.numLayers')}</h3>
          <div class="slider-container">
            <RangeSlider name="numLayers" bind:value={numLayers} min={1} max={4} step={1} ticked />
            <div class="slider-value">{numLayers}</div>
          </div>
        </div>
        <div class="warning-note">
          {$_('dialogs.layerize.resolutionWarning')}
        </div>
      </div>
    </div>
  </section>
  <footer class="card-footer">
    <div class="footer-content">
      <div class="flex gap-2 justify-end">
        <button class="btn variant-ghost-surface" on:click={onCancel}>{$_('dialogs.cancel')}</button>
        <button class="btn variant-filled-primary" on:click={onSubmit}>{$_('dialogs.execute')}</button>
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
    flex-direction: column;
    gap: 16px;
  }

  .canvas-container {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  canvas {
    max-width: 100%;
    max-height: 100%;
  }

  .settings-container {
    padding: 16px;
    border-top: 1px solid rgb(var(--color-surface-300));
  }

  .setting-section h3 {
    font-family: '源暎エムゴ';
    font-size: 18px;
    margin: 0 0 12px 0;
    color: rgb(var(--color-primary-500));
  }

  .slider-container {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .slider-container :global(.range-slider) {
    flex: 1;
  }

  .slider-value {
    font-size: 24px;
    font-weight: bold;
    min-width: 40px;
    text-align: center;
    color: rgb(var(--color-primary-500));
  }

  .footer-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .warning-note {
    margin-top: 12px;
    padding: 8px 12px;
    background-color: rgba(var(--color-warning-500) / 0.15);
    border-left: 3px solid rgb(var(--color-warning-500));
    border-radius: 4px;
    font-size: 13px;
    color: rgb(var(--color-warning-700));
  }
</style>
