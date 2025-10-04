<script lang="ts">
  import type { ImagingMode, ImagingProvider } from '$protocolTypes/imagingTypes';
  import { modeOptions as unifiedModeOptions } from '../utils/feathralImaging';
  import { calculateImagingCost } from '../utils/edgeFunctions/calculateCost';
  import { onMount } from 'svelte';
  import { createPreference } from '../preferences';
  import FeathralCost from '../utils/FeathralCost.svelte';
  import PlainDropdown from '../utils/PlainDropdown.svelte';

  export let mode: ImagingMode;
  export let group: 'imaging' | 'textedit' | 'ref' | 'all' = 'imaging';
  const DEFAULT_IMAGE_SIZE = { width: 1024, height: 1024 };

  export let imageSize: { width: number; height: number } | undefined = DEFAULT_IMAGE_SIZE;
  export let comment: string = '';
  export let width: number = 270;
  export let disabled = false;

  const preference = createPreference<ImagingMode>('imaging', 'mode');

  function coerceMode(v: unknown): ImagingMode {
    if (typeof v === 'string') return v as ImagingMode;
    if (v && typeof v === 'object' && 'value' in (v as any)) return (v as any).value as ImagingMode; // migration support
    return 'schnell';
  }

  let internalMode: ImagingMode = coerceMode(mode);

  onMount(async () => {
    const saved = await preference.getOrDefault(mode);
    internalMode = coerceMode(saved);
    mode = internalMode;
  });

  type ModeOption = { value: ImagingMode; label: string; cost: number; uiType?: ImagingProvider };

  function same(a: ImagingMode, b?: ImagingMode) {
    return !!b && a === b;
  }
  function included(choice: ImagingMode, opts: ModeOption[]) {
    return opts.some(op => same(op.value, choice));
  }

  function filterByGroup() {
    switch (group) {
      case 'imaging':
        return (o: typeof unifiedModeOptions[number]) => !!o.imaging;
      case 'textedit':
        return (o: typeof unifiedModeOptions[number]) => !!o.textedit;
      case 'ref':
        return (o: typeof unifiedModeOptions[number]) => !!o.refImaging;
      case 'all':
      default:
        return (_o: typeof unifiedModeOptions[number]) => true;
    }
  }

  function ensureModeOption(option: unknown): ModeOption {
    return option as ModeOption;
  }

  $: effectiveImageSize = imageSize ?? DEFAULT_IMAGE_SIZE;

  let allOptions: ModeOption[] = [];
  $: allOptions = unifiedModeOptions
    .filter(filterByGroup())
    .map(o => ({
      value: o.value as ImagingMode,
      label: group === 'ref' && o.refImaging && o.textedit ? `☆ ${o.name}` : o.name,
      cost: calculateImagingCost(o.value as ImagingMode, effectiveImageSize),
      uiType: o.uiType as ImagingProvider,
    }));

  let coercedOnce = false;
  function setSelection(next: ImagingMode, persist = true) {
    internalMode = next;
    mode = next;
    if (persist) {
      preference.set(next).then(() => console.log('save done', next));
    }
  }

  $: if (!coercedOnce && internalMode && allOptions.length > 0 && !included(internalMode, allOptions)) {
    setSelection(allOptions[0].value);
    coercedOnce = true;
  }
  $: if (mode && !same(mode, internalMode)) {
    internalMode = coerceMode(mode);
  }

  function handleChange(event: CustomEvent<unknown>) {
    const next = coerceMode(event.detail);
    setSelection(next);
  }
</script>

<div class="mode-row">
  <div class="dropdown-wrapper" style:width={`${width}px`} style:flex={`0 0 ${width}px`}>
    <PlainDropdown
      class="imaging-dropdown"
      containerClass="imaging-dropdown__container"
      triggerClass="imaging-dropdown__trigger"
      listClass="imaging-dropdown__list"
      optionClass="imaging-dropdown__option"
      options={allOptions}
      bind:selectedValue={internalMode}
      on:change={handleChange}
      width={width}
      placeholder="選択可能なモードがありません"
      disabled={disabled || allOptions.length === 0}
    >
      <svelte:fragment slot="trigger" let:selectedOption>
        {#if selectedOption}
          <span>{ensureModeOption(selectedOption).label}</span>
          <span class="cost"><FeathralCost cost={ensureModeOption(selectedOption).cost} showsLabel={false} /></span>
        {:else}
          <span class="placeholder">選択可能なモードがありません</span>
        {/if}
      </svelte:fragment>
      <svelte:fragment slot="option" let:option>
        <span>{ensureModeOption(option).label}</span>
        <span class="cost"><FeathralCost cost={ensureModeOption(option).cost} showsLabel={false} /></span>
      </svelte:fragment>
    </PlainDropdown>
  </div>
  {#if comment}
    <div class="comment-inline">{comment}</div>
  {/if}
</div>

<style>
  .mode-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.imaging-dropdown__container) {
    position: relative;
    display: inline-block;
    font-family: '源暎アンチック';
    width: 100%;
  }

  .dropdown-wrapper {
    flex: 0 0 auto;
  }

  :global(.imaging-dropdown__trigger) {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 8px;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border: 2px solid var(--color-surface-400, #94a3b8);
    border-radius: 0.25rem;
    background-color: white;
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    text-align: left;
  }

  :global(.imaging-dropdown__trigger:hover:not(:disabled)),
  :global(.imaging-dropdown__trigger:focus-visible:not(:disabled)) {
    background-color: var(--color-surface-300, #cbd5e1);
    border-color: var(--color-primary-500, #3b82f6);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }

  :global(.imaging-dropdown__list) {
    margin-top: 0;
    max-height: 60vh;
    overflow: auto;
  }

  :global(.imaging-dropdown__option) {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 8px;
    align-items: center;
  }

  .placeholder {
    color: var(--color-surface-600, #475569);
  }

  .cost {
    justify-self: end;
    white-space: nowrap;
  }

  .comment-inline {
    font-family: '源暎アンチック';
    font-size: 12px;
  }
</style>
