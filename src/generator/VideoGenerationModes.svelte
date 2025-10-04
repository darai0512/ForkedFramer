<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { developmentFlag } from '../utils/developmentFlagStore';
  import type { ImageToVideoModel } from '$protocolTypes/imagingTypes';
  import { videoModelOptions as defaultVideoModelOptions } from './videoModelConfig';
  import PlainDropdown from '../utils/PlainDropdown.svelte';

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

  $: filteredOptions = options.filter((option) => includeDevOptions || !option.devOnly || $developmentFlag);

  $: if (filteredOptions.length > 0 && !filteredOptions.some((option) => option.value === model)) {
    const next = filteredOptions[0].value;
    if (model !== next) {
      model = next;
      dispatch('change', model);
    }
  }

  function ensureVideoOption(option: unknown): VideoModelOption {
    return option as VideoModelOption;
  }

  function handleChange(event: CustomEvent<unknown>) {
    const next = event.detail as ImageToVideoModel;
    if (model !== next) {
      model = next;
      dispatch('change', model);
    }
  }

</script>

<div class="mode-row">
  <div class="dropdown-wrapper" style:width={`${width}px`} style:flex={`0 0 ${width}px`}>
    <PlainDropdown
      class="video-mode-dropdown"
      containerClass="video-mode-dropdown__container"
      triggerClass="video-mode-dropdown__trigger"
      listClass="video-mode-dropdown__list"
      optionClass="video-mode-dropdown__option"
      options={filteredOptions}
      bind:selectedValue={model}
      on:change={handleChange}
      width={width}
      placeholder="選択できるモデルがありません"
      disabled={filteredOptions.length === 0}
    >
      <svelte:fragment slot="trigger" let:selectedOption>
        {#if selectedOption}
          <span class="name">{ensureVideoOption(selectedOption).label}</span>
        {:else}
          <span class="placeholder">選択できるモデルがありません</span>
        {/if}
      </svelte:fragment>
      <svelte:fragment slot="option" let:option>
        <span class="name">{ensureVideoOption(option).label}</span>
      </svelte:fragment>
    </PlainDropdown>
  </div>
</div>

<style>
  .mode-row {
    display: flex;
    align-items: center;
  }

  :global(.video-mode-dropdown) {
    width: 100%;
  }

  :global(.video-mode-dropdown__container) {
    width: 100%;
  }

  .dropdown-wrapper {
    flex: 0 0 auto;
  }

  :global(.video-mode-dropdown__trigger) {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border-radius: 0.75rem;
    padding: 0.6rem 0.9rem;
    background-color: rgb(var(--color-surface-0, 255 255 255));
    color: rgb(var(--color-surface-900, 15 23 42));
    border: 1px solid rgb(var(--color-surface-400, 148 163 184));
  }

  .name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .placeholder {
    color: rgb(var(--color-surface-500, 100 116 139));
    font-size: 0.9rem;
  }

  :global(.video-mode-dropdown__list) {
    border-radius: 0.75rem;
    padding: 0.35rem;
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
  }

  :global(.video-mode-dropdown__option) {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.55rem 0.65rem;
    border-radius: 0.6rem;
  }

</style>
