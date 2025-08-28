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
import type { TextEditModel } from '$protocolTypes/imagingTypes';
import type { Media } from '../lib/layeredCanvas/dataModels/media';

type TextEditDialogResult = {
  image: HTMLCanvasElement;
  prompt: string;
  model: TextEditModel;
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
  
  // 参考画像を追加
  for (const media of request.referenceImages) {
    if (media instanceof ImageMedia) {
      const refImageDataUrl = media.drawSource.toDataURL("image/png");
      imageDataUrls.push(refImageDataUrl);
    }
  }
  console.log(`Added ${request.referenceImages.length} reference images to request`);
  
  const { requestId } = await textEdit({imageDataUrls, prompt: request.prompt, model: request.model});
  const mode = `textedit:${request.model}`;
  await saveRequest(get(mainBookFileSystem)!, "image", mode, requestId);

  const { mediaResources } = await pollMediaStatus({mediaType: "image", mode, requestId});
  loading.set(false);

  const newFilm = film.clone();
  newFilm.media = new ImageMedia(mediaResources[0] as HTMLCanvasElement);

  analyticsEvent('textedit');
  return newFilm;
}