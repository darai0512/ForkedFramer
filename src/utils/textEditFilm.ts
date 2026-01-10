import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { analyticsEvent } from "./analyticsEvent";
import { onlineStatus } from './accountStore';
import { waitDialog } from './waitDialog';
import type { ImagingModel, TextToImageRequest } from '$protocolTypes/imagingTypes';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { modeOptions, inferProvider } from './feathralImaging';
import { filmProcessorQueue } from './filmprocessor/filmProcessorStore';

type TextEditDialogResult = {
  image: HTMLCanvasElement;
  prompt: string;
  model: ImagingModel;
  referenceImages: Media[];
}

export async function textEditFilmInline(film: Film): Promise<Film | null> {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `対話編集はサインインしてないと使えません`, timeout: 3000});
    return null;
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) {
    toastStore.trigger({ message: `対話編集は画像のみ使えます`, timeout: 3000});
    return null;
  }
  const imageMedia = film.content.media as ImageMedia;

  const request = await waitDialog<TextEditDialogResult>('textedit', { title: "対話編集", imageSource: imageMedia.drawSource });
  console.log(request);
  if (!request) {
    return null;
  }

  // メイン画像のDataURLを作成
  const imageDataUrl = request.image.toDataURL("image/png");
  const imageDataUrls = [imageDataUrl];

  // 参考画像を追加（refRange.maxを上限に適用）
  const refMax = modeOptions.find(o => o.value === request.model)?.refRange?.max ?? 0;
  for (const media of request.referenceImages.slice(0, Math.max(0, refMax))) {
    if (media instanceof ImageMedia) {
      const refImageDataUrl = media.drawSource.toDataURL("image/png");
      imageDataUrls.push(refImageDataUrl);
    }
  }
  console.log(`Added ${request.referenceImages.length} reference images to request`);

  // TextToImageRequest を構築（refImage>=1 で i2i/textedit 扱い）
  const req: TextToImageRequest = {
    option: { kind: 'none' },
    provider: inferProvider(request.model),
    prompt: request.prompt,
    imageSize: { width: request.image.width, height: request.image.height },
    numImages: 1,
    model: request.model,
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

  analyticsEvent('textedit');

  console.log("textEditFilmInline: created beforeRequest film", newFilm);
  return newFilm;
}
