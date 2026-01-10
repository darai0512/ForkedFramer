import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { analyticsEvent } from "./analyticsEvent";
import { onlineStatus } from './accountStore';
import { waitDialog } from './waitDialog';
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore';

type ImageMaskRequest = {
  mask: HTMLCanvasElement;
  image: HTMLCanvasElement;
}

export async function eraserFilmInline(film: Film): Promise<Film | null> {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `消しゴムはサインインしてないと使えません`, timeout: 3000});
    return null;
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `消しゴムは画像のみ使えます`, timeout: 3000});
    return null;
  }
  const imageMedia = film.content.media as ImageMedia;

  const request = await waitDialog<ImageMaskRequest>('imageMask', { title: "消しゴムツール", imageSource: imageMedia.drawSource });
  console.log(request);
  if (!request) {
    return null;
  }

  const maskDataUrl = request.mask.toDataURL("image/png");
  const imageDataUrl = request.image.toDataURL("image/png");

  // beforeRequest形式でImageMediaを作成
  const newMedia = new ImageMedia({
    mediaType: 'image',
    mode: 'beforeRequest',
    action: 'eraser',
    request: {
      maskDataUrl,
      imageDataUrl
    }
  });

  const newFilm = film.clone();
  newFilm.media = newMedia;

  // filmProcessorQueueに登録
  filmProcessorQueue.publish({ film: newFilm });

  analyticsEvent('eraser');

  console.log("eraserFilmInline: created beforeRequest film", newFilm);
  return newFilm;
}
