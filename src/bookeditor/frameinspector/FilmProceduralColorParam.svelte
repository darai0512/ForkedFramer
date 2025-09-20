<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ColorPickerLabel from '../../utils/colorpicker/ColorPickerLabel.svelte';

  export let label: string;
  export let value: string;

  const dispatch = createEventDispatcher<{ change: string }>();

  function normalize(color: string): string {
    return color?.toLowerCase() ?? '#000000';
  }

  let current = normalize(value);
  let lastEmitted = current;
  let lastReceived = current;

  $: {
    const external = normalize(value);
    if (external !== lastReceived) {
      lastReceived = external;
      current = external;
    }
  }

  $: if (current !== lastEmitted) {
    lastEmitted = current;
    lastReceived = current;
    dispatch('change', current);
  }
</script>

<div class="param-row">
  <div class="param-label">{label}</div>
  <div class="color-container">
    <div class="color-label">
      <ColorPickerLabel bind:hex={current} />
    </div>
    <span class="color-value">{current}</span>
  </div>
</div>

<style>
  .param-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .param-label {
    font-size: 14px;
    min-width: 92px;
    white-space: nowrap;
  }
  .color-container {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }
  .color-label {
    width: 36px;
    height: 20px;
  }
  .color-value {
    font-size: 0.85rem;
    color: rgb(var(--color-surface-600));
  }
</style>
