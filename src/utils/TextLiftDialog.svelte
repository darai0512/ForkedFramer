<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { textMask } from '../supabase';
  import { makePlainCanvas } from '../lib/layeredCanvas/tools/imageUtil';
  import type { TextMaskResponse } from './edgeFunctions/types/imagingTypes.d';
  import type { TextLiftDialogResult, TextLiftSelection } from './textLiftFilm';

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  let title = '';
  let imageSource: HTMLCanvasElement | null = null;
  let imageCanvas: HTMLCanvasElement;
  let overlayCanvas: HTMLCanvasElement;

  let maskLayers: MaskLayer[] = [];
  let drawInfo: DrawInfo | null = null;
  let isLoading = true;
  let errorMessage = '';
  let enabledCount = 0;

  type DrawInfo = {
    offsetX: number;
    offsetY: number;
    scale: number;
    drawWidth: number;
    drawHeight: number;
  };

  type MaskLayer = {
    id: number;
    rawBox: { x0: number; y0: number; x1: number; y1: number };
    displayBox: { x: number; y: number; width: number; height: number };
    text?: string;
    enabled: boolean;
  };

  onMount(async () => {
    const args = $modalStore[0]?.meta;
    if (!args?.imageSource) {
      errorMessage = $_('dialogs.textLift.noImage');
      isLoading = false;
      return;
    }

    title = args.title ?? $_('dialogs.textLift.title');
    imageSource = args.imageSource as HTMLCanvasElement;

    drawInfo = computeDrawInfo();
    drawBaseImage();
    await fetchMasks();
  });

  function computeDrawInfo(): DrawInfo | null {
    if (!imageSource) return null;

    const imageAspect = imageSource.width / imageSource.height;
    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;

    if (imageAspect > canvasAspect) {
      const drawWidth = CANVAS_WIDTH;
      const drawHeight = CANVAS_WIDTH / imageAspect;
      return {
        offsetX: 0,
        offsetY: (CANVAS_HEIGHT - drawHeight) / 2,
        scale: drawWidth / imageSource.width,
        drawWidth,
        drawHeight,
      };
    } else {
      const drawHeight = CANVAS_HEIGHT;
      const drawWidth = CANVAS_HEIGHT * imageAspect;
      return {
        offsetX: (CANVAS_WIDTH - drawWidth) / 2,
        offsetY: 0,
        scale: drawHeight / imageSource.height,
        drawWidth,
        drawHeight,
      };
    }
  }

  function drawBaseImage() {
    if (!imageCanvas || !imageSource) return;
    const ctx = imageCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (!drawInfo) return;
    ctx.drawImage(imageSource, drawInfo.offsetX, drawInfo.offsetY, drawInfo.drawWidth, drawInfo.drawHeight);
  }

  async function fetchMasks() {
    if (!imageSource) return;

    isLoading = true;
    errorMessage = '';
    maskLayers = [];
    redrawOverlay();

    try {
      const response = await textMask({ dataUrl: imageSource.toDataURL() });
      if (!response.boxes || response.boxes.length === 0) {
        errorMessage = $_('dialogs.textLift.empty');
        return;
      }

      maskLayers = await prepareMaskLayers(response);
      redrawOverlay();
    } catch (error) {
      console.error('textMask failed', error);
      errorMessage = $_('dialogs.textLift.error');
    } finally {
      isLoading = false;
    }
  }

  async function prepareMaskLayers(response: TextMaskResponse): Promise<MaskLayer[]> {
    if (!imageSource) return [];
    const sourceWidth = imageSource.width;
    const sourceHeight = imageSource.height;

    const layers = await Promise.all(response.boxes.map(async (box, idx) => {
      const actualX0 = Math.floor(box.box_2d.x0 * sourceWidth / 1000);
      const actualY0 = Math.floor(box.box_2d.y0 * sourceHeight / 1000);
      const actualX1 = Math.floor(box.box_2d.x1 * sourceWidth / 1000);
      const actualY1 = Math.floor(box.box_2d.y1 * sourceHeight / 1000);
      const width = Math.max(1, actualX1 - actualX0);
      const height = Math.max(1, actualY1 - actualY0);

      return {
        id: idx,
        rawBox: box.box_2d,
        displayBox: { x: actualX0, y: actualY0, width, height },
        text: box.text,
        enabled: true,
      };
    }));

    return layers.filter(Boolean) as MaskLayer[];
  }

  function redrawOverlay() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (!drawInfo) return;

    for (const layer of maskLayers) {
      const dx = drawInfo.offsetX + layer.displayBox.x * drawInfo.scale;
      const dy = drawInfo.offsetY + layer.displayBox.y * drawInfo.scale;
      const dw = layer.displayBox.width * drawInfo.scale;
      const dh = layer.displayBox.height * drawInfo.scale;

      if (layer.enabled) {
        ctx.fillStyle = 'rgba(128, 0, 128, 0.25)';
        ctx.fillRect(dx, dy, dw, dh);
      }

      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = layer.enabled ? 'yellow' : 'rgba(200,200,200,0.9)';
      if (!layer.enabled) {
        ctx.setLineDash([6, 4]);
      }
      ctx.strokeRect(dx, dy, dw, dh);
      ctx.restore();
    }
  }

  function toggleMask(targetId: number) {
    maskLayers = maskLayers.map(layer =>
      layer.id === targetId ? { ...layer, enabled: !layer.enabled } : layer
    );
    redrawOverlay();
  }

  function handleOverlayClick(event: MouseEvent) {
    if (!drawInfo || isLoading || !maskLayers.length) return;

    const rect = overlayCanvas.getBoundingClientRect();
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    const sourceX = (canvasX - drawInfo.offsetX) / drawInfo.scale;
    const sourceY = (canvasY - drawInfo.offsetY) / drawInfo.scale;

    for (let i = maskLayers.length - 1; i >= 0; i--) {
      const box = maskLayers[i].displayBox;
      if (
        sourceX >= box.x &&
        sourceX <= box.x + box.width &&
        sourceY >= box.y &&
        sourceY <= box.y + box.height
      ) {
        toggleMask(maskLayers[i].id);
        break;
      }
    }
  }

  function onCancel() {
    $modalStore[0]?.response?.(null);
    modalStore.close();
  }

  function onSubmit() {
    const selections: TextLiftSelection[] = maskLayers.map(layer => ({
      id: layer.id,
      enabled: layer.enabled,
      text: layer.text,
      box: layer.rawBox,
    }));

    const response: TextLiftDialogResult = {
      committed: true,
      selections,
    };

    $modalStore[0].response?.(response);
    modalStore.close();
  }

  $: if (imageSource && imageCanvas) {
    drawInfo = computeDrawInfo();
    drawBaseImage();
  }

  $: if (overlayCanvas && drawInfo) {
    redrawOverlay();
  }

  $: enabledCount = maskLayers.filter(m => m.enabled).length;
