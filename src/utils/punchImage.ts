import { ImageMedia } from '../lib/layeredCanvas/dataModels/media.js';
import { Film } from '../lib/layeredCanvas/dataModels/film.js';
import { analyticsEvent } from "./analyticsEvent.js";
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore.js';

export function punchFilmInline(film: Film): Film | null {
  if (film.content.kind !== 'media') { return null; }
  const imageMedia = film.content.media;
  if (!(imageMedia instanceof ImageMedia)) { return null; }

  const dataUrl = imageMedia.drawSourceCanvas.toDataURL("image/png");

  // beforeRequest形式でImageMediaを作成
  const newMedia = new ImageMedia({
    mediaType: 'image',
    mode: 'beforeRequest',
    action: 'removebg',
    request: { dataUrl }
  });

  const newFilm = film.clone();
  newFilm.media = newMedia;

  // filmProcessorQueueに登録
  filmProcessorQueue.publish({ film: newFilm });

  analyticsEvent('punch');

  console.log("punchFilmInline: created beforeRequest film", newFilm);
  return newFilm;
}
