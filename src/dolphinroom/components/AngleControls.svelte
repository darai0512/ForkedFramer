<script lang="ts">
  import { _ } from 'svelte-i18n';
  export let rotateRightLeft: number = 0;
  export let moveForward: number = 0;
  export let verticalAngle: number = 0;
  export let wideAngleLens: boolean = false;
</script>

<div class="control-section angle-edit-panel">
  <div class="camera-table">
    <div class="camera-row">
      <span class="control-label">
        <span class="label-group">
          {$_('dialogs.angleEdit.rotate')}
          <span class="label-hint">{$_('dialogs.angleEdit.rotateDescription')}</span>
        </span>
      </span>
      <input type="range" min={-90} max={90} step={45} bind:value={rotateRightLeft} aria-label={$_('dialogs.angleEdit.rotate')} />
      <input type="number" min={-90} max={90} step={45} bind:value={rotateRightLeft} aria-label={$_('dialogs.angleEdit.rotate')} />
    </div>

    <div class="camera-row">
      <span class="control-label">
        <span class="label-group">
          {$_('dialogs.angleEdit.moveForward')}
          <span class="label-hint">{$_('dialogs.angleEdit.moveForwardDescription')}</span>
        </span>
      </span>
      <input type="range" min={0} max={10} step={2.5} bind:value={moveForward} aria-label={$_('dialogs.angleEdit.moveForward')} />
      <input type="number" min={0} max={10} step={2.5} bind:value={moveForward} aria-label={$_('dialogs.angleEdit.moveForward')} />
    </div>

    <div class="camera-row">
      <span class="control-label">
        <span class="label-group">
          {$_('dialogs.angleEdit.verticalAngle')}
          <span class="label-hint">{$_('dialogs.angleEdit.verticalAngleDescription')}</span>
        </span>
      </span>
      <input type="range" min={-1} max={1} step={0.5} bind:value={verticalAngle} aria-label={$_('dialogs.angleEdit.verticalAngle')} />
      <input type="number" min={-1} max={1} step={0.5} bind:value={verticalAngle} aria-label={$_('dialogs.angleEdit.verticalAngle')} />
    </div>

    <div class="camera-row toggle-row">
      <label class="toggle">
        <input type="checkbox" bind:checked={wideAngleLens}>
        <span>{$_('dialogs.angleEdit.wideAngleLens')}</span>
      </label>
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
</style>

