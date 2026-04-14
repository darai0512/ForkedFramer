<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Parameter from "../utils/Parameter.svelte";
  import FreehandInspectorEasing from "./FreehandInspectorEasing.svelte";
  import FreehandInspectorTaper from "./FreehandInspectorTaper.svelte";
  import FreehandInspectorPalette from "./FreehandInspectorPalette.svelte";
  import { EASINGS, type Easing } from "./easing";
  import { deepCopyProperties } from "../lib/layeredCanvas/tools/misc";

  export let opened = false;

  const dispatch = createEventDispatcher();

  type StrokeOperation = "strokeWithfill" | "stroke" | "erase";

  const initialOptions = {
    size: 4,
    thinning: 0.5,
    smoothing: 0.6,
    streamline: 0.5,
    easing: "linear",
    simulatePressure: true,
    last: true,
    start: {
      cap: true,
      taper: 0,
      easing: "linear",
    },
    end: {
      cap: true,
      taper: 0,
      easing: "linear",
    },

    // 以下はperfect-freehandは扱わない
    strokeWidth: 0,
    strokeOperation: "strokeWithFill",
    fill: "#000000",
    stroke: "#ffffff",
  };

  const presets = [
    {
      label: "ファイン",
      thinning: 0.5,
      easing: "linear",
      last: true,
      start: {
        taper: 100,
        easing: "linear",
      },
      end: {
        taper: 100,
        easing: "linear",
      },
      strokeOperation: "strokeWithFill",
    },
    {
      label: "サインペン",
      thinning: 0,
      easing: "linear",
      last: true,
      start: {
        taper: 0,
        cap: true,
      },
      end: {
        taper: 0,
        cap: true,
      },
      strokeOperation: "strokeWithFill",
    },
    {
      label: "フラット",
      thinning: 0,
      easing: "linear",
      last: true,
      start: {
        taper: 0,
        cap: false,
      },
      end: {
        taper: 0,
        cap: false,
      },
      strokeOperation: "strokeWithFill",
    },
    {
      label: "消しゴム",
      thinning: 0,
      easing: "linear",
      last: true,
      start: {
        taper: 0,
        cap: true,
      },
      end: {
        taper: 0,
        cap: true,
      },
      strokeOperation: "erase",
    },
  ];

  let options = structuredClone(initialOptions);
  let fillTheme = options.fill;
  let strokeTheme = options.stroke;
  let paletteOpen = true;

  function applyPreset(preset: any) {
    deepCopyProperties(options, preset);
    options = options;
  }

  let strokeOptions;
  $: onChangeStrokeOptions(options);
  function onChangeStrokeOptions(options: any) {
    strokeOptions = structuredClone(options);
    strokeOptions.easing = EASINGS[options.easing as Easing];
    strokeOptions.start.easing = EASINGS[options.start.easing as Easing];
    strokeOptions.end.easing = EASINGS[options.end.easing as Easing];
    strokeOptions.smoothing = 1.0 - options.smoothing;
    // smoothingの値が点間の距離の最大値の係数なので、0に近いほうが丸くなる
    // これはパラメータに関する直感とは逆なので、ここで変換している
    dispatch("setTool", strokeOptions);
  }

  function onReset() {
    options = structuredClone(initialOptions);
  }

  function onDone() {
    console.log("onDone");
    dispatch("done");
  }

  function onSyncThemeColor() {
    strokeTheme = fillTheme;
  }
</script>

