<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CharacterLocal } from '../lib/book/book';
  import { ProgressRadial } from '@skeletonlabs/skeleton';
  import AutoSizeTextarea from './AutoSizeTextarea.svelte';
	import ColorPickerLabel from '../utils/colorpicker/ColorPickerLabel.svelte';
  import MediaFrame from "../gallery/MediaFrame.svelte";
  import { filterImageFiles } from "../lib/layeredCanvas/tools/fileUtil";
  import { dropDataHandler } from '../utils/dropDataHandler';
  import { _ } from 'svelte-i18n';

  import bellIcon from '../assets/bell.webp';
  import trashIcon from '../assets/trash.webp';

  const dispatch = createEventDispatcher();

  export let character: CharacterLocal;
  export let showPortraitGeneration: boolean;

  $: media = character.portrait != 'loading' ? character.portrait : null;

  function handleDropData(mediaResources: (HTMLCanvasElement | HTMLVideoElement | string)[]) {
    const images = filterImageFiles(mediaResources);
    if (0 < images.length) {
      dispatch('setPortrait', {character, image: images[0]});
    }
  }

  function erasePortrait() {
    dispatch('erasePortrait', character);
  }

  function portrait() {
    dispatch('portrait', character);
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="character-editor" on:input={() => dispatch('change')}>
  <div class="flex flex-col">
    <div class="flex flex-row gap-4 items-center mb-2">
      <input type="text" bind:value={character.name} class="input character-name"/>
      <div class="color-label">
        <ColorPickerLabel bind:hex={character.themeColor}/>
      </div>
      <slot name="headerActions"></slot>
    </div>
    <div class="flex flex-row gap-1">
      <div class="flex flex-col gap-2">
        <div
          class="portrait flex justify-center items-center"
          use:dropDataHandler={handleDropData}
        >
          {#if character.portrait === 'loading'}
            <div class="waiting">
              <ProgressRadial stroke={100} width="w-4"/>
            </div>
          {:else if media}
            <MediaFrame
              media={media}
            />
            {#if showPortraitGeneration}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <img class="portrait-bell" src={bellIcon} alt={$_('notebook.appearance')} on:click={portrait}/>
            {/if}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <img class="portrait-trash" src={trashIcon} alt={$_('notebook.delete')} on:click={erasePortrait}/>
          {:else}
            {#if showPortraitGeneration}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <img class="no-portrait" src={bellIcon} alt={$_('notebook.appearance')} on:click={portrait}/>
            {:else}
              <div class="no-portrait-text">{$_('notebook.noPortrait')}</div>
            {/if}
          {/if}
        </div>
        <slot name="belowPortrait"></slot>
      </div>
      <div class="flex flex-col flex-grow gap-1">
        <AutoSizeTextarea bind:value={character.personality} minHeight={24} placeholder={$_('notebook.personality')}/>
        <AutoSizeTextarea bind:value={character.appearance} minHeight={24} placeholder={$_('notebook.appearance2')}/>
      </div>
    </div>
  </div>
</div>

<style>
  .portrait {
    width: 144px;
    height: 144px;
    border-width: 1px;
    border-style: solid;
    border-color: black;
    position: relative;
  }
  .portrait-bell {
    width: 24px;
    height: 24px;
    position: absolute;
    right: 2px;
    bottom: 2px;
    cursor: pointer;
  }
  .character-name {
    font-size: 16px;
    font-weight: 700;
    font-family: '源暎アンチック';
    border-radius: 2px;
    padding-left: 8px;
    padding-right: 8px;
    width: 240px;
  }
  .waiting {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .no-portrait {
    width: 64px;
    height: 64px;
    cursor: pointer;
  }
  .no-portrait-text {
    color: rgb(var(--color-surface-700));
    font-size: 0.9rem;
  }
  .color-label {
    width: 30px;
    height: 20px;
    margin-left: 4px;
    margin-right: 4px;
    cursor: pointer;
  }
  .portrait-trash {
    width: 20px;
    height: 20px;
    position: absolute;
    right: 2px;
    top: 2px;
    cursor: pointer;
    z-index: 2;
  }
</style>
