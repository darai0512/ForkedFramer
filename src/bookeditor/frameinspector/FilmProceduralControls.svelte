<script lang="ts">
  import type { Film } from "../../lib/layeredCanvas/dataModels/film";
  import type { FilmProceduralEffectType } from "../../lib/layeredCanvas/dataModels/proceduralEffects";
  import { createProceduralEffect, proceduralEffectParamSpecs } from "../../lib/layeredCanvas/dataModels/proceduralEffects";

  export let film: Film;

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

  function onNumberInput(event: Event, key: string, spec: { min: number; max: number }) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(value)) { return; }
    const clamped = Math.min(spec.max, Math.max(spec.min, value));
    params = { ...params, [key]: clamped };
    updateFilm();
  }

  function onColorInput(event: Event, key: string) {
    const value = (event.currentTarget as HTMLInputElement).value;
    params = { ...params, [key]: value };
    updateFilm();
  }

  function onTextInput(event: Event, key: string) {
    const value = (event.currentTarget as HTMLInputElement).value;
    params = { ...params, [key]: value };
    updateFilm();
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
</script>

{#if film.content.kind === 'procedural'}
<div class="procedural-controls">
  <div class="row">
    <label for={typeSelectId}>Type</label>
    <select id={typeSelectId} bind:value={type} on:change={onTypeChange}>
      <option value="concentration">Concentration</option>
      <option value="speedline">Speed Lines</option>
      <option value="burst">Burst</option>
    </select>
  </div>

  {#each Object.entries(proceduralEffectParamSpecs[type]) as [key, spec]}
    <div class="row">
      <label for={`${idPrefix}-${key}`}>{spec.label}</label>
      {#if spec.kind === 'number'}
        <input
          id={`${idPrefix}-${key}`}
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={numberValueOf(key, spec.min)}
          on:input={(event) => onNumberInput(event, key, spec)}
        />
      {:else if spec.kind === 'color'}
        <input
          id={`${idPrefix}-${key}`}
          type="color"
          value={stringValueOf(key, '#000000')}
          on:input={(event) => onColorInput(event, key)}
        />
      {:else if spec.kind === 'text'}
        <input
          id={`${idPrefix}-${key}`}
          type="text"
          value={stringValueOf(key, '')}
          placeholder={spec.placeholder}
          on:input={(event) => onTextInput(event, key)}
        />
      {/if}
    </div>
  {/each}
</div>
{/if}

<style>
  .procedural-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  select,
  input {
    width: 100%;
  }
</style>
