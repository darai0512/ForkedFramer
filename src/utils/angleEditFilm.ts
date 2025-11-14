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
import { inferProvider } from './feathralImaging';

type AngleEditDialogResult = {
  image: HTMLCanvasElement;
  angle: {
    rotate_right_left: number;
    move_forward: number;
    vertical_angle: number;
    wide_angle_lens: boolean;
  };
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
  const model: ImagingMode = 'qwen-image-edit/multiple-angles';
  
  const req: TextToImageRequest = {
    option: {
      kind: 'angle',
      angle: request.angle,
    },
    provider: inferProvider(model),
    prompt: '',
    imageSize: { width: request.image.width, height: request.image.height },
    numImages: 1,
    mode: model,
    background: 'auto',
    imageDataUrls,
  };

  const { requestId, model: responseModel } = await textEdit(req);
  await saveRequest(get(mainBookFileSystem)!, "image", req.mode, requestId, responseModel);

  const { mediaResources } = await pollMediaStatus({mediaType: "image", mode: req.mode, requestId, model: responseModel});
  loading.set(false);

  const newFilm = film.clone();
  newFilm.media = new ImageMedia(mediaResources[0] as HTMLCanvasElement);

  analyticsEvent('angleedit');
  return newFilm;
}
