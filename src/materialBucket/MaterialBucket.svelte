<script lang="ts">
  import Drawer from '../utils/Drawer.svelte'
  import { materialBucketOpen } from './materialBucketStore';
  import MaterialBucketContent from './MaterialBucketContent.svelte';
  import { MaterialBucket_closeOnDragStore } from './tweakUiStore';
  import { SlideToggle } from '@skeletonlabs/skeleton';
  import { _ } from 'svelte-i18n';
  import { toolTip } from '../utils/passiveToolTipStore';
  import newFolderIcon from '../assets/fileManager/new-folder.webp';

  let contentComponent: MaterialBucketContent;

  function onDragStart() {
    if ($MaterialBucket_closeOnDragStore) {
      setTimeout(() => {
        $materialBucketOpen = false;
      }, 0);
    }
  }

  async function addCollection() {
    await contentComponent?.addCollection();
  }
</script>

<div class="drawer-outer">
  <Drawer
    open={$materialBucketOpen}
    size="800px"
    on:clickAway={() => $materialBucketOpen = false}
    hideOverlayOnDrag={!$MaterialBucket_closeOnDragStore}
  >
    {#if $materialBucketOpen}
      <div class="drawer-content">
        <div class="collection-header">
          <h3>素材集</h3>
          <div class="header-controls">
            <div use:toolTip={$_('materialBucket.closeOnDrag')}>
              <SlideToggle
                name="closeOnDrag"
                bind:checked={$MaterialBucket_closeOnDragStore}
                size="sm"
              />
            </div>
            <button
              class="btn btn-sm variant-filled-primary text-white collection-add-button"
              on:click={addCollection}
              use:toolTip={'新しいコレクションを作成'}
            >
              <img src={newFolderIcon} alt="new collection" class="button-icon" />
              新しいコレクション
            </button>
          </div>
        </div>
        <MaterialBucketContent
          bind:this={contentComponent}
          on:dragstart={onDragStart}
        />
      </div>
    {/if}
  </Drawer>
</div>

<style>
  .drawer-outer :global(.drawer .panel) {
    background-color: rgb(var(--color-surface-100));
    padding: 16px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .drawer-content {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .collection-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding: 0 8px;
  }

  h3 {
    font-family: '源暎エムゴ';
    font-size: 1.4rem;
    color: #444;
    margin: 0;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-controls :global(.slide-toggle) {
    margin: 0;
  }

  .header-controls :global(.slide-toggle label) {
    font-family: '源映エムゴ';
    font-size: 14px;
    color: #666;
  }

  .collection-add-button {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: '源映エムゴ';
    font-size: 14px;
  }

  .button-icon {
    width: 16px;
    height: 16px;
    display: block;
  }
</style>