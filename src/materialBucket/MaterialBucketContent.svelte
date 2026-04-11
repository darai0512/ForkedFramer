<script lang="ts">
  import MaterialGallery from './MaterialGallery.svelte';

  import { Accordion, AccordionItem, SlideToggle } from '@skeletonlabs/skeleton';
  import { _ } from 'svelte-i18n';
  import { gadgetFileSystem } from '../filemanager/fileManagerStore';
  import type { Node, EmbodiedEntry } from '../lib/filesystem/fileSystem';
  import type { Media } from '../lib/layeredCanvas/dataModels/media';
  import { toolTip } from '../utils/passiveToolTipStore';
  import { tick, createEventDispatcher } from 'svelte';
  import {
    type MaterialCollectionState,
    loadMaterialCollections,
    addMaterialCollection,
    deleteMaterialCollection,
    renameMaterialCollection,
    saveMaterialToFolder,
    deleteMaterialFromFolder
  } from './materialOperations';
  
  import { draggedMaterial, materialCollectionUpdateToken } from './materialBucketStore';

  import trashIcon from '../assets/fileManager/trash.webp';
  import renameIcon from '../assets/fileManager/rename.webp';

  const dispatch = createEventDispatcher<{ dragstart: void; addcollection: void; choose: Media }>(
);

  export let galleryColumnWidth: number = 220;
  export let selectionOnly: boolean = false;

  let materialCollectionFolders: EmbodiedEntry[] = [];
  let openStates: { [key: string]: boolean } = {};
  let collectionFolderNode: Node | null = null;
  let editingFolderId: string | null = null;
  let editingFolderName: string = '';
  let editingInput: HTMLInputElement | null = null;

  let dragSrcIndex: number | null = null;

  function onDragStart() {
    dispatch('dragstart');
  }

  function onFolderDragStart(e: DragEvent, index: number) {
    dragSrcIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', `folder:${index}`);
    }
  }

  function onFolderDragOver(e: DragEvent) {
    if (e.dataTransfer) {
      e.preventDefault();
    }
  }

  async function onFolderDrop(e: DragEvent, dropIndex: number) {
    if (!e.dataTransfer) return;
    const data = e.dataTransfer.getData('text/plain');

    if (data.startsWith('folder:')) {
      const srcIndex = parseInt(data.substring(7), 10);
      if (srcIndex !== dropIndex) {
        const items = [...materialCollectionFolders];
        const [dragged] = items.splice(srcIndex, 1);
        items.splice(dropIndex, 0, dragged);
        materialCollectionFolders = items;
        // NOTE: 並び順はセッション内のみ（ファイルシステム層の永続化は未対応）
      }
    } else if ($draggedMaterial) {
      const { media, bindId, sourceNodeId } = $draggedMaterial;
      const targetFolderNode = materialCollectionFolders[dropIndex][2];
      if (sourceNodeId !== targetFolderNode.id) {
        const fs = $gadgetFileSystem;
        if (fs) {
           const srcFolderNode = await fs.getNode(sourceNodeId);
           if (srcFolderNode) {
             const srcFolder = srcFolderNode.asFolder()!;
             const dstFolder = targetFolderNode.asFolder()!;
             const entry = await srcFolder.getEntry(bindId as BindId);
             if (entry) {
               // entry is [BindId, string, NodeId] — entry[2] is already NodeId
               await dstFolder.link(entry[1], entry[2]);
               await srcFolder.unlink(bindId as BindId);
               $materialCollectionUpdateToken = true;
             }
           }
        }
      }
      $draggedMaterial = null;
    }
    dragSrcIndex = null;
  }

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

  export async function addCollection() {
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

<div class="content-container" style="--gallery-column-width: {galleryColumnWidth}px;">
  <Accordion>
    {#each materialCollectionFolders as folder, i}
      <AccordionItem bind:open={openStates[folder[1]]}>
        <svelte:fragment slot="summary">
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="folder-header"
               style="opacity: {dragSrcIndex === i ? 0.5 : 1.0}; transition: opacity 0.2s;"
               draggable="true"
               on:dragstart={(e) => onFolderDragStart(e, i)}
               on:dragover={onFolderDragOver}
               on:drop={(e) => onFolderDrop(e, i)}>
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
            <MaterialGallery targetNode={folder[2]} columnWidth={galleryColumnWidth} {selectionOnly} on:dragstart={onDragStart} on:choose={(e) => dispatch('choose', e.detail)} />
          </div>
        </svelte:fragment>
      </AccordionItem>
    {/each}


  </Accordion>
  <button
    class="btn variant-filled-primary w-full mt-4 flex items-center justify-center gap-2"
    on:click={addCollection}
  >
    <span class="text-lg">➕</span> 新しいコレクション
  </button>
</div>

<style>
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

  :global(.accordion-item) {
    background: none;
    border: none;
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
</style>
