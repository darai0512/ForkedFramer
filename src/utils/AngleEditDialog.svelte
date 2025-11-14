<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  let title: string;
  let imageSource: HTMLCanvasElement;
  let imageSize: { width: number; height: number } = { width: 0, height: 0 };

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;

  let canvasElement: HTMLCanvasElement;

  let rotateRightLeft = 0;
  let moveForward = 0;
  let verticalAngle = 0;
  let wideAngleLens = false;
  
  onMount(async () => {
    const args = $modalStore[0]?.meta;
    console.log('AngleEdit Dialog mounted, modal store:', args);

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
      angle: {
        rotate_right_left: -rotateRightLeft, // Invert direction
        move_forward: moveForward,
        vertical_angle: verticalAngle,
        wide_angle_lens: wideAngleLens,
      },
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
            <h3>{$_('dialogs.angleEdit.model')}</h3>
            <div class="fixed-model">Qwen Multiple Angles</div>
          </div>

        </div>
      </div>
    </div>
  </section>
  <footer class="card-footer">
    <div class="footer-content">
          <div class="control-section">
            <h3>{$_('dialogs.angleEdit.cameraSettings')}</h3>
            <div class="camera-table">
              <div class="camera-row">
              <span class="control-label">
                <span class="label-group">
                  {$_('dialogs.angleEdit.rotate')}
                  <span class="label-hint">{$_('dialogs.angleEdit.rotateDescription')}</span>
                </span>
              </span>
            <input type="range" min={-90} max={90} step={45} bind:value={rotateRightLeft}>
            <input type="number" min={-90} max={90} step={45} bind:value={rotateRightLeft}>
          </div>

          <div class="camera-row">
            <span class="control-label">
                <span class="label-group">
                  {$_('dialogs.angleEdit.moveForward')}
                  <span class="label-hint">{$_('dialogs.angleEdit.moveForwardDescription')}</span>
                </span>
              </span>
            <input type="range" min={0} max={10} step={2.5} bind:value={moveForward}>
            <input type="number" min={0} max={10} step={2.5} bind:value={moveForward}>
          </div>

          <div class="camera-row">
            <span class="control-label">
                <span class="label-group">
                  {$_('dialogs.angleEdit.verticalAngle')}
                  <span class="label-hint">{$_('dialogs.angleEdit.verticalAngleDescription')}</span>
                </span>
              </span>
            <input type="range" min={-1} max={1} step={0.5} bind:value={verticalAngle}>
            <input type="number" min={-1} max={1} step={0.5} bind:value={verticalAngle}>
          </div>

          <div class="camera-row toggle-row">
            <label class="toggle">
              <input type="checkbox" bind:checked={wideAngleLens}>
              <span>{$_('dialogs.angleEdit.wideAngleLens')}</span>
            </label>
          </div>
        </div>
      </div>
      <div class="button-row">
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

  .fixed-model {
    font-weight: 600;
    font-family: '源暎エムゴ';
  }

  .right-pane h3 {
    font-family: '源暎エムゴ';
    font-size: 18px;
    margin: 0 0 8px 0;
    color: rgb(var(--color-primary-500));
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
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .control-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 480px;
    width: 100%;
    margin: 0 auto;
  }

  .control-section h3 {
    font-family: '源暎エムゴ';
    font-size: 18px;
    margin: 0;
    color: rgb(var(--color-primary-500));
  }

  .camera-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .camera-row {
    display: grid;
    grid-template-columns: 260px minmax(160px, 280px) 60px;
    align-items: center;
    gap: 8px;
  }

  .camera-row.toggle-row {
    grid-template-columns: 1fr;
  }

  .control-label {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    font-weight: 600;
  }

  .label-group {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .label-hint {
    font-size: 12px;
    color: rgb(var(--color-surface-500));
    font-weight: 400;
  }

  .camera-row input[type="range"] {
    width: 100%;
  }

  .camera-row input[type="number"] {
    width: 70px;
  }

  .toggle {
    display: flex;
    gap: 8px;
    align-items: center;
    font-weight: 600;
  }

  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

</style>
