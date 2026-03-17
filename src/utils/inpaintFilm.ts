import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { analyticsEvent } from "./analyticsEvent";
import { waitDialog } from './waitDialog';
import { requireSignIn } from './signInPrompt';
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore';

type InpaintDialogResult = {
  mask: HTMLCanvasElement;
  image: HTMLCanvasElement;
  prompt: string;
}

export async function inpaintFilmInline(film: Film): Promise<Film | null> {
  if (!await requireSignIn('インペイントはサインインしてないと使えません')) {
    return null;
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `インペイントは画像のみ使えます`, timeout: 3000});
    return null;
  }
  const imageMedia = film.content.media as ImageMedia;

  const request = await waitDialog<InpaintDialogResult>('inpaint', { title: "インペイント", imageSource: imageMedia.drawSource });
  console.log(request);
  if (!request) {
    return null;
  }

  // request.maskを白黒画像に変換（アルファ値128未満なら白、そうでなければ黒）
  {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = request.mask.width;
    maskCanvas.height = request.mask.height;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.drawImage(request.mask, 0, 0);
    const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const data = maskImageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const value = alpha >= 128 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
    maskCtx.putImageData(maskImageData, 0, 0);
    request.mask = maskCanvas;
  }

  const maskDataUrl = request.mask.toDataURL("image/png");
  const imageDataUrl = request.image.toDataURL("image/png");

  // beforeRequest形式でImageMediaを作成
  const newMedia = new ImageMedia({
    mediaType: 'image',
    mode: 'beforeRequest',
    action: 'inpaint',
    request: {
      maskDataUrl,
      imageDataUrl,
      prompt: request.prompt
    }
  });

  const newFilm = film.clone();
  newFilm.media = newMedia;

  // filmProcessorQueueに登録
  filmProcessorQueue.publish({ film: newFilm });

  analyticsEvent('inpaint');

  console.log("inpaintFilmInline: created beforeRequest film", newFilm);
  return newFilm;
}
