<script lang="ts">
  import { redrawToken } from '../bookeditor/workspaceStore';
  import type { Media } from "../lib/layeredCanvas/dataModels/media";
  import { canvasToBlob, computeAspectFitSize } from "../lib/layeredCanvas/tools/imageUtil";
  import { onMount, onDestroy } from 'svelte';

  export let media: Media;
  export let showControls: boolean = true;
  // 画像は<img>で表示してブラウザ標準ドラッグを有効化するか（trueで<img>）
  export let dragAsImage: boolean = true;

  function getVideoSource(media: Media) {
    return (media.drawSource as HTMLVideoElement).src;
  }

  let canvas: HTMLCanvasElement;
  let containerDiv: HTMLDivElement;
  let imageDataUrl: string | null = null; // imgモード用

  // iOS Safari向けベンダー属性を型安全に付与するためのアクション
  function webkitPlaysinline(node: HTMLVideoElement) {
    node.setAttribute('webkit-playsinline', '');
    return {
      destroy() {
        node.removeAttribute('webkit-playsinline');
      }
    };
  }

  function drawFrame() {
    if (!canvas || !media) return;
    const sourceCanvas = media.drawSourceCanvas; // ローディング/失敗時はフォールバックが返る
    // シンプルに毎回レイアウトを合わせる
    const rect = containerDiv?.getBoundingClientRect();
    if (rect) {
      const { width: targetWidth, height: targetHeight } = computeAspectFitSize(rect, media.size);
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${targetHeight}px`;
    }
    if (canvas.width !== media.size[0] || canvas.height !== media.size[1]) {
      canvas.width = media.size[0];
      canvas.height = media.size[1];
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceCanvas, 0, 0);
  }
  // 画像の<img>表示用URL更新
  async function updateImageUrlIfNeeded() {
    if (!media) return;
    if (!dragAsImage) return; // imgモードでないなら不要
    if (media.type !== 'image') return;
    if (!media.isLoaded) return; // ローディング/失敗はキャンバス
    const blob = await canvasToBlob(media.drawSourceCanvas);
    const url = URL.createObjectURL(blob);
    if (imageDataUrl) URL.revokeObjectURL(imageDataUrl);
    imageDataUrl = url;
  }

  // メディア変化・ロード完了・外部再描画トリガで更新
  $: if (media) { updateImageUrlIfNeeded(); }
  $: if ($redrawToken) { updateImageUrlIfNeeded(); }
  onDestroy(() => { if (imageDataUrl) URL.revokeObjectURL(imageDataUrl); });

  // メディアが変わったら一度描画（以降はrAF）
  $: if (media) { drawFrame(); }

  // ローディングスピナーのアニメーション更新
  let rafId: number | null = null;
  function startRaf() {
    if (rafId != null) return;
    const loop = () => {
      drawFrame();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }
  function stopRaf() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  // シンプルに、キャンバスを使う表示であれば常にrAFで再描画
  function usingCanvasNow(): boolean {
    if (!media) return false;
    // 実体のある動画は<video>
    if (media.type === 'video' && media.drawSource instanceof HTMLVideoElement) return false;
    // 画像で、imgドラッグを有効にしていて、ロード完了なら<img>
    if (media.type === 'image' && dragAsImage && media.isLoaded) return false;
    // それ以外はキャンバス描画
    return true;
  }
  $: usingCanvasNow() ? startRaf() : stopRaf();
  onMount(() => { if (usingCanvasNow()) startRaf(); });
  onDestroy(() => { stopRaf(); });
</script>

<div class="media-frame" bind:this={containerDiv}>
  {#if media.type === 'video' && media.drawSource instanceof HTMLVideoElement}
    <!-- 読み込み完了: ネイティブvideoを表示 -->
    <!-- svelte-ignore a11y-media-has-caption -->
    <video 
      src={getVideoSource(media)}
      controls={showControls}
      playsinline
      use:webkitPlaysinline
      class="media-element"
      draggable="true"
      on:click
    />
  {:else}
    {#if dragAsImage && media.type === 'image' && media.isLoaded && imageDataUrl}
      <!-- 画像ロード完了時は<img>（ドラッグ用に必要） -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <img
        src={imageDataUrl}
        class="media-element"
        alt=""
        draggable="true"
        on:click
      />
    {:else}
      <!-- 画像のローディング/失敗、動画の未ロード/失敗はキャンバス描画 -->
      <canvas
        bind:this={canvas}
        class="media-element"
        on:click
      />
    {/if}
  {/if}
</div>

<style>
  .media-frame {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    position: relative;
  }
  .media-element {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
