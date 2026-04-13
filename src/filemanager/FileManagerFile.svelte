<script lang="ts">
  import { fileManagerDragging, fileManagerMarkedFlag, loadBookFrom, loadToken, saveBookTo, selectedEntries, lastSelectedEntry, handleEntryClick, buildDragging, removeSelectedEntries, renameSelectedEntries, exportSelectedEntries, type Dragging, type BulkRenameResult } from "./fileManagerStore";
  import { waitDialog } from '../utils/waitDialog';
  import type { NodeId, BindId, FileSystem, Folder } from "../lib/filesystem/fileSystem";
  import { mainBook, bookOperators } from '../bookeditor/workspaceStore';
  import { createEventDispatcher, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import FileManagerInsertZone from "./FileManagerInsertZone.svelte";
  import RenameEdit from "../utils/RenameEdit.svelte";
  import { toolTip } from '../utils/passiveToolTipStore';
  import { saveAs } from 'file-saver';
  import { toastStore } from '@skeletonlabs/skeleton';
  import { writeEnvelope } from "../lib/book/envelope";
  import { progress } from '../utils/loadingStore';

  import trashIcon from '../assets/fileManager/trash.webp';
  import renameIcon from '../assets/fileManager/rename.webp';
  import fileIcon from '../assets/fileManager/file.webp';
  import pasteIcon from '../assets/fileManager/paste.webp'
  import packageIcon from '../assets/fileManager/package-export.webp'
  import duplicateIcon from '../assets/fileManager/duplicate.webp'

  const dispatch = createEventDispatcher();

  export let fileSystem: FileSystem;
  export let nodeId: NodeId;
  export let bindId: BindId;
  export let filename: string;
  export let parent: Folder;
  export let trash: Folder | null; // 捨てるときの対象、ごみ箱の中身の場合はnull
  export let removability = "removeable"; // "removable" | "unremovable-shallow" | "unremovable-deep"
  export let index: number;
  export let path: string[];

  let acceptable = false;
  let isDiscardable = false;
  let loaded = false;
  let renameEdit: RenameEdit | null = null;
  let renaming = false;
  let isDraggingOverMerge = false;

  $: if ($mainBook) {
    loaded = $mainBook.revision.id === nodeId;
  }

  $: ondrag($fileManagerDragging);
  function ondrag(dragging: Dragging | null) {
    acceptable = dragging != null && !dragging.entries.some(e => path.includes(e.bindId));
  }

	async function onDragStart (ev: DragEvent) {
    console.log("file dragstart", renaming);
    if (renaming) {
      ev.preventDefault();
      return;
    }
		ev.dataTransfer!.setData("bindId", bindId);
		ev.dataTransfer!.setData("parent", parent.id);
    ev.stopPropagation();
    setTimeout(() => {
      // こうしないとなぜかdragendが即時発火してしまう
      $fileManagerDragging = buildDragging(fileSystem, nodeId, bindId, parent.id);
    }, 0);
	}

  function onDragEnd(ev: DragEvent) {
    console.log("file dragend")
    ev.stopPropagation();
    $fileManagerDragging = null;
  }

  function onDragOverMerge(ev: DragEvent) {
    if (renaming) return;
    ev.preventDefault();
    ev.stopPropagation();
    isDraggingOverMerge = true;
  }

  function onDragLeaveMerge() {
    isDraggingOverMerge = false;
  }

  async function onDropMerge(ev: DragEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    isDraggingOverMerge = false;

    if (!acceptable) return;

    const dragging = $fileManagerDragging;
    if (!dragging || dragging.entries.length === 0) return;

    // Check if dropping on itself
    if (dragging.entries.some(e => e.bindId === bindId)) return;

    try {
      const targetNode = await fileSystem.getNode(nodeId);
      if (!targetNode || targetNode.getType() !== 'file') return;
      const targetFile = targetNode.asFile()!;
      const targetBook = await loadBookFrom(fileSystem, targetFile);

      const sourceBookPromises = dragging.entries.map(async entry => {
        const sourceParent = (await dragging.fileSystem.getNode(entry.parent)) as Folder;
        const mover = await sourceParent.getEntry(entry.bindId);
        if (!mover) return null;
        const sourceNode = await dragging.fileSystem.getNode(mover[2]);
        if (!sourceNode || sourceNode.getType() !== 'file') return null;
        return { file: sourceNode.asFile()!, parent: sourceParent, bindId: entry.bindId, name: mover[1] };
      });

      const sourceItems = (await Promise.all(sourceBookPromises)).filter(x => x !== null);
      if (sourceItems.length === 0) return;

      const sourceBooks = await Promise.all(sourceItems.map(item => loadBookFrom(dragging.fileSystem, item!.file)));

      const targetSize = targetBook.newPageProperty?.paperSize || targetBook.pages[0]?.paperSize || [840, 1188];
      
      const isSameSize = (size1: [number, number], size2: [number, number]) => {
        return size1[0] === size2[0] && size1[1] === size2[1];
      };

      for (const sb of sourceBooks) {
        const sourceSize = sb.newPageProperty?.paperSize || sb.pages[0]?.paperSize || [840, 1188];
        if (!isSameSize(targetSize, sourceSize)) {
          toastStore.trigger({ message: '版形が違うbookは統合できません。', timeout: 3000 });
          return;
        }
      }

      const confirmed = await waitDialog<boolean>('confirm', {
        title: '統合の確認',
        message: 'これらのbookを統合しますか？',
        positiveButtonText: '統合する',
        negativeButtonText: 'キャンセル'
      });

      if (!confirmed) return;

      $progress = 0;
      for (const sb of sourceBooks) {
        if (loaded) {
          $mainBook!.pages.push(...sb.pages);
        }
        targetBook.pages.push(...sb.pages);
      }
      if (loaded) {
        $mainBook!.pages = $mainBook!.pages;
      }
      await saveBookTo(loaded ? $mainBook! : targetBook, fileSystem, targetFile);
      
      for (const item of sourceItems) {
        await item!.parent.unlink(item!.bindId);
      }

      toastStore.trigger({ message: '統合しました。', timeout: 2000 });
    } catch (e) {
      console.error(e);
      toastStore.trigger({ message: '統合に失敗しました。', timeout: 3000 });
    } finally {
      $progress = null;
      $fileManagerDragging = null;
      $selectedEntries = new Set();
    }
  }

  async function removeFile() {
    if ($selectedEntries.size > 1 && trash) {
      await removeSelectedEntries(fileSystem, trash);
    } else {
      dispatch('remove', bindId);
    }
  }

  function duplicateFile() {
    dispatch('duplicate', { bindId, nodeId, filename });
  }

  async function startRename() {
    if ($selectedEntries.size > 1) {
      const result = await waitDialog<BulkRenameResult>('bulkRename', { count: $selectedEntries.size });
      await renameSelectedEntries(fileSystem, result);
      dispatch('rename', { bindId, name: filename });
      return;
    }
    console.log("renameFile");
    renameEdit!.setFocus();
  }

  function submitRename(e: CustomEvent<string>) {
    console.log("submitRename", e.detail);
    dispatch('rename', { bindId, name: e.detail });
    renaming = false;
  }

  function onDrop(ev: CustomEvent<DataTransfer>) {
    const detail = { dataTransfer: ev.detail, index };
    dispatch('insert', detail);
    ev.preventDefault();
    ev.stopPropagation();
    $fileManagerDragging = null;
  }

  async function onClick(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      handleEntryClick(nodeId, e);
      return;
    }
    if ($selectedEntries.has(nodeId) && $selectedEntries.size === 1) {
      if (fileSystem.isVault) {
        toastStore.trigger({ message: $_('fileManager.cloudFileCannotOpenDirectly'), timeout: 3000});
        return;
      }
      $loadToken = { fileSystem, nodeId, parent, bindId };
    } else {
      handleEntryClick(nodeId, e);
    }
  }

  async function copyMarkedPages() {
    const marked = $bookOperators!.getMarks();
    const pages = $mainBook!.pages;
    const markedPages = pages.filter((_, i) => marked[i]);

    const file = (await fileSystem.getNode(nodeId))!.asFile()!;
    const targetBook = await loadBookFrom(fileSystem, file);
    targetBook.pages.push(...markedPages);
    await saveBookTo(targetBook, fileSystem, file);
    toastStore.trigger({ message: $_('fileManager.markedPagesCopied'), timeout: 1500});
  }

  async function makePackage() {
    $progress = 0;
    if ($selectedEntries.size > 1) {
      const zipBlob = await exportSelectedEntries(fileSystem, n => $progress = n);
      if (zipBlob) {
        const dateStr = new Date().toISOString().replace(/[-:]/g, '').substring(0, 15);
        saveAs(zipBlob, `selected_${dateStr}.zip`);
        toastStore.trigger({ message: 'パッケージをダウンロードしました。', timeout: 3000});
      }
    } else {
      const file = (await fileSystem.getNode(nodeId))!.asFile()!;
      const book = await loadBookFrom(fileSystem, file);
      const blob = await writeEnvelope(book, n => $progress = n);
      saveAs(blob, `${filename}.envelope`);
      toastStore.trigger({ message: 'パッケージをダウンロードしました。ファイルマネージャにドロップすると読み込むことができます。', timeout: 3000});
    }
    $progress = null;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'F2' && $lastSelectedEntry === nodeId && isDiscardable && !renaming) {
      e.preventDefault();
      startRename();
    }
  }

  onMount(async () => {
    isDiscardable = removability === "removable" && trash != null;
  });

