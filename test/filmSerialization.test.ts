import { describe, it, expect, vi } from 'vitest';
import { Film } from '../src/lib/layeredCanvas/dataModels/film';
import { packFilms, unpackFilms, type SaveMediaFunc, type LoadMediaFunc } from '../src/lib/book/imagePacking';
import { ImageMedia } from '../src/lib/layeredCanvas/dataModels/media';

function createCanvas(width = 128, height = 96): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#abcdef';
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
}

describe('Film serialization', () => {
  it('serializes procedural films without touching media pipeline', async () => {
    const effect = { type: 'motion-lines', params: { lineCount: 42, lineWidth: 0.05, randomSeed: 12 } } as const;
    const film = Film.fromProcedural({
      type: effect.type,
      params: { ...effect.params },
    });
    film.n_scale = 1.5;
    film.n_translation = [0.2, -0.3];
    film.rotation = 15;
    film.reverse = [-1, 1];

    const saveMediaImpl: SaveMediaFunc = async (_resource, _type) => {
      throw new Error('saveMedia should not be called for procedural films');
    };
    const saveMedia = vi.fn(saveMediaImpl);

    const packed = await packFilms([film], saveMedia);

    expect(saveMedia).not.toHaveBeenCalled();
    expect(packed).toHaveLength(1);
    const markUp = packed[0];
    expect(markUp.image).toBeUndefined();
    expect(markUp.mediaType).toBeUndefined();
    expect(markUp.proceduralEffect).toEqual({
      type: effect.type,
      params: effect.params,
    });

    const loadMediaImpl: LoadMediaFunc = async () => {
      throw new Error('loadMedia should not be called for procedural films');
    };
    const loadMedia = vi.fn(loadMediaImpl);

    const restored = await unpackFilms(packed, loadMedia);

    expect(loadMedia).not.toHaveBeenCalled();
    expect(restored).toHaveLength(1);
    const restoredFilm = restored[0];
    if (restoredFilm.content.kind !== 'procedural') {
      throw new Error('expected procedural film');
    }
    expect(restoredFilm.content.effect).toEqual(effect);
    expect(restoredFilm.n_scale).toBe(film.n_scale);
    expect(restoredFilm.n_translation).toEqual(film.n_translation);
    expect(restoredFilm.rotation).toBe(film.rotation);
    expect(restoredFilm.reverse).toEqual(film.reverse);
  });

  it('round-trips media and procedural films together', async () => {
    const canvas = createCanvas();
    const imageFilm = Film.fromMedia(new ImageMedia(canvas));
    imageFilm.n_scale = 0.75;
    imageFilm.n_translation = [0.1, 0.05];

    const proceduralFilm = Film.fromProcedural({
      type: 'speed-lines',
      params: { lineCount: 60, lineWidth: 0.2 },
    });

    const mediaStore = new Map<string, HTMLCanvasElement>();
    const saveMediaImpl: SaveMediaFunc = async (resource, _type) => {
      const id = `media-${mediaStore.size}`;
      mediaStore.set(id, resource as HTMLCanvasElement);
      return id;
    };
    const saveMedia = vi.fn(saveMediaImpl);

    const packed = await packFilms([imageFilm, proceduralFilm], saveMedia);

    expect(saveMedia).toHaveBeenCalledTimes(1);
    expect(packed).toHaveLength(2);
    expect(packed[0].image).toBeDefined();
    expect(packed[0].image as string).toMatch(/^media-0$/);
    expect(packed[1].proceduralEffect?.type).toBe('speed-lines');

    const loadMediaImpl: LoadMediaFunc = async (id, _type) => {
      const media = mediaStore.get(id);
      if (!media) {
        throw new Error(`missing media for id ${id}`);
      }
      return media;
    };
    const loadMedia = vi.fn(loadMediaImpl);

    const restored = await unpackFilms(packed, loadMedia);

    expect(loadMedia).toHaveBeenCalledTimes(1);
    expect(restored).toHaveLength(2);

    const restoredImageFilm = restored[0];
    if (restoredImageFilm.content.kind !== 'media') {
      throw new Error('expected media film');
    }
    expect(restoredImageFilm.content.media.naturalWidth).toBe(canvas.width);
    expect(restoredImageFilm.n_scale).toBeCloseTo(imageFilm.n_scale);
    expect(restoredImageFilm.n_translation).toEqual(imageFilm.n_translation);

    const restoredProceduralFilm = restored[1];
    if (restoredProceduralFilm.content.kind !== 'procedural') {
      throw new Error('expected procedural film');
    }
    expect(restoredProceduralFilm.content.effect.type).toBe('speed-lines');
  });
});
