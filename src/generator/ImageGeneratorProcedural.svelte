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

  const idPrefix = `image-procedural-${Math.random().toString(36).slice(2, 8)}`;
  const labelInputId = `${idPrefix}-label`;
  const typeSelectId = `${idPrefix}-type`;

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
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return;
    }
    params = { ...params, [key]: value };
  }

  function handleTypeChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    changeType(target.value as FilmProceduralEffectType);
  }

  function numberValueOf(key: string, fallback: number): number {
    const value = Number(params[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function colorValueOf(key: string, fallback: string): string {
    const value = params[key];
    return typeof value === 'string' && value ? value : fallback;
  }

  function stringValueOf(key: string, fallback: string): string {
    const value = params[key];
    return typeof value === 'string' ? value : fallback;
  }

  function onNumberInput(event: Event, key: string, spec: { min: number; max: number }) {
    const target = event.currentTarget as HTMLInputElement;
    const raw = Number(target.value);
    if (!Number.isFinite(raw)) {
      return;
    }
    const clamped = Math.min(spec.max, Math.max(spec.min, raw));
    updateParam(key, clamped);
  }

  function onColorInput(event: Event, key: string) {
    const target = event.currentTarget as HTMLInputElement;
    updateParam(key, target.value);
  }

  function onTextInput(event: Event, key: string) {
    const target = event.currentTarget as HTMLInputElement;
    updateParam(key, target.value);
  }

  function submit() {
    const effect = createProceduralEffect(type, params);
    dispatch('create', { effect, label: label.trim() ? label.trim() : null });
  }
</script>

<div class="procedural-panel">
  <h3>Procedural Effect</h3>

  <div class="field">
    <label for={labelInputId}>Label (optional)</label>
    <input id={labelInputId} type="text" bind:value={label} placeholder="Effect label" />
  </div>

  <div class="field">
    <label for={typeSelectId}>Type</label>
    <select id={typeSelectId} bind:value={type} on:change={handleTypeChange}>
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
            value={numberValueOf(key, spec.min)}
            on:input={(event) => onNumberInput(event, key, { min: spec.min, max: spec.max })}
          />
        {:else if spec.kind === 'color'}
          <input
            type="color"
            value={colorValueOf(key, '#000000')}
            on:input={(event) => onColorInput(event, key)}
          />
        {:else if spec.kind === 'text'}
          <input
            type="text"
            value={stringValueOf(key, '')}
            placeholder={spec.placeholder}
            on:input={(event) => onTextInput(event, key)}
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
