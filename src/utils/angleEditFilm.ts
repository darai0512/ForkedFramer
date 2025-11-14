import { get } from 'svelte/store';
import { toastStore } from '@skeletonlabs/skeleton';
import { ImageMedia } from '../lib/layeredCanvas/dataModels/media';
import { Film } from '../lib/layeredCanvas/dataModels/film';
import { textEdit, pollMediaStatus } from "../supabase";
import { analyticsEvent } from "./analyticsEvent";
import { saveRequest } from '../filemanager/warehouse';
import { mainBookFileSystem } from '../filemanager/fileManagerStore';
import { onlineStatus } from './accountStore';
import { waitDialog } from './waitDialog';
import { loading } from './loadingStore';
import type { ImagingMode, TextToImageRequest } from '$protocolTypes/imagingTypes';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { modeOptions, inferProvider } from './feathralImaging';

type AngleEditDialogResult = {
  image: HTMLCanvasElement;
  prompt: string;
  model: ImagingMode;
  referenceImages: Media[];
}

export async function angleEditFilm(film: Film) {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `アングル編集はサインインしてないと使えません`, timeout: 3000});
    return;
  }

  if (film.content.kind !== 'media' || !(film.content.media instanceof ImageMedia)) { 
    toastStore.trigger({ message: `アングル編集は画像のみ使えます`, timeout: 3000});
    return; 
  }
  const imageMedia = film.content.media as ImageMedia;

  const request = await waitDialog<AngleEditDialogResult>('angleedit', { title: "アングル編集", imageSource: imageMedia.drawSource });
  console.log(request);
  if (!request) {
    return;
  }    

  loading.set(true);
  
  const imageDataUrl = request.image.toDataURL("image/png");
  const imageDataUrls = [imageDataUrl];
  
  const refMax = modeOptions.find(o => o.value === request.model)?.refRange?.max ?? 0;
  for (const media of request.referenceImages.slice(0, Math.max(0, refMax))) {
    if (media instanceof ImageMedia) {
      const refImageDataUrl = media.drawSource.toDataURL("image/png");
      imageDataUrls.push(refImageDataUrl);
    }
  }
  console.log(`Added ${request.referenceImages.length} reference images to angle edit request`);
  
  const req: TextToImageRequest = {
    option: { kind: 'none' },
    provider: inferProvider(request.model),
    prompt: request.prompt,
    imageSize: { width: request.image.width, height: request.image.height },
    numImages: 1,
    mode: request.model,
    background: 'auto',
    imageDataUrls,
  };

  const { requestId, model } = await textEdit(req);
  const mode = request.model;
  await saveRequest(get(mainBookFileSystem)!, "image", mode, requestId, model);

  const { mediaResources } = await pollMediaStatus({mediaType: "image", mode, requestId, model});
  loading.set(false);

  const newFilm = film.clone();
  newFilm.media = new ImageMedia(mediaResources[0] as HTMLCanvasElement);

  analyticsEvent('angleedit');
  return newFilm;
}
