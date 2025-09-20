<script lang="ts">
  import type { Film } from "../../lib/layeredCanvas/dataModels/film";
  import type { FilmProceduralEffectType } from "../../lib/layeredCanvas/dataModels/proceduralEffects";
  import { createProceduralEffect, proceduralEffectParamSpecs } from "../../lib/layeredCanvas/dataModels/proceduralEffects";

  export let film: Film;
  export let paperSize: [number, number] | null = null;

  let type: FilmProceduralEffectType = 'concentration';
  let params: Record<string, number | string | boolean> = {};
  let syncing = false;

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

  function onNumberInput(key: string, event: Event, spec: { min: number; max: number }) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(value)) { return; }
    const clamped = Math.min(spec.max, Math.max(spec.min, value));
    params = { ...params, [key]: clamped };
    updateFilm();
  }

  function onColorInput(key: string, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    params = { ...params, [key]: value };
    updateFilm();
  }

  function onTextInput(key: string, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    params = { ...params, [key]: value };
    updateFilm();
  }
</script>

{#if film.content.kind === 'procedural'}
<div class="procedural-controls">
  <div class="row">
    <label>Type</label>
    <select bind:value={type} on:change={(e) => changeType((e.currentTarget as HTMLSelectElement).value as FilmProceduralEffectType)}>
      <option value="concentration">Concentration</option>
      <option value="speedline">Speed Lines</option>
      <option value="burst">Burst</option>
    </select>
  </div>

  {#each Object.entries(proceduralEffectParamSpecs[type]) as [key, spec]}
    <div class="row">
      <label>{spec.label}</label>
      {#if spec.kind === 'number'}
        <input
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={params[key] as number}
          on:input={(event) => onNumberInput(key, event, { min: spec.min, max: spec.max })}
        />
      {:else if spec.kind === 'color'}
        <input
          type="color"
          value={params[key] as string}
          on:input={(event) => onColorInput(key, event)}
        />
      {:else if spec.kind === 'text'}
        <input
          type="text"
          value={params[key] as string}
          placeholder={spec.placeholder}
          on:input={(event) => onTextInput(key, event)}
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
