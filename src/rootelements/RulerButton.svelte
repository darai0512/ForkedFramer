<script type="ts">
  import { controlPanelOpen } from '../controlpanel/controlPanelStore';
  import BaseRootButton from './BaseRootButton.svelte';
  import rulerIcon from '../assets/ruler.webp';
  import { _ } from 'svelte-i18n';

  function openRuler() {
    $controlPanelOpen = !$controlPanelOpen;
  }
</script>

<BaseRootButton icon={rulerIcon} alt={"ruler"} hint={$_('ui.ruler')} origin={"bottomleft"} location={[0,1]} on:click={openRuler}/>
