<script lang="ts">
  import { modalStore } from '@skeletonlabs/skeleton';
  import type { ImageToVideoRequest, ImageToVideoModel, ImageToVideoResolution } from '../utils/edgeFunctions/types/imagingTypes';
  import NotebookTextarea from '../notebook/NotebookTextarea.svelte';
  import { recognizeImage } from '../supabase';
  import type { Media } from '../lib/layeredCanvas/dataModels/media';
  import { onMount, onDestroy } from 'svelte';
  import { resizeCanvasIfNeeded } from '../lib/layeredCanvas/tools/imageUtil';
  import FeathralCost from '../utils/FeathralCost.svelte';
  import { _ } from 'svelte-i18n';
  import { calculateI2VCost } from '../utils/edgeFunctions/calculateCost';
  import { createPreferenceStore } from '../preferences';
  import VideoGenerationModes from './VideoGenerationModes.svelte';
  import PlainDropdown from '../utils/PlainDropdown.svelte';
  import { videoModelOptions, getVideoModelCapability, type VideoModelCapability } from './videoModelConfig';
  
  type Option = { value: string; label: string };
  
  let prompt = '';
  let duration: "1" | "2" | "3" | "4" | "5" | "10" = "5";
  let aspectRatio: "1:1" | "16:9" | "9:16" = "1:1";
  let resolution: ImageToVideoResolution = "720p";
  let model: ImageToVideoModel = "FramePack";
  let sourceMedia: Media;
  let sourceSize: { width: number; height: number } | null = null;
  let promptWaiting: boolean;
  let cost: number = 50;

  const MAX_HISTORY_SIZE = 50;
  const videoPromptHistoryStore = createPreferenceStore<string[]>("tweakUi", "videoGeneratorPromptHistory", []);
  let promptHistory: string[] = [];
  let historyIndex = -1;
  let temporaryPrompt = '';

  let capability: VideoModelCapability | undefined;
  let durationOptions: Option[] = [];
  let aspectRatioOptions: Option[] = [];
  let resolutionOptions: Option[] = [];
  const noOptionText = '利用可能なオプションがありません';

  const unsubscribeHistory = videoPromptHistoryStore.subscribe(value => {
    promptHistory = value;
  });

  onDestroy(() => {
    unsubscribeHistory();
  });

  $: capability = getVideoModelCapability(model);
  $: durationOptions = buildDurationOptions(capability);
  $: aspectRatioOptions = buildAspectRatioOptions(capability);
  $: resolutionOptions = buildResolutionOptions(capability);

  // モデル変更時に互換性のあるオプションに自動調整
  $: if (capability) {
    const availableDurations = durationOptions.map((option) => option.value);
    const availableAspectRatios = aspectRatioOptions.map((option) => option.value);
    const availableResolutions = resolutionOptions.map((option) => option.value);

    if (availableDurations.length > 0 && !availableDurations.includes(duration)) {
      duration = availableDurations[0] as typeof duration;
    }

    if (availableAspectRatios.length > 0 && !availableAspectRatios.includes(aspectRatio)) {
      aspectRatio = availableAspectRatios[0] as typeof aspectRatio;
    }

    if (availableResolutions.length > 0 && !availableResolutions.includes(resolution)) {
      resolution = availableResolutions[0] as ImageToVideoResolution;
    }

    cost = calculateI2VCost(model, parseInt(duration, 10), resolution, aspectRatio);
    console.log(`Model: ${model}, Duration: ${duration}, Resolution: ${resolution}, Cost: ${cost}`);
  } else {
    cost = 0;
  }

  $: sourceSize = sourceMedia
    ? {
        width: sourceMedia.naturalWidth || sourceMedia.drawSourceCanvas.width,
        height: sourceMedia.naturalHeight || sourceMedia.drawSourceCanvas.height,
      }
    : null;

  function buildDurationOptions(cap?: VideoModelCapability): Option[] {
    if (!cap) return [];
    return cap.durations.map((value) => ({ value, label: translateDuration(value) }));
  }

  function buildAspectRatioOptions(cap?: VideoModelCapability): Option[] {
    if (!cap) return [];
    return cap.aspectRatios.map((value) => ({ value, label: translateAspect(value) }));
  }

  function buildResolutionOptions(cap?: VideoModelCapability): Option[] {
    if (!cap) return [];
    return cap.resolutions.map((value) => ({ value, label: value }));
  }

  function translateDuration(value: string): string {
    switch (value) {
      case '1':
        return $_('generator.oneSecond');
      case '2':
        return $_('generator.twoSeconds');
      case '3':
        return $_('generator.threeSeconds');
      case '4':
        return $_('generator.fourSeconds');
      case '5':
        return $_('generator.fiveSeconds');
      default:
        return `${value}s`;
    }
  }

  function translateAspect(value: string): string {
    switch (value) {
      case '1:1':
        return $_('generator.squareRatio');
      case '16:9':
        return $_('generator.landscapeRatio');
      case '9:16':
        return $_('generator.portraitRatio');
      default:
        return value;
    }
  }

  function onCancel() {
    modalStore.close();
  }

  async function onSubmit() {
    addToHistory(prompt);
    const resizedCanvas = resizeCanvasIfNeeded(sourceMedia.drawSourceCanvas, 1024);
    const resizedImageUrl = resizedCanvas.toDataURL();
    const request: ImageToVideoRequest = {
      prompt,
      imageUrl: resizedImageUrl,
      duration,
      aspectRatio,
      resolution,
      model
    };
    
    $modalStore[0].response!(request);
    modalStore.close();
  }

  async function onAskPrompt() {
    try {
      promptWaiting = true;
      const resizedCanvas = resizeCanvasIfNeeded(sourceMedia.drawSourceCanvas, 512);
      const resizedImageUrl = resizedCanvas.toDataURL();
      console.log("resizedImageUrl", resizedImageUrl.length);
      const response = await recognizeImage({
        dataUrl: resizedImageUrl,
        prompt: `
  画像を把握して、この画像から始まる短いシーン(${duration}秒程度の動画)を考えて、説明してください。
  画面上の物体がよく動く様子やカメラワーク、ライティングを具体的に記述してください。
  この画像以前の動画を描くことはできないので、注意してください。
  つまり、必ずこの画像から始まる動画を生成するためのプロンプトを作成する必要があります。
　簡潔に3行程度にまとめてください。
  `
      });
      console.log(response);
      prompt = response.text;
    } finally {
      promptWaiting = false;
    }
  }

  function addToHistory(newPrompt: string) {
    if (!newPrompt.trim()) return;

    const filteredHistory = promptHistory.filter(item => item !== newPrompt);
    const newHistory = [newPrompt, ...filteredHistory];

    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.splice(MAX_HISTORY_SIZE);
    }

    videoPromptHistoryStore.set(newHistory);
    historyIndex = -1;
    temporaryPrompt = '';
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!event.ctrlKey) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigateHistory('up');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigateHistory('down');
    }
  }

  function navigateHistory(direction: 'up' | 'down') {
    if (promptHistory.length === 0) return;

    if (historyIndex === -1 && prompt.trim()) {
      temporaryPrompt = prompt;
    }

    if (direction === 'up') {
      if (historyIndex < promptHistory.length - 1) {
        historyIndex++;
        prompt = promptHistory[historyIndex];
      }
    } else {
      if (historyIndex > -1) {
        historyIndex--;
        if (historyIndex === -1) {
          prompt = temporaryPrompt;
        } else {
          prompt = promptHistory[historyIndex];
        }
      }
    }
  }

  onMount(() => {
    sourceMedia = $modalStore[0].meta.media;
  });
