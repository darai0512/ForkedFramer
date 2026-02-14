<script lang="ts">
  import type { ImagingModel, ImagingProvider } from '$protocolTypes/imagingTypes';
  import { modeOptionsTree, isModeGroup, type ModeOption, type ModeTreeItem } from '../utils/feathralImaging';
  import { calculateImagingCost } from '../utils/edgeFunctions/calculateCost';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { createPreference } from '../preferences';
  import FeathralCost from '../utils/FeathralCost.svelte';
  import { clickOutside } from '../utils/clickOutside';

  export let model: ImagingModel;
  export let group: 'imaging' | 'textedit' | 'ref' | 'page' | 'all' = 'imaging';
  export let preferenceKey: string = 'mode';
  const DEFAULT_IMAGE_SIZE = { width: 1024, height: 1024 };

  export let imageSize: { width: number; height: number } | undefined = DEFAULT_IMAGE_SIZE;
  export let comment: string = '';
  export let width: number = 300;
  export let disabled = false;
  export let placement: 'auto' | 'top' | 'bottom' = 'auto';
  export let hasSelectedImages: boolean | undefined = undefined;
  export let selectedImageCount: number | undefined = undefined;

  const preference = createPreference<ImagingModel>('imaging', preferenceKey);

  function coerceMode(v: unknown): ImagingModel {
    if (typeof v === 'string') return v as ImagingModel;
    if (v && typeof v === 'object' && 'value' in (v as any)) return (v as any).value as ImagingModel  ;
    return 'z-image';
  }

  let internalModel: ImagingModel = coerceMode(model);
  onMount(async () => {
    // マウント時点の値を記録し、非同期ロード中にユーザー選択が変わった場合は上書きしない
    const mountedModel = coerceMode(model);
    const saved = await preference.getOrDefault(mountedModel);
    const savedModel = coerceMode(saved);

    // 非同期ロード中に model/internalModel が変化していたら、遅延した保存値で上書きしない
    if (coerceMode(model) !== mountedModel || internalModel !== mountedModel) {
      return;
    }

    internalModel = savedModel;
    model = savedModel;
  });

  type DisplayModeOption = { value: ImagingModel; label: string; cost: number; uiType?: ImagingProvider; supportsGenerate: boolean; supportsEdit: boolean; refRange: { min: number; max: number } };

  function same(a: ImagingModel, b?: ImagingModel) {
    return !!b && a === b;
  }
  function included(choice: ImagingModel, opts: DisplayModeOption[]) {
    return opts.some(op => same(op.value, choice));
  }

  /**
   * group propによるフィルタ条件
   * - imaging: 参照画像なしで生成可能なモード (refRange.min === 0)
   * - textedit: テキスト編集対応モード
   * - ref: キャラ参照用途。参照画像なしでも実行可能なのでフィルタなし
   * - page: ページ単位の出力に対応したモード (pageImaging === true)
   */
  function filterByGroup() {
    switch (group) {
      case 'imaging':
        return (o: ModeOption) => o.refRange.min === 0;
      case 'textedit':
        return (o: ModeOption) => !!o.textedit;
      case 'ref':
        // 参照画像なしでも生成可能なモードのみ（キャラ参照は任意）
        return (o: ModeOption) => o.refRange.min === 0;
      case 'page':
        return (o: ModeOption) => o.pageImaging;
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
    const val = o.value as ImagingModel;
    // 現在選択中のモードは必ず残す
    if (same(val, internalModel) || same(val, model)) {
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
    const supportsCharacterRef = o.refRange.max >= 3;
    return {
      value: o.value as ImagingModel,
      label: group === 'ref' && supportsCharacterRef ? `☆ ${o.name}` : o.name,
      cost: calculateImagingCost(o.value as ImagingModel, effectiveSize, []),
      uiType: o.uiType as ImagingProvider,
      supportsGenerate: o.refRange.min === 0,
      supportsEdit: o.refRange.max > 0,
      refRange: o.refRange,
    };
  }

  // 階層構造のフィルタ済みツリー（再帰的）
  type FilteredTreeItem = DisplayModeOption | FilteredGroup;
  type FilteredGroup = { groupId: string; groupName: string; children: FilteredTreeItem[] };
  function isFilteredGroup(item: FilteredTreeItem): item is FilteredGroup {
    return 'groupId' in item && 'children' in item;
  }

  let filteredTree: FilteredTreeItem[] = [];
  let allOptions: DisplayModeOption[] = [];

  // ツリーを再帰的にフィルタリングする関数
  function filterTree(items: readonly ModeTreeItem[], flat: DisplayModeOption[]): FilteredTreeItem[] {
    const result: FilteredTreeItem[] = [];
    for (const item of items) {
      if (isModeGroup(item)) {
        const children = filterTree(item.children, flat);
        if (children.length > 0) {
          result.push({ groupId: item.groupId, groupName: item.groupName, children });
        }
      } else {
        const filtered = filterModeOption(item);
        if (filtered) {
          result.push(filtered);
          flat.push(filtered);
        }
      }
    }
    return result;
  }

  // 依存変数を明示的に参照してリアクティブに更新
  $: {
    // 依存変数を明示（Svelteが追跡できるようにする）
    const _deps = [group, selectedImageCount, hasSelectedImages, internalModel, model, imageSize];
    void _deps;

    const flat: DisplayModeOption[] = [];
    const tree = filterTree(modeOptionsTree, flat);
    filteredTree = tree;
    allOptions = flat;
  }

  // ドリルダウンの状態
  let isOpen = false;
  let currentPath: string[] = []; // グループIDのパス
  let drillDirection: 'forward' | 'back' = 'forward'; // アニメーション方向

  // パスを辿ってグループを見つけるヘルパー関数
  function findGroupByPath(items: FilteredTreeItem[], path: string[]): FilteredGroup | null {
    if (path.length === 0) return null;
    const [first, ...rest] = path;
    const grp = items.find(item => isFilteredGroup(item) && item.groupId === first);
    if (!grp || !isFilteredGroup(grp)) return null;
    if (rest.length === 0) return grp;
    return findGroupByPath(grp.children, rest);
  }

  // currentPath と filteredTree に依存してリアクティブに更新（再帰対応）
  $: currentItems = (() => {
    if (currentPath.length === 0) return filteredTree;
    const grp = findGroupByPath(filteredTree, currentPath);
    return grp ? grp.children : [];
  })();

  $: currentGroupName = (() => {
    if (currentPath.length === 0) return null;
    const grp = findGroupByPath(filteredTree, currentPath);
    return grp ? grp.groupName : null;
  })();

  let coercedOnce = false;
  function setSelection(next: ImagingModel, persist = true) {
    internalModel = next;
    model = next;
    if (persist) {
      preference.set(next).then(() => console.log('save done', next));
    }
    isOpen = false;
    currentPath = [];
  }

  $: if (!coercedOnce && internalModel && allOptions.length > 0 && !included(internalModel, allOptions)) {
    setSelection(allOptions[0].value);
    coercedOnce = true;
  }
  $: if (model && !same(model, internalModel)) {
    internalModel = coerceMode(model);
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
    currentPath = [...currentPath, groupId];
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

  $: selectedOption = allOptions.find(o => o.value === internalModel) ?? null;

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
                      class:selected={item.value === internalModel}
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
