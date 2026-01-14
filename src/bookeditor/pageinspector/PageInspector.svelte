<script lang="ts">
  import { pageInspectorTarget } from './pageInspectorStore';
  import Drawer from '../../utils/Drawer.svelte'
	import ColorPickerLabel from '../../utils/colorpicker/ColorPickerLabel.svelte';
  import { RangeSlider } from '@skeletonlabs/skeleton';
  import { redrawToken, mainBook, fontLoadToken } from '../workspaceStore';
  import { toolTip } from '../../utils/passiveToolTipStore';
  import SliderEdit from '../../utils/SliderEdit.svelte';
  import { commit } from '../operations/commitOperations';
  import { fontChooserOpen, chosenFont } from '../bubbleinspector/fontStore';
  import { shapeChooserOpen, chosenShape } from '../bubbleinspector/shapeStore';
  import BubbleSample from '../bubbleinspector/BubbleSample.svelte';

  let prevFontSizeCoefficient: number | null = null;

  // フキダシ一括変更用の状態変数
  let batchFontFamily = "源暎アンチック";
  let batchFontWeight = "400";
  let batchShape = "soft";
  let batchFillColor = "#ffffffE6";
  let batchStrokeWidth = 3;
  let batchStrokeColor = "#000000FF";

  // フォントとシェイプの選択を監視
  let listeningForFont = false;
  let listeningForShape = false;

  function openFontChooser() {
    listeningForFont = true;
    $fontChooserOpen = true;
  }

  function openShapeChooser() {
    listeningForShape = true;
    $shapeChooserOpen = true;
  }

  $: if (listeningForFont && $chosenFont) {
    batchFontFamily = $chosenFont.fontFamily;
    batchFontWeight = $chosenFont.fontWeight;
    listeningForFont = false;
  }

  $: if (listeningForShape && $chosenShape) {
    batchShape = $chosenShape;
    listeningForShape = false;
  }

  // 適用関数
  function applyFont() {
    if (!$pageInspectorTarget) return;
    const page = $pageInspectorTarget;
    for (const bubble of page.bubbles) {
      bubble.fontFamily = batchFontFamily;
      bubble.fontWeight = batchFontWeight;
    }
    $fontLoadToken = [{ family: batchFontFamily, weight: batchFontWeight }];
    commit("bubble");
    $redrawToken = true;
  }

  function applyShape() {
    if (!$pageInspectorTarget) return;
    const page = $pageInspectorTarget;
    for (const bubble of page.bubbles) {
      // しっぽの設定を保持
      const oldTail = {
        tailTip: bubble.optionContext.tailTip,
        tailMid: bubble.optionContext.tailMid,
        tailWidth: bubble.optionContext.tailWidth,
      };
      bubble.shape = batchShape;
      bubble.initOptions();
      // しっぽの設定を復元
      if (oldTail.tailTip !== undefined) bubble.optionContext.tailTip = oldTail.tailTip;
      if (oldTail.tailMid !== undefined) bubble.optionContext.tailMid = oldTail.tailMid;
      if (oldTail.tailWidth !== undefined) bubble.optionContext.tailWidth = oldTail.tailWidth;
    }
    commit("bubble");
    $redrawToken = true;
  }

  function applyFillColor() {
    if (!$pageInspectorTarget) return;
    const page = $pageInspectorTarget;
    for (const bubble of page.bubbles) {
      bubble.fillColor = batchFillColor;
    }
    commit("bubble");
    $redrawToken = true;
  }

  function applyStrokeWidth() {
    if (!$pageInspectorTarget) return;
    const page = $pageInspectorTarget;
    for (const bubble of page.bubbles) {
      bubble.setPhysicalStrokeWidth(page.paperSize, batchStrokeWidth);
    }
    commit("bubble");
    $redrawToken = true;
  }

  function applyStrokeColor() {
    if (!$pageInspectorTarget) return;
    const page = $pageInspectorTarget;
    for (const bubble of page.bubbles) {
      bubble.strokeColor = batchStrokeColor;
    }
    commit("bubble");
    $redrawToken = true;
  }

  $: if ($pageInspectorTarget) {
    const p = $pageInspectorTarget;
    if (p.paperColor != p.frameTree.bgColor || p.frameColor != p.frameTree.borderColor || p.frameWidth != p.frameTree.borderWidth) {
      p.frameTree.bgColor = p.paperColor;
      p.frameTree.borderColor = p.frameColor;
      p.frameTree.borderWidth = p.frameWidth;
      commit("page-attribute");
      $redrawToken = true;
    }
    if (prevFontSizeCoefficient !== null && prevFontSizeCoefficient !== p.fontSizeCoefficient) {
      commit("page-attribute");
      $redrawToken = true;
    }
    prevFontSizeCoefficient = p.fontSizeCoefficient;
  }

  $: target = $pageInspectorTarget!;

  function onClickAway() {
    $mainBook = $mainBook;
    $pageInspectorTarget = null;
  }

