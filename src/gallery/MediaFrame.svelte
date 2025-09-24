<script lang="ts">
  import { redrawToken } from '../bookeditor/workspaceStore';
  import type { Media } from "../lib/layeredCanvas/dataModels/media";
  import { canvasToBlob, computeAspectFitSize } from "../lib/layeredCanvas/tools/imageUtil";
  import { onMount, onDestroy } from 'svelte';

  export let media: Media;
  export let showControls: boolean = true;
  // 画像は<img>で表示してブラウザ標準ドラッグを有効化するか（trueで<img>）
  export let dragAsImage: boolean = true;
  // 親コンポーネントにシークバー操作状態を伝える
  export let isSeekingGlobal: boolean = false;

  // ビデオコントロール用の変数
  let videoElement: HTMLVideoElement | null = null;
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let isSeekbarDragging = false;

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

  // ビデオコントロール関数
  function togglePlay() {
    if (!videoElement) return;
    if (isPlaying) {
      videoElement.pause();
    } else {
      videoElement.play();
    }
  }

  function handleTimeUpdate() {
    if (!videoElement || isSeekbarDragging) return;
    currentTime = videoElement.currentTime;
    duration = videoElement.duration;
  }

  function handlePlayPause() {
    if (!videoElement) return;
    isPlaying = !videoElement.paused;
  }

  function handleSeekStart(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    isSeekbarDragging = true;
    isSeekingGlobal = true;
    handleSeek(e);
  }

  function handleSeek(e: MouseEvent) {
    if (!videoElement || !isSeekbarDragging) return;
    e.preventDefault();
    e.stopPropagation();
    const seekbar = e.currentTarget as HTMLElement;
    const rect = seekbar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * duration;
    videoElement.currentTime = newTime;
    currentTime = newTime;
  }

  function handleSeekEnd(e?: MouseEvent) {
    if (e) {
      e.stopPropagation();
    }
    isSeekbarDragging = false;
    isSeekingGlobal = false;
  }

  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ビデオ要素がマウントされたときの初期化
  function initVideo(node: HTMLVideoElement) {
    videoElement = node;
    node.addEventListener('timeupdate', handleTimeUpdate);
    node.addEventListener('play', handlePlayPause);
    node.addEventListener('pause', handlePlayPause);
    node.addEventListener('loadedmetadata', () => {
      duration = node.duration;
      currentTime = node.currentTime;
    });
    // 音声を常にミュート
    node.muted = true;

    return {
      destroy() {
        node.removeEventListener('timeupdate', handleTimeUpdate);
        node.removeEventListener('play', handlePlayPause);
        node.removeEventListener('pause', handlePlayPause);
        videoElement = null;
      }
    };
  }

  // グローバルなマウスイベントリスナー
  onMount(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isSeekbarDragging) {
        e.preventDefault();
        e.stopPropagation();
        const seekbar = document.querySelector('.custom-seekbar') as HTMLElement;
        if (seekbar) {
          const rect = seekbar.getBoundingClientRect();
          const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (videoElement) {
            const newTime = percent * duration;
            videoElement.currentTime = newTime;
            currentTime = newTime;
          }
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isSeekbarDragging) {
        e.stopPropagation();
        isSeekbarDragging = false;
        isSeekingGlobal = false;
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, true);
    window.addEventListener('mouseup', handleGlobalMouseUp, true);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove, true);
      window.removeEventListener('mouseup', handleGlobalMouseUp, true);
    };
  });
</script>

<div class="media-frame" bind:this={containerDiv}>
  {#if media.type === 'video' && media.drawSource instanceof HTMLVideoElement}
    <!-- 読み込み完了: ネイティブvideoを表示 -->
    <div class="video-container">
      <!-- svelte-ignore a11y-media-has-caption -->
      <video
        src={getVideoSource(media)}
        controls={false}
        playsinline
        use:webkitPlaysinline
        use:initVideo
        class="media-element"
        draggable="true"
        on:click
      />
      {#if showControls}
        <div class="custom-controls" on:click|stopPropagation on:mousedown|stopPropagation on:mouseup|stopPropagation>
          <!-- シークバー -->
          <div class="seekbar-container" on:click|stopPropagation on:mousedown|stopPropagation on:mouseup|stopPropagation>
            <div
              class="custom-seekbar"
              on:mousedown={handleSeekStart}
              on:click|stopPropagation
              role="slider"
              tabindex="0"
              aria-label="シークバー"
              aria-valuemin="0"
              aria-valuemax={duration}
              aria-valuenow={currentTime}
            >
              <div class="seekbar-progress" style="width: {(currentTime / duration) * 100}%"></div>
              <div class="seekbar-handle" style="left: {(currentTime / duration) * 100}%"></div>
            </div>
          </div>

          <!-- 下部コントロール -->
          <div class="control-buttons">
            <button
              class="control-btn play-btn"
              on:click|stopPropagation={togglePlay}
              aria-label={isPlaying ? '一時停止' : '再生'}
            >
              {#if isPlaying}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="5" y="4" width="3" height="12" />
                  <rect x="12" y="4" width="3" height="12" />
                </svg>
              {:else}
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6 4 L16 10 L6 16 Z" />
                </svg>
              {/if}
            </button>

            <span class="time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      {/if}
    </div>
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

  .video-container {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .video-container video {
    flex: 1;
  }

  .custom-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  }

  .custom-controls > * {
    pointer-events: auto;
  }

  .seekbar-container {
    width: 100%;
    padding: 0.5rem 0;
  }

  .custom-seekbar {
    position: relative;
    width: 100%;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .custom-seekbar::before {
    content: '';
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    pointer-events: none;
  }

  .seekbar-progress {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 6px;
    background: #3b82f6;
    border-radius: 3px;
    pointer-events: none;
  }

  .seekbar-handle {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    transition: transform 0.1s;
  }

  .custom-seekbar:hover .seekbar-handle {
    transform: translate(-50%, -50%) scale(1.2);
  }

  .custom-seekbar:hover::before {
    background: rgba(255, 255, 255, 0.4);
  }

  .custom-seekbar:hover .seekbar-progress {
    background: #60a5fa;
  }

  .control-buttons {
    display: flex;
    align-items: center;
    gap: 1rem;
    color: white;
  }

  .control-btn {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
  }

  .control-btn:hover {
    opacity: 0.8;
  }

  .time-display {
    font-size: 0.875rem;
    font-family: monospace;
    flex: 1;
  }
</style>
