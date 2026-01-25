import { describe, it, expect } from 'vitest';
import { unpackFilms, unpackNotebookMedias, type LoadMediaFunc } from './imagePacking';
import { createMissingMediaReference, isMissingMediaReference } from '../layeredCanvas/dataModels/media';
import type { SerializedNotebook } from './book';

describe('missing media handling', () => {
  it('keeps films when loadMedia returns missing', async () => {
    const loadMedia: LoadMediaFunc = async (imageId, mediaType) =>
      createMissingMediaReference(mediaType, { missingId: imageId });

    const films = await unpackFilms([
      {
        ulid: 'missing-film',
        n_scale: 1,
        n_translation: [0, 0],
        rotation: 0,
        reverse: [1, 1],
        visible: true,
        prompt: null,
        effects: [],
        mediaType: 'image',
        image: 'missing-id',
      },
    ], loadMedia);

    expect(films).toHaveLength(1);
    const media = films[0].media;
    expect(media.isFailed).toBe(true);
    expect(isMissingMediaReference(media.persistentSource)).toBe(true);
  });

  it('keeps notebook portraits as missing media instead of null', async () => {
    const loadMedia: LoadMediaFunc = async (imageId, mediaType) =>
      createMissingMediaReference(mediaType, { missingId: imageId });

    const serializedNotebook: SerializedNotebook = {
      theme: '',
      characters: [
        {
          name: 'Test',
          personality: '',
          appearance: '',
          themeColor: '#000000',
          ulid: 'char-1',
          portrait: 'missing-portrait',
        },
      ],
      plot: '',
      scenario: '',
      storyboard: null,
      critique: '',
      pageNumber: null,
      format: 'standard',
    };

    const notebook = await unpackNotebookMedias(serializedNotebook, loadMedia);
    const portrait = notebook.characters[0].portrait;
    expect(portrait).not.toBeNull();
    expect(portrait).not.toBe('loading');
    if (portrait && portrait !== 'loading') {
      expect(isMissingMediaReference(portrait.persistentSource)).toBe(true);
    }
  });
});
