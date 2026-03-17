<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { listActors } from '../supabase';
  import type { Actor } from '../utils/edgeFunctions/types/actorTypes';
  import { createCanvasFromBlob } from '../lib/layeredCanvas/tools/imageUtil';
  import { loading } from '../utils/loadingStore';
  import { toastStore } from '@skeletonlabs/skeleton';
  import { onlineStatus } from '../utils/accountStore';
  import SignInPromptInline from '../utils/SignInPromptInline.svelte';
  import { _ } from 'svelte-i18n';
  import { saveCharacterToRoster } from '../notebook/rosterStore';
  import { gadgetFileSystem } from '../filemanager/fileManagerStore';
  import { buildNullableMedia } from '../lib/layeredCanvas/dataModels/media';
  import type { CharacterLocal } from '../lib/book/book';

  export let columnWidth: number = 220;
  export let downloadedActorIds: string[] = []; // ダウンロード済みの役者ID（ulid）リスト
  export let onDownloaded: (() => void) | null = null; // ダウンロード完了時のコールバック

  const dispatch = createEventDispatcher();

  let actors: Actor[] = [];

  // ダウンロード済みを除外した役者リスト
  $: filteredActors = actors.filter(actor => !downloadedActorIds.includes(actor.id));
  let loadingMore = false;
  let hasMore = true;
  let offset = 0;
  const limit = 50;

  function withQueryParam(url: string, key: string, value: string): string {
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return parsed.toString();
  }

  async function loadPublicActors(append: boolean = false) {
    if (!append) {
      loading.set(true);
      offset = 0;
      hasMore = true;
    } else {
      loadingMore = true;
    }

    try {
      const response = await listActors({
        approved_only: true,
        limit,
        offset
      });

      if (!append) {
        actors = response.actors;
      } else {
        actors = [...actors, ...response.actors];
      }

      hasMore = response.actors.length === limit;
      offset += response.actors.length;
    } catch (error) {
      console.error('Failed to load public actors:', error);
      toastStore.trigger({
        message: $_('publicActors.loadError'),
        timeout: 3000
      });
    } finally {
      loading.set(false);
      loadingMore = false;
    }
  }

  async function downloadActor(actor: Actor) {
    if (!$gadgetFileSystem) {
      toastStore.trigger({
        message: $_('publicActors.noFileSystem'),
        timeout: 3000
      });
      return;
    }

    loading.set(true);
    try {
      // ポートレート画像を取得（表示用<img>の非CORSキャッシュを回避するためURLを分離）
      const downloadUrl = withQueryParam(actor.portrait_url, 'download', '1');
      let response: Response;
      let blob: Blob;
      try {
        response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        blob = await response.blob();
      } catch (error) {
        console.warn(`Failed to fetch portrait for ${downloadUrl}, retrying with cache reload:`, error);
        response = await fetch(downloadUrl, { cache: 'reload' });
        if (!response.ok) {
          throw new Error(`Failed to fetch portrait after retry: ${response.status}`);
        }
        blob = await response.blob();
      }
      const canvas = await createCanvasFromBlob(blob);

      // CharacterLocalを作成（actor.idをulidとして使用）
      const character: CharacterLocal = {
        name: actor.name,
        personality: actor.personality,
        appearance: actor.appearance,
        themeColor: actor.theme_color,
        ulid: actor.id, // actor.idをそのままulidとして使用
        portrait: buildNullableMedia(canvas)
      };

      // ローカルRosterに保存
      await saveCharacterToRoster($gadgetFileSystem, character);

      toastStore.trigger({
        message: $_('publicActors.downloadSuccess', { values: { name: actor.display_name } }),
        timeout: 3000
      });

      // ダウンロード完了コールバック
      if (onDownloaded) {
        onDownloaded();
      }
    } catch (error) {
      console.error('Failed to download actor:', error);
      toastStore.trigger({
        message: $_('publicActors.downloadError'),
        timeout: 3000
      });
    } finally {
      loading.set(false);
    }
  }

  function handleScroll(e: Event) {
    const element = e.target as HTMLElement;
    const scrolledToBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;

    if (scrolledToBottom && hasMore && !loadingMore) {
      loadPublicActors(true);
    }
  }

  function getCategoryLabel(category: string): string {
    const categoryMap: Record<string, string> = {
      'general': $_('publicActors.categories.general'),
      'protagonist': $_('publicActors.categories.protagonist'),
      'supporting': $_('publicActors.categories.supporting'),
      'comedy': $_('publicActors.categories.comedy'),
      'serious': $_('publicActors.categories.serious')
    };
    return categoryMap[category] || category;
  }

  onMount(() => {
    if ($onlineStatus === 'signed-in') {
      loadPublicActors();
    }
  });
</script>

{#if $onlineStatus !== 'signed-in'}
  <div class="gallery-container">
    <div class="empty-state">
      <SignInPromptInline message={$_('publicActors.signInRequired')} />
    </div>
  </div>
{:else}
  <div class="gallery-container" on:scroll={handleScroll}>
    {#if filteredActors.length > 0}
      <div class="actors-grid" style="--column-width: {columnWidth}px;">
        {#each filteredActors as actor (actor.id)}
          <div class="actor-card">
            <div class="portrait-container">
              <img src={withQueryParam(actor.portrait_url, 'view', '1')} alt={actor.display_name} class="portrait" crossorigin="anonymous" />
            </div>
            <div class="actor-info">
              <div class="actor-name" style="border-left: 3px solid {actor.theme_color};">
                {actor.display_name}
              </div>
              <div class="actor-category">{getCategoryLabel(actor.category)}</div>
              {#if actor.description}
                <div class="actor-description">{actor.description}</div>
              {/if}
              <div class="actor-author">by {actor.author_display_name}</div>
            </div>
            <button class="download-btn" on:click={() => downloadActor(actor)}>
              {$_('publicActors.download')}
            </button>
          </div>
        {/each}
      </div>
    {:else if !$loading}
      <div class="empty-state">
        <p class="empty-message">{$_('publicActors.noApprovedActors')}</p>
      </div>
    {/if}

    {#if loadingMore}
      <div class="loading-more">
        <span>{$_('publicActors.loadingMore')}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .gallery-container {
    width: 100%;
    height: 100%;
    min-height: 200px;
    overflow: auto;
    position: relative;
    flex: 1;
  }

  .actors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--column-width), 1fr));
    gap: 16px;
    padding: 8px;
  }

  .actor-card {
    background-color: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    flex-direction: column;
  }

  .actor-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .portrait-container {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background-color: rgb(var(--color-surface-200));
  }

  .portrait {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .actor-info {
    padding: 12px;
    flex: 1;
  }

  .actor-name {
    font-family: '源暎エムゴ';
    font-size: 14px;
    font-weight: 600;
    color: rgb(var(--color-primary-700));
    padding-left: 8px;
    margin-bottom: 4px;
  }

  .actor-category {
    font-size: 11px;
    color: rgb(var(--color-surface-500));
    margin-bottom: 4px;
  }

  .actor-description {
    font-size: 12px;
    color: rgb(var(--color-surface-700));
    line-height: 1.4;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .actor-author {
    font-size: 11px;
    color: rgb(var(--color-surface-500));
    font-style: italic;
  }

  .download-btn {
    width: 100%;
    padding: 8px;
    background-color: rgb(var(--color-secondary-500));
    color: white;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .download-btn:hover {
    background-color: rgb(var(--color-secondary-600));
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
