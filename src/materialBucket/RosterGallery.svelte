<script lang="ts">
  import { onMount } from 'svelte';
  import Gallery from '../gallery/Gallery.svelte';
  import { gadgetFileSystem } from '../filemanager/fileManagerStore';
  import { loadCharactersFromRoster } from '../notebook/rosterStore';
  import type { CharacterLocal } from '../lib/book/book';
  import { buildMedia, type Media } from '../lib/layeredCanvas/dataModels/media';
  import { createEventDispatcher } from 'svelte';
  import type { GalleryItem } from "../gallery/gallery";

  export let columnWidth: number = 220;

  const dispatch = createEventDispatcher();
  let items: (() => Promise<Media[]>)[] = [];
  let characterIds = new WeakMap<(Media | (() => Promise<Media[]>)), string>();

  function onChildDragStart(e: CustomEvent<Media>) {
    dispatch('dragstart', e.detail);
  }

  async function displayRosterImages() {
    if (!$gadgetFileSystem) return;

    const characters = await loadCharactersFromRoster($gadgetFileSystem);
    const newItems = [];
    const newCharacterIds = new WeakMap<(Media | (() => Promise<Media[]>)), string>();

    for (const character of characters) {
      if (character.portrait && character.portrait !== 'loading') {
        const portrait = character.portrait;
        const loader = async () => {
          const media = buildMedia(portrait.persistentSource);
          newCharacterIds.set(media, character.ulid);
          return [media];
        };
        newItems.push(loader);
        newCharacterIds.set(loader, character.ulid);
      }
    }

    items = newItems;
    characterIds = newCharacterIds;
  }

  onMount(displayRosterImages);
</script>

<div class="gallery-content">
  {#if items.length > 0}
    <Gallery {columnWidth} referable={false} bind:items={items} on:dragstart={onChildDragStart}/>
  {:else}
    <div class="empty-state">
      <p class="empty-message">役者が登録されていません</p>
    </div>
  {/if}
</div>

<style>
  .gallery-content {
    width: 100%;
    min-height: 200px;
    display: flex;
    flex-direction: column;
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
