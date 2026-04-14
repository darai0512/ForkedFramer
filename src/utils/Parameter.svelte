<script lang="ts">
  import NumberEdit from "./NumberEdit.svelte";
  import { RangeSlider } from '@skeletonlabs/skeleton';

  export let label;
  export let value: number;
  export let min = 0;
  export let max = 10;
  export let step = 0.1;
  export let buttonStep = step;
  export let showStepButtons = false;

  $: uiValue = value;
  $: onChanged(uiValue);
  function onChanged(v: number) {
    value = v;
  }

  function onDec() {
    uiValue = Math.max(min, uiValue - buttonStep);
  }

  function onInc() {
    uiValue = Math.min(max, uiValue + buttonStep);
  }
</script>

<div class="entry">
  <div class="label">
    {label}
  </div>
  <div class="hbox gap-2 relative flex items-center">
    {#if showStepButtons}
      <button class="step-btn" on:click={onDec}>-</button>
    {/if}
    <div style="flex:1">
      <RangeSlider bind:value={uiValue} min={min} max={max} step={step} name="value"/>
    </div>
    {#if showStepButtons}
      <button class="step-btn" on:click={onInc}>+</button>
    {/if}
    <div class="number-box">
      <NumberEdit bind:value={uiValue} min={min} max={max} allowDecimal={true}/>
    </div>
  </div>
</div>

<style>
  .entry {
    width: 100%;
    height: 24px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
  .label {
    text-align: left;
  }
  .number-box {
    width: 50px;
    height: 20px;
    display: inline-block;
    vertical-align: bottom;
    color: #000;
  }
  .step-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(100, 116, 139, 0.4);
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
    font-weight: bold;
    font-size: 14px;
    line-height: 1;
    padding-bottom: 2px;
  }
  .step-btn:hover {
    background: rgba(100, 116, 139, 0.8);
  }
  .hbox {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex: 1;
  }
</style>