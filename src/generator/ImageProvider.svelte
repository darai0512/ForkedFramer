<script lang="ts">
  import { imageGeneratorTarget, type GeneratedFilmResult } from '../generator/imageGeneratorStore';
  import type { FilmStack } from '../lib/layeredCanvas/dataModels/film';
  import type { Media } from '../lib/layeredCanvas/dataModels/media';

  export async function run(initialPrompt: string | null, filmStack: FilmStack, gallery: Media[], frameSize: [number, number]): Promise<GeneratedFilmResult | null> {
    return new Promise((resolve, reject) => {
      $imageGeneratorTarget = {
        initialPrompt,
        filmStack,
        gallery,
        frameSize,
        onDone: resolve,
      };
    });
  }
</script>

<div>
  
</div>

<style>
  
</style>
