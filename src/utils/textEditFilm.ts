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
import type { ImagingMode, ImagingProvider, TextToImageRequest, ImagingBackground } from '$protocolTypes/imagingTypes';
import type { Media } from '../lib/layeredCanvas/dataModels/media';
import { modeOptions } from './feathralImaging';

type TextEditDialogResult = {
  image: HTMLCanvasElement;
  prompt: string;
  model: ImagingMode;
  referenceImages: Media[];
}

export async function textEditFilm(film: Film) {
  if (get(onlineStatus) !== "signed-in") {
    toastStore.trigger({ message: `対話編集はサインインしてないと使えません`, timeout: 3000});
    return;
  }

  if (!(film.media instanceof ImageMedia)) { 
    toastStore.trigger({ message: `対話編集は画像のみ使えます`, timeout: 3000});
    return; 
  }
  const imageMedia = film.media as ImageMedia;

  const request = await waitDialog<TextEditDialogResult>('textedit', { title: "対話編集", imageSource: imageMedia.drawSource });
  console.log(request);
  if (!request) {
    return;
  }    

  loading.set(true);
  
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
  const inferProvider = (m: ImagingMode): ImagingProvider => {
    if (m.startsWith('gpt-image-1/')) return 'gpt-image-1';
    if (m === 'qwen-image') return 'qwen';
    if (m === 'seedream/v4') return 'seedream';
    return 'flux';
  };
  const req: TextToImageRequest = {
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

  analyticsEvent('textedit');
  return newFilm;
}
