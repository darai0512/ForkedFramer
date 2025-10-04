<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import { portal } from '../utils/portal';
  import { developmentFlag } from '../utils/developmentFlagStore';
  import type { ImageToVideoModel } from '$protocolTypes/imagingTypes';
  import { videoModelOptions as defaultVideoModelOptions } from './videoModelConfig';

  type VideoModelOption = {
    value: ImageToVideoModel;
    label: string;
    devOnly?: boolean;
  };

  export let model: ImageToVideoModel;
  export let options: VideoModelOption[] = defaultVideoModelOptions;
  export let width = 260;
  export let includeDevOptions = false;

  const dispatch = createEventDispatcher<{ change: ImageToVideoModel }>();

  let isOpen = false;
  let displayEl: HTMLButtonElement;
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

  $: filteredOptions = options.filter((option) => includeDevOptions || !option.devOnly || $developmentFlag);

  $: if (filteredOptions.length > 0 && !filteredOptions.some((option) => option.value === model)) {
    const next = filteredOptions[0].value;
    if (model !== next) {
      model = next;
      dispatch('change', model);
    }
  }

  $: selectedOption = filteredOptions.find((entry) => entry.value === model);

  function updatePortalPosition() {
    if (!displayEl) return;
    const rect = displayEl.getBoundingClientRect();
    const margin = 4;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    portalWidth = Math.round(rect.width);
    const desiredLeft = Math.round(rect.left);
    portalLeft = Math.min(Math.max(0, desiredLeft), Math.max(0, vw - portalWidth));

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    openUp = spaceBelow < 200 && spaceAbove > spaceBelow;

    if (openUp) {
      portalTop = Math.max(0, Math.round(rect.top - margin));
      portalTransform = 'translateY(calc(-100%))';
      portalMaxHeight = Math.max(120, Math.min(Math.floor(spaceAbove), Math.floor(vh * 0.6)));
    } else {
      portalTop = Math.round(rect.bottom + margin);
      portalTransform = '';
      portalMaxHeight = Math.max(120, Math.min(Math.floor(spaceBelow), Math.floor(vh * 0.6)));
    }

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
    if (filteredOptions.length === 0) return;
    isOpen = !isOpen;
    if (isOpen) {
      await tick();
      updatePortalPosition();
      attachGlobalListeners();
    } else {
      detachGlobalListeners();
    }
  }

  function selectOption(value: ImageToVideoModel) {
    if (model === value) {
      isOpen = false;
      detachGlobalListeners();
      return;
    }
    model = value;
    isOpen = false;
    dispatch('change', model);
    detachGlobalListeners();
  }

  function handleClickOutside(_event: MouseEvent) {
    if (isOpen) {
      isOpen = false;
      detachGlobalListeners();
    }
  }

  onDestroy(() => {
    detachGlobalListeners();
  });

</script>

<svelte:window on:click={handleClickOutside} />

<div class="mode-row">
  <div class="custom-select-container" style:width={`${width}px`} style:flex={`0 0 ${width}px`}>
    <button
      bind:this={displayEl}
      type="button"
      class="select-display"
      on:click|stopPropagation={toggleDropdown}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      disabled={filteredOptions.length === 0}
    >
      {#if selectedOption}
        <span class="name">{selectedOption.label}</span>
      {:else}
        <span class="placeholder">選択できるモデルがありません</span>
      {/if}
    </button>

    {#if isOpen}
      <div
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
        {#each filteredOptions as option}
          <button
            type="button"
            class="option-item"
            class:selected={option.value === model}
            role="option"
            aria-selected={option.value === model}
            on:click={() => selectOption(option.value)}
          >
            <span class="name">{option.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .mode-row {
    display: flex;
    align-items: center;
  }

  .custom-select-container {
    position: relative;
  }

  .select-display {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    background-color: rgb(var(--color-surface-0, 255 255 255));
    color: rgb(var(--color-surface-900, 15 23 42));
    border-radius: 0.75rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid rgb(var(--color-surface-400, 148 163 184));
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .select-display:hover:not(:disabled),
  .select-display:focus-visible:not(:disabled) {
    border-color: rgb(var(--color-primary-500, 59 130 246));
    box-shadow: 0 0 0 2px rgba(var(--color-primary-500, 59 130 246) / 0.12);
  }

  .select-display:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .placeholder {
    color: rgb(var(--color-surface-500, 100 116 139));
    font-size: 0.9rem;
  }

  .options-container {
    overflow-y: auto;
    background-color: rgb(var(--color-surface-0, 255 255 255));
    border: 1px solid rgb(var(--color-surface-300, 203 213 225));
    border-radius: 0.75rem;
    padding: 0.35rem;
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
  }

  .option-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    width: 100%;
    border: none;
    background: transparent;
    padding: 0.55rem 0.65rem;
    border-radius: 0.6rem;
    transition: background-color 0.12s ease, color 0.12s ease;
    text-align: left;
    cursor: pointer;
  }

  .option-item:hover,
  .option-item:focus-visible {
    background-color: rgba(var(--color-primary-500, 59 130 246) / 0.08);
  }

  .option-item.selected {
    background-color: rgba(var(--color-primary-500, 59 130 246) / 0.16);
    color: rgb(var(--color-primary-700, 37 99 235));
  }

</style>
