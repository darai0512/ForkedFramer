<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let value: string;
  export let placeholder: string = '';

  const dispatch = createEventDispatcher<{ change: string }>();

  let current = value ?? '';
  let lastEmitted = current;
  let lastReceived = current;

  $: {
    const external = value ?? '';
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
  <input
    class="param-input"
    type="text"
    bind:value={current}
    placeholder={placeholder}
  />
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
  .param-input {
    flex: 1;
    min-height: 28px;
    font-size: 0.9rem;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid rgb(var(--color-surface-300));
    background: white;
  }
</style>