{#if opened}
  <div class="freehand-panel">
    <!-- ヘッダー: タイトル + Done + 開閉トグル -->
    <div class="panel-header">
      <button class="toggle-btn" on:click={() => paletteOpen = !paletteOpen}>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:rotated={!paletteOpen}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <span class="panel-title">🖊 落書き</span>
      <div class="header-actions">
        <!-- Edit button placed where Reset was, though not functional unless palette is opened without painting mode. Handled gracefully. -->
        <button class="done-btn" on:click={onDone}>Done</button>
      </div>
    </div>

    {#if paletteOpen}
      <div class="panel-body">
        <!-- プリセット行 -->
        <div class="preset-row">
          {#each presets as preset}
            <button class="preset-chip" on:click={() => applyPreset(preset)}>
              {preset.label}
            </button>
          {/each}
          <button class="preset-chip" style="background: rgba(234, 179, 8, 0.8);" on:click={onReset}>Reset</button>
        </div>

        <!-- パラメータ行 -->
        <div class="param-grid">
          <div class="param-item">
            <Parameter label="太さ" bind:value={options.size} min={1} max={100} step={1} showStepButtons={true} buttonStep={1} />
          </div>
          <div class="param-item">
            <Parameter label="太さ変化" bind:value={options.thinning} min={-1} max={1} step={0.01} showStepButtons={true} buttonStep={0.1} />
          </div>
          <div class="param-item">
            <Parameter label="流線型" bind:value={options.streamline} min={0} max={1} step={0.01} showStepButtons={true} buttonStep={0.1} />
          </div>
          <div class="param-item">
            <Parameter label="スムージング" bind:value={options.smoothing} min={0} max={1} step={0.01} showStepButtons={true} buttonStep={0.1} />
          </div>
        </div>

        <!-- テーパー -->
        <div class="taper-section">
          <details>
            <summary class="taper-summary">テーパー設定</summary>
            <div class="taper-content">
              <FreehandInspectorTaper label="入り：先端の鋭さ" bind:taper={options.start} />
              <hr class="divider" />
              <FreehandInspectorTaper label="抜き：先端の鋭さ" bind:taper={options.end} />
            </div>
          </details>
        </div>

        <!-- 塗りつぶし/消しゴム -->
        <div class="fill-section">
          <div class="fill-row">
            <select class="fill-select" bind:value={options.strokeOperation}>
              <option value={"strokeWithFill"}>塗りつぶし</option>
              <option value={"stroke"}>フチのみ</option>
              <option value={"erase"}>消しゴム</option>
            </select>
            {#if options.strokeOperation != "erase" && 0 < options.strokeWidth}
              <button class="sync-btn" on:click={onSyncThemeColor}>色同期</button>
            {/if}
          </div>

          {#if options.strokeOperation == "strokeWithFill"}
            <FreehandInspectorPalette bind:color={options.fill} bind:themeColor={fillTheme} />
          {/if}

          {#if options.strokeOperation != "erase"}
            <div class="param-item">
              <Parameter label="フチ" bind:value={options.strokeWidth} min={0} max={100} step={1} showStepButtons={true} buttonStep={1} />
            </div>
          {/if}
          {#if 0 < options.strokeWidth}
            <FreehandInspectorPalette bind:color={options.stroke} bind:themeColor={strokeTheme} />
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .freehand-panel {
    position: fixed;
    top: 80px;
    left: 8px;
    z-index: 900;
    max-width: 340px;
    pointer-events: auto;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(40, 40, 50, 0.92);
    backdrop-filter: blur(8px);
    padding: 4px 8px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  .toggle-btn {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    transition: transform 0.15s ease;
  }

  .rotated {
    transform: rotate(-90deg);
  }

  .panel-title {
    color: white;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .preset-btn {
    background: rgba(234, 179, 8, 0.8);
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
  }
  .preset-btn:hover {
    background: rgba(234, 179, 8, 1);
  }

  .done-btn {
    background: rgba(59, 130, 246, 0.9);
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
  }
  .done-btn:hover {
    background: rgba(59, 130, 246, 1);
  }

  .panel-body {
    margin-top: 4px;
    background: rgba(40, 40, 50, 0.88);
    backdrop-filter: blur(8px);
    padding: 8px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
    color: white;
    font-size: 12px;
  }

  .preset-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .preset-chip {
    background: rgba(100, 116, 139, 0.7);
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
  }
  .preset-chip:hover {
    background: rgba(100, 116, 139, 1);
  }

  .param-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .param-item {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .taper-section {
    border-top: 1px solid rgba(255,255,255,0.15);
    padding-top: 4px;
  }

  .taper-summary {
    font-size: 11px;
    cursor: pointer;
    color: rgba(255,255,255,0.8);
  }

  .taper-content {
    padding: 4px 0;
  }

  .divider {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.1);
    margin: 4px 0;
  }

  .fill-section {
    border-top: 1px solid rgba(255,255,255,0.15);
    padding-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .fill-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .fill-select {
    background: rgba(30, 30, 40, 0.9);
    color: white;
    font-size: 11px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    padding: 2px 6px;
  }

  .sync-btn {
    background: rgba(100, 116, 139, 0.7);
    color: white;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
  }

  /* パラメータスライダー内のラベル/入力を小さくする */
  .panel-body :global(label) {
    font-size: 11px;
  }
  .panel-body :global(input[type="range"]) {
    height: 14px;
  }
  .panel-body :global(.parameter-box) {
    gap: 4px;
  }
</style>
