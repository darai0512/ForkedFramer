<script lang="ts">
  import type { ImagingMode, ImagingProvider } from '$protocolTypes/imagingTypes';
  import { modeOptionsTree, isModeGroup, type ModeOption } from '../utils/feathralImaging';
  import { calculateImagingCost } from '../utils/edgeFunctions/calculateCost';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { createPreference } from '../preferences';
  import FeathralCost from '../utils/FeathralCost.svelte';
  import { clickOutside } from '../utils/clickOutside';

  export let mode: ImagingMode;
  export let group: 'imaging' | 'textedit' | 'ref' | 'all' = 'imaging';
  const DEFAULT_IMAGE_SIZE = { width: 1024, height: 1024 };

  export let imageSize: { width: number; height: number } | undefined = DEFAULT_IMAGE_SIZE;
  export let comment: string = '';
  export let width: number = 300;
  export let disabled = false;
  export let placement: 'auto' | 'top' | 'bottom' = 'auto';
  export let hasSelectedImages: boolean | undefined = undefined;
  export let selectedImageCount: number | undefined = undefined;

  const preference = createPreference<ImagingMode>('imaging', 'mode');

  function coerceMode(v: unknown): ImagingMode {
    if (typeof v === 'string') return v as ImagingMode;
    if (v && typeof v === 'object' && 'value' in (v as any)) return (v as any).value as ImagingMode;
    return 'z-image';
  }

  let internalMode: ImagingMode = coerceMode(mode);

  onMount(async () => {
    const saved = await preference.getOrDefault(mode);
    internalMode = coerceMode(saved);
    mode = internalMode;
  });

  type DisplayModeOption = { value: ImagingMode; label: string; cost: number; uiType?: ImagingProvider; supportsGenerate: boolean; supportsEdit: boolean; refRange: { min: number; max: number } };

  function same(a: ImagingMode, b?: ImagingMode) {
    return !!b && a === b;
  }
  function included(choice: ImagingMode, opts: DisplayModeOption[]) {
    return opts.some(op => same(op.value, choice));
  }

  /**
   * group propによるフィルタ条件
   * - imaging: 参照画像なしで生成可能なモード (refRange.min === 0)
   * - textedit: テキスト編集対応モード
   * - ref: キャラ参照用途。参照画像なしでも実行可能なのでフィルタなし
   */
  function filterByGroup() {
    switch (group) {
      case 'imaging':
        return (o: ModeOption) => o.refRange.min === 0;
      case 'textedit':
        return (o: ModeOption) => !!o.textedit;
      case 'ref':
        // 参照画像なしで説明だけでも実行可能なのでフィルタしない
        return (_o: ModeOption) => true;
      case 'all':
      default:
        return (_o: ModeOption) => true;
    }
  }

  function getEffectiveImageSize() {
    return imageSize ?? DEFAULT_IMAGE_SIZE;
  }

  /**
   * フィルタの優先順位:
   * 1. 現在選択中のモード → 常に表示（選択が消えると困るため）
   * 2. group条件 → filterByGroup()参照
   * 3. 参照画像枚数条件 → refRange.min <= 枚数 <= refRange.max
   */
  function filterModeOption(o: ModeOption): DisplayModeOption | null {
    const val = o.value as ImagingMode;
    // 現在選択中のモードは必ず残す
    if (same(val, internalMode) || same(val, mode)) {
      return toDisplayOption(o);
    }
    // グループ条件
    if (!filterByGroup()(o)) return null;
    // 選択枚数によるフィルタ
    if (selectedImageCount !== undefined) {
      if (!(o.refRange.min <= selectedImageCount && selectedImageCount <= o.refRange.max)) {
        return null;
      }
    } else if (hasSelectedImages !== undefined) {
      // 選択状態によるフィルタ（枚数不明の場合のフォールバック）
      if (hasSelectedImages ? o.refRange.max <= 0 : o.refRange.min > 0) {
        return null;
      }
    }
    return toDisplayOption(o);
  }

  function toDisplayOption(o: ModeOption): DisplayModeOption {
    const effectiveSize = getEffectiveImageSize();
    // ☆マークは4枚以上参照可能なモデルにのみ表示（キャラ参照対応の目安）
    // 1枚のみのモデルは基本的にi2iでありキャラ参照ではない
    const supportsCharacterRef = o.refRange.max >= 4;
    return {
      value: o.value as ImagingMode,
      label: group === 'ref' && supportsCharacterRef ? `☆ ${o.name}` : o.name,
      cost: calculateImagingCost(o.value as ImagingMode, effectiveSize, []),
      uiType: o.uiType as ImagingProvider,
      supportsGenerate: o.refRange.min === 0,
      supportsEdit: o.refRange.max > 0,
      refRange: o.refRange,
    };
  }

  // 階層構造のフィルタ済みツリー
  type FilteredGroup = { groupId: string; groupName: string; children: DisplayModeOption[] };
  type FilteredTreeItem = DisplayModeOption | FilteredGroup;
  function isFilteredGroup(item: FilteredTreeItem): item is FilteredGroup {
    return 'groupId' in item && 'children' in item;
  }

  let filteredTree: FilteredTreeItem[] = [];
  let allOptions: DisplayModeOption[] = [];

  // 依存変数を明示的に参照してリアクティブに更新
  $: {
    // 依存変数を明示（Svelteが追跡できるようにする）
    const _deps = [group, selectedImageCount, hasSelectedImages, internalMode, mode, imageSize];
    void _deps;

    const tree: FilteredTreeItem[] = [];
    const flat: DisplayModeOption[] = [];
    for (const item of modeOptionsTree) {
      if (isModeGroup(item)) {
        const children: DisplayModeOption[] = [];
        for (const child of item.children) {
          const filtered = filterModeOption(child);
          if (filtered) {
            children.push(filtered);
            flat.push(filtered);
          }
        }
        if (children.length > 0) {
          tree.push({ groupId: item.groupId, groupName: item.groupName, children });
        }
      } else {
        const filtered = filterModeOption(item);
        if (filtered) {
          tree.push(filtered);
          flat.push(filtered);
        }
      }
    }
    filteredTree = tree;
    allOptions = flat;
  }

  // ドリルダウンの状態
  let isOpen = false;
  let currentPath: string[] = []; // グループIDのパス
  let drillDirection: 'forward' | 'back' = 'forward'; // アニメーション方向

  // currentPath と filteredTree に依存してリアクティブに更新
  $: currentItems = (() => {
    if (currentPath.length === 0) return filteredTree;
    // 現在は1階層のみ想定
    const groupId = currentPath[0];
    const grp = filteredTree.find(item => isFilteredGroup(item) && item.groupId === groupId);
    if (grp && isFilteredGroup(grp)) {
      return grp.children;
    }
    return [];
  })();

  $: currentGroupName = (() => {
    if (currentPath.length === 0) return null;
    const groupId = currentPath[0];
    const grp = filteredTree.find(item => isFilteredGroup(item) && item.groupId === groupId);
    if (grp && isFilteredGroup(grp)) {
      return grp.groupName;
    }
    return null;
  })();

  let coercedOnce = false;
  function setSelection(next: ImagingMode, persist = true) {
    internalMode = next;
    mode = next;
    if (persist) {
      preference.set(next).then(() => console.log('save done', next));
    }
    isOpen = false;
    currentPath = [];
  }

  $: if (!coercedOnce && internalMode && allOptions.length > 0 && !included(internalMode, allOptions)) {
    setSelection(allOptions[0].value);
    coercedOnce = true;
  }
  $: if (mode && !same(mode, internalMode)) {
    internalMode = coerceMode(mode);
  }

  function handleTriggerClick() {
    if (disabled || allOptions.length === 0) return;
    isOpen = !isOpen;
    if (!isOpen) {
      currentPath = [];
    }
  }

  function handleGroupClick(groupId: string) {
    drillDirection = 'forward';
    currentPath = [groupId];
  }

  function handleBackClick() {
    drillDirection = 'back';
    currentPath = currentPath.slice(0, -1);
  }

  function handleOptionClick(option: DisplayModeOption) {
    setSelection(option.value);
  }

  function handleClickOutside() {
    isOpen = false;
    currentPath = [];
  }

  $: selectedOption = allOptions.find(o => o.value === internalMode) ?? null;

  // キーボードナビゲーション
  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        isOpen = true;
      }
      return;
    }
    if (e.key === 'Escape') {
      if (currentPath.length > 0) {
        handleBackClick();
      } else {
        isOpen = false;
      }
      e.preventDefault();
    } else if (e.key === 'Backspace' && currentPath.length > 0) {
      handleBackClick();
      e.preventDefault();
    }
  }
