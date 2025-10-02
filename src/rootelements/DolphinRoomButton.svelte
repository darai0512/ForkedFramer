<script lang="ts">
  import BaseRootButton from './BaseRootButton.svelte';
  import bellIcon from '../assets/bell.webp';
  import { dolphinRoomOpen } from '../dolphinroom/dolphinRoomStore';

  function toggle() {
    $dolphinRoomOpen = !$dolphinRoomOpen;
  }
</script>

<BaseRootButton
  icon={bellIcon}
  alt={"dolphin room"}
  hint={'ドルフィンルーム'}
  origin={"bottomright"}
  location={[1, 0]}
  on:click={toggle}
/>
