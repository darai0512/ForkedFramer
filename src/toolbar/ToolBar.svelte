<script lang="ts">
  import { toolTip } from '../utils/passiveToolTipStore';
  import { undoToken, renderPreference, redrawToken, viewport } from '../bookeditor/workspaceStore';
  import { BubbleRenderMode } from '../lib/layeredCanvas/layers/paperRendererLayer';
  import { _ } from 'svelte-i18n';
  import writableDerived from "svelte-writable-derived";
  import SliderEdit from '../utils/SliderEdit.svelte';

  import undoIcon from '../assets/undo.webp';
  import redoIcon from '../assets/redo.webp';
  import bubbleIcon from '../assets/bubbleLayer/bubble.webp';

  let bubbleRenderMode = renderPreference.bubbleRenderMode;

  function onBubbleRenderModeChange() {
    renderPreference.bubbleRenderMode = bubbleRenderMode;
    $redrawToken = !$redrawToken;
  }

  function undo() {
    $undoToken = 'undo';
  }

  function redo() {
    $undoToken = 'redo';
  }

  const scale = writableDerived(
  	viewport,
  	(v) => v?.scale! * 100,
  	(s, v) => {
      if (v) {
        v.scale = s! / 100;
        v.dirty = true;
        $redrawToken = true;
      }
      return v;
    }
  );
</script>

<div class="fixed top-2 left-2 z-[900] flex flex-col items-start gap-2 pointer-events-none">
  <div class="flex items-center gap-2 pointer-events-auto">
    <button class="btn btn-sm bg-primary-400 undo-redo-button shadow-md" on:click={undo} use:toolTip={$_('ui.undo')}>
      <img src={undoIcon} alt="undo" class="h-6 w-auto"/>
    </button>
    <button class="btn btn-sm bg-primary-400 undo-redo-button shadow-md" on:click={redo} use:toolTip={$_('ui.redo')}>
      <img src={redoIcon} alt="redo" class="h-6 w-auto"/>
    </button>

    <div
      class="flex items-center px-2 py-1 text-sm bg-surface-700/90 backdrop-blur-sm text-white border border-surface-500 rounded shadow-md hover:bg-surface-600"
      use:toolTip={$_('toolbar.bubbleRenderMode.tooltip')}
    >
      <img src={bubbleIcon} alt="bubble" class="w-4 h-4 mr-1"/>
      <select
        class="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
        bind:value={bubbleRenderMode}
        on:change={onBubbleRenderModeChange}
      >
        <option class="bg-surface-700 text-white" value={BubbleRenderMode.All}>{$_('toolbar.bubbleRenderMode.all')}</option>
        <option class="bg-surface-700 text-white" value={BubbleRenderMode.BackgroundOnly}>{$_('toolbar.bubbleRenderMode.backgroundOnly')}</option>
        <option class="bg-surface-700 text-white" value={BubbleRenderMode.None}>{$_('toolbar.bubbleRenderMode.none')}</option>
      </select>
    </div>
  </div>

  <div class="flex items-center gap-2 pointer-events-auto">
    <div class="flex items-center gap-1 bg-surface-700/90 backdrop-blur-sm px-2 py-1 border border-surface-500 rounded shadow-md h-8">
      <span class="text-white text-sm">{$_('editor.scale')}</span>
      <div class="w-20 flex items-center">
        <SliderEdit bind:value={$scale} min={50} max={200} step={1}/>
      </div>
      <span class="text-white text-sm ml-1">%</span>
      <button class="btn btn-sm bg-surface-500 hover:bg-surface-400 text-white h-6 ml-1 px-2 rounded" on:click={() => $scale=100}>100%</button>
    </div>
  </div>
</div>

<style>
  .undo-redo-button {
    width: 50px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0;
  }
</style>
