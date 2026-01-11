<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import CameraWidget3D from './CameraWidget3D.svelte';

  let title: string;
  let imageSource: HTMLCanvasElement;

  let horizontalAngle = 0;
  let verticalAngle = 0;
  let zoom = 5;

  let cameraWidget: CameraWidget3D;

  onMount(async () => {
    const args = $modalStore[0]?.meta;
    console.log('AngleEdit Dialog mounted, modal store:', args);

    if (args) {
      title = args.title;
      if (args.imageSource) {
        imageSource = args.imageSource;
        console.log('Image source:', imageSource, 'size:', { width: imageSource.width, height: imageSource.height });
      } else {
        console.error('No image source in modal meta');
      }
    }
  });

  function handleCameraChange(event: CustomEvent<{ azimuth: number; elevation: number; distance: number }>) {
    horizontalAngle = event.detail.azimuth;
    verticalAngle = event.detail.elevation;
    zoom = event.detail.distance;
  }

  function onReset() {
    cameraWidget?.reset();
    horizontalAngle = 0;
    verticalAngle = 0;
    zoom = 5;
  }

  function onCancel() {
    modalStore.close();
  }

  function onSubmit() {
    if (!imageSource) return;

    $modalStore[0].response?.({
      image: imageSource,
      angle: {
        horizontal_angle: horizontalAngle,
        vertical_angle: verticalAngle,
        zoom: zoom,
      },
    });

    modalStore.close();
  }
</script>

<div class="card p-4 shadow-xl angle-edit-dialog">
  <header class="card-header">
    <h2>{title}</h2>
  </header>
  <section class="p-4">
    <div class="main-content-container">
      <div class="left-pane">
        <div class="widget-container">
          <CameraWidget3D
            bind:this={cameraWidget}
            bind:azimuth={horizontalAngle}
            bind:elevation={verticalAngle}
            bind:distance={zoom}
            imageSource={imageSource}
            on:change={handleCameraChange}
          />
        </div>
      </div>
      <div class="right-pane">
        <div class="right-pane-content">
          <div class="setting-section">
            <h3>{$_('dialogs.angleEdit.model')}</h3>
            <div class="fixed-model">Qwen Multiple Angles</div>
          </div>

          <div class="info-section">
            <h3>{$_('dialogs.angleEdit.cameraSettings')}</h3>
            <div class="info-grid">
              <div class="info-row">
                <span class="info-label">{$_('dialogs.angleEdit.horizontalAngle')}</span>
                <span class="info-value azimuth">{horizontalAngle}°</span>
              </div>
              <div class="info-row">
                <span class="info-label">{$_('dialogs.angleEdit.verticalAngle')}</span>
                <span class="info-value elevation">{verticalAngle}°</span>
              </div>
              <div class="info-row">
                <span class="info-label">{$_('dialogs.angleEdit.zoom')}</span>
                <span class="info-value distance">{zoom.toFixed(1)}</span>
              </div>
            </div>
            <button class="btn variant-ghost-surface btn-sm reset-btn" on:click={onReset}>
              {$_('dialogs.angleEdit.reset') || 'Reset'}
            </button>
          </div>

          <div class="hint-section">
            <p class="hint-text">{$_('dialogs.angleEdit.dragHint') || 'Drag the colored handles to adjust camera angles'}</p>
          </div>

        </div>
      </div>
    </div>
  </section>
  <footer class="card-footer">
    <div class="button-row">
      <button class="btn variant-ghost-surface" on:click={onCancel}>{$_('dialogs.cancel')}</button>
      <button class="btn variant-filled-primary" on:click={onSubmit}>{$_('dialogs.execute')}</button>
    </div>
  </footer>
</div>

<style>
  .angle-edit-dialog {
    width: 900px;
    max-width: 95vw;
  }

  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }

  .main-content-container {
    display: flex;
    gap: 16px;
    height: 500px;
  }

  .left-pane {
    flex: 2;
    display: flex;
    flex-direction: column;
  }

  .widget-container {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    overflow: hidden;
  }

  .right-pane {
    flex: 1;
    min-width: 200px;
    max-width: 280px;
    border-left: 1px solid rgb(var(--color-surface-300));
    padding-left: 16px;
    overflow-y: auto;
    max-height: 500px;
  }

  .right-pane-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .setting-section {
    margin-bottom: 0;
  }

  .fixed-model {
    font-weight: 600;
    font-family: '源暎エムゴ';
  }

  .right-pane h3 {
    font-family: '源暎エムゴ';
    font-size: 16px;
    margin: 0 0 12px 0;
    color: rgb(var(--color-primary-500));
  }

  .info-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: rgb(var(--color-surface-200));
    border-radius: 6px;
  }

  .info-label {
    font-size: 13px;
    color: rgb(var(--color-surface-600));
  }

  .info-value {
    font-weight: 600;
    font-size: 14px;
  }

  .info-value.azimuth {
    color: #E93D82;
  }

  .info-value.elevation {
    color: #00FFD0;
  }

  .info-value.distance {
    color: #FFB800;
  }

  .reset-btn {
    margin-top: 8px;
  }

  .hint-section {
    padding: 12px;
    background: rgb(var(--color-surface-100));
    border-radius: 8px;
  }

  .hint-text {
    font-size: 12px;
    color: rgb(var(--color-surface-500));
    margin: 0;
  }

  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
