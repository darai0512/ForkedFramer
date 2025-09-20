import { type Writable, writable } from "svelte/store";
import type { FilmStack } from "../lib/layeredCanvas/dataModels/film";
import type { Media } from "../lib/layeredCanvas/dataModels/media";
import type { FilmProceduralEffect } from "../lib/layeredCanvas/dataModels/proceduralEffects";

export type GeneratedFilmResult =
  | { kind: 'media'; media: Media; prompt: string }
  | { kind: 'procedural'; effect: FilmProceduralEffect; prompt: string | null };

export type ImageGeneratorTarget = {
  filmStack: FilmStack;
  initialPrompt: string | null;
  gallery: Media[];
  onDone: (r: GeneratedFilmResult | null) => void,
}

export const imageGeneratorTarget: Writable<ImageGeneratorTarget | null> = writable(null);
