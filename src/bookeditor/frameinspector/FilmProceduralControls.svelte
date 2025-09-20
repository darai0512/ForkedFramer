<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Film } from "../../lib/layeredCanvas/dataModels/film";
  import type { FilmProceduralEffectType } from "../../lib/layeredCanvas/dataModels/proceduralEffects";
  import { createProceduralEffect, proceduralEffectParamSpecs } from "../../lib/layeredCanvas/dataModels/proceduralEffects";
  import FilmProceduralNumberParam from './FilmProceduralNumberParam.svelte';
  import FilmProceduralColorParam from './FilmProceduralColorParam.svelte';
  import FilmProceduralTextParam from './FilmProceduralTextParam.svelte';

  export let film: Film;

  const dispatch = createEventDispatcher<{ change: void }>();

  let type: FilmProceduralEffectType = 'concentration';
  let params: Record<string, number | string | boolean> = {};
  let syncing = false;
  const idPrefix = `film-procedural-${Math.random().toString(36).slice(2, 8)}`;
  const typeSelectId = `${idPrefix}-type`;

  $: if (film.content.kind === 'procedural') {
      syncing = true;
      type = film.content.effect.type;
      params = { ...film.content.effect.params };
      syncing = false;
    }

  function updateFilm() {
    if (syncing || film.content.kind !== 'procedural') { return; }
    const effect = createProceduralEffect(type, params);
    film.proceduralEffect = effect;
    film.transientCanvas = undefined;
    dispatch('change');
  }

  function changeType(next: FilmProceduralEffectType) {
    if (type === next) { return; }
    const preserved = {
      width: params.width,
      height: params.height,
    };
    type = next;
    params = {
      ...createProceduralEffect(type, preserved).params,
    };
    updateFilm();
  }

  function onTypeChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    changeType(target.value as FilmProceduralEffectType);
  }

  function numberValueOf(key: string, fallback: number): number {
    const value = params[key];
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
    return typeof value === 'string' ? value : fallback;
  }

  function onNumberParamChange(key: string, value: number, step: number) {
    const previous = Number(params[key]);
    const tolerance = step >= 1 ? 0 : Math.max(step / 100, 1e-6);
    if (Number.isFinite(previous) && Math.abs(previous - value) <= tolerance) {
      return;
    }
    params = { ...params, [key]: value };
    updateFilm();
  }

  function onColorParamChange(key: string, value: string) {
    const previous = typeof params[key] === 'string' ? (params[key] as string) : '';
    if (previous.toLowerCase() === value.toLowerCase()) {
      return;
    }
    params = { ...params, [key]: value };
    updateFilm();
  }

  function onTextParamChange(key: string, value: string) {
    const previous = typeof params[key] === 'string' ? (params[key] as string) : '';
    if (previous === value) {
      return;
    }
    params = { ...params, [key]: value };
    updateFilm();
  }
</script>

{#if film.content.kind === 'procedural'}
<div class="procedural-controls">
  <div class="selector-row">
    <label class="selector-label" for={typeSelectId}>Type</label>
    <select class="selector-control" id={typeSelectId} bind:value={type} on:change={onTypeChange}>
      <option value="concentration">Concentration</option>
      <option value="speedline">Speed Lines</option>
      <option value="burst">Burst</option>
    </select>
  </div>

  {#each Object.entries(proceduralEffectParamSpecs[type]) as [key, spec]}
    {#if spec.kind === 'number'}
      <FilmProceduralNumberParam
        label={spec.label}
        value={numberValueOf(key, spec.min)}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        on:change={(event) => onNumberParamChange(key, event.detail, spec.step)}
      />
    {:else if spec.kind === 'color'}
      <FilmProceduralColorParam
        label={spec.label}
        value={stringValueOf(key, '#000000')}
        on:change={(event) => onColorParamChange(key, event.detail)}
      />
    {:else if spec.kind === 'text'}
      <FilmProceduralTextParam
        label={spec.label}
        value={stringValueOf(key, '')}
        placeholder={spec.placeholder}
        on:change={(event) => onTextParamChange(key, event.detail)}
      />
    {/if}
  {/each}
</div>
{/if}

<style>
  .procedural-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
</style>
