import { get } from 'svelte/store';
import type { ImageToVideoRequest } from '$protocolTypes/imagingTypes';
import { Film, FilmStack } from '../lib/layeredCanvas/dataModels/film';
import { ImageMedia, VideoMedia } from '../lib/layeredCanvas/dataModels/media';
import { waitDialog } from '../utils/waitDialog';
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore';
import { toastStore } from '@skeletonlabs/skeleton';
import { onlineStatus } from './accountStore';

export async function generateMovie(filmStack: FilmStack, film: Film) {
  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `内部エラー: 動画生成は画像に対してしか使えません`, timeout: 3000});
    return;
  }

  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `動画生成はサインインしてないと使えません`, timeout: 3000});
    return;
  }

  const request = await waitDialog<ImageToVideoRequest>('videoGenerator', { media: film.content.media });
  console.log("modalFrameVideo", request);

  if (!request) { return; }

  // beforeRequest形式でVideoMediaを作成（API呼び出しなし）
  const newMedia = new VideoMedia({
    mediaType: 'video',
    mode: 'beforeRequest',
    action: 'imagetovideo',
    request
  });
  const newFilm = Film.fromMedia(newMedia);

  // filmProcessorQueueに登録（ここでAPIが呼ばれ、ポーリングされる）
  filmProcessorQueue.publish({ film: newFilm });

  const index = filmStack.films.indexOf(film);
  filmStack.films.splice(index + 1, 0, newFilm);

  toastStore.trigger({ message: `ムービー生成には数分かかります`, timeout: 3000});
}
