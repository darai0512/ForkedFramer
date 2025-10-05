<script lang="ts">
  import BaseRootButton from './BaseRootButton.svelte';
  import bellIcon from '../assets/studio.webp';
  import { dolphinRoomOpen } from '../dolphinroom/dolphinRoomStore';

  function toggle() {
    $dolphinRoomOpen = !$dolphinRoomOpen;
  }
</script>

<BaseRootButton
  icon={bellIcon}
  alt={"studio"}
  hint={'スタジオ'}
  origin={"bottomright"}
  location={[1, 0]}
  on:click={toggle}
/>
