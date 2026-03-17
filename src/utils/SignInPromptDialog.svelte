<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import { developmentFlag } from './developmentFlagStore';

  $: message = $modalStore[0]?.meta?.message as string ?? 'この機能を使うにはサインインが必要です';

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

  function close() {
    $modalStore[0]?.response?.(false);
    modalStore.close();
  }
</script>

<div class="card p-6 shadow-xl max-w-md mx-auto space-y-4">
  <h3 class="h3 text-center">サインインが必要です</h3>
  <p class="text-center whitespace-pre-line">{message}</p>
  <p class="text-center text-sm opacity-70">サインインだけなら無料です</p>
  <div class="flex gap-2 justify-center">
    <button class="btn variant-filled-primary" on:click={signIn}>
      サインイン / サインアップ
    </button>
    <button class="btn variant-ghost" on:click={close}>
      閉じる
    </button>
  </div>
</div>
