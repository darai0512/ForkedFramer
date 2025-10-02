<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { type ModalSettings, modalStore } from '@skeletonlabs/skeleton';
  import { mediaViewerTarget } from './mediaViewerStore';
  import { toolTip } from '../utils/passiveToolTipStore';
  import { getVideoElementFromMedia, type Media } from "../lib/layeredCanvas/dataModels/media";
  import { formatDuration } from '../utils/timeFormat';
  import MediaFrame from './MediaFrame.svelte';
  import { _ } from 'svelte-i18n';
  import { attachFileToDataTransfer } from '../lib/layeredCanvas/tools/dragUtil';

  import drop from '../assets/drop.webp';
  import reference from '../assets/reference.webp';
  import referenceSelected from '../assets/reference-selected.webp';
  import telescope from '../assets/telescope.webp';

  export let media: Media;
  export let width = 160;
  export let chosen: Media | null = null;
  export let refered: Media | null = null;
  export let accessable: boolean = true;
  export let referable: boolean = true;
  export let viewable: boolean = true; // 詳細（ビューア）ボタンの表示可否

  let height: number = 160;

  const dispatch = createEventDispatcher();

  $: {
    if (media) {
      const size = media.size;
      height = (size[1] / size[0]) * width; // fix aspect ratio
    }
  }

  $: duration = media.type === 'video' ? 
    (media.drawSource as HTMLVideoElement).duration : 
    null;

  function onClick() {
    console.log("onClick");
    if (chosen === media) {
      dispatch("commit", media);
      return;
    }
    chosen = media;
  }

  function onDelete(e: MouseEvent) {
    console.log("onDelete");
    e.stopPropagation();
    dispatch("delete", media);
  }

  function onRefer(e: MouseEvent) {
    console.log("onRefer");
    e.stopPropagation();
    refered = refered === media ? null : media;
  }

  const videoFileCache = new WeakMap<Media, Promise<File | null>>();

  function deriveVideoFileName(blobType: string): string {
    if (blobType.includes('webm')) return 'material-video.webm';
    if (blobType.includes('ogg') || blobType.includes('ogv')) return 'material-video.ogv';
    return 'material-video.mp4';
  }

  async function ensureVideoFile(target: Media): Promise<File | null> {
    let promise = videoFileCache.get(target);
    if (promise) return promise;

    promise = (async () => {
      const videoElement = getVideoElementFromMedia(target);
      const src = videoElement?.src;
      if (!src) return null;
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        if (!blob || blob.size === 0) return null;
        const type = blob.type || 'video/mp4';
        const name = deriveVideoFileName(type);
        return new File([blob], name, { type });
      } catch (error) {
        console.warn('Failed to prepare video file for drag', error);
        return null;
      }
    })();

    videoFileCache.set(target, promise);
    return promise;
  }

  function onDragStart(e: DragEvent) {
    console.log("onDragStart");
    if (e.dataTransfer && media.type === 'video') {
      const videoElement = getVideoElementFromMedia(media);
      const src = videoElement?.src;
      if (src) {
        try {
          e.dataTransfer.setData("video/mp4", src);
        } catch (error) {
          console.warn('Failed to set video/mp4 drag data', error);
        }
        void ensureVideoFile(media).then((file) => {
          if (!file) return;
          attachFileToDataTransfer(e.dataTransfer!, file, { setUriList: true });
        });
      }
    }
    dispatch("dragstart", media);
  }

  function onView(e: MouseEvent) {
    console.log("onView");
    $mediaViewerTarget = media;
    e.stopPropagation();
    const d: ModalSettings = {
      type: 'component',
      component: 'mediaViewer',
    };
    modalStore.trigger(d);
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div 
  class="frame" 
  class:selected={chosen === media} 
  style="width: {width}px; height: {height}px;"
  draggable="true" 
  on:dragstart={onDragStart}
  on:click={onClick}
>
  <div class="media-container">
    <MediaFrame {media} showControls={false}/>
  </div>
  {#if accessable}
    <div class="delete-button" on:click={e => onDelete(e)} use:toolTip={$_('gallery.delete')}>
      <img src={drop} alt="delete"/>
    </div>
    {#if viewable}
      <div class="telescope-button" on:click={e => onView(e)} use:toolTip={$_('gallery.view')}>
        <img src={telescope} alt="view" />
      </div>
    {/if}
    {#if referable}
      <div class="reference-button" on:click={e => onRefer(e)} use:toolTip={$_('gallery.i2iReference')}>
        {#if refered === media}
          <img src={referenceSelected} alt="reference"/>
        {:else}
          <img src={reference} alt="reference" />
        {/if}
      </div>
    {/if}
  {/if}
  {#if media.type === 'video' && duration}
    <div class="duration-label">
      {formatDuration(duration)}
    </div>
  {/if}
</div>

<style>
  .frame {
    width: 100%;
    height: 100%;
    position: relative;
    border: 2px solid transparent;
    box-sizing: border-box;
    overflow: hidden;
  }
  .selected {
    border-color: blue;
  }
  .media-container {
    width: 100%;
    height: 100%;
  }
  .delete-button {
    position: absolute;
    top: 4px;
    right: 4px;
    cursor: pointer;
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 0 2px black);
  }
  .reference-button {
    position: absolute;
    bottom: 4px;
    left: 4px;
    cursor: pointer;
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 0 2px black);
  }
  .telescope-button {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 1;
    cursor: pointer;
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 0 2px black);
  }
  .duration-label {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 2px 4px;
    border-radius: 2px;
    font-size: 0.8em;
  }
</style>
