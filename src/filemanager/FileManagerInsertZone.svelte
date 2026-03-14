<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher();

  export let acceptable: boolean;
  export let depth: number;
  export let split: boolean = false;

  let isDraggingOver = false;
  let lineAtBottom = false;

  async function onDragOver(ev: DragEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    isDraggingOver = true;
    if (split) {
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      lineAtBottom = ev.clientY >= rect.top + rect.height / 2;
    }
  }

  function onDragLeave() {
    isDraggingOver = false;
  }

  function onDrop(ev: DragEvent) {
    isDraggingOver = false;
    dispatch('drop', ev);
    ev.preventDefault();
    ev.stopPropagation();
  }

</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="drop-zone"
  class:acceptable={acceptable}
  on:dragover={onDragOver}
  on:dragleave={onDragLeave}
  on:drop={onDrop}
  style="z-index: {depth}"
>
  <div
    class="insert-line"
    class:dragging={isDraggingOver}
    style="top: {split && lineAtBottom ? '100%' : '0%'}"
  >
  </div>
</div>


<style>
  .drop-zone {
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    width: 100%;
    height: calc(100% + 4px);
    z-index: 1;
    display: none;
  }

  .drop-zone.acceptable {
    display: block;
  }

  .insert-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background-color: black;
    transform: translateY(-50%);
    opacity: 0;
    pointer-events: none;
  }

  .dragging {
    opacity: 1;
  }
</style>
