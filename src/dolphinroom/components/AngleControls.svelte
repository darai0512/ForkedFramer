<script lang="ts">
  import { _ } from 'svelte-i18n';
  export let horizontalAngle: number = 0;
  export let verticalAngle: number = 0;
  export let zoom: number = 5;
</script>

<div class="control-section angle-edit-panel">
  <div class="camera-table">
    <div class="camera-row">
      <span class="control-label">
        <span class="label-group">
          {$_('dialogs.angleEdit.horizontalAngle')}
          <span class="label-hint">{$_('dialogs.angleEdit.horizontalAngleDescription')}</span>
        </span>
      </span>
      <input type="range" min={0} max={360} step={15} bind:value={horizontalAngle} aria-label={$_('dialogs.angleEdit.horizontalAngle')} />
      <input type="number" min={0} max={360} step={15} bind:value={horizontalAngle} aria-label={$_('dialogs.angleEdit.horizontalAngle')} />
    </div>

    <div class="camera-row">
      <span class="control-label">
        <span class="label-group">
          {$_('dialogs.angleEdit.verticalAngle')}
          <span class="label-hint">{$_('dialogs.angleEdit.verticalAngleDescription')}</span>
        </span>
      </span>
      <input type="range" min={-30} max={90} step={15} bind:value={verticalAngle} aria-label={$_('dialogs.angleEdit.verticalAngle')} />
      <input type="number" min={-30} max={90} step={15} bind:value={verticalAngle} aria-label={$_('dialogs.angleEdit.verticalAngle')} />
    </div>

    <div class="camera-row">
      <span class="control-label">
        <span class="label-group">
          {$_('dialogs.angleEdit.zoom')}
          <span class="label-hint">{$_('dialogs.angleEdit.zoomDescription')}</span>
        </span>
      </span>
      <input type="range" min={0} max={10} step={1} bind:value={zoom} aria-label={$_('dialogs.angleEdit.zoom')} />
      <input type="number" min={0} max={10} step={1} bind:value={zoom} aria-label={$_('dialogs.angleEdit.zoom')} />
    </div>
  </div>
</div>

<style>
  .angle-edit-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
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
</style>

