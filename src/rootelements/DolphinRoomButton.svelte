<script lang="ts">
  import { _ } from 'svelte-i18n';
  import BaseRootButton from './BaseRootButton.svelte';
  import bellIcon from '../assets/studio.webp';
  import { dolphinRoomOpen } from '../dolphinroom/dolphinRoomStore';
  import { onlineStatus } from '../utils/accountStore';
  import { toastStore } from '@skeletonlabs/skeleton';

  function toggle() {
    if ($onlineStatus !== "signed-in") {
      toastStore.trigger({ message: $_('messages.aiSignInRequired'), timeout: 3000});
      return;
    }

    $dolphinRoomOpen = !$dolphinRoomOpen;
  }
</script>

<BaseRootButton
  icon={bellIcon}
  alt={$_('dolphinRoom.button.alt')}
  hint={$_('dolphinRoom.button.hint')}
  origin={"bottomright"}
  location={[1, 0]}
  on:click={toggle}
/>
