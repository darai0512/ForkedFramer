<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";

  export let open = false;
  export let duration = 0.2;
  export let placement = "left";
  export let size: string | null = null;
  export let overlay = true;
  export let hideOverlayOnDrag = false;

  const dispatch = createEventDispatcher();
  let dragCounter = 0;

  $: style = `--duration: ${duration}s; --size: ${size};`;
  $: isDragging = dragCounter > 0;
  $: shouldShowOverlay = overlay && (!hideOverlayOnDrag || !isDragging);

  function handleClickAway() {
    dispatch("clickAway");
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
  }

  function handleDragLeave() {
    dragCounter--;
    if (dragCounter < 0) dragCounter = 0;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragCounter = 0;
  }

  onMount(() => {
    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
  });

  onDestroy(() => {
    document.removeEventListener("dragenter", handleDragEnter);
    document.removeEventListener("dragleave", handleDragLeave);
    document.removeEventListener("dragover", handleDragOver);
    document.removeEventListener("drop", handleDrop);
  });
</script>

<aside class="drawer" class:open {style}>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  {#if shouldShowOverlay}
    <div class="overlay" on:click={handleClickAway} />
  {/if}
  <div class="panel {placement}" class:size>
    {#if open}
      <div class="slot-wrapper">
        <slot />
      </div>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="close-bar" on:click={handleClickAway}>
        <span class="close-label">閉じる</span>
      </div>
    {/if}
  </div>
</aside>

<style>
  .drawer {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    z-index: -1;
    transition: z-index var(--duration) step-end;
    pointer-events: none;
  }

  .drawer.open {
    z-index: 950;
    transition: z-index var(--duration) step-start;
  }

  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(100, 100, 100, 0.5);
    opacity: 0;
    z-index: 2;
    transition: opacity var(--duration) ease;
    pointer-events: auto;
  }

  .drawer.open .overlay {
    opacity: 1;
  }

  .panel {
    position: fixed;
    width: 100%;
    height: 100%;
    background: white;
    z-index: 3;
    transition: transform var(--duration) ease;
    overflow: hidden;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
  }

  .slot-wrapper {
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .panel.left {
    left: 0;
    transform: translate(-100%, 0);
  }

  .panel.right {
    right: 0;
    transform: translate(100%, 0);
  }

  .panel.top {
    top: 0;
    transform: translate(0, -100%);
  }

  .panel.bottom {
    bottom: 0;
    transform: translate(0, 100%);
  }

  .panel.left.size,
  .panel.right.size {
    max-width: var(--size);
  }

  .panel.top.size,
  .panel.bottom.size {
    max-height: var(--size);
  }

  .drawer.open .panel {
    transform: translate(0, 0);
  }

  .close-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 4px 12px 12px;
    padding: 10px 0;
    border-top: 1px solid rgba(128, 128, 128, 0.25);
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.15s ease;
  }

  .close-bar:hover {
    background: rgba(128, 128, 128, 0.12);
  }

  .close-bar:active {
    background: rgba(128, 128, 128, 0.22);
  }

  .close-label {
    font-family: '源暎アンチック', sans-serif;
    font-size: 14px;
    color: rgba(100, 100, 100, 0.8);
    letter-spacing: 0.05em;
    user-select: none;
  }
</style>