</script>

<div class="mode-row">
  <div
    class="dropdown-wrapper"
    style:width={`${width}px`}
    style:flex={`0 0 ${width}px`}
    use:clickOutside={handleClickOutside}
  >
    <div class="imaging-dropdown__container">
      <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
      <button
        type="button"
        class="imaging-dropdown__trigger"
        class:disabled={disabled || allOptions.length === 0}
        on:click={handleTriggerClick}
        on:keydown={handleKeydown}
        disabled={disabled || allOptions.length === 0}
      >
        {#if selectedOption}
          <span class="label-with-chip">
            {selectedOption.label}
            {#if selectedOption.supportsGenerate}
              <span class="chip chip-generate">生成</span>
            {/if}
            {#if selectedOption.supportsEdit}
              <span class="chip chip-edit">編集({selectedOption.refRange.max})</span>
            {/if}
          </span>
          <span class="cost"><FeathralCost cost={selectedOption.cost} showsLabel={false} /></span>
        {:else}
          <span class="placeholder">選択可能なモードがありません</span>
        {/if}
      </button>

      {#if isOpen}
        <div
          class="imaging-dropdown__list"
          class:placement-top={placement === 'top'}
        >
          <!-- ドリルダウンのヘッダー（戻るボタン） -->
          {#if currentPath.length > 0}
            <button
              type="button"
              class="drilldown-back"
              on:click={handleBackClick}
            >
              <span class="back-arrow">←</span>
              <span class="back-label">{currentGroupName}</span>
            </button>
          {/if}

          <!-- リスト本体 -->
          <div class="drilldown-content" class:has-header={currentPath.length > 0}>
            {#key currentPath.join('/')}
              <div
                class="drilldown-panel"
                in:fly={{ x: drillDirection === 'forward' ? 80 : -80, duration: 150 }}
              >
                {#each currentItems as item}
                  {#if isFilteredGroup(item)}
                    <!-- グループ項目 -->
                    <button
                      type="button"
                      class="imaging-dropdown__option group-item"
                      on:click={() => handleGroupClick(item.groupId)}
                    >
                      <span class="group-label">{item.groupName} <span class="group-count">({item.children.length})</span></span>
                      <span class="group-arrow">▶</span>
                    </button>
                  {:else}
                    <!-- 通常のオプション -->
                    <button
                      type="button"
                      class="imaging-dropdown__option"
                      class:selected={item.value === internalMode}
                      on:click={() => handleOptionClick(item)}
                    >
                      <span class="label-with-chip">
                        {item.label}
                        {#if item.supportsGenerate}
                          <span class="chip chip-generate">生成</span>
                        {/if}
                        {#if item.supportsEdit}
                          <span class="chip chip-edit">編集({item.refRange.max})</span>
                        {/if}
                      </span>
                      <span class="cost"><FeathralCost cost={item.cost} showsLabel={false} /></span>
                    </button>
                  {/if}
                {/each}
              </div>
            {/key}
          </div>
        </div>
      {/if}
    </div>
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

  .imaging-dropdown__container {
    position: relative;
    display: inline-block;
    font-family: '源暎アンチック';
    width: 100%;
  }

  .dropdown-wrapper {
    flex: 0 0 auto;
  }

  .imaging-dropdown__trigger {
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
    width: 100%;
    font-family: inherit;
    font-size: inherit;
  }

  .imaging-dropdown__trigger:hover:not(:disabled),
  .imaging-dropdown__trigger:focus-visible:not(:disabled) {
    background-color: var(--color-surface-300, #cbd5e1);
    border-color: var(--color-primary-500, #3b82f6);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }

  .imaging-dropdown__trigger:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .imaging-dropdown__list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 2px solid var(--color-surface-400, #94a3b8);
    border-radius: 0.25rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    overflow: hidden;
  }

  .imaging-dropdown__list.placement-top {
    top: auto;
    bottom: 100%;
    margin-top: 0;
    margin-bottom: 4px;
  }

  .drilldown-back {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-bottom: 1px solid var(--color-surface-300, #e2e8f0);
    background: var(--color-surface-100, #f1f5f9);
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
  }

  .drilldown-back:hover {
    background: var(--color-surface-200, #e2e8f0);
  }

  .back-arrow {
    font-weight: bold;
    color: var(--color-primary-500, #3b82f6);
  }

  .back-label {
    font-weight: 600;
    color: var(--color-surface-700, #334155);
  }

  .drilldown-content {
    max-height: 50vh;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .drilldown-content.has-header {
    max-height: calc(50vh - 40px);
  }

  .drilldown-panel {
    width: 100%;
  }

  .imaging-dropdown__option {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 8px;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .imaging-dropdown__option:hover {
    background-color: var(--color-surface-200, #e2e8f0);
  }

  .imaging-dropdown__option.selected {
    background-color: var(--color-primary-100, #dbeafe);
  }

  .imaging-dropdown__option.group-item {
    background-color: var(--color-surface-50, #f8fafc);
  }

  .imaging-dropdown__option.group-item:hover {
    background-color: var(--color-surface-200, #e2e8f0);
  }

  .group-label {
    font-weight: 600;
    color: var(--color-surface-700, #334155);
  }

  .group-count {
    font-weight: normal;
    font-size: 0.85em;
    color: var(--color-surface-500, #64748b);
  }

  .group-arrow {
    color: var(--color-primary-500, #3b82f6);
    font-size: 0.8em;
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

  .label-with-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
  }

  .chip {
    display: inline-block;
    padding: 0.1em 0.35em;
    font-size: 0.65em;
    font-weight: 600;
    color: white;
    border-radius: 0.25em;
    white-space: nowrap;
  }

  .chip-generate {
    background-color: #3b82f6;
  }

  .chip-edit {
    background-color: #10b981;
  }
</style>
