<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { RadioGroup, RadioItem } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import ColorPickerLabel from '../utils/colorpicker/ColorPickerLabel.svelte';
  import FontSelect from '../utils/FontSelect.svelte';
  import {
    type BubbleStyleTemplate,
    type BubbleStyleEntry,
    type FillColorMode,
    STANDARD_BUBBLE_STYLE_ENTRY,
  } from '../lib/layeredCanvas/dataModels/bubbleStyleTemplate';

  const AI_SHAPES = ["soft", "polygon", "shout", "rounded", "square", "ellipse", "none"] as const;
  const SHAPE_LABELS: Record<string, string> = {
    soft: "やわらか",
    polygon: "多角形",
    shout: "シャウト",
    rounded: "角丸",
    square: "四角形",
    ellipse: "楕円",
    none: "なし",
  };

  const KNOWN_SEMANTICS = ["title"] as const;
  const SEMANTICS_LABELS: Record<string, string> = {
    title: "タイトル",
  };

  let templates: BubbleStyleTemplate[] = [];
  let selectedIndex: number = 0;
  let editingTemplate: BubbleStyleTemplate;

  // オーバーライド編集用（シェイプ/セマンティクス共通）
  let editingOverrideKind: 'shape' | 'semantics' | null = null;
  let editingOverrideKey: string | null = null;
  let editingOverrideEntry: BubbleStyleEntry | null = null;

  onMount(() => {
    const args = $modalStore[0]?.meta;
    if (args) {
      templates = JSON.parse(JSON.stringify(args.templates));
      selectedIndex = args.selectedIndex;
      if (args.addNew) {
        onAddTemplate();
      }
    }
    editingTemplate = templates[selectedIndex];
  });

  $: if (templates.length > 0 && selectedIndex >= 0 && selectedIndex < templates.length) {
    editingTemplate = templates[selectedIndex];
  }

  function onAddTemplate() {
    const newTemplate: BubbleStyleTemplate = {
      name: `テンプレート${templates.length}`,
      defaultStyle: { ...STANDARD_BUBBLE_STYLE_ENTRY, optionOverrides: { ...STANDARD_BUBBLE_STYLE_ENTRY.optionOverrides } },
    };
    templates.push(newTemplate);
    templates = templates;
    selectedIndex = templates.length - 1;
  }

  // オーバーライド管理（shape/semantics共通）
  function getOverridesMap(kind: 'shape' | 'semantics'): Partial<Record<string, Partial<BubbleStyleEntry>>> | undefined {
    return kind === 'shape' ? editingTemplate?.shapeOverrides : editingTemplate?.semanticsOverrides;
  }

  function ensureOverridesMap(kind: 'shape' | 'semantics'): Record<string, Partial<BubbleStyleEntry>> {
    if (kind === 'shape') {
      if (!editingTemplate.shapeOverrides) editingTemplate.shapeOverrides = {};
      return editingTemplate.shapeOverrides as Record<string, Partial<BubbleStyleEntry>>;
    } else {
      if (!editingTemplate.semanticsOverrides) editingTemplate.semanticsOverrides = {};
      return editingTemplate.semanticsOverrides as Record<string, Partial<BubbleStyleEntry>>;
    }
  }

  function getOverrideKeys(kind: 'shape' | 'semantics'): string[] {
    const map = getOverridesMap(kind);
    return map ? Object.keys(map) : [];
  }

  function buildFullEntry(override: Partial<BubbleStyleEntry>): BubbleStyleEntry {
    const def = editingTemplate.defaultStyle;
    return {
      ...def,
      optionOverrides: { ...def.optionOverrides },
      fillColorMode: def.fillColorMode.kind === 'fixed'
        ? { kind: 'fixed', color: def.fillColorMode.color }
        : { kind: 'themeColor', whitenRatio: def.fillColorMode.whitenRatio },
      ...override,
      ...(override.optionOverrides ? { optionOverrides: { ...def.optionOverrides, ...override.optionOverrides } } : {}),
      ...(override.fillColorMode ? { fillColorMode: override.fillColorMode } : {}),
    };
  }

  function onAddOverride(kind: 'shape' | 'semantics', key: string) {
    const map = ensureOverridesMap(kind);
    map[key] = {};
    editingOverrideKind = kind;
    editingOverrideKey = key;
    editingOverrideEntry = buildFullEntry({});
    templates = templates;
  }

  function onEditOverride(kind: 'shape' | 'semantics', key: string) {
    editingOverrideKind = kind;
    editingOverrideKey = key;
    const map = getOverridesMap(kind);
    editingOverrideEntry = buildFullEntry(map?.[key] ?? {});
  }

  function computeDiff(entry: BubbleStyleEntry): Partial<BubbleStyleEntry> {
    const diff: Partial<BubbleStyleEntry> = {};
    const def = editingTemplate.defaultStyle;
    if (entry.fontFamily !== def.fontFamily) diff.fontFamily = entry.fontFamily;
    if (entry.fontWeight !== def.fontWeight) diff.fontWeight = entry.fontWeight;
    if (entry.n_fontSize !== def.n_fontSize) diff.n_fontSize = entry.n_fontSize;
    if (entry.fontColor !== def.fontColor) diff.fontColor = entry.fontColor;
    if (entry.direction !== def.direction) diff.direction = entry.direction;
    if (JSON.stringify(entry.fillColorMode) !== JSON.stringify(def.fillColorMode)) diff.fillColorMode = entry.fillColorMode;
    if (entry.strokeColor !== def.strokeColor) diff.strokeColor = entry.strokeColor;
    if (entry.n_strokeWidth !== def.n_strokeWidth) diff.n_strokeWidth = entry.n_strokeWidth;
    if (entry.outlineColor !== def.outlineColor) diff.outlineColor = entry.outlineColor;
    if (entry.n_outlineWidth !== def.n_outlineWidth) diff.n_outlineWidth = entry.n_outlineWidth;
    if (JSON.stringify(entry.optionOverrides) !== JSON.stringify(def.optionOverrides)) diff.optionOverrides = entry.optionOverrides;
    return diff;
  }

  function onSaveOverride() {
    if (!editingOverrideKind || !editingOverrideKey || !editingOverrideEntry) return;
    const map = ensureOverridesMap(editingOverrideKind);
    const diff = computeDiff(editingOverrideEntry);
    if (Object.keys(diff).length === 0) {
      delete map[editingOverrideKey];
    } else {
      map[editingOverrideKey] = diff;
    }
    editingOverrideKind = null;
    editingOverrideKey = null;
    editingOverrideEntry = null;
    templates = templates;
  }

  function onCancelOverride() {
    editingOverrideKind = null;
    editingOverrideKey = null;
    editingOverrideEntry = null;
  }

  function onRemoveOverride(kind: 'shape' | 'semantics', key: string) {
    const map = getOverridesMap(kind);
    if (map) {
      delete map[key];
      if (Object.keys(map).length === 0) {
        if (kind === 'shape') delete editingTemplate.shapeOverrides;
        else delete editingTemplate.semanticsOverrides;
      }
      templates = templates;
    }
  }

  function availableShapesForOverride(): string[] {
    const existing = getOverrideKeys('shape');
    return AI_SHAPES.filter(s => !existing.includes(s));
  }

  function availableSemanticsForOverride(): string[] {
    const existing = getOverrideKeys('semantics');
    return KNOWN_SEMANTICS.filter(s => !existing.includes(s));
  }

  function onAddShapeOverrideFromSelect() {
    const sel = document.getElementById('add-shape-override-select') as HTMLSelectElement | null;
    if (sel) onAddOverride('shape', sel.value);
  }

  function onAddSemanticsOverrideFromSelect() {
    const sel = document.getElementById('add-semantics-override-select') as HTMLSelectElement | null;
    if (sel) onAddOverride('semantics', sel.value);
  }

  // fillColorMode helpers
  function setFillColorKind(style: BubbleStyleEntry, kind: 'fixed' | 'themeColor') {
    if (kind === 'fixed') {
      style.fillColorMode = { kind: 'fixed', color: '#ffffffE6' };
    } else {
      style.fillColorMode = { kind: 'themeColor', whitenRatio: 0.85 };
    }
  }

  function setOverrideFillColorKind(kind: 'fixed' | 'themeColor') {
    if (editingOverrideEntry) {
      setFillColorKind(editingOverrideEntry, kind);
      editingOverrideEntry = editingOverrideEntry;
    }
  }

  function onSave() {
    $modalStore[0].response?.({ templates, selectedIndex });
    modalStore.close();
  }

  function onCancel() {
    $modalStore[0].response?.(null);
    modalStore.close();
  }