</script>

<svelte:window on:keydown={onKeyDown}/>

<div class="file" class:selected={$selectedEntries.has(nodeId)} class:file-dragging-over={isDraggingOverMerge} data-node-id={nodeId} data-bind-id={bindId} data-parent-id={parent.id}>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="file-title" class:loaded={loaded} use:toolTip={$_('fileManager.moveByDragEditByDoubleClick')}
    draggable={true} on:click={onClick} on:dragstart={onDragStart} on:dragend={onDragEnd}>
    <img class="button" src={fileIcon} alt="symbol"/>
    {#if isDiscardable}
      <div class="filename">
        <RenameEdit bind:this={renameEdit} bind:editing={renaming} value={filename} on:submit={submitRename}/>
      </div>
    {:else}
      {filename}
    {/if}
  </div>
  {#if $lastSelectedEntry === nodeId}
    <div class="floating-actions">
      {#if $fileManagerMarkedFlag}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <img class="action-icon" src={pasteIcon} alt="paste" on:click={copyMarkedPages} use:toolTip={$_('fileManager.selectPagesCopy')}/>
      {/if}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <img class="action-icon" src={packageIcon} alt="package" on:click={makePackage} use:toolTip={$_('fileManager.createPackage')}/>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <img class="action-icon" src={duplicateIcon} alt="duplicate" on:click={duplicateFile} use:toolTip={$_('fileManager.duplicate')}/>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <img class="action-icon" src={renameIcon} alt="rename" on:click={startRename} use:toolTip={$_('fileManager.changeFileName')}/>
      {#if isDiscardable}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <img class="action-icon" src={trashIcon} alt="trash" on:click={removeFile} use:toolTip={$_('fileManager.discard')}/>
      {/if}
    </div>
  {/if}
  <FileManagerInsertZone on:drop={onDrop} bind:acceptable={acceptable} depth={path.length}/>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="file-drop-zone"
    class:acceptable={acceptable}
    on:dragover={onDragOverMerge}
    on:dragleave={onDragLeaveMerge}
    on:drop={onDropMerge}
    style="z-index: {path.length + 1}"
  ></div>
</div>

<style>
  .file {
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    position: relative;
    border: 2px solid transparent;
  }
  .file:hover {
    background-color: #fff4;
  }
  .file.file-dragging-over {
    background-color: #ee84;
    box-shadow: 0 0 0 2px #444 inset;
  }
  .file-drop-zone {
    position: absolute;
    top: 33%;
    left: 0;
    right: 0;
    height: 34%;
    display: none;
  }
  .file-drop-zone.acceptable {
    display: block;
  }
  .file-title {
    font-size: 16px;
    font-weight: 700;
    user-select: none;
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    height: 24px;
  }
  .button {
    width: 16px;
    height: 16px;
    display: inline;
  }
  .floating-actions {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
    padding: 2px 4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    z-index: 1;
  }
  .action-icon {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
  .loaded {
    background-color: #f8f4;
    border-radius: 8px;
  }
  .selected {
    border-color: #4a90e2;
  }

</style>