</script>

<div class="drawer-outer">
  <Drawer placement="left" open={$pageInspectorTarget != null} size="350px" on:clickAway={onClickAway}>
    <div class="drawer-content">
      <div class="flex flex-col gap-2 m-2 paper-color-picker">
        <h1>背景色</h1>
        <div class="flex flex-col items-center">
          <div class="color-label" use:toolTip={"背景色"}>
            <ColorPickerLabel bind:hex={target.paperColor}/>
          </div>
        </div>
        <h1>枠色</h1>
        <div class="flex flex-col items-center">
          <div class="color-label" use:toolTip={"枠色"}>
            <ColorPickerLabel bind:hex={target.frameColor}/>
          </div>
        </div>
        <h1>枠の幅</h1><RangeSlider name="line" bind:value={target.frameWidth} max={10} step={1} style="width:100px;"/>
        <h1>フォントサイズ係数</h1>
        <div class="flex flex-col items-center">
          <div class="slider-container">
            <SliderEdit bind:value={target.fontSizeCoefficient} min={0.5} max={2} step={0.01} allowDecimal={true}/>
          </div>
        </div>

        <!-- フキダシ一括変更パネル -->
        <div class="batch-panel">
          <h2>フキダシ一括変更</h2>

          <!-- フォント -->
          <div class="batch-item">
            <div class="batch-label">フォント</div>
            <div class="batch-control">
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div class="font-selector variant-ghost-primary rounded-container-token" on:click={openFontChooser}>
                <span style="font-family: {batchFontFamily};">{batchFontFamily}</span>
              </div>
              <button class="btn btn-sm variant-filled-primary apply-btn" on:click={applyFont}>適用</button>
            </div>
          </div>

          <!-- シェイプ -->
          <div class="batch-item">
            <div class="batch-label">シェイプ</div>
            <div class="batch-control">
              <BubbleSample size={[48, 64]} bind:shape={batchShape} on:click={openShapeChooser}/>
              <button class="btn btn-sm variant-filled-primary apply-btn" on:click={applyShape}>適用</button>
            </div>
          </div>

          <!-- 塗りつぶし色 -->
          <div class="batch-item">
            <div class="batch-label">塗りつぶし色</div>
            <div class="batch-control">
              <div class="color-label" use:toolTip={"塗りつぶし色"}>
                <ColorPickerLabel bind:hex={batchFillColor}/>
              </div>
              <button class="btn btn-sm variant-filled-primary apply-btn" on:click={applyFillColor}>適用</button>
            </div>
          </div>

          <!-- 線の太さ -->
          <div class="batch-item">
            <div class="batch-label">線の太さ</div>
            <div class="batch-control">
              <RangeSlider name="batchStrokeWidth" bind:value={batchStrokeWidth} max={20} step={1} style="width:100px;"/>
              <button class="btn btn-sm variant-filled-primary apply-btn" on:click={applyStrokeWidth}>適用</button>
            </div>
          </div>

          <!-- 線の色 -->
          <div class="batch-item">
            <div class="batch-label">線の色</div>
            <div class="batch-control">
              <div class="color-label" use:toolTip={"線の色"}>
                <ColorPickerLabel bind:hex={batchStrokeColor}/>
              </div>
              <button class="btn btn-sm variant-filled-primary apply-btn" on:click={applyStrokeColor}>適用</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Drawer>
</div>

<style>
  h1 {
    font-size: 1.2rem;
    font-weight: 500;
  }
  .drawer-content {
    width: 100%;
    height: 100%;
    padding: 16px;
  }
  .drawer-outer :global(.drawer .panel) {
    background-color: rgb(var(--color-surface-100));
  }
  .paper-color-picker :global(.container .color) {
    width: 80px;
    height: 15px;
    border-radius: 4px;
  }
  .paper-color-picker :global(.container .alpha) {
    width: 80px;
    height: 15px;
    border-radius: 4px;
  }
  .color-label {
    width: 50px;
    height: 20px;
    margin-left: 4px;
    margin-right: 4px;
  }
  .slider-container {
    width: 180px;
  }
  .batch-panel {
    margin-top: 16px;
    padding: 12px;
    border: 1px solid rgb(var(--color-surface-400));
    border-radius: 8px;
  }
  .batch-panel h2 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .batch-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }
  .batch-item:last-child {
    margin-bottom: 0;
  }
  .batch-label {
    font-size: 0.85rem;
    color: rgb(var(--color-surface-600));
  }
  .batch-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .font-selector {
    flex: 1;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 0.85rem;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .font-selector:hover {
    color: rgb(128, 93, 47);
  }
  .apply-btn {
    height: 28px;
    min-width: 50px;
    margin-left: auto;
  }
</style>