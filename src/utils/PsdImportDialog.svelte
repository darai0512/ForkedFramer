<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  let filename: string = '';
  let width: number = 0;
  let height: number = 0;
  let layerCount: number = 0;

  onMount(() => {
    const args = $modalStore[0]?.meta;
    if (args) {
      filename = args.filename || '';
      width = args.width || 0;
      height = args.height || 0;
      layerCount = args.layerCount || 0;
    }
  });

  function onComposite() {
    $modalStore[0].response?.('composite');
    modalStore.close();
  }

  function onLayers() {
    $modalStore[0].response?.('layers');
    modalStore.close();
  }

  function onCancel() {
    $modalStore[0].response?.(null);
    modalStore.close();
  }
</script>

<div class="card p-4 shadow-xl psd-dialog">
  <header class="card-header">
    <h2>{$_('psd.title')}</h2>
  </header>
  <section class="p-4">
    <div class="info-section">
      <p class="filename">{filename}</p>
      <p class="dimensions">{width} × {height}px / {$_('psd.layerCount', { values: { count: layerCount } })}</p>
    </div>
    <p class="note">{$_('psd.newPageNote')}</p>
    <p class="description">{$_('psd.selectMode')}</p>
  </section>
  <footer class="card-footer flex flex-col gap-2">
    <button class="btn variant-filled-primary w-full" on:click={onComposite}>
      {$_('psd.compositeMode')}
    </button>
    <button class="btn variant-filled-secondary w-full" on:click={onLayers}>
      {$_('psd.layersMode')}
    </button>
    <button class="btn variant-ghost-surface w-full" on:click={onCancel}>
      {$_('dialogs.cancel')}
    </button>
  </footer>
</div>

<style>
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }
  .info-section {
    margin-bottom: 12px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 8px;
  }
  .filename {
    font-weight: 700;
    font-size: 16px;
    word-break: break-all;
  }
  .dimensions {
    font-size: 14px;
    color: var(--color-surface-600);
    margin-top: 4px;
  }
  .note {
    font-size: 13px;
    color: var(--color-surface-500);
    margin-bottom: 8px;
    font-style: italic;
  }
  .description {
    font-size: 15px;
    margin-bottom: 8px;
  }
  .psd-dialog {
    max-width: 420px;
  }
</style>
