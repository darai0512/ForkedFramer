import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media.js';
import { Film } from '../lib/layeredCanvas/dataModels/film.js';
import { layerize, pollMediaStatus } from "../supabase.js";
import { analyticsEvent } from "./analyticsEvent.js";
import { saveRequest } from '../filemanager/warehouse.js';
import { mainBookFileSystem } from '../filemanager/fileManagerStore.js';
import { onlineStatus } from './accountStore.js';
import { waitDialog } from './waitDialog.js';
import { loading } from './loadingStore.js';

type LayerizeDialogResult = {
  image: HTMLCanvasElement;
  numLayers: number;
}

export async function layerizeFilm(film: Film): Promise<Film[]> {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `レイヤー化はサインインしてないと使えません`, timeout: 3000});
    return [];
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `レイヤー化は画像のみ使えます`, timeout: 3000});
    return [];
  }
  const imageMedia = film.content.media as ImageMedia;

  const request = await waitDialog<LayerizeDialogResult>('layerize', {
    title: "レイヤー化",
    imageSource: imageMedia.drawSource
  });
  console.log(request);
  if (!request) {
    return [];
  }

  loading.set(true);

  const dataUrl = request.image.toDataURL("image/png");
  const { requestId, model } = await layerize({ dataUrl, numLayers: request.numLayers });
  await saveRequest(get(mainBookFileSystem)!, "image", "layerize", requestId, model);

  const { mediaResources } = await pollMediaStatus({ mediaType: "image", mode: "layerize", requestId, model });

  loading.set(false);

  const newFilms: Film[] = [];
  for (const resource of mediaResources) {
    const newFilm = Film.fromMedia(new ImageMedia(resource as HTMLCanvasElement));
    newFilm.n_scale = film.n_scale;
    newFilm.n_translation = [...film.n_translation];
    newFilms.push(newFilm);
  }

  analyticsEvent('layerize');
  return newFilms;
}
