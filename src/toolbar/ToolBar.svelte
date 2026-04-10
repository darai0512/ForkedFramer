<script lang="ts">
  import { toolTip } from '../utils/passiveToolTipStore';
  import { undoToken, renderPreference, redrawToken } from '../bookeditor/workspaceStore';
  import { BubbleRenderMode } from '../lib/layeredCanvas/layers/paperRendererLayer';
  import { _ } from 'svelte-i18n';

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
</script>

<div class="fixed top-2 left-2 z-[900] flex items-center gap-2 pointer-events-auto">
  <button class="btn btn-sm bg-primary-400 undo-redo-button shadow-md" on:click={undo} use:toolTip={$_('ui.undo')}>
    <img src={undoIcon} alt="undo" class="h-6 w-auto"/>
  </button>
  <button class="btn btn-sm bg-primary-400 undo-redo-button shadow-md" on:click={redo} use:toolTip={$_('ui.redo')}>
    <img src={redoIcon} alt="redo" class="h-6 w-auto"/>
  </button>

  <div
    class="flex items-center px-2 py-1 text-sm bg-surface-700/90 backdrop-blur-sm text-white border border-surface-500 rounded shadow-md hover:bg-surface-600 pointer-events-auto"
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
