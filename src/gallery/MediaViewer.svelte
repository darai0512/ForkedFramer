<script lang="ts">
  import { modalStore, toastStore } from "@skeletonlabs/skeleton";
  import { mediaViewerTarget } from "./mediaViewerStore";
  import MediaFrame from "./MediaFrame.svelte";
  import { sendMediaToMaterialCollection, postToPublicMaterials } from "../materialBucket/materialOperations";
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
  let contentArea: HTMLDivElement;

  // シークバー操作中フラグを MediaFrame から受け取る
  let isSeekingGlobal = false;

  function handleBackgroundClick(event: MouseEvent) {
    // クリック位置がコンテンツエリア外かつシークバー操作中でない場合のみ閉じる
    if (!contentArea || isSeekingGlobal) return;

    const rect = contentArea.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    // コンテンツエリアの外側をクリックした場合のみ閉じる
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      modalStore.close();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ((event.key === 'Enter' || event.key === ' ') && !isSeekingGlobal) {
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
      const { requestId: request_id, model } = await image2Video(request);
      await saveRequest(get(mainBookFileSystem)!, "video", request.model, request_id, model);

      const newMedia = new VideoMedia({ mediaType: "video", mode: request.model, requestId: request_id, model });
      
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

  async function handlePostToPublicMaterials() {
    modalStore.close();
    await postToPublicMaterials($mediaViewerTarget!);
  }

  // materialInfoがついてる素材は投稿できない
  $: canPostToPublic = $mediaViewerTarget && !(($mediaViewerTarget as any).materialInfo);
  
  // materialInfoが存在するかチェック
  $: materialInfo = ($mediaViewerTarget as any)?.materialInfo;
  
  // MangaFarmのURLを取得
  function getMangaFarmUrl() {
    const getParentDomain = () => window.location.hostname.split('.').slice(1).join('.');
    const parentDomain = getParentDomain();
    return window.location.hostname === 'frameplanner.example.local'
      ? 'http://example.local:5174'
      : `https://${parentDomain}`;
  }
  
  function openUserProfile(username: string) {
    const targetUrl = `${getMangaFarmUrl()}/user/${username}`;
    window.open(targetUrl, '_blank');
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
  on:click={handleBackgroundClick}
  on:keydown={handleKeyDown}
>
  {#if $mediaViewerTarget}
    <div
      class="content-area"
      bind:this={contentArea}
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="presentation">
      <div class="media-container" bind:this={mediaContainer}>
        <MediaFrame
          media={$mediaViewerTarget}
          bind:isSeekingGlobal={isSeekingGlobal}
        />
      </div>
      {#if materialInfo}
        <div class="material-info">
          <h3 class="font-bold text-lg">{materialInfo.name || '無題'}</h3>
          {#if materialInfo.description}
            <p class="text-sm mt-2">{materialInfo.description}</p>
          {/if}
          {#if materialInfo.author_username}
            <p class="text-sm mt-2">
              作成者:
              <button
                class="author-link"
                on:click|stopPropagation={() => openUserProfile(materialInfo.author_username)}
              >
                {materialInfo.author_display_name || materialInfo.author_username}
                {#if materialInfo.author_display_name}
                  <span class="opacity-70">(@{materialInfo.author_username})</span>
                {/if}
              </button>
            </p>
          {/if}
        </div>
      {/if}
      {#if $mediaViewerTarget.type === 'video'}
        <div class="video-controls">
          <button
            class="btn variant-filled-primary text-white"
            on:click|stopPropagation={captureCurrentFrame}
          >
            {$_('frame.actions.sendVideoFrameToMaterialCollection')}
          </button>
          <button
            class="btn variant-filled-secondary text-white"
            disabled={!canPostToPublic}
            on:click|stopPropagation={handlePostToPublicMaterials}
          >
            {$_('publicMaterials.postButton')}
          </button>
        </div>
      {/if}
      {#if $mediaViewerTarget.type === 'image'}
        <div class="image-controls">
          <button
            class="btn variant-filled-primary text-white"
            on:click|stopPropagation={generateMovieFromImage}
          >
            {$_('publicMaterials.generateVideoButton')}
          </button>
          <button
            class="btn variant-filled-secondary text-white"
            disabled={!canPostToPublic}
            on:click|stopPropagation={handlePostToPublicMaterials}
          >
            {$_('publicMaterials.postButton')}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    position: relative;
    width: 100%;
    height: 100%;
  }
  .content-area {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
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
  .material-info {
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 1rem;
    border-radius: 0.5rem;
    max-width: 500px;
    text-align: center;
  }
  .author-link {
    color: #60a5fa;
    text-decoration: underline;
    cursor: pointer;
    transition: color 0.2s;
  }
  .author-link:hover {
    color: #93bbfc;
  }
</style>
