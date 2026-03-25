<script lang="ts">
  import Drawer from '../utils/Drawer.svelte'
  import { downloaderOpen } from './downloaderStore';
  import downloadIcon from '../assets/get.webp';
  import clipboardIcon from '../assets/clipboard.webp';
  import aiPictorsIcon from '../assets/aipictors_logo_0.webp'
  import { analyticsEvent } from "../utils/analyticsEvent";
  import { toastStore } from '@skeletonlabs/skeleton';
  import { type BookArchiveOperation, bookArchiver } from "../utils/bookArchiverStore";
  import { toolTip } from '../utils/passiveToolTipStore';
  import { developmentFlag } from '../utils/developmentFlagStore';
  import { mainBook } from '../bookeditor/workspaceStore';
  import { _ } from 'svelte-i18n';

  $: buttons = [
    {icon: downloadIcon, label: $_('downloader.download'), onClick: download, hint: $_('downloader.downloadHint')},
    {icon: clipboardIcon, label: $_('downloader.copyToClipboard'), onClick: copyToClipboard, hint: $_('downloader.copyToClipboardHint')},
    {icon: downloadIcon, label: $_('downloader.upscaleAndDownload'), onClick: downloadAfterUpscale, hint: $_('downloader.upscaleAndDownloadHint')},
    {icon: clipboardIcon, label: $_('downloader.upscaleAndCopy'), onClick: copyToClipboardAfterUpscale, hint: $_('downloader.upscaleAndCopyHint')},
    // {icon: aiPictorsIcon, label: "に投稿", onClick: postAIPictors, hint: "aiPictorsに投稿します"},
    {label: $_('downloader.exportPSD'), onClick: downloadPSD, hint: $_('downloader.exportPSDHint')},
    // {label: $_('downloader.share'), onClick: shareBook, hint: $_('downloader.shareHint')},
    {label: $_('downloader.package'), onClick: downloadEnvelop, hint: $_('downloader.packageHint')},
    {label: $_('downloader.downloadMaterials'), onClick: downloadMaterials, hint: $_('downloader.downloadMaterialsHint')},
    {label: $_('downloader.exportDialogues'), onClick: downloadDialogues, hint: $_('downloader.exportDialoguesHint')},
    {label: $_('downloader.exportPrompts'), onClick: exportPrompts, hint: $_('downloader.exportPromptsHint')},
    {label: $_('downloader.publishToMangaFarm'), onClick: publishEnvelope, hint: $_('downloader.publishToMangaFarmHint')},
    // {label: "test", onClick: testIt }
    ...($developmentFlag ? [
      {label: $_('downloader.downloadFrames'), onClick: downloadFrames, hint: $_('downloader.downloadFramesHint')},
      {label: $_('downloader.downloadFramesNoBubbles'), onClick: downloadFramesNoBubbles, hint: $_('downloader.downloadFramesNoBubblesHint')},
      {label: $_('downloader.downloadLoraData'), onClick: downloadLoraData, hint: $_('downloader.downloadLoraDataHint')},
      {label: $_('downloader.testDownload'), onClick: downloadPublicationFiles, hint: $_('downloader.testDownloadHint')},
    ] : [])
  ];

  function archive(op: BookArchiveOperation) {
    $bookArchiver.push(op);
    $bookArchiver = $bookArchiver;
  }

  function download() {
    analyticsEvent('download');
    archive('download');
  }

  function downloadAfterUpscale() {
    analyticsEvent('download_after_upscale');
    archive('download-after-upscale');
  }

  function postAIPictors() {
    analyticsEvent('post_to_aipictors');
    archive('aipictors');
  }

  function copyToClipboard() {
    analyticsEvent('copy_book_to_clipboard');
    archive('copy');
  }

  function copyToClipboardAfterUpscale() {
    analyticsEvent('copy_book_to_clipboard_after_upscale');
    archive('copy-after-upscale');
  }

  async function downloadPSD() {
    analyticsEvent('export_psd');
    archive('export-psd');
  }

  async function downloadFrames() {
    analyticsEvent('download_frames');
    archive('download-frames');
  }

  async function downloadFramesNoBubbles() {
    analyticsEvent('download_frames_no_bubbles');
    archive('download-frames-no-bubbles');
  }

  async function downloadLoraData() {
    analyticsEvent('download_lora_data');
    archive('download-lora-data');
  }

  async function shareBook() {
    analyticsEvent('share_book');
    archive('share-book');
  }

  function downloadDialogues() {
    analyticsEvent('export_dialogues');
    archive('export-dialogues');
  }

  function downloadMaterials() {
    analyticsEvent('download_materials');
    archive('download-materials');
  }

  async function downloadEnvelop() {
    analyticsEvent('download_envelop');
    archive('envelope');
  }

  async function exportPrompts() {
    analyticsEvent('export_prompts');
    archive('export-prompts');
    toastStore.trigger({ message: $_('downloader.copiedToClipboard'), timeout: 1500});
  }

  async function publishEnvelope() {
    analyticsEvent('publish_envelop');
    archive('publish');
  }

  async function downloadPublicationFiles() {
    archive('download-publication-files');
  }

  function testIt() {
    const downloadUrl = 'https://frameplanner-e5569.web.app/viewer.html?envelope=01JBH992N5FKAM6T02GJ92ETKY'
    toastStore.trigger({ message: `<a target="_blank" href="${downloadUrl}"><span class="text-yellow-200">公開URL</span></a>がクリップボードにコピーされました`, timeout: 10000});
  }

</script>

<div class="drawer-outer">
  <Drawer placement="right" open={$downloaderOpen} size="300px" on:clickAway={() => $downloaderOpen = false}>
    <div class="drawer-content">
      <div class="flex flex-col gap-2 m-2">
        {#each buttons as {icon, label, hint, onClick}}
          <button
            class="bg-primary-500 text-white hover:bg-primary-700 focus:bg-primary-700 active:bg-primary-900 w-fill h-12 flex items-center justify-center gap-2"
            on:click={() => onClick()}
            use:toolTip={hint}
          >
            {#if icon != null}
              <img src={icon} alt={label} class="h-8 w-auto"/>
            {/if}            
            {#if label != null}
              <div class="flex flex-col">
                {#each label.split('\n') as line}
                  <span>{line}</span>
                {/each}
              </div>
            {/if}
          </button>
        {/each}
      </div>
      <span class="text-xs text-slate-800">
      {$_('downloader.targetPagesNote')}
      </span>

      {#if $mainBook?.attributes.publishUrl != null}
        <div>
          <a target="_blank" href={$mainBook.attributes.publishUrl}>{$_('downloader.publishedUrl')}</a>
        </div>
      {/if}
    </div>
  </Drawer>
</div>

<style>
  .drawer-content {
    width: 100%;
    height: 100%;
    padding: 16px;
  }
  .drawer-outer :global(.drawer .panel) {
    background-color: rgb(var(--color-surface-100));
  }
</style>
