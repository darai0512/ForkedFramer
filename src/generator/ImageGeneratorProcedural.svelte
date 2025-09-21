<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FilmProceduralEffectType, FilmProceduralEffect, FilmProceduralParamValue } from '../lib/layeredCanvas/dataModels/proceduralEffects';
  import { createProceduralEffect, proceduralEffectParamSpecs } from '../lib/layeredCanvas/dataModels/proceduralEffects';
  import { _ } from 'svelte-i18n';
  import FilmProceduralNumberParam from '../bookeditor/frameinspector/FilmProceduralNumberParam.svelte';
  import FilmProceduralColorParam from '../bookeditor/frameinspector/FilmProceduralColorParam.svelte';
  import FilmProceduralTextParam from '../bookeditor/frameinspector/FilmProceduralTextParam.svelte';

  const dispatch = createEventDispatcher<{ create: { effect: FilmProceduralEffect; label: string | null } }>();

  const typeSelectId = `image-procedural-${Math.random().toString(36).slice(2, 8)}-type`;

  let type: FilmProceduralEffectType = 'motion-lines';
  let params: Record<string, FilmProceduralParamValue> = createProceduralEffect(type).params;

  function changeType(next: FilmProceduralEffectType) {
    if (next === type) return;
    type = next;
    params = {
      ...createProceduralEffect(next).params,
    };
  }

  function handleTypeChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    changeType(target.value as FilmProceduralEffectType);
  }

  function numberValueOf(key: string, fallback: number): number {
    const value = params[key];
    if (Array.isArray(value)) {
      return fallback;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }

  function stringValueOf(key: string, fallback: string): string {
    const value = params[key];
    if (Array.isArray(value)) {
      return fallback;
    }
    return typeof value === 'string' ? value : fallback;
  }

  function onNumberParamChange(key: string, value: number) {
    params = { ...params, [key]: value };
  }

  function onColorParamChange(key: string, value: string) {
    params = { ...params, [key]: value };
  }

  function onTextParamChange(key: string, value: string) {
    params = { ...params, [key]: value };
  }

  function submit() {
    const effect = createProceduralEffect(type, params);
    dispatch('create', { effect, label: null });
  }
</script>

<div class="procedural-content">
  <h2>{$_('generator.procedural.title')}</h2>

  <div class="procedural-controls">
    <div class="selector-row">
      <label class="selector-label" for={typeSelectId}>{$_('film.procedural.selectorLabel')}</label>
      <select class="selector-control" id={typeSelectId} bind:value={type} on:change={handleTypeChange}>
        <option value="motion-lines">{$_('film.procedural.type.motion-lines')}</option>
        <option value="speed-lines">{$_('film.procedural.type.speed-lines')}</option>
      </select>
    </div>

    <div class="params-panel variant-soft-surface">
      {#each Object.entries(proceduralEffectParamSpecs[type]) as [key, spec]}
        {#if spec.kind === 'number'}
          <FilmProceduralNumberParam
            label={spec.labelKey ? $_(spec.labelKey) : spec.label}
            value={numberValueOf(key, spec.min)}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            on:change={(event) => onNumberParamChange(key, event.detail)}
          />
        {:else if spec.kind === 'color'}
          <FilmProceduralColorParam
            label={spec.labelKey ? $_(spec.labelKey) : spec.label}
            value={stringValueOf(key, '#000000')}
            on:change={(event) => onColorParamChange(key, event.detail)}
          />
        {:else if spec.kind === 'text'}
          <FilmProceduralTextParam
            label={spec.labelKey ? $_(spec.labelKey) : spec.label}
            value={stringValueOf(key, '')}
            placeholder={spec.placeholderKey ? $_(spec.placeholderKey) : spec.placeholder}
            on:change={(event) => onTextParamChange(key, event.detail)}
          />
        {/if}
      {/each}
    </div>
  </div>

  <button class="generate-button" on:click={submit}>
    {$_('generator.procedural.createButton')}
  </button>
</div>

<style>
  .procedural-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin: 16px;
  }

  h2 {
    font-family: '源暎エムゴ';
    font-size: 18px;
    display: flex;
    align-items: center;
    margin-top: 8px;
    margin-bottom: 12px;
  }

  .procedural-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
    margin-bottom: 16px;
  }

  .params-panel {
    padding: 12px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .selector-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .selector-label {
    font-size: 14px;
    min-width: 92px;
    white-space: nowrap;
  }

  .selector-control {
    flex: 1;
    min-height: 28px;
    font-size: 0.9rem;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid rgb(var(--color-surface-300));
    background: white;
  }

  .generate-button {
    background-color: rgb(var(--color-primary-500));
    color: white;
    padding: 8px 24px;
    border-radius: 4px;
    margin-top: 8px;
    align-self: flex-start;
    transition: background-color 0.2s;
  }

  .generate-button:hover {
    background-color: rgb(var(--color-primary-700));
  }

  .generate-button:active {
    background-color: rgb(var(--color-primary-900));
  }
</style>