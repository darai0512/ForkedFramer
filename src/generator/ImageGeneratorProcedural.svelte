<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FilmProceduralEffect, FilmProceduralEffectType } from '../lib/layeredCanvas/dataModels/proceduralEffects';

  const dispatch = createEventDispatcher<{ create: { effect: FilmProceduralEffect; label: string | null } }>();

  const proceduralOptions: { value: FilmProceduralEffectType; label: string }[] = [
    { value: 'concentration', label: 'Concentration Lines' },
    { value: 'speedline', label: 'Speed Lines' },
    { value: 'burst', label: 'Burst Rings' },
  ];

  let type: FilmProceduralEffectType = 'concentration';
  let width = 1024;
  let height = 1024;
  let label = '';

  let concentrationParams = {
    lineCount: 48,
    lineWidth: 1.5,
    innerRatio: 0.05,
    outerRatio: 1.1,
    angleJitter: 0.4,
    color: '#000000',
    seed: '',
  };

  let speedlineParams = {
    bandCount: 24,
    bandWidthRatio: 0.12,
    direction: 0,
    color: '#000000',
  };

  let burstParams = {
    ringCount: 4,
    startRatio: 0.2,
    lineWidth: 2,
    color: '#000000',
  };

  function sanitize(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
  }

  function buildEffect(): FilmProceduralEffect {
    const baseParams: Record<string, number | string | boolean> = {
      width: sanitize(width, 1024),
      height: sanitize(height, 1024),
    };

    switch (type) {
      case 'concentration':
        return {
          type,
          params: {
            ...baseParams,
            lineCount: sanitize(concentrationParams.lineCount, 48),
            lineWidth: sanitize(concentrationParams.lineWidth, 1.5),
            innerRatio: sanitize(concentrationParams.innerRatio, 0.05),
            outerRatio: sanitize(concentrationParams.outerRatio, 1.1),
            angleJitter: sanitize(concentrationParams.angleJitter, 0.4),
            color: concentrationParams.color,
            seed: concentrationParams.seed,
          },
        };
      case 'speedline':
        return {
          type,
          params: {
            ...baseParams,
            bandCount: sanitize(speedlineParams.bandCount, 24),
            bandWidthRatio: sanitize(speedlineParams.bandWidthRatio, 0.12),
            direction: sanitize(speedlineParams.direction, 0),
            color: speedlineParams.color,
          },
        };
      case 'burst':
        return {
          type,
          params: {
            ...baseParams,
            ringCount: sanitize(burstParams.ringCount, 4),
            startRatio: sanitize(burstParams.startRatio, 0.2),
            lineWidth: sanitize(burstParams.lineWidth, 2),
            color: burstParams.color,
          },
        };
    }
  }

  function submit() {
    const effect = buildEffect();
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
    <select bind:value={type}>
      {#each proceduralOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class="dimension-grid">
    <label>
      Width
      <input type="number" min="32" step="16" bind:value={width} />
    </label>
    <label>
      Height
      <input type="number" min="32" step="16" bind:value={height} />
    </label>
  </div>

  {#if type === 'concentration'}
    <div class="grid">
      <label>
        Line Count
        <input type="number" min="4" step="1" bind:value={concentrationParams.lineCount} />
      </label>
      <label>
        Line Width
        <input type="number" min="0.1" step="0.1" bind:value={concentrationParams.lineWidth} />
      </label>
      <label>
        Inner Ratio
        <input type="number" min="0" max="0.8" step="0.01" bind:value={concentrationParams.innerRatio} />
      </label>
      <label>
        Outer Ratio
        <input type="number" min="0.5" max="2" step="0.01" bind:value={concentrationParams.outerRatio} />
      </label>
      <label>
        Angle Jitter
        <input type="number" min="0" max="2" step="0.1" bind:value={concentrationParams.angleJitter} />
      </label>
      <label>
        Color
        <input type="color" bind:value={concentrationParams.color} />
      </label>
      <label>
        Seed (optional)
        <input type="text" bind:value={concentrationParams.seed} />
      </label>
    </div>
  {:else if type === 'speedline'}
    <div class="grid">
      <label>
        Band Count
        <input type="number" min="1" step="1" bind:value={speedlineParams.bandCount} />
      </label>
      <label>
        Band Width Ratio
        <input type="number" min="0.02" max="0.5" step="0.01" bind:value={speedlineParams.bandWidthRatio} />
      </label>
      <label>
        Direction (deg)
        <input type="number" min="-360" max="360" step="1" bind:value={speedlineParams.direction} />
      </label>
      <label>
        Color
        <input type="color" bind:value={speedlineParams.color} />
      </label>
    </div>
  {:else if type === 'burst'}
    <div class="grid">
      <label>
        Ring Count
        <input type="number" min="1" step="1" bind:value={burstParams.ringCount} />
      </label>
      <label>
        Start Ratio
        <input type="number" min="0" max="1" step="0.01" bind:value={burstParams.startRatio} />
      </label>
      <label>
        Line Width
        <input type="number" min="0.5" step="0.1" bind:value={burstParams.lineWidth} />
      </label>
      <label>
        Color
        <input type="color" bind:value={burstParams.color} />
      </label>
    </div>
  {/if}

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
  .dimension-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
  .grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
  input[type="text"],
  input[type="number"],
  select {
    width: 100%;
  }
</style>
