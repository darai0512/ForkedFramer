<script lang="ts">
  import { modalStore, toastStore } from "@skeletonlabs/skeleton";
  import { mediaViewerTarget } from "./mediaViewerStore";
  import MediaFrame from "./MediaFrame.svelte";
  import { sendMediaToMaterialCollection } from "../materialBucket/materialOperations";
  import { ImageMedia, VideoMedia } from "../lib/layeredCanvas/dataModels/media";
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { mainBookFileSystem } from '../filemanager/fileManagerStore';
  import { waitDialog } from '../utils/waitDialog';
  import { image2Video } from '../supabase';
  import { saveRequest } from '../filemanager/warehouse';
  import { loading } from '../utils/loadingStore';
  import { onlineStatus } from '../utils/accountStore';
  import type { ImageToVideoRequest } from '$protocolTypes/imagingTypes';
  
  let mediaContainer: HTMLDivElement;
  
  function handleClose() {
    modalStore.close();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      modalStore.close();
    }
  }

  async function generateMovieFromImage() {
    if (!$mediaViewerTarget || $mediaViewerTarget.type !== 'image') return;
    
    if (get(onlineStatus) !== "signed-in") {
      toastStore.trigger({ message: `動画生成はサインインしてないと使えません`, timeout: 3000});
      return;
    }

    modalStore.close();
    const request = await waitDialog<ImageToVideoRequest>('videoGenerator', { media: $mediaViewerTarget });
    console.log("modalFrameVideo", request);

    if (!request) { return; }

    loading.set(true);
    try {
      const { requestId: request_id } = await image2Video(request);
      await saveRequest(get(mainBookFileSystem)!, "video", request.model, request_id);

      const newMedia = new VideoMedia({ mediaType: "video", mode: request.model, requestId: request_id });
      
      // 生成した動画を素材集に送る
      const result = await sendMediaToMaterialCollection(newMedia, `generated-video-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`);
      
      loading.set(false);
      toastStore.trigger({ message: result.message, timeout: 3000});
    }
    catch (e) {
      loading.set(false);
      toastStore.trigger({ message: `動画生成に失敗しました`, timeout: 3000});
    }
  }

  async function captureCurrentFrame() {
    if (!$mediaViewerTarget || $mediaViewerTarget.type !== 'video') return;
    
    // DOMから実際のvideo要素を取得
    const videoElement = mediaContainer?.querySelector('video');
    if (!videoElement) {
      console.error('Video element not found in DOM');
      return;
    }
    
    try {
      // Create canvas and capture current frame
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // 現在のフレームを描画
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Create ImageMedia from canvas
      const media = new ImageMedia(canvas);
      
      // Generate filename with timestamp and current time
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const currentTime = Math.floor(videoElement.currentTime);
      const fileName = `video-frame-${currentTime}s-${timestamp}.png`;
      
      // Send to material collection
      const result = await sendMediaToMaterialCollection(media, fileName);
      
      toastStore.trigger({ 
        message: result.message, 
        timeout: 3000 
      });
    } catch (error) {
      console.error('Failed to capture frame:', error);
      toastStore.trigger({ message: $_('errors.capture_failed'), timeout: 3000 });
    }
  }
</script>

<div 
  class="page-container" 
  role="button" 
  tabindex="0"
  on:click={handleClose}
  on:keydown={handleKeyDown}
>
  {#if $mediaViewerTarget}
    <div class="media-container" bind:this={mediaContainer}>
      <MediaFrame 
        media={$mediaViewerTarget}
      />
    </div>
    {#if $mediaViewerTarget.type === 'video'}
      <div class="video-controls">
        <button 
          class="btn variant-filled-primary text-white"
          on:click|stopPropagation={captureCurrentFrame}
        >
          {$_('frame.actions.sendToMaterialCollection')}
        </button>
      </div>
    {/if}
    {#if $mediaViewerTarget.type === 'image'}
      <div class="image-controls">
        <button 
          class="btn variant-filled-primary text-white"
          on:click|stopPropagation={generateMovieFromImage}
        >
          動画化して素材集に送る
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    position: relative;
    gap: 1rem;
  }
  .media-container {
    width: 80svw;
    height: 80svh;
  }
  .video-controls,
  .image-controls {
    display: flex;
    gap: 1rem;
    padding: 0.5rem;
  }
</style>