</script>

<div class="card p-4 shadow-xl">
  <header class="card-header">
    <div>
      <h2>{title}</h2>
      <p class="hint">{$_('dialogs.textLift.hint')}</p>
    </div>
    <div class="pill">
      {enabledCount}/{maskLayers.length || 0} {$_('dialogs.textLift.enabledLabel')}
    </div>
  </header>
  <section class="p-4">
    <div class="dialog-body">
      <div class="canvas-pane">
        <div class="canvas-wrapper">
          <canvas
            bind:this={imageCanvas}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            class="base-canvas"
          />
          <canvas
            bind:this={overlayCanvas}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            class="overlay-canvas"
            on:click={handleOverlayClick}
          />
          {#if isLoading}
            <div class="loading-overlay">
              <span>{$_('dialogs.textLift.loading')}</span>
            </div>
          {/if}
        </div>
      </div>
      <div class="list-pane">
        <div class="list-header">
          <h3>{$_('dialogs.textLift.listTitle')}</h3>
        </div>
        {#if errorMessage}
          <div class="status-block error">{errorMessage}</div>
        {:else if isLoading}
          <div class="status-block subtle">{$_('dialogs.textLift.loading')}</div>
        {:else if maskLayers.length === 0}
          <div class="status-block subtle">{$_('dialogs.textLift.empty')}</div>
        {:else}
          <div class="mask-list">
            {#each maskLayers as mask}
              <button
                type="button"
                class={`mask-item ${mask.enabled ? 'enabled' : 'disabled'}`}
                on:click={() => toggleMask(mask.id)}
              >
                <div class="mask-item-header">
                  <span class="badge">#{mask.id + 1}</span>
                  <span class="state">
                    {mask.enabled ? $_('dialogs.textLift.enabledLabel') : $_('dialogs.textLift.disabledLabel')}
                  </span>
                </div>
                {#if mask.text}
                  <div class="mask-text">{mask.text}</div>
                {/if}
                <div class="mask-meta">
                  {Math.round(mask.displayBox.width)} x {Math.round(mask.displayBox.height)}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </section>
  <footer class="card-footer flex gap-2">
    <div class="flex-1"></div>
    <button class="btn variant-ghost-surface" type="button" on:click={onCancel}>
      {$_('dialogs.cancel')}
    </button>
    <button
      class="btn variant-filled-primary"
      type="button"
      on:click={onSubmit}
      disabled={isLoading || maskLayers.length === 0}
    >
      {$_('dialogs.ok')}
    </button>
  </footer>
</div>

<style>
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin: 0;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .hint {
    margin: 4px 0 0 0;
    font-size: 12px;
    color: rgb(var(--color-surface-500));
  }

  .pill {
    background: rgba(var(--color-primary-500), 0.1);
    color: rgb(var(--color-primary-700));
    border: 1px solid rgba(var(--color-primary-500), 0.35);
    border-radius: 999px;
    padding: 6px 12px;
    font-weight: 600;
    font-family: '源暎アンチック';
  }

  .dialog-body {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 16px;
    align-items: stretch;
  }

  .canvas-pane {
    min-height: 620px;
  }

  .canvas-wrapper {
    position: relative;
    width: 100%;
    height: 620px;
    background: radial-gradient(circle at 20% 20%, rgba(var(--color-primary-200), 0.2), transparent 40%),
      #0f172a;
    border: 1px solid rgb(var(--color-surface-300));
    border-radius: 12px;
    overflow: hidden;
  }

  canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .overlay-canvas {
    cursor: pointer;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .list-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 260px;
  }

  .list-header h3 {
    font-family: '源暎エムゴ';
    font-size: 18px;
    margin: 0;
    color: rgb(var(--color-primary-500));
  }

  .mask-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 600px;
    overflow: auto;
    padding-right: 4px;
  }

  .mask-item {
    width: 100%;
    text-align: left;
    border-radius: 10px;
    border: 1px solid rgb(var(--color-surface-300));
    padding: 10px 12px;
    background: rgba(var(--color-surface-50), 0.6);
    transition: border-color 0.15s ease, transform 0.1s ease, background 0.15s ease;
  }

  .mask-item.enabled {
    border-color: rgb(var(--color-primary-400));
    background: rgba(var(--color-primary-50), 0.55);
  }

  .mask-item.disabled {
    opacity: 0.7;
    border-style: dashed;
  }

  .mask-item:hover {
    transform: translateY(-1px);
  }

  .mask-item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }

  .badge {
    font-weight: 700;
    color: rgb(var(--color-primary-600));
  }

  .state {
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(var(--color-surface-500), 0.1);
    color: rgb(var(--color-surface-700));
  }

  .mask-text {
    margin: 6px 0 2px 0;
    font-family: '源暎アンチック';
    color: rgb(var(--color-surface-800));
    word-break: break-word;
  }

  .mask-meta {
    font-size: 12px;
    color: rgb(var(--color-surface-500));
  }

  .status-block {
    padding: 12px;
    border-radius: 10px;
    border: 1px dashed rgb(var(--color-surface-300));
    color: rgb(var(--color-surface-700));
    background: rgba(var(--color-surface-100), 0.6);
  }

  .status-block.error {
    border-color: rgba(var(--color-error-500), 0.6);
    color: rgb(var(--color-error-700));
    background: rgba(var(--color-error-50), 0.5);
  }
</style>
