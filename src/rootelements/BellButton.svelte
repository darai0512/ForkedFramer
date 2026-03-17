<script lang="ts">
  import { notebookOpen } from '../notebook/notebookStore';  
  import { requireSignIn } from '../utils/signInPrompt';
  import BaseRootButton from './BaseRootButton.svelte';
  import bellIcon from '../assets/bell.webp';
  import { gadgetFileSystem } from '../filemanager/fileManagerStore';
  import { _ } from 'svelte-i18n';

  async function callFairy() {
    if (!$gadgetFileSystem) {
      return;
    }

    if (!await requireSignIn($_('messages.aiSignInRequired'))) {
      return;
    }

    $notebookOpen = !$notebookOpen;
  }
</script>

<BaseRootButton icon={bellIcon} alt={"creative notebook"} hint={$_('ui.bell')} origin={"bottomright"} location={[0,0]} on:click={callFairy}/>
