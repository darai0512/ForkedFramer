<script lang="ts">
  import { type ImageGeneratorTarget, imageGeneratorTarget } from "./imageGeneratorStore";
  import { TabGroup, Tab } from '@skeletonlabs/skeleton';
  import { tick } from "svelte";
  import Drawer from '../utils/Drawer.svelte';
  import MaterialBucketContent from "../materialBucket/MaterialBucketContent.svelte";
  import ImageGeneratorPlain from "./ImageGeneratorPlain.svelte";
  import ImageGeneratorProcedural from "./ImageGeneratorProcedural.svelte";
  import { type Media } from "../lib/layeredCanvas/dataModels/media";
  import type { GeneratedFilmResult } from "./imageGeneratorStore";
  import type { FilmProceduralEffect } from "../lib/layeredCanvas/dataModels/proceduralEffects";
  import { makePlainCanvas } from "../lib/layeredCanvas/tools/imageUtil";
  import { ImageMedia } from "../lib/layeredCanvas/dataModels/media";
  import { _ } from 'svelte-i18n';

  let tabSet: number = 1;
  let prompt: string = '';
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
      await tick(); // HACK: なんかこうしないとHTMLが更新されない
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

  // タブ4: 透明レイヤー即時作成
  $: if (tabSet === 4 && $imageGeneratorTarget) {
    const [fw, fh] = $imageGeneratorTarget.frameSize;
    const w = Math.max(256, Math.ceil(fw));
    const h = Math.max(256, Math.ceil(fh));
    const media = new ImageMedia(makePlainCanvas(w, h, '#ffffff00'));
    tabSet = 1; // resetしてからnotify
    notify({ kind: 'media', media, prompt: '' });
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
      <Tab bind:group={tabSet} name="tab2" value={2}>{$_('generator.blank')}</Tab>
      <Tab bind:group={tabSet} name="tab3" value={3}>{$_('generator.procedural.title')}</Tab>
      <Tab bind:group={tabSet} name="tab4" value={4}>{$_('hint.frame.addTransparentLayer')}</Tab>
      <!-- Tab Panels --->
      <svelte:fragment slot="panel">
        {#if tabSet === 1}
          <div class="material-bucket-wrapper">
            <MaterialBucketContent selectionOnly={true} on:choose={(e) => chosen = e.detail} />
          </div>
          {:else if tabSet === 2}
          <ImageGeneratorPlain bind:chosen={chosen}/>
          {:else if tabSet === 3}
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
  .material-bucket-wrapper {
    height: calc(100vh - 120px);
    overflow-y: auto;
  }
</style>
