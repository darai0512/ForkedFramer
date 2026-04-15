<script lang="ts">
  import type { GoogleFontDefinition } from "@svelte-web-fonts/google";
  import { onMount } from "svelte";
  import { createEventDispatcher } from 'svelte';
  import { loadFont } from '../fontLoading';

  type FontDefinition = GoogleFontDefinition & { isGothic: boolean, isBold: boolean, isLocal: boolean };

  export let font: FontDefinition;

  let url: string;
  let imageError = false;

  const dispatch = createEventDispatcher();

  function chooseFont(mouseEvent: MouseEvent) {
    dispatch('choose', { mouseEvent, font });
  }

  onMount(async () => {
    const family = font.family.replace(/ /g, "-");
    url = new URL(`../../assets/fonts/labels/${family}.webp`, import.meta.url).href;
  });

  $: if (imageError && font.isLocal) {
    loadFont(font.family, font.variants[0] || '400');
  }

</script>

<div>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  {#if imageError}
    <div class="fallback-text" style="font-family: '{font.family}', sans-serif; font-weight: {font.variants[0]};" on:click={chooseFont}>
      <span class="family-name">{font.family}</span>
      <span class="sample-text">今日はいい天気ですね</span>
    </div>
  {:else}
    <img src={url} alt={font.family} on:click={chooseFont} on:error={() => imageError = true}/>
  {/if}
</div>

<style>
  div {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
  }
  div:hover {
    background-color: rgb(128, 93, 47);
  }
  .fallback-text {
    width: 100%;
    padding: 8px 16px;
    text-align: center;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 8px;
    color: black;
  }
  .family-name {
    font-size: 1.1rem;
    font-weight: bold;
    color: #333;
    font-family: system-ui, sans-serif;
  }
  .sample-text {
    font-size: 1.4rem;
  }
</style>