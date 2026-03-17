import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { analyticsEvent } from "./analyticsEvent";
import { waitDialog } from './waitDialog';
import { requireSignIn } from './signInPrompt';
import type { ImagingModel, TextToImageRequest } from '$protocolTypes/imagingTypes';
import { inferProvider } from './feathralImaging';
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore';

type AngleEditDialogResult = {
  image: HTMLCanvasElement;
  angle: {
    horizontal_angle: number;
    vertical_angle: number;
    zoom: number;
  };
}

export async function angleEditFilmInline(film: Film): Promise<Film | null> {
  if (!await requireSignIn('アングル編集はサインインしてないと使えません')) {
    return null;
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `アングル編集は画像のみ使えます`, timeout: 3000});
    return null;
  }
  const imageMedia = film.content.media as ImageMedia;

  const request = await waitDialog<AngleEditDialogResult>('angleedit', { title: "アングル編集", imageSource: imageMedia.drawSource });
  console.log(request);
  if (!request) {
    return null;
  }

  const imageDataUrl = request.image.toDataURL("image/png");
  const imageDataUrls = [imageDataUrl];
  const model: ImagingModel = 'qwen-image-edit/multiple-angles';

  const req: TextToImageRequest = {
    option: {
      kind: 'angle',
      angle: request.angle,
    },
    provider: inferProvider(model),
    prompt: '',
    imageSize: { width: request.image.width, height: request.image.height },
    numImages: 1,
    model: model,
    background: 'auto',
    imageDataUrls,
  };

  // beforeRequest形式でImageMediaを作成
  const newMedia = new ImageMedia({
    mediaType: 'image',
    mode: 'beforeRequest',
    action: 'texttoimage',
    request: req
  });

  const newFilm = film.clone();
  newFilm.media = newMedia;

  // filmProcessorQueueに登録
  filmProcessorQueue.publish({ film: newFilm });

  analyticsEvent('angleedit');

  console.log("angleEditFilmInline: created beforeRequest film", newFilm);
  return newFilm;
}
