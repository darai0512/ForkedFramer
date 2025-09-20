<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FilmProceduralEffectType, FilmProceduralEffect } from '../lib/layeredCanvas/dataModels/proceduralEffects';
  import { createProceduralEffect, proceduralEffectParamSpecs } from '../lib/layeredCanvas/dataModels/proceduralEffects';

  const dispatch = createEventDispatcher<{ create: { effect: FilmProceduralEffect; label: string | null } }>();

  const proceduralOptions: { value: FilmProceduralEffectType; label: string }[] = [
    { value: 'concentration', label: 'Concentration Lines' },
    { value: 'speedline', label: 'Speed Lines' },
    { value: 'burst', label: 'Burst Rings' },
  ];

  let type: FilmProceduralEffectType = 'concentration';
  let label = '';
  let params: Record<string, number | string | boolean> = createProceduralEffect(type).params;

  function changeType(next: FilmProceduralEffectType) {
    if (next === type) return;
    const preservedDimensions = {
      width: params.width,
      height: params.height,
    };
    type = next;
    params = {
      ...createProceduralEffect(next, preservedDimensions).params,
    };
  }

  function updateParam(key: string, value: number | string | boolean) {
    params = { ...params, [key]: value };
  }

  function submit() {
    const effect = createProceduralEffect(type, params);
    dispatch('create', { effect, label: label.trim() ? label.trim() : null });
  }
</script>

<div class="procedural-panel">
  <h3>Procedural Effect</h3>

  <div class="field">
    <label>Label (optional)</label>
    <input type="text" bind:value={label} placeholder="Effect label" />
  </div>

  <div class="field">
    <label>Type</label>
    <select bind:value={type} on:change={(event) => changeType((event.currentTarget as HTMLSelectElement).value as FilmProceduralEffectType)}>
      {#each proceduralOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class="grid">
    {#each Object.entries(proceduralEffectParamSpecs[type]) as [key, spec]}
      <label>
        {spec.label}
        {#if spec.kind === 'number'}
          <input
            type="number"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            bind:value={params[key]}
            on:change={(event) => updateParam(key, Number((event.currentTarget as HTMLInputElement).value))}
          />
        {:else if spec.kind === 'color'}
          <input
            type="color"
            bind:value={params[key]}
            on:change={(event) => updateParam(key, (event.currentTarget as HTMLInputElement).value)}
          />
        {:else if spec.kind === 'text'}
          <input
            type="text"
            bind:value={params[key]}
            placeholder={spec.placeholder}
            on:input={(event) => updateParam(key, (event.currentTarget as HTMLInputElement).value)}
          />
        {/if}
      </label>
    {/each}
  </div>

  <button class="btn variant-filled-primary mt-4" on:click={submit}>
    Create Procedural Layer
  </button>
</div>

<style>
  .procedural-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  input[type="number"],
  input[type="text"],
  input[type="color"],
  select {
    width: 100%;
  }
</style>
