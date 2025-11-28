<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Bubble } from '../lib/layeredCanvas/dataModels/bubble';
  import { redrawToken } from '../bookeditor/workspaceStore';
  import { onMount, tick } from 'svelte';
  import { toolTip } from '../utils/passiveToolTipStore';
  import { _ } from 'svelte-i18n';

  import trashIcon from '../assets/trash.webp';
  import clipboardIcon from '../assets/clipboard.webp';
  import { toastStore } from '@skeletonlabs/skeleton';

  export let bubble: Bubble;

  const dispatch = createEventDispatcher();
  let text: string;
  let textarea: HTMLTextAreaElement;

  function autoResize() {
    textarea.style.height = 'auto'; // 高さを一旦リセット
    textarea.style.height = (textarea.scrollHeight+2) + 'px'; // スクロール高さに基づいて高さを再設定
  }

  function onInput(event: any) {
    bubble.text = event.target.value; // textareaのvalueプロパティからテキストを取得
    $redrawToken = true;
    autoResize(); // 自動リサイズ機能を呼び出し
  }

  function onPaste(event: ClipboardEvent) {
    // ペーストイベントの伝播を停止（親要素のペーストハンドラーが実行されないようにする）
    event.stopPropagation();
    // デフォルトのペースト動作はそのまま実行される
  }

  onMount(async () => {
    text = bubble.text;
    await tick();
    autoResize();
  });

  function onDelete(ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    dispatch('delete', bubble);
  }

  async function onCopy(ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    await navigator.clipboard.writeText(bubble.text);
    toastStore.trigger({ message: 'コピーしました', timeout: 1500 });
  }
</script>

<div class="bubblet-container">
  <div class="drag-handle" use:toolTip={$_('bubble.actions.reorder')}>
    <svg class="handle-icon" viewBox="0 0 16 24" fill="currentColor">
      <circle cx="5" cy="4" r="2"/>
      <circle cx="11" cy="4" r="2"/>
      <circle cx="5" cy="12" r="2"/>
      <circle cx="11" cy="12" r="2"/>
      <circle cx="5" cy="20" r="2"/>
      <circle cx="11" cy="20" r="2"/>
    </svg>
  </div>
  <div class="bubblet-content">
    <textarea class="bubblet variant-soft-surface rounded-container-token" bind:value={text} on:input={onInput} on:paste={onPaste} bind:this={textarea}></textarea>
    <div class="control-panel">
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <img
        draggable={false}
        class="control-icon"
        src={clipboardIcon}
        alt={$_('bubble.actions.copy')}
        use:toolTip={$_('bubble.actions.copy')}
        on:click={onCopy}
      />
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <img
        draggable={false}
        class="control-icon control-icon-delete"
        src={trashIcon}
        alt={$_('bubble.actions.delete')}
        use:toolTip={$_('bubble.actions.delete')}
        on:click={onDelete}
      />
    </div>
  </div>
</div>

<style>
  .bubblet-container {
    position: relative;
    width: 90%;
    padding: 6px;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 4px;
  }
  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-height: 60px;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    opacity: 0.5;
    transition: opacity 0.2s, background-color 0.2s;
    border-radius: 4px;
  }
  .drag-handle:hover {
    opacity: 1;
    background-color: rgba(var(--color-surface-500), 0.15);
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .handle-icon {
    width: 16px;
    height: 24px;
    color: rgb(var(--color-surface-500));
  }
  .bubblet-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .bubblet {
    color: var(--color-primary-50);
    font-family: 'Zen Kurenaido';
    word-wrap: break-word;
    width: 100%;
    height: 150px;
    border: none;
    resize: none;
    overflow: auto;
    white-space: pre-wrap;
    outline: none;
    box-shadow: none;
  }
  .control-panel {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    padding: 4px 0;
  }
  .control-icon {
    width: 24px;
    height: 24px;
    padding: 4px;
    box-sizing: content-box;
    cursor: pointer;
    transition: opacity 0.2s, background-color 0.2s, border-color 0.2s;
    border: 2px solid #888;
    border-radius: 6px;
    background-color: rgba(255, 255, 255, 0.5);
  }
  .control-icon:hover {
    background-color: rgba(200, 220, 255, 0.5);
    border-color: #46c;
  }
  .control-icon-delete:hover {
    background-color: rgba(255, 200, 200, 0.5);
    border-color: #c44;
  }
</style>
