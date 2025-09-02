<script lang="ts">
  import type { ImagingMode, ImagingProvider } from '$protocolTypes/imagingTypes';
  import { textToImageModeOptions, textEditModeOptions, type ModeChoice } from '../utils/feathralImaging';
  import { calculateTextEditCost, calculateT2iCost } from '../utils/edgeFunctions/calculateCost';
  import { onMount } from 'svelte';
  import { createPreference } from '../preferences';
  import FeathralCost from '../utils/FeathralCost.svelte';

  // Selected mode now supports both imaging and text edit
  export let mode: ModeChoice;
  // When true, also show text edit modes in the list
  export let allowTextEdit: boolean = false;
  // Optionally provide image size to compute text edit costs
  export let imageSize: { width: number; height: number } | undefined = undefined;
  export let comment: string = '';
  let internalMode: ModeChoice;

  const preference = createPreference<ModeChoice>("imaging", "mode");

  function toModeChoice(v: unknown): ModeChoice {
    // Migration support: legacy value was ImagingMode (string)
    if (typeof v === 'string') {
      return { type: 'imaging', value: v as ImagingMode };
    }
    return (v as ModeChoice) ?? { type: 'imaging', value: 'schnell' };
  }

  // initialize immediately to avoid undefined during first render
  internalMode = toModeChoice(mode);

  onMount(async () => {
    const saved = await preference.getOrDefault(mode);
    internalMode = toModeChoice(saved);
    mode = internalMode;
  });

  // keep prop 'mode' in sync on user actions or coercion; avoid general reactive sync to prevent cycles
  
  // ドロップダウンの開閉状態
  let isOpen = false;
  
  type ModeOption = { value: ModeChoice; name: string; cost: number; uiType?: ImagingProvider };
  function same(a: ModeChoice, b?: ModeChoice) { return !!b && a.type === b.type && a.value === b.value; }
  function included(choice: ModeChoice, opts: ModeOption[]) { return opts.some(op => same(op.value, choice)); }

  // Build selectable options
  let imagingOptions: ModeOption[] = [];
  let textEditOptions: ModeOption[] = [];
  let allOptions: ModeOption[] = [];
  $: imagingOptions = textToImageModeOptions.map(o => ({ value: { type: 'imaging', value: o.value } as ModeChoice, name: o.name, cost: imageSize ? calculateT2iCost(o.value as ImagingMode, imageSize) : o.cost, uiType: o.uiType }));
  $: textEditOptions = textEditModeOptions.filter(o => o.t2i).map(o => ({ 
    value: { type: 'textEdit', value: o.value } as ModeChoice, 
    name: `☆ ${o.name}`, 
    cost: imageSize ? calculateTextEditCost(o.value, imageSize) : 0 
  }));
  $: allOptions = allowTextEdit ? [...imagingOptions, ...textEditOptions] : imagingOptions;

  // 選択されたモードのコスト取得
  $: selectedMode = internalMode ? allOptions.find(option => same(option.value, internalMode)) : undefined;
  // If current selection is not available (e.g., filtered out), fallback once to first option
  let coercedOnce = false;
  $: if (!coercedOnce && internalMode && allOptions.length > 0 && !included(internalMode, allOptions)) {
    internalMode = allOptions[0].value;
    mode = internalMode;
    coercedOnce = true;
    preference.set(internalMode).then(() => console.log("save done", internalMode));
  }
  
  // ドロップダウンの開閉を切り替える
  function toggleDropdown() {
    isOpen = !isOpen;
  }
  
  // 選択処理
  function selectOption(option: ModeOption) {
    internalMode = option.value;
    isOpen = false;
    mode = internalMode;
    preference.set(internalMode).then(() => console.log("save done", internalMode));
  }
  
  // 外部クリックでドロップダウンを閉じる
  function handleClickOutside(event: MouseEvent) {
    if (isOpen) {
      isOpen = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="mode-row">
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="custom-select-container" on:click|stopPropagation>
    <div class="select-display" on:click={toggleDropdown}>
      {#if selectedMode}
        <span>{selectedMode.name}</span>
        <FeathralCost cost={selectedMode.cost} showsLabel={false}/>
      {/if}
    </div>
    
    {#if isOpen}
      <div class="options-container">
        {#each allOptions as option}
          <div
            class="option-item"
            class:selected={!!internalMode && same(option.value, internalMode)}
            on:click={() => selectOption(option)}
          >
            <span>{option.name}</span>
            <FeathralCost cost={option.cost} showsLabel={false}/>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  {#if comment}
    <div class="comment-inline">{comment}</div>
  {/if}
</div>

<style>
  .mode-row {
    display: flex;
    align-items: center; /* 縦センタリング */
    gap: 8px;
  }

  .custom-select-container {
    position: relative;
    display: inline-block;
    width: 300px;
    font-family: '源暎アンチック';
  }
  
  .select-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border: 2px solid var(--color-surface-400, #94a3b8);
    border-radius: 0.25rem;
    background-color: white;
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .select-display:hover {
    background-color: var(--color-surface-300, #cbd5e1);
    border-color: var(--color-primary-500, #3b82f6);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }
  
  .select-display::after {
    content: "";
    width: 0.5rem;
    height: 0.5rem;
    border-right: 2px solid var(--color-surface-600, #475569);
    border-bottom: 2px solid var(--color-surface-600, #475569);
    position: absolute;
    right: 0.75rem;
    top: calc(50% - 0.4rem);
    transform: rotate(45deg);
    pointer-events: none;
    transition: transform 0.2s ease;
  }
  
  .custom-select-container:hover .select-display::after {
    border-color: var(--color-primary-500, #3b82f6);
  }
  
  .options-container {
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    max-height: fit-content;
    overflow: hidden;
    background-color: white;
    border: 1px solid var(--color-surface-400, #94a3b8);
    border-radius: 0.25rem;
    z-index: 10;
    margin-top: 0.25rem;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  }
  
  .option-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  
  .option-item:hover {
    background-color: #e0f2fe; /* 薄い水色 */
  }
  
  /* 選択中の項目のスタイル - ホバーされていない時 */
  .option-item.selected {
    background-color: #bae6fd; /* より濃い水色で選択中を表示 */
    font-weight: 500;
  }
  
  /* 選択中の項目のホバー時のスタイル - ホバーが優先されるように */
  .option-item.selected:hover {
    background-color: #e0f2fe; /* ホバー時は他と同じ薄い水色に */
  }
  
  .comment-inline {
    font-family: '源暎アンチック';
    font-size: 12px;
    color: var(--color-surface-700, #334155);
    white-space: nowrap; /* 折り返さず同じ行に保持 */
  }
</style>
