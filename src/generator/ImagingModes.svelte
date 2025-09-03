<script lang="ts">
  import type { ImagingMode, ImagingProvider } from '$protocolTypes/imagingTypes';
  import { modeOptions as unifiedModeOptions } from '../utils/feathralImaging';
  import { calculateImagingCost } from '../utils/edgeFunctions/calculateCost';
  import { onMount, tick } from 'svelte';
  import { createPreference } from '../preferences';
  import FeathralCost from '../utils/FeathralCost.svelte';
  import { portal } from '../utils/portal';

  // Unified Imaging Modes selector
  export let mode: ImagingMode;
  // Filter which group of modes to show: 'imaging' (default), 'textedit', 'ref', or 'all'
  export let group: 'imaging' | 'textedit' | 'ref' | 'all' = 'imaging';
  // Optional image size to compute costs
  export let imageSize: { width: number; height: number } | undefined = undefined;
  export let comment: string = '';
  // Fixed width for the trigger/dropdown (px)
  export let width: number = 270;
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

  let allOptions: ModeOption[] = [];
  $: allOptions = unifiedModeOptions
    .filter(filterByGroup())
    .map(o => ({
      value: o.value as ImagingMode,
      name: (group == 'ref' && o.refImaging && o.textedit ? `☆ ${o.name}` : o.name),
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

  let displayEl: HTMLButtonElement;
  let optionsEl: HTMLDivElement;
  let portalTop = 0;
  let portalLeft = 0;
  let portalWidth = 0;
  let portalMaxHeight = 0;
  let openUp = false;
  let portalTransform = '';
  let portalFontFamily = '';
  let portalFontSize = '';
  let portalLineHeight = '';
  let portalColor = '';
  let portalFontWeight = '';

  function updatePortalPosition() {
    if (!displayEl) return;
    const rect = displayEl.getBoundingClientRect();
    const margin = 4; // space between button and dropdown
    // Clamp within viewport width
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const desiredLeft = Math.round(rect.left);
    portalWidth = Math.round(rect.width);
    // Clamp within viewport without adding artificial margins
    portalLeft = Math.min(Math.max(0, desiredLeft), Math.max(0, vw - portalWidth));

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    // Choose direction: flip upward if below space is tight
    openUp = spaceBelow < 200 && spaceAbove > spaceBelow;

    if (openUp) {
      // Place top at trigger top and translate upward by full height + margin
      portalTop = Math.max(0, Math.round(rect.top - margin));
      portalTransform = `translateY(calc(-100%))`;
      portalMaxHeight = Math.max(120, Math.min(Math.floor(spaceAbove), Math.floor(vh * 0.6)));
    } else {
      portalTop = Math.round(rect.bottom + margin);
      portalTransform = '';
      portalMaxHeight = Math.max(120, Math.min(Math.floor(spaceBelow), Math.floor(vh * 0.6)));
    }

    // Inherit critical text styles from trigger to keep layout consistent
    const cs = getComputedStyle(displayEl);
    portalFontFamily = cs.fontFamily;
    portalFontSize = cs.fontSize;
    portalLineHeight = cs.lineHeight;
    portalColor = cs.color;
    portalFontWeight = cs.fontWeight;
  }

  function attachGlobalListeners() {
    window.addEventListener('scroll', updatePortalPosition, true);
    window.addEventListener('resize', updatePortalPosition);
  }
  function detachGlobalListeners() {
    window.removeEventListener('scroll', updatePortalPosition, true);
    window.removeEventListener('resize', updatePortalPosition);
  }

  async function toggleDropdown() {
    isOpen = !isOpen;
    if (isOpen) {
      await tick();
      updatePortalPosition();
      attachGlobalListeners();
    } else {
      detachGlobalListeners();
    }
  }
  function selectOption(option: ModeOption) {
    internalMode = option.value;
    isOpen = false;
    mode = internalMode;
    preference.set(internalMode).then(() => console.log("save done", internalMode));
    detachGlobalListeners();
  }
  function handleClickOutside(_event: MouseEvent) {
    if (isOpen) {
      isOpen = false;
      detachGlobalListeners();
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="mode-row">
  <div class="custom-select-container" role="group" style:width={`${width}px`} style:flex={`0 0 ${width}px`}>
    <button bind:this={displayEl} type="button" class="select-display" on:click|stopPropagation={toggleDropdown} aria-haspopup="listbox" aria-expanded={isOpen}>
      {#if selectedMode}
        <span>{selectedMode.name}</span>
        <span class="cost"><FeathralCost cost={selectedMode.cost} showsLabel={false}/></span>
      {/if}
    </button>
    
    {#if isOpen}
      <div
        bind:this={optionsEl}
        use:portal
        class="options-container portaled"
        role="listbox"
        tabindex="0"
        on:click|stopPropagation
        on:keydown|stopPropagation
        style:position="fixed"
        style:top={`${portalTop}px`}
        style:left={`${portalLeft}px`}
        style:width={`${portalWidth}px`}
        style:max-height={`${portalMaxHeight}px`}
        style:transform={portalTransform}
        style:font-family={portalFontFamily}
        style:font-size={portalFontSize}
        style:line-height={portalLineHeight}
        style:color={portalColor}
        style:font-weight={portalFontWeight}
        style:z-index={2147483647}
      >
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
            <span class="cost"><FeathralCost cost={option.cost} showsLabel={false}/></span>
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
    .custom-select-container { position: relative; display: inline-block; font-family: '源暎アンチック'; }
    .select-display { width: 100%; display: grid; grid-template-columns: 1fr auto; column-gap: 8px; align-items: center; padding: 0.5rem 0.75rem; border: 2px solid var(--color-surface-400, #94a3b8); border-radius: 0.25rem; background-color: white; cursor: pointer; position: relative; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); text-align: left; }
  .select-display:hover { background-color: var(--color-surface-300, #cbd5e1); border-color: var(--color-primary-500, #3b82f6); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15); }
  .select-display::after { content: ""; width: 0.5rem; height: 0.5rem; border-right: 2px solid var(--color-surface-600, #475569); border-bottom: 2px solid var(--color-surface-600, #475569); position: absolute; right: 0.75rem; top: calc(50% - 0.4rem); transform: rotate(45deg); pointer-events: none; transition: transform 0.2s ease; }
  .custom-select-container:hover .select-display::after { border-color: var(--color-primary-500, #3b82f6); }
  .options-container { position: absolute; top: 100%; left: 0; width: 100%; max-height: fit-content; overflow: hidden; background-color: white; border: 1px solid var(--color-surface-400, #94a3b8); border-radius: 0.25rem; z-index: 10; margin-top: 0.25rem; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); }
  /* When portaled to body, override positional concerns */
  .options-container.portaled { margin-top: 0; max-height: 60vh; overflow: auto; }
  .option-item { width: 100%; display: grid; grid-template-columns: 1fr auto; column-gap: 8px; align-items: center; padding: 0.5rem 0.75rem; cursor: pointer; transition: background-color 0.15s ease; text-align: left; }
  .cost { justify-self: end; white-space: nowrap; }
  .option-item:hover { background-color: #e0f2fe; }
  .option-item.selected { background-color: #bae6fd; font-weight: 500; }
  .option-item.selected:hover { background-color: #e0f2fe; }
  .comment-inline { font-family: '源暎アンチック'; font-size: 12px; }
</style>
