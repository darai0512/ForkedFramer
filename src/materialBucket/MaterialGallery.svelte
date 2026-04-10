<script lang="ts">
  import Gallery from '../gallery/Gallery.svelte';
  import type { GalleryItem } from "../gallery/gallery";
  import { dropzone } from '../utils/dropzone';
  import { createCanvasFromBlob, createVideoFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
  import { Bubble } from "../lib/layeredCanvas/dataModels/bubble";
  import type { Rect } from "../lib/layeredCanvas/tools/geometry/geometry";
  import { bookOperators, redrawToken } from '../bookeditor/workspaceStore';
  import { Film } from '../lib/layeredCanvas/dataModels/film';
  import { ImageMedia, VideoMedia, type Media, buildMedia } from '../lib/layeredCanvas/dataModels/media';
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Node, BindId } from '../lib/filesystem/fileSystem';
  import { 
    saveMaterialToFolder, 
    deleteMaterialFromFolder, 
    loadMaterialsFromFolder 
  } from './materialOperations';
  import { materialCollectionUpdateToken, draggedMaterial } from './materialBucketStore';

  export let targetNode: Node | null = null;
  export let columnWidth: number = 220;

  let items: (() => Promise<Media[]>)[] = [];
  let bindIds = new WeakMap<(() => Promise<Media[]>) | Media, BindId>();

  interface LoaderEntry {
    loader: () => Promise<Media[]>;
    setLoadMedia: (loadMedia: () => Promise<Media[]>) => void;
  }

  let loaderEntries = new Map<BindId, LoaderEntry>();

  $: displayMaterialImages(targetNode, $materialCollectionUpdateToken);
  async function displayMaterialImages(node: Node | null, updateToken: boolean) {
    if (node == null) return;
    if (!updateToken) return;
    const folder = node.asFolder()!;
    const materialItems = await loadMaterialsFromFolder(folder);
    const nextItems: (() => Promise<Media[]>)[] = [];
    const nextEntries = new Map<BindId, LoaderEntry>();

    for (const item of materialItems) {
      let entry = loaderEntries.get(item.bindId);
      if (!entry) {
        entry = createLoaderEntry(item.bindId, item.loadMedia);
      } else {
        entry.setLoadMedia(item.loadMedia);
      }
      bindIds.set(entry.loader, item.bindId);
      nextEntries.set(item.bindId, entry);
      nextItems.push(entry.loader);
    }

    loaderEntries = nextEntries;
    if (!areItemsEqual(items, nextItems)) {
      items = nextItems;
    }
    $materialCollectionUpdateToken = false;
  }


  const dispatch = createEventDispatcher();

  function createLoaderEntry(bindId: BindId, loadMedia: () => Promise<Media[]>): LoaderEntry {
    let currentLoadMedia = loadMedia;
    let cachedPromise: Promise<Media[]> | null = null;

    const loader = async () => {
      if (!cachedPromise) {
        cachedPromise = currentLoadMedia()
          .then(mediaArray => {
            for (const media of mediaArray) {
              bindIds.set(media, bindId);
            }
            return mediaArray;
          })
          .catch(error => {
            cachedPromise = null;
            throw error;
          });
      }
      return cachedPromise;
    };

    bindIds.set(loader, bindId);

    return {
      loader,
      setLoadMedia(nextLoadMedia: () => Promise<Media[]>) {
        currentLoadMedia = nextLoadMedia;
        cachedPromise = null;
      }
    };
  }

  function areItemsEqual(
    current: (() => Promise<Media[]>)[],
    next: (() => Promise<Media[]>)[]
  ): boolean {
    if (current === next) return true;
    if (current.length !== next.length) return false;
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== next[i]) return false;
    }
    return true;
  }

  function onChooseImage(e: CustomEvent<Media>) {
    const page = $bookOperators!.getFocusedPage();
    const canvas = e.detail;
    const bubble = new Bubble();
    const paperSize = page.paperSize;
    const imageSize = e.detail.size;
    const x = Math.random() * (paperSize[0] - imageSize[0]);
    const y = Math.random() * (paperSize[1] - imageSize[1]);
    bubble.setPhysicalRect(paperSize, [x, y, ...imageSize] as Rect);
    bubble.forceEnoughSize(paperSize);
    bubble.shape = "none";
    bubble.initOptions();
    bubble.text = "";
    const film = Film.fromMedia(buildMedia(e.detail.persistentSource));
    bubble.filmStack.films.push(film);
    page.bubbles.push(bubble);
    $bookOperators!.focusBubble(page, bubble);
    $redrawToken = true;
  }

  function onChildDragStart(e: CustomEvent<Media>) {
    const bindId = bindIds.get(e.detail);
    if (targetNode && bindId) {
      $draggedMaterial = { media: e.detail, bindId, sourceNodeId: targetNode.id };
    }
    dispatch('dragstart', e.detail);
  }

  async function onDelete(e: CustomEvent<GalleryItem>) {
    const bindId = bindIds.get(e.detail);
    if (targetNode == null || bindId == null) return;
    const folder = targetNode.asFolder()!;
    await deleteMaterialFromFolder(folder, bindId);
    $materialCollectionUpdateToken = true;
  }

  async function onFileDrop(files: FileList) {
    if (targetNode == null) return;
    const folder = targetNode.asFolder()!;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/svg')) continue;
      
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        // 非同期関数を作成してitemsに追加
        const loadMedia = async (): Promise<Media[]> => {
          let media: Media;
          if (file.type.startsWith('image/')) {
            const canvas = await createCanvasFromBlob(file);
            media = new ImageMedia(canvas);
          } else {
            const video = await createVideoFromBlob(file);
            media = new VideoMedia(video);
          }
          
          const bindId = await saveMaterialToFolder(folder, media, file.name);
          bindIds.set(loadMedia, bindId);
          bindIds.set(media, bindId);
          return [media];
        };
        
        items.push(loadMedia);
      }
    }
    items = items; // リアクティブ更新をトリガー
  }

  onMount(() => {
    $materialCollectionUpdateToken = true;
  });
</script>

<div class="dropzone" use:dropzone={onFileDrop}>
  {#if items.length > 0}
    <Gallery {columnWidth} referable={false} bind:items={items} on:commit={onChooseImage} on:dragstart={onChildDragStart} on:delete={onDelete}/>
  {:else}
    <div class="empty-state">
      <p class="empty-message">ここに画像や動画をドロップしてください</p>
    </div>
  {/if}
</div>

<style>
  .dropzone {
    width: 100%;
    height: 100%;
    min-height: 200px;
    overflow: auto;
    transition: all 0.2s;
    border-radius: 4px;
    position: relative;
    flex: 1;
  }
  :global(.dropzone.drag-over) {
    background-color: rgba(0, 123, 255, 0.15) !important;
    outline: 3px dashed rgba(0, 123, 255, 0.6) !important;
    outline-offset: -3px !important;
    z-index: 10 !important;
  }
  
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    width: 100%;
    height: 100%;
  }
  
  .empty-message {
    color: rgb(var(--color-surface-600));
    font-size: 16px;
    font-family: '源暎エムゴ';
    text-align: center;
    padding: 20px;
  }
</style>
