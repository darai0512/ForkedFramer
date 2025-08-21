<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import type { Media } from "../lib/layeredCanvas/dataModels/media";
  import MediaFrame from './MediaFrame.svelte';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import FeathralCost from '../utils/FeathralCost.svelte';
  
  let media: Media;
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
      media,
      confirmed: true,
      category,
      displayName: displayName.trim(),
      description: description.trim()
    };
    
    $modalStore[0].response!(response);
    modalStore.close();
  }

  onMount(() => {
    media = $modalStore[0].meta.media;
  });
</script>

<div class="card p-4 w-modal shadow-xl max-w-2xl">
  <header class="card-header">
    <h2>{$_('publicMaterials.dialog.title')}</h2>
  </header>
  
  <section class="p-4">
    <div class="grid grid-cols-1 gap-4">
      <div class="preview-container">
        {#if media}
          <MediaFrame 
            {media}
            showControls={false}
          />
        {/if}
      </div>

      <div class="confirm-section">
        <div class="form-section">
          <label class="label">
            <span>{$_('publicMaterials.dialog.displayName')}</span>
            <input 
              type="text" 
              bind:value={displayName}
              class="input"
              placeholder={$_('publicMaterials.dialog.displayNamePlaceholder')}
              required
            />
          </label>
          
          <label class="label">
            <span>{$_('publicMaterials.dialog.category')}</span>
            <select bind:value={category} class="select">
              <option value="general">{$_('publicMaterials.categories.general')}</option>
              <option value="character">{$_('publicMaterials.categories.character')}</option>
              <option value="background">{$_('publicMaterials.categories.background')}</option>
              <option value="effect">{$_('publicMaterials.categories.effect')}</option>
              <option value="item">{$_('publicMaterials.categories.item')}</option>
            </select>
          </label>
          
          <label class="label">
            <span>{$_('publicMaterials.dialog.description')}</span>
            <textarea 
              bind:value={description}
              class="textarea"
              rows="3"
              placeholder={$_('publicMaterials.dialog.descriptionPlaceholder')}
            />
          </label>
        </div>
        
        <p class="text-sm mb-4">{@html $_('publicMaterials.dialog.confirmText')}</p>
        <p class="text-sm mb-4">
          {$_('publicMaterials.dialog.selectionRewardPrefix')}
          <FeathralCost showsLabel={false} cost={200} inline={true}/>
          {$_('publicMaterials.dialog.selectionRewardSuffix')}
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
      <span class="submit-text">{$_('publicMaterials.dialog.submitButton')}</span>
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
    height: 300px;
    background-color: var(--color-surface-200);
    border-radius: 8px;
    overflow: hidden;
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