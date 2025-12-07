<script lang="ts">
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import { portal } from './portal';

  type DropdownOption<T = unknown> = {
    value: T;
    label?: string;
    disabled?: boolean;
  };

  type DropdownValue = DropdownOption['value'];

  export let options: DropdownOption[] = [];
  export let selectedValue: DropdownValue | undefined;
  export let disabled = false;
  export let placeholder = '選択してください';
  export let width: number | undefined = undefined;
  export let closeOnSelect = true;
  export let containerClass = '';
  export let triggerClass = '';
  export let listClass = '';
  export let optionClass = '';
  export let placement: 'auto' | 'top' | 'bottom' = 'auto';
  export let match: (optionValue: DropdownValue, current: DropdownValue | undefined) => boolean = (optionValue, current) => optionValue === current;
  export let optionKey = (option: DropdownOption) => option.value;

  const dispatch = createEventDispatcher<{ change: DropdownValue }>();

  let triggerEl: HTMLButtonElement | undefined;
  let isOpen = false;
  let portalTop = 0;
  let portalLeft = 0;
  let portalWidth = 0;
  let portalMaxHeight = 0;
  let portalTransform = '';
  let openUp = false;
  let portalFontFamily = '';
  let portalFontSize = '';
  let portalLineHeight = '';
  let portalColor = '';
  let portalFontWeight = '';

  $: selectedOption = options.find(option => match(option.value, selectedValue));
  $: widthStyle = width !== undefined ? `${width}px` : undefined;

  function updatePortalPosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const margin = 4;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    portalWidth = Math.round(rect.width);
    const desiredLeft = Math.round(rect.left);
    portalLeft = Math.min(Math.max(0, desiredLeft), Math.max(0, vw - portalWidth));

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    if (placement === 'top') {
      openUp = true;
    } else if (placement === 'bottom') {
      openUp = false;
    } else {
      openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    }

    if (openUp) {
      portalTop = Math.max(0, Math.round(rect.top - margin));
      portalTransform = 'translateY(calc(-100%))';
      portalMaxHeight = Math.max(120, Math.min(Math.floor(spaceAbove), Math.floor(vh * 0.6)));
    } else {
      portalTop = Math.round(rect.bottom + margin);
      portalTransform = '';
      portalMaxHeight = Math.max(120, Math.min(Math.floor(spaceBelow), Math.floor(vh * 0.6)));
    }

    const cs = getComputedStyle(triggerEl);
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

  async function openDropdown() {
    if (disabled || options.length === 0) return;
    if (isOpen) return;
    isOpen = true;
    await tick();
    updatePortalPosition();
    attachGlobalListeners();
  }

  function closeDropdown() {
    if (!isOpen) return;
    isOpen = false;
    detachGlobalListeners();
  }

  async function toggleDropdown() {
    if (isOpen) {
      closeDropdown();
    } else {
      await openDropdown();
    }
  }

  function selectOption(option: DropdownOption) {
    if (option.disabled) return;
    const next = option.value;
    const alreadySelected = match(next, selectedValue);
    selectedValue = next;
    if (!alreadySelected) {
      dispatch('change', next);
    }
    if (closeOnSelect) {
      closeDropdown();
    }
  }

  function handleClickOutside() {
    if (isOpen) {
      closeDropdown();
    }
  }

  onDestroy(detachGlobalListeners);

  $: if (isOpen) {
    tick().then(() => {
      updatePortalPosition();
    });
  }

  $: if (isOpen && (disabled || options.length === 0)) {
    closeDropdown();
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class={`plain-dropdown ${containerClass}`} style:width={widthStyle} {...$$restProps}>
  <button
    type="button"
    class={`plain-dropdown__trigger ${triggerClass}`}
    class:is-open={isOpen}
    bind:this={triggerEl}
    on:click|stopPropagation={toggleDropdown}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    disabled={disabled || options.length === 0}
  >
    <span class="plain-dropdown__label">
      <slot name="trigger" selectedOption={selectedOption} isOpen={isOpen} placeholder={placeholder}>
        {#if selectedOption}
          {selectedOption.label ?? `${selectedOption.value}`}
        {:else}
          <span class="plain-dropdown__placeholder">{placeholder}</span>
        {/if}
      </slot>
    </span>
    <span class="plain-dropdown__icon" aria-hidden="true">▾</span>
  </button>

  {#if isOpen}
    <div
      use:portal
      class={`plain-dropdown__list ${listClass}`}
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
      {#each options as option (optionKey(option))}
        {@const isSelected = match(option.value, selectedValue)}
        <button
          type="button"
          class={`plain-dropdown__option ${optionClass}`}
          class:selected={isSelected}
          role="option"
          aria-selected={isSelected}
          on:click={() => selectOption(option)}
          disabled={option.disabled}
        >
          <slot name="option" option={option} isSelected={isSelected}>
            {option.label ?? `${option.value}`}
          </slot>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .plain-dropdown {
    position: relative;
    display: inline-block;
  }

  .plain-dropdown__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    border: 1px solid rgb(var(--color-surface-400, 148 163 184));
    border-radius: 0.5rem;
    background-color: rgb(var(--color-surface-0, 255 255 255));
    color: inherit;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    text-align: left;
  }

  .plain-dropdown__label {
    flex: 1 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .plain-dropdown__trigger:hover:not(:disabled),
  .plain-dropdown__trigger:focus-visible:not(:disabled) {
    border-color: rgb(var(--color-primary-500, 59 130 246));
    box-shadow: 0 0 0 2px rgba(var(--color-primary-500, 59 130 246) / 0.12);
  }

  .plain-dropdown__trigger:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .plain-dropdown__icon {
    flex: 0 0 auto;
    transition: transform 0.2s ease;
    color: rgb(var(--color-surface-500, 100 116 139));
    font-size: 0.75rem;
    display: inline-flex;
    align-items: center;
  }

  .plain-dropdown__trigger.is-open .plain-dropdown__icon {
    transform: rotate(-180deg);
  }

  .plain-dropdown__placeholder {
    color: rgb(var(--color-surface-500, 100 116 139));
  }

  .plain-dropdown__list {
    background-color: rgb(var(--color-surface-0, 255 255 255));
    border: 1px solid rgb(var(--color-surface-300, 203 213 225));
    border-radius: 0.5rem;
    padding: 0.25rem;
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
    overflow-y: auto;
  }

  .plain-dropdown__option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    border: none;
    background: transparent;
    padding: 0.5rem 0.75rem;
    border-radius: 0.4rem;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.12s ease, color 0.12s ease;
  }

  .plain-dropdown__option:hover:not(:disabled),
  .plain-dropdown__option:focus-visible:not(:disabled) {
    background-color: rgba(var(--color-primary-500, 59 130 246) / 0.08);
  }

  .plain-dropdown__option.selected {
    background-color: rgba(var(--color-primary-500, 59 130 246) / 0.16);
    color: rgb(var(--color-primary-700, 37 99 235));
  }

  .plain-dropdown__option:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
