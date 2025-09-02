<script lang="ts">
  import type { ImagingMode, ImagingProvider } from '$protocolTypes/imagingTypes';
  import { modeOptions as unifiedModeOptions } from '../utils/feathralImaging';
  import { calculateImagingCost } from '../utils/edgeFunctions/calculateCost';
  import { onMount } from 'svelte';
  import { createPreference } from '../preferences';
  import FeathralCost from '../utils/FeathralCost.svelte';

  // Unified Imaging Modes selector
  export let mode: ImagingMode;
  // Filter which group of modes to show: 'imaging' (default), 'textedit', or 'all'
  export let group: 'imaging' | 'textedit' | 'all' = 'imaging';
  // Optional image size to compute costs
  export let imageSize: { width: number; height: number } | undefined = undefined;
  export let comment: string = '';
  let internalMode: ImagingMode;

  const preference = createPreference<ImagingMode>("imaging", "mode");

  function coerceMode(v: unknown): ImagingMode {
    if (typeof v === 'string') return v as ImagingMode;
    if (v && typeof v === 'object' && 'value' in (v as any)) return (v as any).value as ImagingMode; // migration support
    return 'schnell';
  }

  internalMode = coerceMode(mode);

  onMount(async () => {
    const saved = await preference.getOrDefault(mode);
    internalMode = coerceMode(saved);
    mode = internalMode;
  });

  let isOpen = false;
  
  type ModeOption = { value: ImagingMode; name: string; cost: number; uiType?: ImagingProvider };
  function same(a: ImagingMode, b?: ImagingMode) { return !!b && a === b; }
  function included(choice: ImagingMode, opts: ModeOption[]) { return opts.some(op => same(op.value, choice)); }

  function filterByGroup() {
    switch (group) {
      case 'imaging':
        return (o: typeof unifiedModeOptions[number]) => (o.preferredGroup === 'imaging' || o.preferredGroup === 'both');
      case 'textedit':
        return (o: typeof unifiedModeOptions[number]) => (o.preferredGroup === 'textedit' || o.preferredGroup === 'both');
      case 'all':
      default:
        return (_o: typeof unifiedModeOptions[number]) => true;
    }
  }

  let allOptions: ModeOption[] = [];
  $: allOptions = unifiedModeOptions
    .filter(filterByGroup())
    .map(o => ({
      value: o.value as ImagingMode,
      name: (o.preferredGroup === 'imaging' ? o.name : `☆ ${o.name}`),
      cost: imageSize ? calculateImagingCost(o.value as ImagingMode, imageSize) : 0,
      uiType: o.uiType as ImagingProvider,
    }));

  $: selectedMode = internalMode ? allOptions.find(option => same(option.value, internalMode)) : undefined;
  let coercedOnce = false;
  $: if (!coercedOnce && internalMode && allOptions.length > 0 && !included(internalMode, allOptions)) {
    internalMode = allOptions[0].value;
    mode = internalMode;
    coercedOnce = true;
    preference.set(internalMode).then(() => console.log("save done", internalMode));
  }

  function toggleDropdown() { isOpen = !isOpen; }
  function selectOption(option: ModeOption) {
    internalMode = option.value;
    isOpen = false;
    mode = internalMode;
    preference.set(internalMode).then(() => console.log("save done", internalMode));
  }
  function handleClickOutside(_event: MouseEvent) { if (isOpen) isOpen = false; }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="mode-row">
  <div class="custom-select-container" role="group">
    <button type="button" class="select-display" on:click|stopPropagation={toggleDropdown} aria-haspopup="listbox" aria-expanded={isOpen}>
      {#if selectedMode}
        <span>{selectedMode.name}</span>
        <FeathralCost cost={selectedMode.cost} showsLabel={false}/>
      {/if}
    </button>
    
    {#if isOpen}
      <div class="options-container" role="listbox" tabindex="0" on:click|stopPropagation on:keydown|stopPropagation>
        {#each allOptions as option}
          <button
            type="button"
            class="option-item"
            class:selected={!!internalMode && same(option.value, internalMode)}
            role="option"
            aria-selected={same(option.value, internalMode)}
            on:click={() => selectOption(option)}
          >
            <span>{option.name}</span>
            <FeathralCost cost={option.cost} showsLabel={false}/>
          </button>
        {/each}
      </div>
    {/if}
  </div>
  {#if comment}
    <div class="comment-inline">{comment}</div>
  {/if}
</div>

<style>
  .mode-row { display: flex; align-items: center; gap: 8px; }
  .custom-select-container { position: relative; display: inline-block; width: 300px; font-family: '源暎アンチック'; }
  .select-display { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border: 2px solid var(--color-surface-400, #94a3b8); border-radius: 0.25rem; background-color: white; cursor: pointer; position: relative; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
  .select-display:hover { background-color: var(--color-surface-300, #cbd5e1); border-color: var(--color-primary-500, #3b82f6); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15); }
  .select-display::after { content: ""; width: 0.5rem; height: 0.5rem; border-right: 2px solid var(--color-surface-600, #475569); border-bottom: 2px solid var(--color-surface-600, #475569); position: absolute; right: 0.75rem; top: calc(50% - 0.4rem); transform: rotate(45deg); pointer-events: none; transition: transform 0.2s ease; }
  .custom-select-container:hover .select-display::after { border-color: var(--color-primary-500, #3b82f6); }
  .options-container { position: absolute; top: 100%; left: 0; width: 100%; max-height: fit-content; overflow: hidden; background-color: white; border: 1px solid var(--color-surface-400, #94a3b8); border-radius: 0.25rem; z-index: 10; margin-top: 0.25rem; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); }
  .option-item { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; cursor: pointer; transition: background-color 0.15s ease; }
  .option-item:hover { background-color: #e0f2fe; }
  .option-item.selected { background-color: #bae6fd; font-weight: 500; }
  .option-item.selected:hover { background-color: #e0f2fe; }
  .comment-inline { font-family: '源暎アンチック'; font-size: 12px; }
</style>
