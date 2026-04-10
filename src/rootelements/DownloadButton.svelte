<script type="ts">
  import { downloaderOpen } from '../downloader/downloaderStore';
  import BaseRootButton from './BaseRootButton.svelte';
  import downloadIcon from '../assets/download.webp';
  import { _ } from 'svelte-i18n';

  function download() {
    $downloaderOpen = !$downloaderOpen;
  }
</script>

<BaseRootButton icon={downloadIcon} alt={"download"} hint={$_('ui.download')} origin={"bottomleft"} location={[1,1]} on:click={download}/>
