<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';

  let baseName = '';
  let separator = '_';
  let digits = 2;
  let startNumber = 1;
  let count = 0;

  onMount(() => {
    const args = $modalStore[0]?.meta;
    if (args) {
      count = args.count || 0;
      digits = Math.max(2, String(count).length);
    }
  });

  function pad(n: number): string {
    return String(n).padStart(digits, '0');
  }

  $: previews = Array.from({ length: Math.min(count, 5) }, (_, i) =>
    `${baseName}${separator}${pad(startNumber + i)}`
  );

  function onSubmit() {
    if (!baseName) { return; }
    $modalStore[0].response?.({ baseName, separator, digits, startNumber });
    modalStore.close();
  }

  function onCancel() {
    $modalStore[0].response?.(null);
    modalStore.close();
  }
</script>

<div class="card p-4 shadow-xl bulk-rename-dialog">
  <header class="card-header">
    <h2>連番リネーム</h2>
  </header>
  <section class="p-4 flex flex-col gap-3">
    <label class="label">
      <span>基本名</span>
      <!-- svelte-ignore a11y-autofocus -->
      <input class="input px-2 py-1" type="text" bind:value={baseName} placeholder="page" autofocus />
    </label>
    <div class="flex gap-3">
      <label class="label flex-1">
        <span>区切り文字</span>
        <input class="input px-2 py-1 text-center" type="text" bind:value={separator} maxlength="3" />
      </label>
      <label class="label flex-1">
        <span>桁数</span>
        <input class="input px-2 py-1 text-right" type="number" bind:value={digits} min="1" max="6" />
      </label>
      <label class="label flex-1">
        <span>開始番号</span>
        <input class="input px-2 py-1 text-right" type="number" bind:value={startNumber} min="0" />
      </label>
    </div>
    {#if baseName}
      <div class="preview">
        <span class="preview-label">プレビュー:</span>
        {#each previews as name}
          <div class="preview-item">{name}</div>
        {/each}
        {#if count > 5}
          <div class="preview-item preview-ellipsis">... ({count}件)</div>
        {/if}
      </div>
    {/if}
  </section>
  <footer class="card-footer flex gap-2">
    <div class="flex-1"></div>
    <button class="btn variant-ghost-surface" on:click={onCancel}>
      キャンセル
    </button>
    <button class="btn variant-filled-primary" on:click={onSubmit} disabled={!baseName}>
      リネーム
    </button>
  </footer>
</div>

<style>
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }
  .bulk-rename-dialog {
    min-width: 180px;
    max-width: 280px;
  }
  .preview {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    padding: 8px;
    font-size: 13px;
  }
  .preview-label {
    font-size: 12px;
    color: #666;
  }
  .preview-item {
    font-family: monospace;
    padding: 1px 0;
  }
  .preview-ellipsis {
    color: #888;
  }
</style>
