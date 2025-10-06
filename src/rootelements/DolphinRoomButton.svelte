<script lang="ts">
  import { _ } from 'svelte-i18n';
  import BaseRootButton from './BaseRootButton.svelte';
  import bellIcon from '../assets/studio.webp';
  import { dolphinRoomOpen } from '../dolphinroom/dolphinRoomStore';

  function toggle() {
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
