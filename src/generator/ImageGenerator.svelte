<script lang="ts">
  import { type ImageGeneratorTarget, imageGeneratorTarget } from "./imageGeneratorStore";
  import { TabGroup, Tab } from '@skeletonlabs/skeleton';
  import { tick } from "svelte";
  import Drawer from '../utils/Drawer.svelte';
  import ImageGeneratorStableDiffusion from "./ImageGeneratorStableDiffusion.svelte";
  import MaterialBucketContent from "../materialBucket/MaterialBucketContent.svelte";
  import ImageGeneratorPlain from "./ImageGeneratorPlain.svelte";
  import ImageGeneratorProcedural from "./ImageGeneratorProcedural.svelte";
  import { type Media } from "../lib/layeredCanvas/dataModels/media";
  import type { GeneratedFilmResult } from "./imageGeneratorStore";
  import type { FilmProceduralEffect } from "../lib/layeredCanvas/dataModels/proceduralEffects";
  import { _ } from 'svelte-i18n';
  import sprytIcon from '../assets/spryt.webp';

  let busy: boolean;
  let tabSet: number = 1;
  let prompt: string = 'zzz';
  let gallery: Media[] = [];
  let chosen: Media | null = null;

  $: onTargetChanged($imageGeneratorTarget);
  function onTargetChanged(igt: ImageGeneratorTarget | null) {
    if (igt) {
      prompt = igt.initialPrompt ?? '';
    }
  }

  $: onChangeGallery($imageGeneratorTarget?.gallery);
  async function onChangeGallery(g: Media[] | undefined) {
    if (g) {
      gallery = [];
      await tick(); // HACK: なんかこうしないとHTMLが更新されない
      gallery = g;
    }
  }

  $: onChosen(chosen);
  function notify(result: GeneratedFilmResult) {
    const t = $imageGeneratorTarget!;
    $imageGeneratorTarget = null;
    chosen = null;
    t.onDone(result);
  }

  function onChosen(c: Media | null) {
    if (c != null) {
      notify({ kind: 'media', media: c, prompt });
    }
  }

  function onClickAway() {
    if (busy) { return; }
    const t = $imageGeneratorTarget!;
    // onChosen直後にonClickAwayが呼ばれてすでにnullになっていることがある
    if (t != null) {
      $imageGeneratorTarget = null;
      t.onDone(null);
    }
  }

  function handleProceduralCreate(event: CustomEvent<{ effect: FilmProceduralEffect; label: string | null }>) {
    const { effect, label } = event.detail;
    notify({ kind: 'procedural', effect, prompt: label });
  }
</script>

<div class="drawer-outer">
  <Drawer
    open={$imageGeneratorTarget != null}
    placement="right"
    size="800px"
    on:clickAway={onClickAway}
  >

    <TabGroup>
      <Tab bind:group={tabSet} name="tab1" value={1}>{$_('ui.materialBucket')}</Tab>
      <Tab bind:group={tabSet} name="tab2" value={2}>Stable Diffusion</Tab>
      <Tab bind:group={tabSet} name="tab4" value={3}>{$_('generator.blank')}</Tab>
      <Tab bind:group={tabSet} name="tab5" value={4}>{$_('generator.procedural.title')}</Tab>
      <!-- Tab Panels --->
      <svelte:fragment slot="panel">
        {#if tabSet === 1}
          <div class="material-bucket-wrapper">
            <MaterialBucketContent selectionOnly={true} on:choose={(e) => chosen = e.detail} />
          </div>
          {:else if tabSet === 2}
          <ImageGeneratorStableDiffusion bind:busy={busy} bind:prompt={prompt} bind:gallery={gallery} bind:chosen={chosen}/>
          {:else if tabSet === 3}
          <ImageGeneratorPlain bind:chosen={chosen}/>
          {:else if tabSet === 4}
          <ImageGeneratorProcedural on:create={handleProceduralCreate}/>
        {/if}
      </svelte:fragment>
    </TabGroup>  

  </Drawer>
</div>

<style>
  .drawer-outer :global(.drawer .panel) {
    background-color: rgb(var(--color-surface-100));
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .material-bucket-wrapper {
    height: calc(100vh - 120px);
    overflow-y: auto;
  }
</style>
