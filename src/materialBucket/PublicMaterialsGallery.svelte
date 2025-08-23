<script lang="ts">
  import { onMount } from 'svelte';
  import Gallery from '../gallery/Gallery.svelte';
  import { listMaterials } from '../supabase';
  import type { Material } from '../utils/edgeFunctions/types/materialTypes';
  import { buildMedia, ImageMedia, VideoMedia, type Media } from '../lib/layeredCanvas/dataModels/media';
  import { createCanvasFromBlob, createVideoFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
  import { createEventDispatcher } from 'svelte';
  import { Bubble } from "../lib/layeredCanvas/dataModels/bubble";
  import type { Rect } from "../lib/layeredCanvas/tools/geometry/geometry";
  import { bookOperators, redrawToken } from '../bookeditor/workspaceStore';
  import { Film } from '../lib/layeredCanvas/dataModels/film';
  import { loading } from '../utils/loadingStore';
  import { toastStore } from '@skeletonlabs/skeleton';

  // カテゴリは一旦無視
  const actualCategory = '';

  const dispatch = createEventDispatcher();
  let items: (() => Promise<Media[]>)[] = [];
  let materials: Material[] = [];
  let loadingMore = false;
  let hasMore = true;
  let offset = 0;
  const limit = 50;

  function onChildDragStart(e: CustomEvent<Media>) {
    dispatch('dragstart', e.detail);
  }

  function onChooseImage(e: CustomEvent<Media>) {
    const page = $bookOperators!.getFocusedPage();
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
    const film = new Film(buildMedia(e.detail.persistentSource));
    bubble.filmStack.films.push(film);
    page.bubbles.push(bubble);
    $bookOperators!.focusBubble(page, bubble);
    $redrawToken = true;
  }

  async function loadPublicMaterials(append: boolean = false) {
    if (!append) {
      loading.set(true);
      offset = 0;
      hasMore = true;
    } else {
      loadingMore = true;
    }

    try {
      const response = await listMaterials({
        category: actualCategory || undefined,
        approved_only: true,
        limit,
        offset
      });

      if (!append) {
        materials = response.materials;
        items = [];
      } else {
        materials = [...materials, ...response.materials];
      }

      // 取得した素材が limit より少なければ、もうデータがない
      hasMore = response.materials.length === limit;
      offset += response.materials.length;

      // 新しく取得した素材をギャラリー用のアイテムに変換
      const newItems = response.materials.map((material) => {
        const loadMedia = async (): Promise<Media[]> => {
          try {
            let response = await fetch(material.file);
            
            if (!response.ok) {
              throw new Error(`Failed to fetch ${material.file}`);
            }
            
            let blob: Blob;
            try {
              blob = await response.blob();
            } catch (error) {
              // blob作成失敗（CORSエラー等）の場合、キャッシュを更新してリトライ
              console.warn(`Failed to create blob for ${material.file}, retrying with cache reload:`, error);
              response = await fetch(material.file, { cache: 'reload' });
              if (!response.ok) {
                throw new Error(`Failed to fetch ${material.file} after retry`);
              }
              blob = await response.blob();
            }
            let media: Media;
            
            // Content-Typeまたはファイル拡張子から判別
            const contentType = response.headers.get('content-type') || '';
            const isVideo = contentType.startsWith('video/') || 
                          material.file.toLowerCase().endsWith('.mp4') || 
                          material.file.toLowerCase().endsWith('.webm');
            
            if (isVideo) {
              const video = await createVideoFromBlob(blob);
              media = new VideoMedia(video);
            } else {
              const canvas = await createCanvasFromBlob(blob);
              media = new ImageMedia(canvas);
            }
            
            // メタデータを保存（ツールチップなどで使用可能）
            (media as any).materialInfo = {
              name: material.display_name,
              description: material.description,
              category: material.category
            };
            
            return [media];
          } catch (error) {
            console.error(`Failed to load material: ${material.display_name}`, error);
            return [];
          }
        };
        
        return loadMedia;
      });

      if (append) {
        items = [...items, ...newItems];
      } else {
        items = newItems;
      }
    } catch (error) {
      console.error('Failed to load public materials:', error);
      toastStore.trigger({ 
        message: 'みんなの素材集の読み込みに失敗しました', 
        timeout: 3000 
      });
    } finally {
      loading.set(false);
      loadingMore = false;
    }
  }

  function handleScroll(e: Event) {
    const element = e.target as HTMLElement;
    const scrolledToBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;
    
    if (scrolledToBottom && hasMore && !loadingMore) {
      loadPublicMaterials(true);
    }
  }

  // カテゴリが変更されたら再読み込み（一旦無効化）
  // $: if (currentCategory !== category) {
  //   currentCategory = category;
  //   loadPublicMaterials();
  // }

  onMount(() => {
    loadPublicMaterials();
  });
</script>

<div class="gallery-container" on:scroll={handleScroll}>
  {#if items.length > 0}
    <Gallery 
      columnWidth={220} 
      referable={false} 
      bind:items={items} 
      on:commit={onChooseImage} 
      on:dragstart={onChildDragStart}
    />
  {:else if !$loading}
    <div class="empty-state">
      <p class="empty-message">承認済みの素材はまだありません</p>
    </div>
  {/if}
  
  {#if loadingMore}
    <div class="loading-more">
      <span>読み込み中...</span>
    </div>
  {/if}
</div>

<style>
  .gallery-container {
    width: 100%;
    height: 100%;
    min-height: 200px;
    overflow: auto;
    position: relative;
    flex: 1;
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
  
  .loading-more {
    display: flex;
    justify-content: center;
    padding: 20px;
    color: rgb(var(--color-surface-600));
    font-family: '源暎エムゴ';
  }
</style>