</script>

<div class="card p-4 shadow-xl editor-card">
  <header class="card-header">
    <h2>フキダシスタイルテンプレート</h2>
  </header>

  <section class="p-4 editor-body">
    {#if editingTemplate}
      <!-- テンプレート名 -->
      <div class="flex items-center gap-2 mb-4">
        <span class="text-sm">名前:</span>
        <input type="text" class="input text-sm px-2 py-1" style="width: 200px;" bind:value={editingTemplate.name} disabled={selectedIndex < 2}/>
      </div>

      {#if editingOverrideKey && editingOverrideEntry}
        <!-- オーバーライド編集モード -->
        <div class="override-editing">
          <h3>{editingOverrideKind === 'shape' ? (SHAPE_LABELS[editingOverrideKey] ?? editingOverrideKey) : (SEMANTICS_LABELS[editingOverrideKey] ?? editingOverrideKey)} のスタイル</h3>
          <div class="style-grid">
            <span class="label">フォント:</span>
            <FontSelect bind:value={editingOverrideEntry.fontFamily}/>

            <span class="label">太さ:</span>
            <select class="select text-sm py-1 px-2" style="width: auto;" bind:value={editingOverrideEntry.fontWeight}>
              <option value="400">普通</option>
              <option value="700">太字</option>
            </select>

            <span class="label">文字サイズ:</span>
            <div class="flex items-center gap-2">
              <input type="range" min="0.01" max="0.08" step="0.001" bind:value={editingOverrideEntry.n_fontSize}/>
              <span class="text-xs">{editingOverrideEntry.n_fontSize.toFixed(3)}</span>
            </div>

            <span class="label">文字色:</span>
            <div class="color-box"><ColorPickerLabel bind:hex={editingOverrideEntry.fontColor}/></div>

            <span class="label">文字の向き:</span>
            <RadioGroup>
              <RadioItem bind:group={editingOverrideEntry.direction} name="override-dir" value="v"><span class="text-sm">縦</span></RadioItem>
              <RadioItem bind:group={editingOverrideEntry.direction} name="override-dir" value="h"><span class="text-sm">横</span></RadioItem>
            </RadioGroup>

            <span class="label">背景色:</span>
            <div class="flex flex-col gap-1">
              {#if editingOverrideEntry.fillColorMode.kind === 'themeColor'}
                <div class="flex items-center gap-2">
                  <button class="btn btn-sm variant-filled-primary" on:click={() => { /* keep */ }}>テーマカラー</button>
                  <button class="btn btn-sm variant-ghost" on:click={() => setOverrideFillColorKind('fixed')}>固定色に変更</button>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs">白混合率:</span>
                  <input type="range" min="0" max="1" step="0.05" bind:value={editingOverrideEntry.fillColorMode.whitenRatio}/>
                  <span class="text-xs">{editingOverrideEntry.fillColorMode.whitenRatio.toFixed(2)}</span>
                </div>
              {:else}
                <div class="flex items-center gap-2">
                  <button class="btn btn-sm variant-ghost" on:click={() => setOverrideFillColorKind('themeColor')}>テーマカラーに変更</button>
                  <button class="btn btn-sm variant-filled-primary" on:click={() => { /* keep */ }}>固定色</button>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs">色:</span>
                  <div class="color-box"><ColorPickerLabel bind:hex={editingOverrideEntry.fillColorMode.color}/></div>
                </div>
              {/if}
            </div>

            <span class="label">線の色:</span>
            <div class="color-box"><ColorPickerLabel bind:hex={editingOverrideEntry.strokeColor}/></div>

            <span class="label">フチ幅:</span>
            <div class="flex items-center gap-2">
              <input type="range" min="0" max="0.02" step="0.001" bind:value={editingOverrideEntry.n_outlineWidth}/>
              <span class="text-xs">{editingOverrideEntry.n_outlineWidth.toFixed(3)}</span>
            </div>

            <span class="label">フチの色:</span>
            <div class="color-box"><ColorPickerLabel bind:hex={editingOverrideEntry.outlineColor}/></div>

            <span class="label">はみだし:</span>
            <div class="flex items-center gap-2">
              <input type="range" min="0" max="0.2" step="0.01" bind:value={editingOverrideEntry.optionOverrides.shapeExpand}/>
              <span class="text-xs">{(editingOverrideEntry.optionOverrides.shapeExpand ?? 0).toFixed(2)}</span>
            </div>
          </div>
          <div class="flex gap-2 mt-4 justify-end">
            <button class="btn btn-sm variant-ghost" on:click={onCancelOverride}>キャンセル</button>
            <button class="btn btn-sm variant-filled-primary" on:click={onSaveOverride}>適用</button>
          </div>
        </div>
      {:else}
        <!-- 基本スタイル編集 -->
        <h3>基本スタイル</h3>
        <div class="style-grid">
          <span class="label">フォント:</span>
          <FontSelect bind:value={editingTemplate.defaultStyle.fontFamily}/>

          <span class="label">太さ:</span>
          <select class="select text-sm py-1 px-2" style="width: auto;" bind:value={editingTemplate.defaultStyle.fontWeight}>
            <option value="400">普通</option>
            <option value="700">太字</option>
          </select>

          <span class="label">文字サイズ:</span>
          <div class="flex items-center gap-2">
            <input type="range" min="0.01" max="0.08" step="0.001" bind:value={editingTemplate.defaultStyle.n_fontSize}/>
            <span class="text-xs">{editingTemplate.defaultStyle.n_fontSize.toFixed(3)}</span>
          </div>

          <span class="label">文字色:</span>
          <div class="color-box"><ColorPickerLabel bind:hex={editingTemplate.defaultStyle.fontColor}/></div>

          <span class="label">文字の向き:</span>
          <RadioGroup>
            <RadioItem bind:group={editingTemplate.defaultStyle.direction} name="default-dir" value="v"><span class="text-sm">縦</span></RadioItem>
            <RadioItem bind:group={editingTemplate.defaultStyle.direction} name="default-dir" value="h"><span class="text-sm">横</span></RadioItem>
          </RadioGroup>

          <span class="label">背景色:</span>
          <div class="flex flex-col gap-1">
            {#if editingTemplate.defaultStyle.fillColorMode.kind === 'themeColor'}
              <div class="flex items-center gap-2">
                <button class="btn btn-sm variant-filled-primary" on:click={() => { /* keep */ }}>テーマカラー</button>
                <button class="btn btn-sm variant-ghost" on:click={() => { setFillColorKind(editingTemplate.defaultStyle, 'fixed'); templates = templates; }}>固定色に変更</button>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs">白混合率:</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={editingTemplate.defaultStyle.fillColorMode.whitenRatio}/>
                <span class="text-xs">{editingTemplate.defaultStyle.fillColorMode.whitenRatio.toFixed(2)}</span>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <button class="btn btn-sm variant-ghost" on:click={() => { setFillColorKind(editingTemplate.defaultStyle, 'themeColor'); templates = templates; }}>テーマカラーに変更</button>
                <button class="btn btn-sm variant-filled-primary" on:click={() => { /* keep */ }}>固定色</button>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs">色:</span>
                <div class="color-box"><ColorPickerLabel bind:hex={editingTemplate.defaultStyle.fillColorMode.color}/></div>
              </div>
            {/if}
          </div>

          <span class="label">線の色:</span>
          <div class="color-box"><ColorPickerLabel bind:hex={editingTemplate.defaultStyle.strokeColor}/></div>

          <span class="label">フチ幅:</span>
          <div class="flex items-center gap-2">
            <input type="range" min="0" max="0.02" step="0.001" bind:value={editingTemplate.defaultStyle.n_outlineWidth}/>
            <span class="text-xs">{editingTemplate.defaultStyle.n_outlineWidth.toFixed(3)}</span>
          </div>

          <span class="label">フチの色:</span>
          <div class="color-box"><ColorPickerLabel bind:hex={editingTemplate.defaultStyle.outlineColor}/></div>

          <span class="label">はみだし:</span>
          <div class="flex items-center gap-2">
            <input type="range" min="0" max="0.2" step="0.01" bind:value={editingTemplate.defaultStyle.optionOverrides.shapeExpand}/>
            <span class="text-xs">{(editingTemplate.defaultStyle.optionOverrides.shapeExpand ?? 0).toFixed(2)}</span>
          </div>
        </div>

        <!-- シェイプ別オーバーライド -->
        <h3 class="mt-4">シェイプ別スタイル</h3>
        <div class="overrides-section">
          {#each getOverrideKeys('shape') as shape}
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-bold">{SHAPE_LABELS[shape] ?? shape}</span>
              <button class="btn btn-sm variant-ghost" on:click={() => onEditOverride('shape', shape)}>編集</button>
              <button class="btn btn-sm variant-ghost-error" on:click={() => onRemoveOverride('shape', shape)}>削除</button>
            </div>
          {/each}
          {#if availableShapesForOverride().length > 0}
            <div class="flex items-center gap-2 mt-2">
              <span class="text-sm">追加:</span>
              <select class="select text-sm py-1 px-2" style="width: auto;" id="add-shape-override-select">
                {#each availableShapesForOverride() as shape}
                  <option value={shape}>{SHAPE_LABELS[shape] ?? shape}</option>
                {/each}
              </select>
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <span class="btn btn-sm variant-ghost" on:click={onAddShapeOverrideFromSelect}>+追加</span>
            </div>
          {/if}
        </div>

        <!-- セマンティクス別オーバーライド -->
        <h3 class="mt-4">セマンティクス別スタイル</h3>
        <div class="overrides-section">
          {#each getOverrideKeys('semantics') as sem}
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-bold">{SEMANTICS_LABELS[sem] ?? sem}</span>
              <button class="btn btn-sm variant-ghost" on:click={() => onEditOverride('semantics', sem)}>編集</button>
              <button class="btn btn-sm variant-ghost-error" on:click={() => onRemoveOverride('semantics', sem)}>削除</button>
            </div>
          {/each}
          {#if availableSemanticsForOverride().length > 0}
            <div class="flex items-center gap-2 mt-2">
              <span class="text-sm">追加:</span>
              <select class="select text-sm py-1 px-2" style="width: auto;" id="add-semantics-override-select">
                {#each availableSemanticsForOverride() as sem}
                  <option value={sem}>{SEMANTICS_LABELS[sem] ?? sem}</option>
                {/each}
              </select>
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <span class="btn btn-sm variant-ghost" on:click={onAddSemanticsOverrideFromSelect}>+追加</span>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </section>

  <footer class="card-footer flex gap-2 justify-end">
    <button class="btn variant-ghost-surface" on:click={onCancel}>キャンセル</button>
    <button class="btn variant-filled-primary" on:click={onSave}>保存</button>
  </footer>
</div>

<style>
  .editor-card {
    width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
  .editor-body {
    overflow-y: auto;
    flex: 1;
  }
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
  }
  h3 {
    font-family: '源暎エムゴ';
    font-size: 16px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgb(var(--color-surface-300));
    padding-bottom: 4px;
  }
  .style-grid {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 8px;
    align-items: center;
  }
  .label {
    font-size: 13px;
    text-align: right;
    padding-right: 4px;
  }
  .color-box {
    width: 32px;
    height: 24px;
    cursor: pointer;
  }
  .override-editing {
    border: 1px solid rgb(var(--color-surface-400));
    border-radius: 8px;
    padding: 12px;
    background-color: rgb(var(--color-surface-50));
  }
  .overrides-section {
    padding-left: 8px;
  }
  button {
    font-family: '源暎エムゴ';
  }
</style>