</script>

<div class="card p-4 w-modal shadow-xl">
  <header class="card-header">
    <h2>{$_('generator.videoGeneration')}</h2>
  </header>
  
  <section class="p-4">
    <div class="grid grid-cols-1 gap-4">
      <div class="preview-image">
        <img 
          src={sourceMedia?.drawSourceCanvas.toDataURL()}
          alt="Source" 
          class="w-full h-64 object-contain"
        />
      </div>

      <div>
        <h3>{$_('generator.prompt')}</h3>
        <div class="prompt-input" role="group">
          <NotebookTextarea
            bind:value={prompt}
            minHeight={90}
            placeholder="Describe the video you want to generate..."
            cost={2}
            bind:waiting={promptWaiting}
            on:advise={onAskPrompt}
            on:keydown={handleKeyDown}
          />
          <div class="history-hint">{$_('generator.historyHint')}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="label">
          <h3>{$_('generator.model')}</h3>
          <VideoGenerationModes
            bind:model={model}
            options={videoModelOptions}
            width={240}
            duration={duration}
            resolution={resolution}
            aspectRatio={aspectRatio}
            sourceSize={sourceSize}
          />
        </div>

        <div class="label">
          <h3>{$_('generator.time')}</h3>
          <div class="video-dialog-dropdown-wrapper">
            <PlainDropdown
              options={durationOptions}
              bind:selectedValue={duration}
              containerClass="video-dialog-dropdown"
              triggerClass="video-dialog-dropdown__trigger"
              listClass="video-dialog-dropdown__list"
              optionClass="video-dialog-dropdown__option"
              placeholder={noOptionText}
              disabled={durationOptions.length === 0}
              optionKey={(option) => option.value}
            >
              <svelte:fragment slot="trigger" let:selectedOption>
                {#if selectedOption}
                  <span>{selectedOption.label ?? `${selectedOption.value}`}</span>
                {:else}
                  <span class="video-dialog-dropdown__placeholder">{noOptionText}</span>
                {/if}
              </svelte:fragment>
              <svelte:fragment slot="option" let:option>
                <span>{option.label ?? `${option.value}`}</span>
              </svelte:fragment>
            </PlainDropdown>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="label">
          <h3>{$_('generator.aspectRatio')}</h3>
          <div class="video-dialog-dropdown-wrapper">
            <PlainDropdown
              options={aspectRatioOptions}
              bind:selectedValue={aspectRatio}
              containerClass="video-dialog-dropdown"
              triggerClass="video-dialog-dropdown__trigger"
              listClass="video-dialog-dropdown__list"
              optionClass="video-dialog-dropdown__option"
              placeholder={noOptionText}
              disabled={aspectRatioOptions.length === 0}
              optionKey={(option) => option.value}
            >
              <svelte:fragment slot="trigger" let:selectedOption>
                {#if selectedOption}
                  <span>{selectedOption.label ?? `${selectedOption.value}`}</span>
                {:else}
                  <span class="video-dialog-dropdown__placeholder">{noOptionText}</span>
                {/if}
              </svelte:fragment>
              <svelte:fragment slot="option" let:option>
                <span>{option.label ?? `${option.value}`}</span>
              </svelte:fragment>
            </PlainDropdown>
          </div>
        </div>

        <div class="label">
          <h3>{$_('generator.resolution')}</h3>
          <div class="video-dialog-dropdown-wrapper">
            <PlainDropdown
              options={resolutionOptions}
              bind:selectedValue={resolution}
              containerClass="video-dialog-dropdown"
              triggerClass="video-dialog-dropdown__trigger"
              listClass="video-dialog-dropdown__list"
              optionClass="video-dialog-dropdown__option"
              placeholder={noOptionText}
              disabled={resolutionOptions.length === 0}
              optionKey={(option) => option.value}
            >
              <svelte:fragment slot="trigger" let:selectedOption>
                {#if selectedOption}
                  <span>{selectedOption.label ?? `${selectedOption.value}`}</span>
                {:else}
                  <span class="video-dialog-dropdown__placeholder">{noOptionText}</span>
                {/if}
              </svelte:fragment>
              <svelte:fragment slot="option" let:option>
                <span>{option.label ?? `${option.value}`}</span>
              </svelte:fragment>
            </PlainDropdown>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="card-footer flex gap-2">
    <div class="flex-1"></div>
    <button class="btn variant-ghost-surface" on:click={onCancel}>
      {$_('generator.cancel')}
    </button>
    <button class="btn variant-filled-primary flex flex-row gap-2" on:click={onSubmit}>
      <span class="generate-text">{$_('generator.generate')}</span><FeathralCost cost={cost}/>
    </button>
  </footer>
</div>

<style>
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }
  h3 { 
    font-family: '源暎エムゴ';
    font-size: 18px;
    margin-top: 8px;
  }
  button .generate-text {
    font-family: '源暎エムゴ';
    font-size: 18px;
  }
  .prompt-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .history-hint {
    font-size: 12px;
    color: rgb(var(--color-surface-500));
    padding-left: 4px;
  }

  .video-dialog-dropdown-wrapper {
    width: 100%;
  }

  :global(.video-dialog-dropdown) {
    width: 100%;
    display: block;
  }

  :global(.video-dialog-dropdown__trigger) {
    border-radius: 0.75rem;
    padding: 0.6rem 0.9rem;
    background-color: rgb(var(--color-surface-0, 255 255 255));
    color: rgb(var(--color-surface-900, 15 23 42));
    border: 1px solid rgb(var(--color-surface-400, 148 163 184));
    font-size: 0.95rem;
  }

  :global(.video-dialog-dropdown__list) {
    border-radius: 0.75rem;
    padding: 0.35rem;
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
  }

  :global(.video-dialog-dropdown__option) {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.55rem 0.65rem;
    border-radius: 0.6rem;
  }

  .video-dialog-dropdown__placeholder {
    color: rgb(var(--color-surface-500, 100 116 139));
  }
</style>
