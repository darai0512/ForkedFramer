<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Effect } from "../../lib/layeredCanvas/dataModels/effect";
  import { isWebGPUAvailable } from "../../lib/layeredCanvas/dataModels/effect";
  import { RangeSlider } from '@skeletonlabs/skeleton';
  import NumberEdit from '../../utils/NumberEdit.svelte';
	import ColorPickerLabel from '../../utils/colorpicker/ColorPickerLabel.svelte';
  import { _ } from 'svelte-i18n';

  import deleteIcon from '../../assets/filmlist/delete.webp';

  const dispatch = createEventDispatcher();

  interface Parameter {
    name: string;
  }

  $: parameterLists = {
    "OutlineEffect": [
      { name: "color", label: $_('frame.effects.color'), type: "color" },
      { name: "width", label: $_('frame.effects.width'), type: "number", min: 0, max: 0.1, step: 0.001 },
      { name: "sharp", label: $_('frame.effects.sharp'), type: "number", min: 0, max: 1, step: 0.01 },
    ],
  }
  
  $: titles = {
    "OutlineEffect": $_('frame.effects.outline'),
  }
  export let effect: Effect;
  $: effectAny = effect as any;
  $: effectTag = effect.tag as keyof typeof parameterLists;
  const webgpuAvailable = isWebGPUAvailable();

  function onDelete() {
    dispatch("delete", effect);
  }

  $: onEffectChanged(effect);
  function onEffectChanged(effect: Effect) {
    dispatch("update", effect);
  }

  function stopSortInteraction(event: Event) {
    event.stopPropagation();
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="list" on:click={e => e.stopPropagation()}>
  <div class="title-row">
    <h1>{titles[effectTag]}</h1>
    {#if !webgpuAvailable}
      <span class="webgpu-warn">現在WebGPU無効</span>
    {/if}
  </div>
  <div class="delete-icon">
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <img src={deleteIcon} alt="delete" on:click={onDelete}/>
  </div>
  {#each parameterLists[effectTag] as e}
    <div class="list-item">
      {#if e.type === "number"}
        <div class="row">
          <div class="label">{e.label}</div>
          <div
            class="slider-wrapper"
            on:pointerdown={stopSortInteraction}
          >
            <RangeSlider 
              id={`${effect.ulid}:${e.name}`}
              name={e.name} 
              bind:value={effectAny[e.name]} 
              min={e.min} 
              max={e.max} 
              step={e.step}/>
          </div>
          <div class="number-box">
            <NumberEdit bind:value={effectAny[e.name]} min={e.min} max={e.max} allowDecimal={true}/>
          </div>
        </div>
      {/if}
      {#if e.type === "color"}
        <div class="row">
            <div class="label">{e.label}</div>
          <div class="color-label">
            <ColorPickerLabel bind:hex={effectAny[e.name]}/>
          </div>
        </div>
      {/if}
    </div>
  {/each}  
</div>

<style>
  .list {
    width: 100%;
    color: black;
    position: relative;
  }
  .list-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .label {
    width: 60px;
    text-align: left;
    font-size: 14px;
  }
  .row {
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
  .slider-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
  }
  .number-box {
    width: 30px;
    height: 20px;
    display: inline-block;
    text-align: right;
    font-size: 12px;
  }
  .color-label :global(.color-picker) {
    width: 30px;
  }
  h1 {
    font-family: '源暎エムゴ';
    font-size: 16px;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .webgpu-warn {
    font-size: 11px;
    color: #c0392b;
    background: #fdecea;
    border: 1px solid #e74c3c;
    border-radius: 4px;
    padding: 1px 5px;
    white-space: nowrap;
  }
  .label {
    font-family: '源暎エムゴ';
    font-size: 14px;
  }
  .delete-icon {
    position: absolute;
    right: 0;
    top: 0;
    width: 16px;
    height: 16px;
  }
  .color-label {
    width: 30px;
    height: 20px;
    margin-left: 4px;
    margin-right: 4px;
  }
</style>
