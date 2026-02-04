<script lang="ts">
  import { newBookToken } from "../filemanager/fileManagerStore";
  import { newBook, newImageBook, type NotebookOptions } from "../lib/book/book";
  import { mainBook } from '../bookeditor/workspaceStore';
  import { createCanvasFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
  import BaseRootButton from './BaseRootButton.svelte';
  import newBookIcon from '../assets/new-book.webp';
  import { excludeTextFiles } from "../lib/layeredCanvas/tools/fileUtil";
  import { dropDataHandler } from '../utils/dropDataHandler';
  import { _ } from 'svelte-i18n';
  import { createPreference } from '../preferences';

  async function getNotebookOptions(): Promise<NotebookOptions> {
    const formatPref = createPreference<"4koma" | "standard">('imaging', 'notebookFormat');
    const pageNumberPref = createPreference<number | null>('imaging', 'notebookPageNumber');
    const format = await formatPref.get();
    const pageNumber = await pageNumberPref.get();
    return {
      format: format ?? "standard",
      pageNumber: pageNumber ?? null,
    };
  }

  async function createNewFile(e: CustomEvent<MouseEvent>) {
    if (e.detail.ctrlKey) {
      await createNewImageFileUsingClipboard();
    } else {
      const options = await getNotebookOptions();
      $newBookToken = newBook("not visited", "shortcut-", "standard", options);
    }
  }

  async function createNewImageFileUsingClipboard() {
    const options = await getNotebookOptions();
    const items = await navigator.clipboard.read();
    for (let item of items) {
      for (let type of item.types) {
        console.log(type);
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          const canvas = await createCanvasFromBlob(blob);
          const book = newImageBook("not visited", [canvas], "paste-", options)
          $newBookToken = book;
          return;
        }
      }
    }
  }

  // dropDataHandler用コールバック
  async function handleDropData(mediaResources: (HTMLCanvasElement | HTMLVideoElement | string)[]) {
    const options = await getNotebookOptions();
    const filteredResources = excludeTextFiles(mediaResources);
    const book = newImageBook("not visited", filteredResources, "drop-", options);
    $newBookToken = book;
  }

</script>

{#if $mainBook}
<BaseRootButton icon={newBookIcon} alt={"new book"} hint={$_('tooltips.newDocumentHint')} origin={"bottomleft"} location={[0,1]} on:click={createNewFile}>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="w-full h-full"
    use:dropDataHandler={handleDropData}>
  </div>
</BaseRootButton>
{/if}
