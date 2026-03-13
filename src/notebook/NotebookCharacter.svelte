<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CharacterLocal } from '../lib/book/book';
  import CharacterEditor from './CharacterEditor.svelte';
  import { _ } from 'svelte-i18n';

  import trashIcon from '../assets/trash.webp'

  const dispatch = createEventDispatcher();

  export let character: CharacterLocal;

  function remove() {
    dispatch('remove', character);
  }

  function register() {
    dispatch('register', character);
  }
</script>

<CharacterEditor
  bind:character={character}
  showPortraitGeneration={true}
  on:setPortrait
  on:erasePortrait
  on:portrait
>
  <svelte:fragment slot="headerActions">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <img class="trash" src={trashIcon} alt={$_('notebook.delete')} on:click={remove}/>
  </svelte:fragment>
  <svelte:fragment slot="belowPortrait">
    <button class="btn btn-sm bg-secondary-400" on:click={register}>{$_('notebook.registerToRoster')}</button>
  </svelte:fragment>
</CharacterEditor>

<style>
  .trash {
    width: 20px;
    height: 20px;
    cursor: pointer;
  }
</style>
