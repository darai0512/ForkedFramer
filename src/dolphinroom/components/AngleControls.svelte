<script lang="ts">
  import { _ } from 'svelte-i18n';
  import CameraWidget3D from '../../utils/CameraWidget3D.svelte';

  export let horizontalAngle: number = 0;
  export let verticalAngle: number = 0;
  export let zoom: number = 5;
  export let imageSource: HTMLCanvasElement | null = null;

  let cameraWidget: CameraWidget3D;

  function handleCameraChange(event: CustomEvent<{ azimuth: number; elevation: number; distance: number }>) {
    horizontalAngle = event.detail.azimuth;
    verticalAngle = event.detail.elevation;
    zoom = event.detail.distance;
  }

  export function reset() {
    cameraWidget?.reset();
    horizontalAngle = 0;
    verticalAngle = 0;
    zoom = 5;
  }
</script>

<div class="angle-controls-container">
  <div class="widget-wrapper">
    <CameraWidget3D
      bind:this={cameraWidget}
      bind:azimuth={horizontalAngle}
      bind:elevation={verticalAngle}
      bind:distance={zoom}
      {imageSource}
      on:change={handleCameraChange}
    />
  </div>
  <div class="info-panel">
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
      <span class="info-value distance">{zoom}</span>
    </div>
    <button class="btn variant-ghost-surface btn-sm reset-btn" on:click={reset}>
      {$_('dialogs.angleEdit.reset') || 'Reset'}
    </button>
  </div>
</div>

<style>
  .angle-controls-container {
    display: flex;
    gap: 16px;
    width: 100%;
    height: 300px;
  }

  .widget-wrapper {
    flex: 1;
    min-width: 300px;
    border-radius: 8px;
    overflow: hidden;
  }

  .info-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 160px;
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
</style>

