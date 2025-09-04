<script lang="ts">
  import { onlineStatus } from "../utils/accountStore";
  import Feathral from '../utils/Feathral.svelte';
  import { persistentText } from '../utils/persistentText';
  import type { ImagingMode } from '$protocolTypes/imagingTypes';
  import { type ImagingContext, generatePageImages, portraitsRecordFromNotebook } from '../utils/feathralImaging';
  import { busy, batchImagingPage } from './batchImagingStore';
  import { mainBook, redrawToken } from '../bookeditor/workspaceStore';
  import { commitBook } from '../lib/book/book';
  import ImagingModes from './ImagingModes.svelte';
  import { modeOptions, getRefMaxForMode } from '../utils/feathralImaging';
  import { _ } from 'svelte-i18n';
  import "../box.css"  

  export let imagingContext: ImagingContext;

  let postfix: string = "";
  let mode: ImagingMode = 'schnell';

  // 選択モードに応じて参照画像の上限を同期
  $: imagingContext.maxRefImages = getRefMaxForMode(mode);

  // Notebook のキャラクタ画像を参照画像としてセット
  $: imagingContext.refImages = portraitsRecordFromNotebook($mainBook?.notebook ?? null);

  async function execute() {
    console.log('execute');
    $busy = true;
    await generatePageImages(
      imagingContext, postfix, mode, $batchImagingPage!, true, () => {imagingContext = imagingContext;});
    $busy = false;
    console.log('execute done');

    commitBook($mainBook!, null);
    $mainBook = $mainBook;
    $redrawToken = true;
    $batchImagingPage = null;
  }

</script>

<div class="flux-panel flex flex-col gap-2 mt-2 w-full h-full">
  {#if $onlineStatus !== 'signed-in'}
    <p>{$_('generator.pleaseLogIn')}</p>
  {:else}
    <p><Feathral/></p>
    <div class="flex flex-col gap-3">
      <div class="flex flex-row gap-2 items-center">
        <h3>{$_('generator.mode')}</h3>
        <ImagingModes bind:mode={mode} group="imaging" imageSize={{width: 1024, height: 1024}} comment={$_('generator.perPanelEstimate')}/>
      </div>
      <div class="flex flex-row gap-2 items-start">
        <h3>{$_('generator.style')}</h3>
        <textarea class="textarea textarea-style w-96" bind:value={postfix} use:persistentText={{store:'imaging', key:'style', onLoad: (v) => postfix = v}}/>
      </div>
    </div>
    <button class="btn btn-sm variant-filled w-32" disabled={imagingContext.total === imagingContext.succeeded} on:click={execute}>{$_('generator.start')}</button>
  {/if}
</div>

<style>
  .flux-panel {
    font-size: 14px;
    line-height: 1.4;
  }
  h3 {
    font-family: '源暎エムゴ';
    font-weight: 500;
    font-size: 16px;
  }
  .textarea-style {
    font-size: 16px;
    font-weight: 700;
    font-family: '源暎アンチック';
    border-radius: 2px;
    padding-left: 8px;
    padding-right: 8px;
  }

</style>
