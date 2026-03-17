<script lang="ts">
  import { developmentFlag } from './developmentFlagStore';

  export let message: string = 'この機能を使うにはサインインが必要です';

  function getParentDomain(): string {
    return window.location.hostname.split('.').slice(1).join('.');
  }

  function generateAuthUrl(): string {
    const fullPath = window.location.protocol + '//' + window.location.hostname + window.location.pathname;
    const parentDomain = getParentDomain();
    return `https://${parentDomain}/auth?next=${encodeURIComponent(fullPath)}`;
  }

  function signIn() {
    if ($developmentFlag) {
      window.location.href = `http://example.local:5174/auth?next=${encodeURIComponent(window.location.href)}`;
    } else {
      window.location.href = generateAuthUrl();
    }
  }
</script>

<div class="flex flex-col items-center gap-3 p-4">
  <p>{message}</p>
  <button class="btn variant-filled-primary" on:click={signIn}>
    サインイン / サインアップ
  </button>
</div>
