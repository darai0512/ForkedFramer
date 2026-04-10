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
  import fitIcon from '../assets/frameLayer/fit.webp';

  let bubbleRenderMode = renderPreference.bubbleRenderMode;
  let isOpen = true;

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
    <button class="btn btn-sm bg-surface-700/90 hover:bg-surface-600 text-white shadow-md pointer-events-auto h-8 px-2 border border-surface-500 rounded" on:click={() => isOpen = !isOpen} use:toolTip={$_('toolbar.toggle', { default: 'メニュー開閉' })}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>

    {#if isOpen}
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
    {/if}
  </div>

  {#if isOpen}
    <div class="flex items-center gap-2 pointer-events-auto w-full">
      <div class="flex items-center justify-between bg-surface-700/90 backdrop-blur-sm px-2 py-1 border border-surface-500 rounded shadow-md h-8 w-full">
        <span class="text-white text-sm whitespace-nowrap">{$_('editor.scale')}</span>
        <div class="w-full mx-2 flex items-center">
          <SliderEdit bind:value={$scale} min={50} max={200} step={1}/>
        </div>
        <div class="flex items-center whitespace-nowrap">
          <span class="text-white text-sm">%</span>
          <button class="btn btn-sm bg-surface-500 hover:bg-surface-400 text-white h-6 ml-1 px-1 rounded flex items-center justify-center p-1" on:click={() => $scale=100} use:toolTip={'100%表示'}>
            <img src={fitIcon} alt="100%" class="h-4 w-4" style="filter: brightness(0) invert(1);"/>
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .undo-redo-button {
    width: 40px;
    height: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0;
  }
</style>
