<script lang="ts">
  import Drawer from '../utils/Drawer.svelte'
  import { materialBucketOpen } from './materialBucketStore';
  import MaterialGallery from './MaterialGallery.svelte';
  import WarehouseGallery from './WarehouseGallery.svelte';
  import { Accordion, AccordionItem, SlideToggle } from '@skeletonlabs/skeleton';
  import { _ } from 'svelte-i18n';
  import { gadgetFileSystem } from '../filemanager/fileManagerStore';
  import type { Node, EmbodiedEntry } from '../lib/filesystem/fileSystem';
  import { toolTip } from '../utils/passiveToolTipStore';
  import { MaterialBucket_closeOnDragStore } from './tweakUiStore';
  import { tick } from 'svelte';
  import {
    type MaterialCollectionState,
    loadMaterialCollections,
    addMaterialCollection,
    deleteMaterialCollection,
    renameMaterialCollection
  } from './materialOperations';
  
  import trashIcon from '../assets/fileManager/trash.webp';
  import renameIcon from '../assets/fileManager/rename.webp';
  import newFolderIcon from '../assets/fileManager/new-folder.webp';

  let materialCollectionFolders: EmbodiedEntry[] = [];
  let openStates: { [key: string]: boolean } = {};
  let collectionFolderNode: Node | null = null;
  let editingFolderId: string | null = null;
  let editingFolderName: string = '';
  let editingInput: HTMLInputElement | null = null;

  function onDragStart() {
    if ($MaterialBucket_closeOnDragStore) {
      setTimeout(() => {
        $materialBucketOpen = false;
      }, 0);
    }
  }

  let warehouseOpen = false;

  // MaterialCollectionState オブジェクトを作成
  $: state = {
    materialCollectionFolders,
    openStates,
    collectionFolderNode
  } as MaterialCollectionState;

  async function loadCollections() {
    await loadMaterialCollections(state);
    materialCollectionFolders = state.materialCollectionFolders;
    openStates = state.openStates;
    collectionFolderNode = state.collectionFolderNode;
  }

  async function addCollection() {
    await addMaterialCollection(state);
    materialCollectionFolders = state.materialCollectionFolders;
    openStates = state.openStates;
    collectionFolderNode = state.collectionFolderNode;
  }

  async function deleteCollection(bindId: string) {
    await deleteMaterialCollection(state, bindId);
    materialCollectionFolders = state.materialCollectionFolders;
    openStates = state.openStates;
    collectionFolderNode = state.collectionFolderNode;
  }

  async function startEditingFolder(bindId: string, currentName: string) {
    editingFolderId = bindId;
    editingFolderName = currentName;
    await tick();
    if (editingInput) {
      editingInput.focus();
      editingInput.select();
    }
  }

  async function saveEditingFolder() {
    if (editingFolderId == null || !editingFolderName.trim()) return;
    await renameMaterialCollection(state, editingFolderId, editingFolderName);
    materialCollectionFolders = state.materialCollectionFolders;
    openStates = state.openStates;
    collectionFolderNode = state.collectionFolderNode;
    editingFolderId = null;
    editingFolderName = '';
  }

  function cancelEditingFolder() {
    editingFolderId = null;
    editingFolderName = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      saveEditingFolder();
    } else if (e.key === 'Escape') {
      cancelEditingFolder();
    }
  }

  $: if ($gadgetFileSystem) {
    loadCollections();
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
      <div class="content-container">
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
        <Accordion>
          {#each materialCollectionFolders as folder}
            <AccordionItem bind:open={openStates[folder[1]]}>
              <svelte:fragment slot="summary">
                <div class="folder-header">
                  {#if editingFolderId === folder[0]}
                    <input 
                      type="text" 
                      class="folder-name-input"
                      bind:value={editingFolderName}
                      bind:this={editingInput}
                      on:keydown={handleKeydown}
                      on:blur={saveEditingFolder}
                      on:click|stopPropagation
                    />
                  {:else}
                    <h2 
                      class="folder-name" 
                      on:dblclick|stopPropagation={() => startEditingFolder(folder[0], folder[1])}
                      title="ダブルクリックで編集"
                    >
                      {folder[1]}
                    </h2>
                  {/if}
                  <div class="folder-actions">
                    <button 
                      class="icon-button"
                      on:click|stopPropagation={() => startEditingFolder(folder[0], folder[1])}
                      use:toolTip={'名前を編集'}
                    >
                      <img src={renameIcon} alt="rename" class="icon" />
                    </button>
                    <button 
                      class="icon-button"
                      on:click|stopPropagation={() => deleteCollection(folder[0])}
                      use:toolTip={'コレクションを削除'}
                    >
                      <img src={trashIcon} alt="trash" class="icon" />
                    </button>
                  </div>
                </div>
              </svelte:fragment>
              <svelte:fragment slot="content">
                <div class="accordion-content">
                  <MaterialGallery targetNode={folder[2]} on:dragstart={onDragStart} />
                </div>
              </svelte:fragment>
            </AccordionItem>
          {/each}
          
          <AccordionItem bind:open={warehouseOpen}>
            <svelte:fragment slot="summary">
              <h2>{$_('materialBucket.generationHistory')}</h2>
            </svelte:fragment>
            <svelte:fragment slot="content">
              <div class="accordion-content">
                <WarehouseGallery on:dragstart={onDragStart} />
              </div>
            </svelte:fragment>
          </AccordionItem>
        </Accordion>
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

  .content-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
  }

  :global(.accordion-item) {
    margin-top: -8px;
  }

  .accordion-content {
    min-height: 200px;
    overflow: visible;
    display: flex;
    flex-direction: column;
  }

  h2 {
    font-family: '源暎エムゴ';
    font-size: 1.2rem;
    color: #666;
    margin: 0;
  }

  h3 {
    font-family: '源暎エムゴ';
    font-size: 1.4rem;
    color: #444;
    margin: 0;
  }

  :global(.accordion-item) {
    background: none;
    border: none;
  }

  .collection-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding: 0 8px;
  }

  .folder-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .folder-header button {
    margin-left: auto;
  }

  .folder-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .folder-name {
    cursor: pointer;
    user-select: none;
  }

  .folder-name:hover {
    text-decoration: underline;
    text-decoration-style: dotted;
  }

  .folder-name-input {
    font-family: '源映エムゴ';
    font-size: 1.2rem;
    color: #666;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 2px 8px;
    margin: -2px 0;
    outline: none;
  }

  .folder-name-input:focus {
    border-color: #007bff;
  }

  .icon-button {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }

  .icon {
    width: 16px;
    height: 16px;
    display: block;
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
</style>