import { get } from 'svelte/store';
import type { UpscaleRequest } from '$protocolTypes/imagingTypes.d';
import { Film } from '../lib/layeredCanvas/dataModels/film.js';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media.js';
import { waitDialog } from './waitDialog.js';
import { toastStore } from '@skeletonlabs/skeleton';
import { onlineStatus } from './accountStore.js';
import { analyticsEvent } from "./analyticsEvent.js";
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore.js';
import { upscale, pollMediaStatus } from "../supabase.js";
import { saveRequest } from '../filemanager/warehouse.js';
import { mainBookFileSystem } from '../filemanager/fileManagerStore.js';
import { loading } from './loadingStore.js';
import { _ } from 'svelte-i18n';

// インライン版（フリーズしない）
export async function upscaleFilmInline(film: Film): Promise<Film | null> {
  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: get(_)('upscale.imageOnlyError'), timeout: 3000});
    return null;
  }
  const imageMedia = film.content.media as ImageMedia;

  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: get(_)('upscale.signInRequired'), timeout: 3000});
    return null;
  }

  const request = await waitDialog<UpscaleRequest>('upscaler', { canvas: imageMedia.drawSourceCanvas });
  console.log("upscale", request);

  if (!request) { return null; }

  // beforeRequest形式でImageMediaを作成
  const newMedia = new ImageMedia({
    mediaType: 'image',
    mode: 'beforeRequest',
    action: 'upscale',
    request
  });

  const newFilm = film.clone();
  newFilm.media = newMedia;

  // filmProcessorQueueに登録
  filmProcessorQueue.publish({ film: newFilm });

  analyticsEvent('upscale');

  console.log("upscaleFilmInline: created beforeRequest film", newFilm);
  return newFilm;
}

// ブロッキング版（結果を待つ、エクスポート用）
export async function upscaleCanvas(canvas: HTMLCanvasElement, warning: string | null = null): Promise<HTMLCanvasElement | null> {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: get(_)('upscale.signInRequired'), timeout: 3000});
    return null;
  }

  const request = await waitDialog<UpscaleRequest>('upscaler', { canvas });
  console.log("upscale", request);

  if (!request) { return null; }

  if (warning) {
    toastStore.trigger({ message: warning, timeout: 6000});
  }

  loading.set(true);
  const { requestId, model } = await upscale(request);
  await saveRequest(get(mainBookFileSystem)!, "image", "upscale", requestId, model);

  const { mediaResources } = await pollMediaStatus({mediaType: "image", action: "upscale", requestId, model});
  loading.set(false);

  return mediaResources[0] as HTMLCanvasElement;
}

// ブロッキング版（ダイアログなし、エクスポート用）
export async function upscaleCanvasWithoutDialog(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: get(_)('upscale.signInRequired'), timeout: 3000});
    return null;
  }

  const request: UpscaleRequest = {
    dataUrl: canvas.toDataURL('image/png'),
    scale: "2x",
    provider: "standard",
  };

  loading.set(true);
  const { requestId, model } = await upscale(request);
  await saveRequest(get(mainBookFileSystem)!, "image", "upscale", requestId, model);

  const { mediaResources } = await pollMediaStatus({mediaType: "image", action: "upscale", requestId, model});
  loading.set(false);

  return mediaResources[0] as HTMLCanvasElement;
}
