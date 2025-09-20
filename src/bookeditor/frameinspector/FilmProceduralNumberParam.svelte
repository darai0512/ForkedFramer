<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { RangeSlider } from '@skeletonlabs/skeleton';
  import NumberEdit from '../../utils/NumberEdit.svelte';
  import { onMount, onDestroy } from 'svelte';

  export let label: string;
  export let value: number;
  export let min: number;
  export let max: number;
  export let step: number;

  const dispatch = createEventDispatcher<{ change: number }>();
  const allowDecimal = Math.abs(step - Math.round(step)) > 1e-6;
  const sliderId = `film-proc-num-${Math.random().toString(36).slice(2, 8)}`;

  function clamp(v: number): number {
    if (!Number.isFinite(v)) {
      return min;
    }
    return Math.min(max, Math.max(min, v));
  }

  function nearlyEqual(a: number, b: number): boolean {
    const tolerance = allowDecimal ? Math.max(step / 100, 1e-6) : 0;
    return Math.abs(a - b) <= tolerance;
  }

  let current = clamp(value);
  let lastEmitted = current;
  let lastReceived = current;
  let cleanup: (() => void) | null = null;

  $: {
    const external = clamp(value);
    if (!nearlyEqual(external, lastReceived)) {
      lastReceived = external;
      current = external;
    }
  }

  $: if (!nearlyEqual(current, lastEmitted)) {
    lastEmitted = current;
    lastReceived = current;
    dispatch('change', current);
  }

  onMount(() => {
    const elem = document.getElementById(sliderId);
    if (!elem) { return; }
    const handler = (event: DragEvent) => {
      event.preventDefault();
    };
    elem.setAttribute('draggable', 'true');
    elem.addEventListener('dragstart', handler);
    cleanup = () => {
      elem.removeEventListener('dragstart', handler);
    };
  });

  onDestroy(() => {
    cleanup?.();
    cleanup = null;
  });
</script>

<div class="param-row">
  <div class="param-label">{label}</div>
  <div class="param-slider">
    <RangeSlider
      id={sliderId}
      name={sliderId}
      bind:value={current}
      min={min}
      max={max}
      step={step}
    />
  </div>
  <div class="param-number">
    <div class="number-box">
      <NumberEdit bind:value={current} min={min} max={max} allowDecimal={allowDecimal} />
    </div>
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
  .param-slider {
    flex: 1;
    display: flex;
    align-items: center;
  }
  .param-number {
    width: 48px;
  }
  .number-box {
    width: 100%;
    height: 24px;
    display: inline-block;
  }
  .number-box :global(input) {
    font-size: 0.85rem;
    text-align: right;
  }
</style>
