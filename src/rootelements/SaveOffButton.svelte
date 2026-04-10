<script type="ts">
  import { saveProhibitFlag } from '../utils/developmentFlagStore';
  import { onMount } from 'svelte';
  import barricadeIcon from '../assets/barricade.webp';
  import BaseRootButton from './BaseRootButton.svelte';
  
  function toggle() {
    $saveProhibitFlag = !$saveProhibitFlag;
    sessionStorage.setItem('saveProhibited', $saveProhibitFlag.toString());
  }

  onMount(() => {
    $saveProhibitFlag = sessionStorage.getItem('saveProhibited') === 'true';
  });

  $: hint = $saveProhibitFlag ? '現在セーブ禁止' : '現在セーブ許可';
  $: customClass = $saveProhibitFlag ? 'variant-ghost-error' : 'variant-ghost-surface';
</script>

<BaseRootButton 
  icon={barricadeIcon} 
  alt="セーブオフ" 
  hint={hint}
  customClass={customClass}
  origin="bottomleft" 
  location={[0,1]} 
  on:click={toggle} />
