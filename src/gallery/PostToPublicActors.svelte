<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import type { Media } from "../lib/layeredCanvas/dataModels/media";
  import MediaFrame from './MediaFrame.svelte';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import FeathralCost from '../utils/FeathralCost.svelte';
  import type { CharacterLocal } from '../lib/book/book';

  let character: CharacterLocal;
  let category = 'general';
  let displayName = '';
  let description = '';

  function onCancel() {
    $modalStore[0].response!(null);
    modalStore.close();
  }

  function showGuideline() {
    window.open('/postingGuideline.html', '_blank');
  }

  function onSubmit() {
    if (!displayName.trim()) return;

    const response = {
      character,
      confirmed: true,
      category,
      displayName: displayName.trim(),
      description: description.trim()
    };

    $modalStore[0].response!(response);
    modalStore.close();
  }

  onMount(() => {
    character = $modalStore[0].meta.character;
    displayName = character.name;
  });
</script>

<div class="card p-4 w-modal shadow-xl max-w-2xl">
  <header class="card-header">
    <h2>{$_('publicActors.dialog.title')}</h2>
  </header>

  <section class="p-4">
    <div class="grid grid-cols-1 gap-4">
      <div class="preview-container">
        {#if character && character.portrait && character.portrait !== 'loading'}
          <MediaFrame
            media={character.portrait}
            showControls={false}
          />
        {:else}
          <div class="no-portrait">{$_('notebook.noPortrait')}</div>
        {/if}
      </div>

      <div class="character-info">
        <div class="info-row">
          <span class="info-label">{$_('notebook.characterName')}:</span>
          <span class="info-value">{character?.name || ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">{$_('notebook.personality')}:</span>
          <span class="info-value">{character?.personality || $_('publicActors.dialog.notSet')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">{$_('notebook.appearance2')}:</span>
          <span class="info-value">{character?.appearance || $_('publicActors.dialog.notSet')}</span>
        </div>
      </div>

      <div class="confirm-section">
        <div class="form-section">
          <label class="label">
            <span>{$_('publicActors.dialog.displayName')}</span>
            <input
              type="text"
              bind:value={displayName}
              class="input"
              placeholder={$_('publicActors.dialog.displayNamePlaceholder')}
              required
            />
          </label>

          <label class="label">
            <span>{$_('publicActors.dialog.category')}</span>
            <select bind:value={category} class="select">
              <option value="general">{$_('publicActors.categories.general')}</option>
              <option value="protagonist">{$_('publicActors.categories.protagonist')}</option>
              <option value="supporting">{$_('publicActors.categories.supporting')}</option>
              <option value="comedy">{$_('publicActors.categories.comedy')}</option>
              <option value="serious">{$_('publicActors.categories.serious')}</option>
            </select>
          </label>

          <label class="label">
            <span>{$_('publicActors.dialog.description')}</span>
            <textarea
              bind:value={description}
              class="textarea"
              rows="3"
              placeholder={$_('publicActors.dialog.descriptionPlaceholder')}
            />
          </label>
        </div>

        <p class="text-sm mb-4">{@html $_('publicActors.dialog.confirmText')}</p>
        <p class="text-sm mb-4">
          {$_('publicActors.dialog.selectionRewardPrefix')}
          <FeathralCost showsLabel={false} cost={200} inline={true}/>
          {$_('publicActors.dialog.selectionRewardSuffix')}
        </p>

      </div>
    </div>
  </section>

  <footer class="card-footer flex gap-2">
    <button type="button" class="btn variant-filled-secondary" on:click={showGuideline}>
      {$_('publication.postingGuideline')}
    </button>
    <div class="flex-1"></div>
    <button class="btn variant-ghost-surface" on:click={onCancel}>
      {$_('dialogs.cancel')}
    </button>
    <button
      class="btn variant-filled-primary"
      on:click={onSubmit}
      disabled={!displayName.trim()}
    >
      <span class="submit-text">{$_('publicActors.dialog.submitButton')}</span>
    </button>
  </footer>
</div>

<style>
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }

  .preview-container {
    width: 100%;
    height: 200px;
    background-color: var(--color-surface-200);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .no-portrait {
    color: rgb(var(--color-surface-600));
    font-size: 14px;
  }

  .character-info {
    background-color: var(--color-surface-100);
    border-radius: 8px;
    padding: 1rem;
  }

  .info-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .info-row:last-child {
    margin-bottom: 0;
  }

  .info-label {
    font-weight: 600;
    color: rgb(var(--color-surface-700));
    min-width: 80px;
  }

  .info-value {
    color: rgb(var(--color-surface-900));
    flex: 1;
  }

  .confirm-section {
    padding: 1rem;
    background-color: var(--color-surface-100);
    border-radius: 8px;
  }

  .form-section {
    margin-bottom: 1rem;
  }

  .form-section .label {
    display: block;
    margin-bottom: 0.75rem;
  }

  .form-section .label span {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .form-section .input {
    width: 100%;
    padding: 0.75rem;
  }

  .form-section .textarea {
    width: 100%;
    padding: 0.75rem;
    resize: vertical;
  }

  button .submit-text {
    font-family: '源暎エムゴ';
    font-size: 18px;
  }
</style>
