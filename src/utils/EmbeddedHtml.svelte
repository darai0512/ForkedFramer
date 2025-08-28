<script lang="ts">
  import { onMount, afterUpdate, onDestroy } from 'svelte';

  export let app;
  export let url;
  export let reload: boolean;
  export let onAnalyticsEvent: (eventData: any) => void = () => {};

  let key = 0;

  $: if (reload) {
    console.log("reloading");
    reload = false;
    key++;
  }

  function handleMessage(event: MessageEvent) {
    // セキュリティチェック: 同一オリジンまたは信頼できるオリジンからのメッセージのみ受け入れ
    if (event.origin !== window.location.origin) {
      return;
    }

    if (event.data.type === 'analytics' && event.data.app === app) {
      console.log('Analytics event received:', event.data);
      onAnalyticsEvent(event.data);
    }
  }
    
  onMount(() => {
    console.log(`Mounted ${app}`);
    window.addEventListener('message', handleMessage);
  });
  
  afterUpdate(() => {
    console.log(`Updated ${app}`);
  });
  
  onDestroy(() => {
    console.log(`Destroyed ${app}`);
    window.removeEventListener('message', handleMessage);
  });
</script>

{#key key}
  <iframe
    title="{app}"
    id='microapp-{app}'
    frameborder='0'
    scrolling='no'
    src={url}
  ></iframe>
{/key}  
  
  <style>
      iframe { width: 100%; height:100%; }
  </style>